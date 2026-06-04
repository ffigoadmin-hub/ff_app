'use client';

import { motion } from 'framer-motion';
import { Check, Truck, Package, ShoppingBag, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderStatus = string;

interface OrderTrackingCardProps {
  status: OrderStatus;
  estimatedDelivery?: string | null;
}

const STEPS = [
  { status: 'PLACED',           label: 'Order Placed',     icon: ShoppingBag, desc: 'We have received your order' },
  { status: 'CONFIRMED',        label: 'Confirmed',         icon: Check,       desc: 'Order confirmed and being processed' },
  { status: 'PICKING',          label: 'Packing',           icon: Package,     desc: 'Items are being picked and packed' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery',  icon: Truck,       desc: 'Our rider is on the way to you' },
  { status: 'DELIVERED',        label: 'Delivered',         icon: Check,       desc: 'Arrived at your doorstep!' },
];

// Map DB status values (may be lowercase/different) to component status
function normalizeStatus(status: string): string {
  const map: Record<string, string> = {
    pending:          'PLACED',
    placed:           'PLACED',
    confirmed:        'CONFIRMED',
    picking:          'PICKING',
    packed:           'PICKING',
    out_for_delivery: 'OUT_FOR_DELIVERY',
    delivered:        'DELIVERED',
  };
  return map[status.toLowerCase()] ?? status.toUpperCase();
}

export function OrderTrackingCard({ status, estimatedDelivery }: OrderTrackingCardProps) {
  const normalized    = normalizeStatus(status);
  const isCancelled   = normalized === 'CANCELLED';
  const currentIdx    = STEPS.findIndex((s) => s.status === normalized);
  const activeIdx     = currentIdx === -1 ? 0 : currentIdx;

  // Progress line height as % (from center of first icon to center of last icon)
  // Each step is 56px tall (h-14) + 24px gap (space-y-6) = 80px
  // Line spans from center of step[0] to center of step[last]
  const progressPct = activeIdx > 0 ? (activeIdx / (STEPS.length - 1)) * 100 : 0;

  if (isCancelled) {
    return (
      <div className="flex items-center gap-4 rounded-3xl border border-red-100 bg-red-50 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <XCircle className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-red-900">Order Cancelled</h3>
          <p className="text-sm text-red-600">This order has been cancelled. Refund will be processed shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-xl shadow-neutral-100">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Status</p>
          <h3 className="text-xl font-black text-neutral-900">
            {STEPS[activeIdx]?.label ?? status}
          </h3>
        </div>
        {estimatedDelivery && (
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Expected</p>
            <div className="flex items-center gap-1.5 text-primary-600">
              <Clock className="h-4 w-4" />
              <span className="text-lg font-black">{estimatedDelivery}</span>
            </div>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Grey background line — from top of first icon to bottom of last icon */}
        <div className="absolute bottom-7 left-7 top-7 w-0.5 -translate-x-1/2 bg-neutral-100" />

        {/* Animated green progress line */}
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: progressPct / 100 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="absolute left-7 top-7 w-0.5 -translate-x-1/2 origin-top bg-primary-600"
          style={{ height: 'calc(100% - 56px)' }}
        />

        <div className="space-y-6">
          {STEPS.map((step, index) => {
            const Icon      = step.icon;
            const completed = index <= activeIdx;
            const current   = index === activeIdx;

            return (
              <div key={step.status} className="relative flex items-center gap-5">
                {/* Step icon */}
                <div className={cn(
                  'relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all duration-500',
                  completed ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-neutral-100 text-neutral-300',
                  current   && 'ring-4 ring-primary-100',
                )}>
                  <Icon className={cn('h-6 w-6', current && 'animate-pulse')} />
                </div>

                {/* Step label */}
                <div>
                  <p className={cn(
                    'font-bold transition-colors duration-500',
                    completed ? 'text-neutral-900' : 'text-neutral-300',
                    current   && 'text-lg text-primary-600',
                  )}>
                    {step.label}
                  </p>
                  {current && (
                    <p className="text-xs font-medium text-neutral-500">{step.desc}</p>
                  )}
                </div>

                {/* Current pulse indicator */}
                {current && (
                  <div className="absolute -right-1 top-1/2 -translate-y-1/2">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-600" />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
