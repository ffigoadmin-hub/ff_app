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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Adjectives/qualifiers to strip when doing fallback name lookups
const STRIP_WORDS = new Set(['organic', 'fresh', 'baby', 'red', 'green', 'yellow', 'mini', 'premium',
  'sweet', 'wild', 'local', 'farm', 'raw', 'dried', 'whole', 'natural', 'pure']);

async function resolveProductByName(name: string): Promise<{ id: string; price: number } | null> {
  const tryLookup = async (term: string) => {
    const rows = await sbFetch<any>('products', {
      select:  'id,website_price,price',
      filters: `name=ilike.*${encodeURIComponent(term)}*&is_published=eq.true&limit=1`,
      serviceRole: true,
    });
    return rows[0] ? { id: rows[0].id, price: Number(rows[0].website_price ?? rows[0].price ?? 0) } : null;
  };

  // 1. Full name
  let res = await tryLookup(name);
  if (res) return res;

  // 2. Name without spaces (e.g. "Sweet Corn" → "SweetCorn" → matches "Sweetcorn")
  res = await tryLookup(name.replace(/\s+/g, ''));
  if (res) return res;

  // 3. Each word, longest first, stripping qualifier words
  const words = name.split(/\s+/).filter(w => w.length > 2);
  const meaningful = words.filter(w => !STRIP_WORDS.has(w.toLowerCase()));
  const candidates = meaningful.length > 0 ? meaningful : words;

  for (const word of [...candidates].reverse()) {
    res = await tryLookup(word);
    if (res) return res;
    // Try without trailing 's' (plural → singular)
    if (word.endsWith('s') && word.length > 4) {
      res = await tryLookup(word.slice(0, -1));
      if (res) return res;
    }
  }

  return null;
}

const orderSchema = z.object({
  userId: z.string().optional(),
  items: z.array(z.object({
    productId:   z.string(),
    productName: z.string().optional(),
    quantity:    z.number().int().positive(),
  })).min(1),
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

    const uuidItems   = items.filter((i) => UUID_RE.test(i.productId));
    const legacyItems = items.filter((i) => !UUID_RE.test(i.productId));

    const productMap: Record<string, { id: string; price: number }> = {};

    // 1. UUID items — fetch by ID
    if (uuidItems.length > 0) {
      const rows = await sbFetch<any>('products', {
        select:      'id,name,website_price,price',
        filters:     `id=in.(${uuidItems.map((i) => i.productId).join(',')})&is_published=eq.true`,
        serviceRole: true,
      });
      for (const p of rows) productMap[p.id] = { id: p.id, price: Number(p.website_price ?? p.price ?? 0) };
    }

    // 2. Legacy items — smart name lookup
    for (const item of legacyItems) {
      if (productMap[item.productId]) continue;
      const name = item.productName ?? '';
      if (!name) continue;
      const resolved = await resolveProductByName(name);
      if (resolved) productMap[item.productId] = resolved;
    }

    // 3. UUID items not in DB → unavailable
    const missing = items.filter((i) => !productMap[i.productId]);
    if (missing.length > 0) {
      const names = missing.map((i) => i.productName ?? i.productId).join(', ');
      return NextResponse.json(
        { error: `Some items are no longer available: ${names}. Please remove them and try again.` },
        { status: 422 }
      );
    }

    const subtotal    = items.reduce((s, i) => s + (productMap[i.productId]?.price ?? 0) * i.quantity, 0);
    const deliveryFee = subtotal >= 499 ? 0 : 40;
    const total       = subtotal + deliveryFee;
    const orderNumber = 'FF-' + Date.now().toString().slice(-6);

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
        product_id: productMap[i.productId]?.id ?? i.productId,
        quantity:   i.quantity,
        unit_price: productMap[i.productId]?.price ?? 0,
        total:      (productMap[i.productId]?.price ?? 0) * i.quantity,
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
