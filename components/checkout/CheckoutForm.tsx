'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useUIStore } from '@/store/uiStore';
import { useAddressStore } from '@/store/addressStore';
import { useUserStore } from '@/store/userStore';
import { formatPrice, cn } from '@/lib/utils';
import {
  Loader2, Truck, MapPin, CreditCard, Banknote,
  CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, Navigation,
} from 'lucide-react';

const RazorpayCheckout = dynamic(
  () => import('./RazorpayCheckout').then((m) => m.RazorpayCheckout),
  { ssr: false, loading: () => <div className="h-14 animate-pulse rounded-2xl bg-neutral-100" /> },
);

interface AddressForm {
  fullName: string; phone: string; line1: string;
  city: string; state: string; pincode: string;
}

interface SavedAddress {
  label: string; line1: string; city: string; state: string; pincode: string; isDefault: boolean;
}

const inputCls =
  'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0'))  return digits.slice(1);
  return digits.slice(-10);
}

export function CheckoutForm() {
  const router      = useRouter();
  const items       = useCartStore((s) => s.items);
  const subtotal    = useCartStore((s) => s.subtotal());
  const isEmpty     = useCartStore((s) => s.isEmpty());
  const clearCart   = useCartStore((s) => s.clearCart);
  const addToast    = useUIStore((s) => s.addToast);
  const savedAddr   = useAddressStore((s) => s.address);
  const saveAddress = useAddressStore((s) => s.setAddress);
  const user        = useUserStore((s) => s.user);

  const deliveryFee = subtotal >= 199 ? 0 : 25;
  const total       = subtotal + deliveryFee;

  const [payMethod,     setPayMethod]     = useState<'COD' | 'RAZORPAY'>('COD');
  const [placingCod,    setPlacingCod]    = useState(false);
  const [orderError,    setOrderError]    = useState('');
  const [addrOpen,      setAddrOpen]      = useState(true);
  const [addrSaved,     setAddrSaved]     = useState(false);
  const [addrErrors,    setAddrErrors]    = useState<Partial<AddressForm>>({});
  const [locLoading,    setLocLoading]    = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addr, setAddr] = useState<AddressForm>({
    fullName: '', phone: '', line1: '', city: '', state: '', pincode: '',
  });

  // Pre-fill from localStorage store first; if empty, fetch default address from DB
  useEffect(() => {
    if (addrSaved) return;

    if (savedAddr?.line1) {
      setAddr({
        fullName: savedAddr.fullName || user?.name || '',
        phone:    normalisePhone(savedAddr.phone || user?.phone),
        line1:    savedAddr.line1,
        city:     savedAddr.city,
        state:    savedAddr.state,
        pincode:  savedAddr.pincode,
      });
      return;
    }

    if (!user?.id) return;
    fetch(`/api/user/addresses?userId=${user.id}`)
      .then((r) => r.json())
      .then((d: { data?: SavedAddress[] }) => {
        const list = d.data ?? [];
        setSavedAddresses(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (!def) return;
        setAddr({
          fullName: user.name || '',
          phone:    normalisePhone(user.phone),
          line1:    def.line1,
          city:     def.city,
          state:    def.state,
          pincode:  def.pincode,
        });
      })
      .catch(() => {});
  }, [savedAddr, addrSaved, user]);

  const setField = (k: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddr((p) => ({ ...p, [k]: e.target.value }));
    setAddrErrors((p) => ({ ...p, [k]: '' }));
  };

  // ── Use Live Location ────────────────────────────────────────────────────────
  const handleUseLiveLocation = useCallback(() => {
    if (!navigator.geolocation) {
      addToast({ variant: 'error', title: 'Geolocation not supported in this browser' });
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const res = await fetch(`/api/location/reverse-geocode?lat=${lat}&lng=${lng}`);
          if (!res.ok) throw new Error('Geocode failed');
          const data = await res.json() as {
            address?: string; city?: string; state?: string; pincode?: string;
          };
          setAddr((prev) => ({
            ...prev,
            line1:   data.address  || prev.line1,
            city:    data.city     || prev.city,
            state:   data.state    || prev.state,
            pincode: data.pincode  || prev.pincode,
          }));
          addToast({ variant: 'success', title: '📍 Location detected!' });
        } catch {
          addToast({ variant: 'error', title: 'Could not fetch address. Enter manually.' });
        } finally {
          setLocLoading(false);
        }
      },
      () => {
        setLocLoading(false);
        addToast({ variant: 'error', title: 'Location access denied. Please allow in browser settings.' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [addToast]);

  const validateAddr = useCallback((): boolean => {
    const errs: Partial<AddressForm> = {};
    if (addr.fullName.trim().length < 2)       errs.fullName = 'Enter your full name';
    if (!/^\d{10}$/.test(addr.phone.trim()))   errs.phone    = 'Enter valid 10-digit number';
    if (addr.line1.trim().length < 5)          errs.line1    = 'Enter full address';
    if (addr.city.trim().length < 2)           errs.city     = 'Enter city';
    if (addr.state.trim().length < 2)          errs.state    = 'Enter state';
    if (!/^\d{6}$/.test(addr.pincode.trim()))  errs.pincode  = 'Enter 6-digit pincode';
    setAddrErrors(errs);
    return Object.keys(errs).length === 0;
  }, [addr]);

  const handleSaveAddr = () => {
    if (!validateAddr()) return;
    setAddrSaved(true);
    setAddrOpen(false);
    saveAddress({
      fullName: addr.fullName.trim(), phone: addr.phone.trim(),
      line1:    addr.line1.trim(),    city:  addr.city.trim(),
      state:    addr.state.trim(),    pincode: addr.pincode.trim(),
    });
    addToast({ variant: 'success', title: 'Address saved' });
  };

  const addressPayload = {
    fullName: addr.fullName.trim(), phone:   addr.phone.trim(),
    line1:    addr.line1.trim(),    city:    addr.city.trim(),
    state:    addr.state.trim(),    pincode: addr.pincode.trim(),
  };

  const handleCodOrder = useCallback(async () => {
    if (!validateAddr()) { setAddrOpen(true); return; }
    setOrderError('');
    setPlacingCod(true);
    try {
      const res  = await fetch('/api/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          userId:        user?.id ?? '',
          items:         items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod: 'COD',
          address:       addressPayload,
        }),
      });
      const data = await res.json() as { order?: { id: string }; error?: string };
      if (!res.ok) {
        setOrderError(data.error ?? 'Order failed. Please try again.');
        return;
      }
      clearCart();
      addToast({ variant: 'success', title: 'Order placed! Pay on delivery.' });
      router.replace('/checkout/success?orderId=' + (data.order?.id ?? ''));
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order failed. Please try again.');
    } finally {
      setPlacingCod(false);
    }
  }, [validateAddr, items, addressPayload, clearCart, addToast, router]); // eslint-disable-line

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
        <p className="text-neutral-500">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">

      {/* ── Left — Address + Payment ── */}
      <div className="space-y-4 lg:col-span-2">

        {/* Address section */}
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <button
            type="button"
            onClick={() => setAddrOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary-600" />
              <span className="font-bold text-neutral-900">Delivery Address</span>
              {addrSaved && (
                <span className="ml-2 flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
            {addrOpen
              ? <ChevronUp className="h-4 w-4 text-neutral-400" />
              : <ChevronDown className="h-4 w-4 text-neutral-400" />}
          </button>

          {addrOpen && (
            <div className="border-t border-neutral-100 px-5 pb-5 pt-4">

              {/* ── Use Live Location button ── */}
              <div className="mb-4 flex items-center justify-between gap-3">
                {/* Saved addresses dropdown */}
                {savedAddresses.length > 0 && (
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      📍 Choose a Saved Delivery Location
                    </label>
                    <select
                      className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:border-primary-500 focus:outline-none"
                      defaultValue=""
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        if (isNaN(idx)) return;
                        const a = savedAddresses[idx];
                        if (!a) return;
                        setAddr((prev) => ({
                          ...prev,
                          line1:   a.line1,
                          city:    a.city,
                          state:   a.state,
                          pincode: a.pincode,
                        }));
                      }}
                    >
                      <option value="">-- Select a Saved Location to Auto-fill --</option>
                      {savedAddresses.map((a, i) => (
                        <option key={i} value={i}>
                          {a.label || a.line1} — {a.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Live location button */}
                <button
                  type="button"
                  onClick={handleUseLiveLocation}
                  disabled={locLoading}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 transition-all hover:bg-primary-100 disabled:opacity-60"
                >
                  {locLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Navigation className="h-3.5 w-3.5" />}
                  Use Live Location
                </button>
              </div>

              {addrSaved && (
                <div className="mb-4 rounded-xl bg-neutral-50 p-3 text-sm">
                  <p className="font-semibold text-neutral-800">{addr.fullName} &middot; {addr.phone}</p>
                  <p className="text-neutral-500">{addr.line1}, {addr.city}, {addr.state} - {addr.pincode}</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Full Name *</label>
                  <input className={inputCls} placeholder="John Doe" value={addr.fullName} onChange={setField('fullName')} />
                  {addrErrors.fullName && <p className="mt-1 text-xs text-red-500">{addrErrors.fullName}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Mobile *</label>
                  <input className={inputCls} placeholder="9876543210" inputMode="numeric" maxLength={10} value={addr.phone} onChange={setField('phone')} />
                  {addrErrors.phone && <p className="mt-1 text-xs text-red-500">{addrErrors.phone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Street Address *</label>
                  <input className={inputCls} placeholder="Flat/House No, Street, Area" value={addr.line1} onChange={setField('line1')} />
                  {addrErrors.line1 && <p className="mt-1 text-xs text-red-500">{addrErrors.line1}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">City *</label>
                  <input className={inputCls} placeholder="Chennai" value={addr.city} onChange={setField('city')} />
                  {addrErrors.city && <p className="mt-1 text-xs text-red-500">{addrErrors.city}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">State *</label>
                  <input className={inputCls} placeholder="Tamil Nadu" value={addr.state} onChange={setField('state')} />
                  {addrErrors.state && <p className="mt-1 text-xs text-red-500">{addrErrors.state}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Zip Code *</label>
                  <input className={inputCls} placeholder="600001" inputMode="numeric" maxLength={6} value={addr.pincode} onChange={setField('pincode')} />
                  {addrErrors.pincode && <p className="mt-1 text-xs text-red-500">{addrErrors.pincode}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveAddr}
                className="mt-4 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-700"
              >
                Save Address &amp; Continue
              </button>
            </div>
          )}
        </section>

        {/* Payment method */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <span className="font-bold text-neutral-900">Payment Method</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { id: 'COD',      label: 'Cash on Delivery', icon: Banknote,   desc: 'Pay when you receive'  },
              { id: 'RAZORPAY', label: 'Pay Online',        icon: CreditCard, desc: 'Cards, UPI, Wallets'   },
            ] as const).map(({ id, label, icon: Icon, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPayMethod(id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
                  payMethod === id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-100 hover:border-neutral-200',
                )}
              >
                <Icon className={cn('h-5 w-5', payMethod === id ? 'text-primary-600' : 'text-neutral-400')} />
                <div>
                  <p className={cn('text-sm font-bold', payMethod === id ? 'text-primary-700' : 'text-neutral-700')}>{label}</p>
                  <p className="text-xs text-neutral-400">{desc}</p>
                </div>
                {payMethod === id && <CheckCircle2 className="ml-auto h-4 w-4 text-primary-600" />}
              </button>
            ))}
          </div>
        </section>

        {/* Error banner */}
        {orderError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">{orderError}</p>
              <button
                onClick={() => { clearCart(); setOrderError(''); router.push('/'); }}
                className="mt-2 text-xs font-bold text-red-600 underline underline-offset-2"
              >
                Clear Cart &amp; Shop Again
              </button>
            </div>
          </div>
        )}

        {/* Place Order / Razorpay */}
        {payMethod === 'COD' ? (
          <button
            type="button"
            onClick={() => void handleCodOrder()}
            disabled={placingCod}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 text-base font-black text-white shadow-lg shadow-primary-200 transition-all hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60"
          >
            {placingCod
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Placing Order...</>
              : <><Truck className="h-5 w-5" /> Place Order — Pay on Delivery</>}
          </button>
        ) : (
          <RazorpayCheckout
            amount={total}
            address={addressPayload}
            items={items}
            onValidateAddress={validateAddr}
          />
        )}
      </div>

      {/* ── Right — Order Summary ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-4 font-black text-neutral-900">Order Summary</h3>
          <div className="space-y-3">
            {items.map((item) => {
              const imgSrc = item.product.imageUrls[0] ?? '';
              return (
                <div key={item.productId} className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    {imgSrc && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgSrc} alt={item.product.name} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-800">{item.product.name}</p>
                    <p className="text-xs text-neutral-400">Qty: {item.quantity}</p>
                  </div>
                  <span className="text-sm font-bold text-neutral-900">{formatPrice(item.product.price * item.quantity)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
            <div className="flex justify-between text-sm text-neutral-600">
              <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-neutral-600">
              <span>Delivery</span>
              <span className={deliveryFee === 0 ? 'font-semibold text-emerald-600' : ''}>
                {deliveryFee === 0 ? 'FREE' : formatPrice(deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2 text-base font-black text-neutral-900">
              <span>Total</span><span>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
