import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';

const SB_URL  = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SB_SERV = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
const SB_ANON = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

async function sbFetch<T>(
  table: string,
  opts: { method?: string; select?: string; filters?: string; body?: unknown; serviceRole?: boolean } = {},
): Promise<T[]> {
  const { method = 'GET', select = '*', filters = '', body, serviceRole = false } = opts;
  const key = serviceRole ? SB_SERV : SB_ANON;
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  if (method === 'GET') {
    url.searchParams.set('select', select);
    if (filters) filters.split('&').forEach((f) => {
      const eq = f.indexOf('='); if (eq > -1) url.searchParams.set(f.slice(0,eq), f.slice(eq+1));
    });
  }
  const headers: Record<string, string> = {
    apikey: key, Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json', Accept: 'application/json',
    Prefer: 'return=representation',
  };
  const res = await fetch(url.toString(), {
    method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  });
  if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error(`${method} ${table}: ${e}`); }
  return res.json() as Promise<T[]>;
}

const orderSchema = z.object({
  userId: z.string().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
  paymentMethod: z.enum(['COD', 'RAZORPAY', 'UPI']).default('COD'),
  address: z.object({
    fullName: z.string().min(1),
    phone:    z.string().min(10),
    line1:    z.string().min(3),
    city:     z.string().min(2),
    state:    z.string().min(2),
    pincode:  z.string().length(6),
  }),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const userId  = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ data: [], error: 'Not authenticated' }, { status: 401 });

    const orders = await sbFetch<Record<string, unknown>>('orders', {
      select:      'id,order_number,status,payment_status,payment_method,subtotal,delivery_fee,total_amount,delivery_address,created_at',
      filters:     `user_id=eq.${userId}&order=created_at.desc&limit=50`,
      serviceRole: true,
    });

    const orderIds = (orders as any[]).map((o) => o.id as string);
    let allItems: any[] = [];
    if (orderIds.length > 0) {
      allItems = await sbFetch<Record<string, unknown>>('order_items', {
        select:      'id,order_id,product_id,quantity,unit_price,total,products(name,unit,image_url,slug)',
        filters:     `order_id=in.(${orderIds.join(',')})`,
        serviceRole: true,
      });
    }

    const itemsByOrder: Record<string, any[]> = {};
    for (const item of allItems) {
      const oid = (item as any).order_id as string;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(item);
    }

    const data = (orders as any[]).map((o) => ({
      id:            o.id,
      orderNumber:   o.order_number,
      status:        o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      subtotal:      Number(o.subtotal ?? 0),
      deliveryFee:   Number(o.delivery_fee ?? 0),
      total:         Number(o.total_amount ?? 0),
      createdAt:     o.created_at,
      items: (itemsByOrder[o.id] ?? []).map((i: any) => ({
        id:        i.id,
        name:      i.products?.name ?? '',
        unit:      i.products?.unit ?? 'kg',
        slug:      i.products?.slug ?? '',
        imageUrls: [i.products?.image_url ?? ''].filter(Boolean),
        quantity:  i.quantity,
        unitPrice: Number(i.unit_price ?? 0),
      })),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return NextResponse.json({ data: [], error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { items, paymentMethod, address } = parsed.data;
    const userId = parsed.data.userId || `guest-${Date.now()}`;

    const productIds = items.map((i) => i.productId);
    const products = await sbFetch<Record<string, unknown>>('products', {
      select:      'id,name,website_price,price,in_stock',
      filters:     `id=in.(${productIds.join(',')})&is_published=eq.true`,
      serviceRole: true,
    });

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: 'Some items are unavailable. Please refresh your cart.' }, { status: 422 });
    }

    const priceMap: Record<string, number> = {};
    for (const p of products as any[]) priceMap[p.id] = Number(p.website_price ?? p.price ?? 0);

    const subtotal    = items.reduce((s, i) => s + (priceMap[i.productId] ?? 0) * i.quantity, 0);
    const deliveryFee = subtotal >= 499 ? 0 : 40;
    const total       = subtotal + deliveryFee;
    const orderNumber = 'FF-' + Date.now().toString().slice(-6);

    // Format so pincode extraction regex (\d{6})$ works
    const deliveryAddress = `${address.fullName}\n${address.phone}\n${address.line1}, ${address.city}, ${address.state} - ${address.pincode}`;

    const [newOrder] = await sbFetch<any>('orders', {
      method:      'POST',
      serviceRole: true,
      body: {
        user_id:          userId,
        order_number:     orderNumber,
        customer_name:    address.fullName,
        customer_phone:   address.phone,
        subtotal,
        delivery_fee:     deliveryFee,
        total_amount:     total,
        total,
        delivery_address: deliveryAddress,
        delivery_pincode: address.pincode,
        payment_method:   paymentMethod.toLowerCase(),
        payment_status:   paymentMethod === 'COD' ? 'unpaid' : 'paid',
        status:           'PLACED',
      },
    });

    if (!newOrder?.id) throw new Error('Order insert failed');

    await sbFetch('order_items', {
      method:      'POST',
      serviceRole: true,
      body: items.map((i) => ({
        order_id:   newOrder.id,
        product_id: i.productId,
        quantity:   i.quantity,
        unit_price: priceMap[i.productId] ?? 0,
        total:      (priceMap[i.productId] ?? 0) * i.quantity,
      })),
    });

    return NextResponse.json({
      order: { id: newOrder.id, orderNumber: newOrder.order_number, total, status: 'PLACED' },
    }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/orders]', err);
    return NextResponse.json({ error: 'Failed to place order. Please try again.' }, { status: 500 });
  }
}
