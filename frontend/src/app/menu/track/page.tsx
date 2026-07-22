'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Flame,
  X,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Base API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface OrderItemAddon {
  id: string;
  nameSnapshot: string;
  priceSnapshot: string;
}

interface OrderItem {
  id: string;
  nameSnapshot: string;
  variantNameSnapshot: string | null;
  priceSnapshot: string;
  quantity: number;
  totalPrice: string;
  addons: OrderItemAddon[];
}

interface OrderDetails {
  id: string;
  tableId: string | null;
  table?: {
    id: string;
    tableNumber: string;
    qrToken?: {
      token: string;
    } | null;
  } | null;
  orderNumber: string;
  status: 'RECEIVED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED' | 'VOIDED';
  subtotal: string;
  cgst: string;
  sgst: string;
  serviceCharge: string;
  nightCharge: string;
  roundOff: string;
  grandTotal: string;
  notes: string | null;
  cancellationReason: string | null;
  tableNumberSnapshot: string | null;
  createdAt: string;
  items: OrderItem[];
}

interface SettingsDetails {
  enableCallWaiter: boolean;
}

const STATUS_STEPS = [
  { status: 'RECEIVED', label: 'Order Received', desc: 'Sent to the kitchen' },
  { status: 'PREPARING', label: 'Preparing', desc: 'Chefs are cooking your items' },
  { status: 'SERVED', label: 'Served', desc: 'Served at your table' },
  { status: 'COMPLETED', label: 'Completed', desc: 'Bill settled & finished' },
];

function TrackPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token') || '';

  // Order state
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [settings, setSettings] = useState<SettingsDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Waiter Call state
  const [waiterCallLoading, setWaiterCallLoading] = useState(false);
  const [waiterCallCooldown, setWaiterCallCooldown] = useState(0);
  const [waiterCallMessage, setWaiterCallMessage] = useState<string | null>(null);

  // Fetch Order details wrapped in useCallback to satisfy dependency rules
  const fetchOrder = useCallback(async (isInitial = false) => {
    if (!token) {
      setError('Invalid order tracking token.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await axios.get(`${API_URL}/public/orders/track/${token}`);
      setOrder(res.data as OrderDetails);
      if (isInitial) {
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Failed to retrieve order tracking details.');
      if (isInitial) {
        setIsLoading(false);
      }
    }
  }, [token]);

  // Initial Fetch on mount
  useEffect(() => {
    const init = async () => {
      await fetchOrder(true);
      try {
        const settingsRes = await axios.get(`${API_URL}/public/settings`);
        setSettings(settingsRes.data);
      } catch {
        // ignore
      }
    };
    init();
  }, [token, fetchOrder]);

  // Polling Interval (Every 5 seconds)
  useEffect(() => {
    if (!order) return;

    // Terminal statuses (polling stops)
    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'VOIDED'];
    if (terminalStatuses.includes(order.status)) {
      return;
    }

    const interval = setInterval(() => {
      fetchOrder();
    }, 5000);

    return () => clearInterval(interval);
  }, [order, fetchOrder]);

  // Waiter Call Cooldown Tracker
  useEffect(() => {
    if (waiterCallCooldown <= 0) return;
    const timer = setInterval(() => {
      setWaiterCallCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [waiterCallCooldown]);

  // Call Waiter Request (uses table context from loaded order)
  const handleCallWaiter = async () => {
    if (!order || waiterCallCooldown > 0) return;
    setWaiterCallLoading(true);
    setWaiterCallMessage(null);

    const lastToken = localStorage.getItem('ccb_last_token') || '';
    const orderTableId = order.tableId || '';

    try {
      const res = await axios.post(`${API_URL}/public/tables/call-waiter`, {
        tableId: orderTableId,
        token: lastToken,
      });

      setWaiterCallMessage(res.data.message);
      if (res.data.cooldownSeconds > 0) {
        setWaiterCallCooldown(res.data.cooldownSeconds);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setWaiterCallMessage(axiosError.response?.data?.message || 'Failed to request waiter.');
    } finally {
      setWaiterCallLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-[#5C3A21] animate-spin mb-4" />
        <h2 className="text-[#5C3A21] font-semibold text-lg">Retrieving order timeline...</h2>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-[#5C3A21] mb-2">Order Not Found</h1>
        <p className="text-stone-500 text-sm mb-6 max-w-sm">{error || 'This order tracking link is invalid.'}</p>
        <Button onClick={() => router.back()} className="bg-[#5C3A21] hover:bg-[#A0522D] text-white rounded-full px-6">
          Go Back
        </Button>
      </div>
    );
  }

  // Get active step index for timeline highlight
  const currentStatus = order.status;
  const isCancelled = currentStatus === 'CANCELLED';
  const isVoided = currentStatus === 'VOIDED';
  const isTerminal = ['COMPLETED', 'CANCELLED', 'VOIDED'].includes(currentStatus);

  const getStepStatus = (stepStatus: string) => {
    if (isCancelled || isVoided) return 'inactive';

    let normalizedCurrent = currentStatus;
    if (normalizedCurrent === 'ACCEPTED') normalizedCurrent = 'PREPARING';
    if (normalizedCurrent === 'READY') normalizedCurrent = 'SERVED';

    const currentIdx = STATUS_STEPS.findIndex((s) => s.status === normalizedCurrent);
    const stepIdx = STATUS_STEPS.findIndex((s) => s.status === stepStatus);

    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#5C3A21] max-w-md mx-auto shadow-xl relative pb-10">
      {/* Header */}
      <header className="sticky top-0 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-stone-200/80 p-4 z-40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="text-stone-500 hover:text-stone-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-base text-[#5C3A21]">Track Order</h1>
            <p className="text-stone-400 text-[10px] font-bold tracking-wider">{order.orderNumber}</p>
          </div>
        </div>

        {settings?.enableCallWaiter && (
          <Button
            size="sm"
            onClick={handleCallWaiter}
            disabled={waiterCallLoading || waiterCallCooldown > 0}
            className="bg-[#A0522D] hover:bg-[#5C3A21] text-white font-semibold rounded-full shadow-sm text-xs px-3 h-8 flex items-center gap-1.5"
          >
            {waiterCallLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : waiterCallCooldown > 0 ? (
              <span>Waiter ({waiterCallCooldown}s)</span>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5 fill-amber-300 animate-pulse text-amber-300" />
                <span>Call Waiter</span>
              </>
            )}
          </Button>
        )}
      </header>

      {/* Cooldown Messages */}
      {waiterCallMessage && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-[#5C3A21] text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{waiterCallMessage}</span>
          <button onClick={() => setWaiterCallMessage(null)} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Terminal banners */}
      {isCancelled && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex gap-3">
          <XCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Order Cancelled</h4>
            <p className="text-xs text-red-600/90 mt-1 leading-snug">
              {order.cancellationReason ? `Reason: "${order.cancellationReason}"` : 'This order has been cancelled.'}
            </p>
          </div>
        </div>
      )}

      {isVoided && (
        <div className="mx-4 mt-4 bg-stone-100 border border-stone-300 text-stone-700 p-4 rounded-xl flex gap-3">
          <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Order Voided</h4>
            <p className="text-xs text-stone-600 mt-1 leading-snug">
              This order has been voided. Please reach out to staff for details.
            </p>
          </div>
        </div>
      )}

      {/* Active Stepper Progress */}
      {!isCancelled && !isVoided && (
        <div className="bg-white border border-stone-200/60 p-4 mx-4 mt-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100">
            <span className="font-bold text-xs text-stone-400 uppercase tracking-wider">Status Timeline</span>
            {!isTerminal && (
              <span className="text-stone-500 text-[10px] font-bold flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A0522D]" />
                Auto-refreshing...
              </span>
            )}
          </div>

          <div className="relative pl-6 space-y-6 border-l-2 border-stone-200">
            {STATUS_STEPS.map((step) => {
              const status = getStepStatus(step.status);
              return (
                <div key={step.status} className="relative">
                  {/* Dot */}
                  <div className={`absolute -left-[31px] top-0 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all ${
                    status === 'completed'
                      ? 'bg-[#5C3A21] border-[#5C3A21]'
                      : status === 'current'
                      ? 'bg-amber-100 border-[#A0522D] animate-pulse scale-110'
                      : 'bg-white border-stone-300'
                  }`}>
                    {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    {status === 'current' && <Clock className="w-3.5 h-3.5 text-[#A0522D]" />}
                  </div>

                  {/* Labels */}
                  <div>
                    <h5 className={`font-bold text-sm ${
                      status === 'current' ? 'text-[#A0522D]' : status === 'completed' ? 'text-[#5C3A21]' : 'text-stone-400'
                    }`}>{step.label}</h5>
                    <p className="text-stone-500 text-xs mt-0.5">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bill & Details Preview */}
      <div className="bg-white border border-stone-200/60 p-4 mx-4 mt-4 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center gap-1.5 pb-2 border-b border-stone-100 text-[#5C3A21] font-bold text-xs uppercase tracking-wider">
          <FileText className="w-4 h-4 text-[#A0522D]" />
          <span>Current Bill Details</span>
        </div>

        <div className="divide-y divide-stone-100">
          {order.items.map((item) => (
            <div key={item.id} className="py-2.5 flex justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-stone-800 truncate">{item.nameSnapshot}</p>
                {item.variantNameSnapshot && (
                  <p className="text-stone-400 text-[10px] font-bold mt-0.5">Size: {item.variantNameSnapshot}</p>
                )}
                {item.addons.length > 0 && (
                  <p className="text-[#A0522D] text-[10px] font-semibold mt-0.5">
                    Addons: {item.addons.map((a) => a.nameSnapshot).join(', ')}
                  </p>
                )}
              </div>
              <span className="text-stone-500 font-bold shrink-0">x{item.quantity}</span>
              <span className="font-extrabold text-stone-800 shrink-0">₹{item.totalPrice}</span>
            </div>
          ))}
        </div>

        {/* Pricing Summary */}
        <div className="border-t border-stone-200/70 pt-2.5 space-y-2 text-xs font-semibold text-stone-500">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="text-stone-800">₹{order.subtotal}</span>
          </div>
          {Number(order.cgst) > 0 && (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span className="text-stone-800">₹{order.cgst}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span className="text-stone-800">₹{order.sgst}</span>
              </div>
            </>
          )}
          {Number(order.serviceCharge) > 0 && (
            <div className="flex justify-between">
              <span>Service Charge</span>
              <span className="text-stone-800">₹{order.serviceCharge}</span>
            </div>
          )}
          {Number(order.nightCharge) > 0 && (
            <div className="flex justify-between">
              <span>Night Charge</span>
              <span className="text-stone-800">₹{order.nightCharge}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Round Off</span>
            <span className="text-stone-800">₹{order.roundOff}</span>
          </div>
          <div className="flex justify-between text-sm font-black border-t border-stone-200/70 pt-2 text-[#5C3A21]">
            <span>Grand Total</span>
            <span className="text-[#A0522D]">₹{order.grandTotal}</span>
          </div>
        </div>
      </div>

      {/* Add More Items Button */}
      {!isTerminal && (
        <div className="mx-4 mt-6">
          <Button
            onClick={() => {
              const tableQrToken =
                order.table?.qrToken?.token ||
                (order.tableId ? localStorage.getItem(`ccb_table_qr_token_${order.tableId}`) : null) ||
                localStorage.getItem('ccb_last_table_qr_token') ||
                localStorage.getItem('ccb_last_token') ||
                '';

              if (order.tableId && tableQrToken) {
                router.push(`/menu.html?table=${order.tableId}&token=${tableQrToken}`);
              } else {
                router.push('/menu.html');
              }
            }}
            className="w-full bg-[#5C3A21] hover:bg-[#A0522D] text-white font-extrabold py-3 rounded-full flex items-center justify-center gap-2 shadow-lg"
          >
            <span>+ Add More Items</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-[#5C3A21] animate-spin mb-4" />
        <h2 className="text-[#5C3A21] font-semibold text-lg font-mono">Loading order tracker...</h2>
      </div>
    }>
      <TrackPageContent />
    </Suspense>
  );
}
