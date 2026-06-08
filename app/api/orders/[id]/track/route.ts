import { NextRequest, NextResponse } from 'next/server';

const SB = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const STATUS_STEPS = [
  { key: 'PLACED',           label: 'Order Placed',     emoji: '🛒', desc: 'Your order has been received.' },
  { key: 'CONFIRMED',        label: 'Order Confirmed',  emoji: '✅', desc: 'We have confirmed your order.' },
  { key: 'PICKING',          label: 'Picking Items',    emoji: '📦', desc: 'Our team is packing your items.' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', emoji: '🚚', desc: 'Your order is on the way!' },
  { key: 'DELIVERED',        label: 'Delivered',        emoji: '🎉', desc: 'Your order has been delivered.' },
];

const STATUS_NORM: Record<string, string> = {
  placed: 'PLACED', confirmed: 'CONFIRMED', picking: 'PICKING',
  processing: 'CONFIRMED', packed: 'PICKING',
  out_for_delivery: 'OUT_FOR_DELIVERY', delivered: 'DELIVERED',
};

function parseAddress(raw: string) {
  const lines = (raw ?? '').split('\n').map((l: string) => l.trim()).filter(Boolean);
  const street = lines[2] ?? lines[0] ?? '';
  const parts = street.split(',');
  const city = parts[parts.length - 2]?.trim() ?? '';
  const last = parts[parts.length - 1]?.trim() ?? '';
  const state = last.split('-')[0]?.trim() ?? '';
  return { street, city, state, raw };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const orderRes = await fetch(
      `${SB}/rest/v1/orders?or=(id.eq.${id},order_number.eq.${id})&select=*&limit=1`,
      { headers: HDR, cache: 'no-store' }
    );
    const orders: any[] = await orderRes.json();
    if (!Array.isArray(orders) || !orders.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const o = orders[0];

    const itemsRes = await fetch(
      `${SB}/rest/v1/order_items?order_id=eq.${o.id}&select=*`,
      { headers: HDR, cache: 'no-store' }
    );
    const items: any[] = (await itemsRes.json()) ?? [];

    let products: any[] = [];
    const productIds = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))];
    const uuids = (productIds as string[]).filter((pid) => /^[0-9a-f-]{36}$/i.test(pid));
    if (uuids.length) {
      const prodRes = await fetch(
        `${SB}/rest/v1/products?id=in.(${uuids.join(',')})&select=id,name,unit,image_url,image_urls`,
        { headers: HDR, cache: 'no-store' }
      );
      products = (await prodRes.json()) ?? [];
    }
    const prodMap: Record<string, any> = Object.fromEntries(products.map((p: any) => [p.id, p]));

    const rawStatus = (o.status ?? 'PLACED').toUpperCase();
    const normStatus =
      STATUS_NORM[rawStatus.toLowerCase()] ??
      (STATUS_STEPS.find((s) => s.key === rawStatus) ? rawStatus : 'PLACED');
    const currentStepIdx = Math.max(0, STATUS_STEPS.findIndex((s) => s.key === normStatus));

    const createdAt = new Date(o.created_at);
    const etaAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const remainingMs = Math.max(0, etaAt.getTime() - Date.now());
    const isDone = normStatus === 'DELIVERED' || rawStatus === 'CANCELLED';

    const addr = parseAddress(o.delivery_address ?? '');

    return NextResponse.json({
      order: {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        total: o.total ?? o.total_amount,
        createdAt: o.created_at,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        address: addr,
        items: items.map((item: any) => {
          const prod = prodMap[item.product_id] ?? {};
          let imgs: string[] = [];
          try { imgs = JSON.parse(prod.image_urls ?? '[]'); } catch {}
          if (!imgs.length && prod.image_url) imgs = [prod.image_url];
          return {
            name: prod.name ?? item.product_id,
            unit: prod.unit ?? 'kg',
            imageUrls: imgs,
            qty: item.quantity,
            price: item.unit_price,
            total: item.total,
          };
        }),
      },
      tracking: {
        steps: STATUS_STEPS.map((step, i) => ({
          ...step,
          status: i < currentStepIdx ? 'completed' : i === currentStepIdx ? 'current' : 'upcoming',
        })),
        currentStep: currentStepIdx,
        eta: isDone
          ? null
          : {
              hours: Math.floor(remainingMs / 3600000),
              minutes: Math.floor((remainingMs % 3600000) / 60000),
            },
        location:
          normStatus === 'OUT_FOR_DELIVERY' ? { lat: 13.0827, lng: 80.2707, bearing: 45 } : null,
        deliveryAddress: addr.city
          ? `${addr.city}, ${addr.state}`.replace(/(^, |, $)/, '')
          : 'Chennai',
      },
    });
  } catch (err) {
    console.error('[track GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
