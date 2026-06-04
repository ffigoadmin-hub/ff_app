import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Receipt, Share2 } from 'lucide-react';
import { OrderTrackingCard } from '@/components/orders/OrderTrackingCard';
import { formatPrice } from '@/lib/utils';

const SB_URL  = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SB_SERV = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

async function getOrder(id: string) {
  try {
    const headers = { apikey: SB_SERV, Authorization: `Bearer ${SB_SERV}` };
    // Fetch order
    const r = await fetch(
      `${SB_URL}/rest/v1/orders?id=eq.${id}&select=*&limit=1`,
      { headers, cache: 'no-store' }
    );
    const rows: any[] = await r.json();
    if (!rows.length) return null;
    const o = rows[0];

    // Fetch order items + product images
    const ir = await fetch(
      `${SB_URL}/rest/v1/order_items?order_id=eq.${id}&select=id,product_id,quantity,unit_price,total,products(name,unit,image_url,slug)`,
      { headers, cache: 'no-store' }
    );
    const items: any[] = await ir.json();

    return {
      id: o.id,
      orderNumber: o.order_number,
      status: o.status ?? 'PLACED',
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      subtotal: Number(o.subtotal ?? 0),
      deliveryFee: Number(o.delivery_fee ?? 0),
      total: Number(o.total_amount ?? o.total ?? 0),
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      deliveryAddress: o.delivery_address ?? '',
      createdAt: o.created_at,
      items: (Array.isArray(items) ? items : []).map((i: any) => ({
        id:        i.id,
        productId: i.product_id,
        name:      i.products?.name ?? 'Product',
        unit:      i.products?.unit ?? 'kg',
        slug:      i.products?.slug ?? '',
        imageUrls: i.products?.image_url ? [i.products.image_url] : [],
        quantity:  Number(i.quantity ?? 1),
        unitPrice: Number(i.unit_price ?? 0),
        total:     Number(i.total ?? 0),
      })),
    };
  } catch {
    return null;
  }
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params;
  const order   = await getOrder(id);
  if (!order) notFound();

  // Parse address lines from the stored string
  const addrLines = order.deliveryAddress.split('\n').filter(Boolean);
  const addrDisplay = addrLines.slice(2).join(', ') || addrLines.join(', ');

  return (
    <div className="min-h-screen bg-neutral-50 px-4 pb-24 pt-4 md:px-0">
      <div className="mx-auto max-w-lg">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <Link
            href="/orders"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-900 shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <h1 className="text-sm font-bold uppercase leading-none tracking-widest text-neutral-400">Order Tracking</h1>
            <p className="text-lg font-black text-neutral-900">#{order.orderNumber}</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-900 shadow-sm">
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6">

          {/* Live Tracking */}
          <OrderTrackingCard status={order.status} />

          {/* Delivery Address */}
          <section className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                <MapPin className="h-5 w-5" />
              </div>
              <h3 className="font-black text-neutral-900">Delivery Address</h3>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              {order.customerName && <><strong>{order.customerName}</strong><br /></>}
              {addrDisplay || order.deliveryAddress}
            </p>
          </section>

          {/* Order Items */}
          <section className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                <Receipt className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-neutral-900">Order Items</h3>
            </div>

            <div className="mb-6 space-y-4 border-b border-dashed border-neutral-100 pb-6">
              {order.items.length > 0 ? order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-neutral-50 p-1">
                      {item.imageUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrls[0]} alt={item.name} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl">🛒</div>
                      )}
                    </div>
                    <div>
                      <p className="line-clamp-1 text-sm font-bold text-neutral-900">{item.name}</p>
                      <p className="text-xs text-neutral-500">{item.unit} × {item.quantity}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{formatPrice(item.total || item.unitPrice * item.quantity)}</p>
                </div>
              )) : (
                <p className="text-sm text-neutral-400 text-center py-2">No items found</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-neutral-500">
                <span>Items Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-neutral-500">
                <span>Delivery Fee</span>
                <span className={order.deliveryFee === 0 ? 'font-bold text-green-600' : ''}>
                  {order.deliveryFee === 0 ? 'FREE' : formatPrice(order.deliveryFee)}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-neutral-50 pt-2">
                <span className="font-black text-neutral-900">Total Paid</span>
                <span className="text-lg font-black text-primary-600">{formatPrice(order.total)}</span>
              </div>
            </div>
          </section>

          <button className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-neutral-200 py-4 font-bold text-neutral-600 transition-colors hover:bg-neutral-100">
            Need help with this order?
          </button>

        </div>
      </div>
    </div>
  );
}
