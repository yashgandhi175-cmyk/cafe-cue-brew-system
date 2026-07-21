'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ShoppingBag,
  User,
  Phone,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Flame,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Handcrafted Modal Component for compile safety and zero dependency overhead
interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

function CustomModal({ isOpen, onClose, title, description, children }: CustomModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-opacity">
      <div className="bg-[#FDFBF7] text-[#5C3A21] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 bg-stone-100 border-b border-stone-200 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-base leading-none text-[#5C3A21]">{title}</h3>
            {description && <p className="text-stone-500 text-xs font-semibold mt-1.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-[#5C3A21]/60 hover:text-[#5C3A21] font-bold text-lg leading-none">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Chime player using Web Audio API (zero static file dependency)
const playChime = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    const now = audioCtx.currentTime;
    playTone(523.25, now, 0.4); // C5
    playTone(659.25, now + 0.12, 0.5); // E5
  } catch (err) {
    console.error('Failed to play audio:', err);
  }
};

interface OrderItem {
  id: string;
  nameSnapshot: string;
  variantNameSnapshot: string | null;
  priceSnapshot: string;
  variantPriceSnapshot: string | null;
  discountSnapshot: string;
  quantity: number;
  totalPrice: string;
  notes: string | null;
  addons: Array<{
    id: string;
    nameSnapshot: string;
    priceSnapshot: string;
  }>;
}

interface Order {
  id: string;
  orderNumber: string;
  publicTrackingToken: string;
  customerId: string | null;
  tableId: string | null;
  tableSessionId?: string | null;
  tableNumberSnapshot: string | null;
  source: 'QR' | 'OWNER_POS' | 'MANAGER' | 'WAITER' | 'CASHIER';
  status: 'RECEIVED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED' | 'VOIDED';
  paymentStatus: 'UNPAID' | 'PAID' | 'PARTIALLY_PAID' | 'REFUNDED';
  subtotal: string;
  discount: string;
  couponDiscount: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  serviceCharge: string;
  nightCharge: string;
  roundOff: string;
  grandTotal: string;
  notes: string | null;
  createdAt: string;
  cancellationReason: string | null;
  cancelledById: string | null;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  table?: {
    id: string;
    tableNumber: string;
  };
  createdBy?: {
    name: string;
    role: string;
  };
  items: OrderItem[];
  statusHistory?: Array<{
    id: string;
    oldStatus: string | null;
    newStatus: string;
    changedBy?: {
      name: string;
      role: string;
    };
    changedAt: string;
    notes: string | null;
  }>;
}

interface WaiterCall {
  id: string;
  tableId: string;
  tableNumberSnapshot: string;
  requestedAt: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
  handledBy?: {
    name: string;
    role: string;
  };
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [currentTab, setCurrentTab] = useState<'live' | 'history'>('live');
  const [staff] = useState<{ id: string; role: string; name: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const staffData = localStorage.getItem('ccb_staff');
      if (staffData) {
        try {
          return JSON.parse(staffData);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  const [nowTime, setNowTime] = useState<number>(() => typeof window !== 'undefined' ? Date.now() : 0);

  // Sound and notifications states
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ccb_enable_sound') === 'true';
    }
    return false;
  });
  const [selectedMobileStatusTab, setSelectedMobileStatusTab] = useState<'RECEIVED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED'>('RECEIVED');
  
  // Dialog/Detail state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [groupByTable, setGroupByTable] = useState(true);
  const [selectedGroupOrders, setSelectedGroupOrders] = useState<Order[] | null>(null);

  // Status transitions state
  const [isOverrideChecked, setIsOverrideChecked] = useState(false);
  const [overrideReasonText, setOverrideReasonText] = useState('');
  const [cancellationReason, setCancellationReason] = useState('CUSTOMER_CANCELLED');
  const [customCancelReasonText, setCustomCancelReasonText] = useState('');
  const [voidReasonText, setVoidReasonText] = useState('');
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  // History pagination and filter states
  const [histPage, setHistPage] = useState(1);
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState<string>('ALL');
  const [histPayment, setHistPayment] = useState<string>('ALL');
  const [histSource, setHistSource] = useState<string>('ALL');
  const [histTable, setHistTable] = useState<string>('ALL');

  // Baseline tracker to prevent chime on loaded RECEIVED orders
  const seenReceivedIds = useRef<Set<string>>(new Set());
  const isBaselineCreated = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const interval = setInterval(() => {
        setNowTime(Date.now());
      }, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ccb_enable_sound', String(newVal));
    }
    // Attempt play to unblock browser Audio Context
    if (newVal) playChime();
  };

  // Queries
  const { data: liveOrders = [] } = useQuery<Order[]>({
    queryKey: ['liveOrders'],
    queryFn: async () => {
      const res = await api.get('/orders/live');
      return res.data;
    },
    refetchInterval: 3000,
    enabled: currentTab === 'live',
  });

  const { data: activeWaiterCalls = [] } = useQuery<WaiterCall[]>({
    queryKey: ['activeWaiterCalls'],
    queryFn: async () => {
      const res = await api.get('/waiter-calls/active');
      return res.data;
    },
    refetchInterval: 3000,
    enabled: currentTab === 'live',
  });

  const { data: historyData } = useQuery<{ data: Order[]; meta: { totalPages: number } }>({
    queryKey: ['historyOrders', histPage, histSearch, histStatus, histPayment, histSource, histTable],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: histPage, limit: 15 };
      if (histSearch) params.search = histSearch;
      if (histStatus !== 'ALL') params.status = histStatus;
      if (histPayment !== 'ALL') params.paymentStatus = histPayment;
      if (histSource !== 'ALL') params.source = histSource;
      if (histTable !== 'ALL') params.tableId = histTable;
      const res = await api.get('/orders', { params });
      return res.data;
    },
    enabled: currentTab === 'history',
  });

  const { data: tablesList = [] } = useQuery<Array<{ id: string; tableNumber: string }>>({
    queryKey: ['tablesList'],
    queryFn: async () => {
      const res = await api.get('/tables');
      return res.data;
    },
  });

  // Sound triggering on newly arriving RECEIVED orders
  useEffect(() => {
    if (currentTab !== 'live' || liveOrders.length === 0) return;

    const currentReceived = liveOrders.filter((o) => o.status === 'RECEIVED');

    if (!isBaselineCreated.current) {
      // Create initial baseline
      currentReceived.forEach((o) => seenReceivedIds.current.add(o.id));
      isBaselineCreated.current = true;
      return;
    }

    // Check if any RECEIVED order is newly detected
    let hasNewReceived = false;
    currentReceived.forEach((o) => {
      if (!seenReceivedIds.current.has(o.id)) {
        seenReceivedIds.current.add(o.id);
        hasNewReceived = true;
      }
    });

    if (hasNewReceived && soundEnabled) {
      playChime();
    }
  }, [liveOrders, currentTab, soundEnabled]);

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, override, overrideReason }: { id: string; status: string; override?: boolean; overrideReason?: string }) => {
      return api.patch(`/orders/${id}/status`, { status, override, overrideReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders'] });
      setDetailModalOpen(false);
      setSelectedOrder(null);
      setIsOverrideChecked(false);
      setOverrideReasonText('');
      setErrorAlert(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setErrorAlert(axiosError.response?.data?.message || 'Failed to update order status.');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ id, reason, customReason }: { id: string; reason: string; customReason?: string }) => {
      return api.post(`/orders/${id}/cancel`, { reason, customReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders'] });
      setDetailModalOpen(false);
      setSelectedOrder(null);
      setCustomCancelReasonText('');
      setErrorAlert(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setErrorAlert(axiosError.response?.data?.message || 'Failed to cancel order.');
    },
  });

  const voidOrderMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return api.post(`/orders/${id}/void`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders'] });
      setDetailModalOpen(false);
      setSelectedOrder(null);
      setVoidReasonText('');
      setErrorAlert(null);
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setErrorAlert(axiosError.response?.data?.message || 'Failed to void order.');
    },
  });

  const acknowledgeCallMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.patch(`/waiter-calls/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWaiterCalls'] });
    },
  });

  const resolveCallMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.patch(`/waiter-calls/${id}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWaiterCalls'] });
    },
  });

  const handleCardClick = async (order: Order) => {
    try {
      const res = await api.get(`/orders/${order.id}`);
      setSelectedOrder(res.data);
      setDetailModalOpen(true);
      setErrorAlert(null);
    } catch {
      // fallback to list data
      setSelectedOrder(order);
      setDetailModalOpen(true);
      setErrorAlert(null);
    }
  };

  const getElapsedTime = (createdTime: string) => {
    if (nowTime === 0) return 'Loading...';
    const elapsedMs = nowTime - new Date(createdTime).getTime();
    const mins = Math.floor(elapsedMs / 60000);
    if (mins < 1) return 'Just now';
    return `${mins}m ago`;
  };

  // Safe role check logic
  const isOwner = staff?.role === 'OWNER';
  const isManager = staff?.role === 'MANAGER';
  const isWaiter = staff?.role === 'WAITER';
  const isCashier = staff?.role === 'CASHIER';
  const canModifyStatus = isOwner || isManager || isWaiter || isCashier;

  // Filter live orders by columns
  const filterLive = (status: string) => {
    return liveOrders.filter((o) => o.status === status);
  };

  // Grouping helper for live orders
  const groupOrdersForStatus = (status: string) => {
    const rawList = liveOrders.filter((o) => o.status === status);
    if (!groupByTable) {
      return rawList.map((o) => ({ isGroup: false as const, order: o, id: o.id, createdAt: o.createdAt }));
    }

    const groupsMap = new Map<string, {
      isGroup: true;
      id: string;
      tableNumber: string;
      customerName: string;
      orders: Order[];
      orderNumbers: string[];
      itemsCount: number;
      grandTotal: number;
      createdAt: string;
    }>();

    const standalone: Array<{ isGroup: false; order: Order; id: string; createdAt: string }> = [];

    for (const ord of rawList) {
      const tableKey = ord.tableSessionId || ord.tableId || ord.tableNumberSnapshot;
      if (!tableKey) {
        standalone.push({ isGroup: false, order: ord, id: ord.id, createdAt: ord.createdAt });
        continue;
      }

      if (!groupsMap.has(tableKey)) {
        groupsMap.set(tableKey, {
          isGroup: true,
          id: tableKey,
          tableNumber: ord.tableNumberSnapshot || 'Table',
          customerName: ord.customer?.name || 'Customer',
          orders: [ord],
          orderNumbers: [ord.orderNumber],
          itemsCount: ord.items.reduce((acc, i) => acc + i.quantity, 0),
          grandTotal: Number(ord.grandTotal),
          createdAt: ord.createdAt,
        });
      } else {
        const group = groupsMap.get(tableKey)!;
        group.orders.push(ord);
        group.orderNumbers.push(ord.orderNumber);
        group.itemsCount += ord.items.reduce((acc, i) => acc + i.quantity, 0);
        group.grandTotal += Number(ord.grandTotal);
        if (new Date(ord.createdAt) < new Date(group.createdAt)) {
          group.createdAt = ord.createdAt;
        }
      }
    }

    return [...Array.from(groupsMap.values()), ...standalone];
  };

  const handleGroupCardClick = (orders: Order[]) => {
    if (orders.length === 1) {
      handleCardClick(orders[0]);
      return;
    }
    setSelectedGroupOrders(orders);
    setSelectedOrder(orders[0]);
    setDetailModalOpen(true);
    setErrorAlert(null);
  };

  const executeStatusUpdate = async (targetStatus: string) => {
    if (!selectedOrder) return;
    const ordersToUpdate = (selectedGroupOrders && selectedGroupOrders.length > 0)
      ? selectedGroupOrders
      : [selectedOrder];

    try {
      await Promise.all(
        ordersToUpdate.map((o) =>
          api.patch(`/orders/${o.id}/status`, {
            status: targetStatus,
            override: isOverrideChecked,
            overrideReason: overrideReasonText || undefined,
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['liveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders'] });
      setDetailModalOpen(false);
      setSelectedOrder(null);
      setSelectedGroupOrders(null);
      setIsOverrideChecked(false);
      setOverrideReasonText('');
      setErrorAlert(null);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setErrorAlert(axiosError.response?.data?.message || 'Failed to update order status.');
    }
  };

  return (
    <div className="space-y-6 text-[#5C3A21]">
      {/* Top action/tabs bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#3C2A21] flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-[#8F6A50]" /> Order Management
          </h1>
          <p className="text-stone-500 text-xs mt-1 font-medium">Monitor active tables and manage kitchen state transitions.</p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Sounds trigger unblock button */}
          <button
            onClick={toggleSound}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-xs ${
              soundEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-stone-100 border-stone-300 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Chime Active' : 'Sound Blocked'}</span>
          </button>

          {/* Group by Table Toggle */}
          <button
            onClick={() => setGroupByTable(!groupByTable)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shadow-xs ${
              groupByTable
                ? 'bg-amber-100 border-amber-300 text-amber-900 font-extrabold'
                : 'bg-stone-100 border-stone-300 text-stone-600 hover:bg-stone-200'
            }`}
            title="Group multiple orders from the same table into a single card"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{groupByTable ? 'Grouped by Table' : 'Individual Orders'}</span>
          </button>

          <div className="flex bg-stone-150 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setCurrentTab('live')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentTab === 'live'
                  ? 'bg-white text-[#3C2A21] shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Live Board
            </button>
            <button
              onClick={() => setCurrentTab('history')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentTab === 'history'
                  ? 'bg-white text-[#3C2A21] shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Order History
            </button>
          </div>
        </div>
      </div>

      {currentTab === 'live' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Waiter Calls Sidebar widget */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white border border-stone-200/80 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 bg-amber-50/50 border-b border-stone-200 flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-[#5C3A21] flex items-center gap-1.5">
                  <Flame className="w-4.5 h-4.5 text-amber-600 animate-pulse" /> Waiter Requests
                </h3>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {activeWaiterCalls.length} Active
                </span>
              </div>

              <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto no-scrollbar">
                {activeWaiterCalls.length === 0 ? (
                  <div className="p-8 text-center text-stone-400 text-xs font-medium">
                    No active waiter assistance requested.
                  </div>
                ) : (
                  activeWaiterCalls.map((call) => (
                    <div key={call.id} className="p-4 space-y-2.5 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-stone-800 text-sm">{call.tableNumberSnapshot}</p>
                          <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                            Called {getElapsedTime(call.requestedAt)}
                          </p>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          call.status === 'PENDING' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-blue-50 text-blue-600 border border-blue-200'
                        }`}>
                          {call.status}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        {call.status === 'PENDING' && (
                          <button
                            onClick={() => acknowledgeCallMutation.mutate(call.id)}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-2.5 rounded-lg transition-colors leading-none"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          onClick={() => resolveCallMutation.mutate(call.id)}
                          className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 font-bold py-1 px-2.5 rounded-lg transition-colors leading-none"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Active columns board */}
          <div className="lg:col-span-3 space-y-4">
            {/* Mobile Tab Switcher */}
            <div className="md:hidden flex gap-1 overflow-x-auto no-scrollbar bg-stone-100 p-1 rounded-xl border border-stone-200">
              {(['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedMobileStatusTab(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
                    selectedMobileStatusTab === s
                      ? 'bg-white text-[#3C2A21] shadow-xs'
                      : 'text-stone-500'
                  }`}
                >
                  {s} ({filterLive(s).length})
                </button>
              ))}
            </div>

            {/* Columns grid */}
            <div className="hidden md:grid grid-cols-5 gap-3.5 items-start">
              {(['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const).map((status) => {
                const list = groupOrdersForStatus(status);
                return (
                  <div key={status} className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 space-y-3 min-h-[500px]">
                    <div className="flex justify-between items-center border-b border-stone-200/60 pb-2">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider text-stone-500">{status}</span>
                      <span className="bg-stone-200/80 text-stone-700 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                        {list.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[480px] overflow-y-auto no-scrollbar">
                      {list.map((item) => {
                        if ('isGroup' in item && item.isGroup) {
                          return (
                            <div
                              key={item.id}
                              onClick={() => handleGroupCardClick(item.orders)}
                              className="bg-amber-50/40 border border-amber-300 hover:border-[#8F6A50] rounded-xl p-3 space-y-2 shadow-xs cursor-pointer hover:shadow-md transition-all duration-150 relative overflow-hidden"
                            >
                              {status === 'RECEIVED' && (
                                <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500 animate-pulse" />
                              )}
                              <div className="flex justify-between items-start text-xs">
                                <span className="font-black text-[#5C3A21] truncate flex items-center gap-1.5">
                                  <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-black">
                                    {item.orders.length} orders
                                  </span>
                                  <span>{item.tableNumber}</span>
                                </span>
                                <span className="text-[10px] text-stone-400 font-extrabold shrink-0">
                                  {getElapsedTime(item.createdAt)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs font-bold text-[#8F6A50]">
                                <span className="text-stone-600 truncate">{item.customerName}</span>
                              </div>

                              <div className="flex justify-between items-center border-t border-stone-200/60 pt-2 text-[10px] font-extrabold text-stone-500">
                                <span>{item.itemsCount} items</span>
                                <span className="text-[#A0522D] text-xs font-black">₹{item.grandTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        }

                        const order = item.order;
                        return (
                          <div
                            key={order.id}
                            onClick={() => handleCardClick(order)}
                            className="bg-white border border-stone-200/60 hover:border-[#8F6A50] rounded-xl p-3 space-y-2 shadow-xs cursor-pointer hover:shadow-md transition-all duration-150 relative overflow-hidden"
                          >
                            {status === 'RECEIVED' && (
                              <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 animate-pulse" />
                            )}
                            <div className="flex justify-between items-start text-xs">
                              <span className="font-black text-stone-800 truncate">{order.orderNumber}</span>
                              <span className="text-[10px] text-stone-400 font-extrabold shrink-0">
                                {getElapsedTime(order.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8F6A50]">
                              <span>{order.tableNumberSnapshot || 'POS'}</span>
                              <span className="text-stone-300">•</span>
                              <span className="text-stone-500 truncate">{order.customer?.name || 'Customer'}</span>
                            </div>

                            <div className="flex justify-between items-center border-t border-stone-100 pt-2 text-[10px] font-extrabold text-stone-400">
                              <span>{order.items.length} items</span>
                              <span className="text-[#A0522D] text-xs font-black">₹{order.grandTotal}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Tab Column */}
            <div className="md:hidden space-y-2">
              {filterLive(selectedMobileStatusTab).map((order) => (
                <div
                  key={order.id}
                  onClick={() => handleCardClick(order)}
                  className="bg-white border border-stone-200/60 p-4 rounded-xl space-y-2.5 shadow-xs relative overflow-hidden"
                >
                  {selectedMobileStatusTab === 'RECEIVED' && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 animate-pulse" />
                  )}
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-stone-800 text-sm">{order.orderNumber}</span>
                    <span className="text-stone-400 font-extrabold">{getElapsedTime(order.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="text-[#8F6A50] font-black">{order.tableNumberSnapshot || 'POS'}</span>
                    <span className="text-stone-300">•</span>
                    <span className="text-stone-600">{order.customer?.name || 'Customer'}</span>
                  </div>

                  <div className="flex justify-between items-center border-t border-stone-100 pt-2.5 text-xs font-bold text-stone-400">
                    <span>{order.items.length} items</span>
                    <span className="text-[#A0522D] font-black text-sm">₹{order.grandTotal}</span>
                  </div>
                </div>
              ))}
              {filterLive(selectedMobileStatusTab).length === 0 && (
                <div className="text-center py-12 text-stone-400 font-medium text-xs">
                  No orders in {selectedMobileStatusTab} column.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* History orders table */
        <div className="bg-white border border-stone-200/80 rounded-2xl shadow-xs overflow-hidden">
          {/* Filters header bar */}
          <div className="p-4 border-b border-stone-200 bg-stone-50/50 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-stone-400" />
              <span className="font-extrabold text-xs text-stone-500 uppercase tracking-wider">Search & Filters</span>
            </div>

            <div className="flex flex-wrap gap-2 items-center flex-1 max-w-2xl justify-end">
              <div className="relative w-44">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Order No / Name"
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  className="pl-8 w-full border border-stone-200 rounded-lg py-1.5 text-xs bg-white text-[#5C3A21] placeholder-stone-400 font-medium focus:outline-none"
                />
              </div>

              <select
                value={histStatus}
                onChange={(e) => setHistStatus(e.target.value)}
                className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white text-[#5C3A21] focus:outline-none font-bold"
              >
                <option value="ALL">All Statuses</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="PREPARING">PREPARING</option>
                <option value="READY">READY</option>
                <option value="SERVED">SERVED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="VOIDED">VOIDED</option>
              </select>

              <select
                value={histPayment}
                onChange={(e) => setHistPayment(e.target.value)}
                className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white text-[#5C3A21] focus:outline-none font-bold"
              >
                <option value="ALL">All Payments</option>
                <option value="UNPAID">UNPAID</option>
                <option value="PAID">PAID</option>
                <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
              </select>

              <select
                value={histSource}
                onChange={(e) => setHistSource(e.target.value)}
                className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white text-[#5C3A21] focus:outline-none font-bold"
              >
                <option value="ALL">All Sources</option>
                <option value="QR">QR</option>
                <option value="OWNER_POS">POS</option>
                <option value="WAITER">WAITER</option>
              </select>

              <select
                value={histTable}
                onChange={(e) => setHistTable(e.target.value)}
                className="border border-stone-200 rounded-lg px-2 py-1.5 text-xs bg-white text-[#5C3A21] focus:outline-none font-bold"
              >
                <option value="ALL">All Tables</option>
                {tablesList.map((t) => (
                  <option key={t.id} value={t.id}>{t.tableNumber}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 text-stone-500 font-extrabold uppercase border-b border-stone-100">
                  <th className="p-3.5">Order Number</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Table</th>
                  <th className="p-3.5">Customer Name</th>
                  <th className="p-3.5">Source</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {historyData?.data.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => handleCardClick(order)}
                    className="hover:bg-stone-50/50 cursor-pointer font-medium text-stone-700"
                  >
                    <td className="p-3.5 font-bold text-[#3C2A21]">{order.orderNumber}</td>
                    <td className="p-3.5 text-stone-400">
                      {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3.5 font-bold text-stone-600">{order.tableNumberSnapshot || 'POS'}</td>
                    <td className="p-3.5">{order.customer?.name || 'Walk-in'}</td>
                    <td className="p-3.5 font-bold">{order.source}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        order.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border border-green-200' :
                        order.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border border-red-200' :
                        order.status === 'VOIDED' ? 'bg-stone-100 text-stone-700 border border-stone-300' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        order.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                        order.paymentStatus === 'PARTIALLY_PAID' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-black text-[#A0522D] text-sm">₹{order.grandTotal}</td>
                  </tr>
                ))}
                {historyData?.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-stone-400 font-medium">
                      No historical orders matched the selected filter query criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="p-4 border-t border-stone-200 bg-stone-50/50 flex justify-between items-center text-xs">
            <span className="text-stone-400 font-bold">Page {histPage} of {historyData?.meta.totalPages || 1}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setHistPage(Math.max(1, histPage - 1))}
                disabled={histPage <= 1}
                className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 h-8 px-2.5 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => setHistPage(histPage + 1)}
                disabled={histPage >= (historyData?.meta.totalPages || 1)}
                className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 h-8 px-2.5 rounded-lg"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Order Details CustomModal */}
      {selectedOrder && (
        <CustomModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Order Details: ${selectedOrder.orderNumber}`}
          description={`Placed on ${new Date(selectedOrder.createdAt).toLocaleString()}`}
        >
          <div className="p-5 max-h-[500px] overflow-y-auto space-y-5 text-xs text-[#5C3A21] no-scrollbar">
            {errorAlert && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg font-semibold">
                {errorAlert}
              </div>
            )}

            {/* Order info blocks */}
            <div className="grid grid-cols-2 gap-4 bg-white border border-stone-200/80 p-3.5 rounded-xl">
              <div>
                <p className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Source</p>
                <p className="font-extrabold text-stone-800 text-xs mt-0.5">{selectedOrder.source}</p>
              </div>
              <div>
                <p className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Table</p>
                <p className="font-extrabold text-stone-800 text-xs mt-0.5">{selectedOrder.tableNumberSnapshot || 'POS'}</p>
              </div>
              <div className="col-span-2 border-t border-stone-100 pt-2.5">
                <p className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Customer Contact</p>
                <div className="flex gap-2 text-stone-800 font-bold mt-1">
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-stone-400" /> {selectedOrder.customer?.name || 'Walk-in'}</span>
                  {selectedOrder.customer?.phone && (
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-stone-400" /> {selectedOrder.customer.phone}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Items Snapshots */}
            <div className="space-y-2">
              <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D]">Itemized Order items</h4>
              <div className="divide-y divide-stone-100 bg-white border border-stone-200/80 rounded-xl p-3.5 space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex justify-between gap-3 font-medium">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-800 truncate">{item.nameSnapshot}</p>
                      {item.variantNameSnapshot && (
                        <p className="text-stone-400 text-[10px] font-black mt-0.5">Size: {item.variantNameSnapshot}</p>
                      )}
                      {item.addons.length > 0 && (
                        <p className="text-[#A0522D] text-[10px] font-bold mt-0.5">
                          Addons: {item.addons.map((a) => a.nameSnapshot).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-amber-700 text-[10px] font-bold italic mt-1 bg-amber-50/50 p-1.5 rounded-md border border-amber-100">
                          &ldquo;{item.notes}&rdquo;
                        </p>
                      )}
                    </div>
                    <span className="text-stone-400 font-black text-xs px-2 shrink-0">x{item.quantity}</span>
                    <span className="font-extrabold text-stone-800 shrink-0">₹{item.totalPrice}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill summary breakdown */}
            <div className="space-y-2">
              <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D]">Billing Calculations</h4>
              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2 font-semibold text-stone-500">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-stone-800">₹{selectedOrder.subtotal}</span>
                </div>
                {Number(selectedOrder.cgst) > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>CGST</span>
                      <span className="text-stone-800">₹{selectedOrder.cgst}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST</span>
                      <span className="text-stone-800">₹{selectedOrder.sgst}</span>
                    </div>
                  </>
                )}
                {Number(selectedOrder.serviceCharge) > 0 && (
                  <div className="flex justify-between">
                    <span>Service Charge</span>
                    <span className="text-stone-800">₹{selectedOrder.serviceCharge}</span>
                  </div>
                )}
                {Number(selectedOrder.nightCharge) > 0 && (
                  <div className="flex justify-between">
                    <span>Night Surcharge</span>
                    <span className="text-stone-800">₹{selectedOrder.nightCharge}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Round Off</span>
                  <span className="text-stone-800">₹{selectedOrder.roundOff}</span>
                </div>
                <div className="flex justify-between text-sm font-black border-t border-stone-200/70 pt-2 text-[#5C3A21]">
                  <span>Grand Total</span>
                  <span className="text-[#A0522D]">₹{selectedOrder.grandTotal}</span>
                </div>
              </div>
            </div>

            {/* Order Timeline History */}
            {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D]">Status Log Timeline</h4>
                <div className="bg-white border border-stone-200/80 p-3.5 rounded-xl space-y-3.5">
                  {selectedOrder.statusHistory.map((history) => (
                    <div key={history.id} className="relative pl-4 border-l-2 border-stone-200 flex justify-between items-start text-[11px] font-medium text-stone-500">
                      <div className="absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#8F6A50]" />
                      <div>
                        <p className="font-bold text-stone-700">{history.newStatus}</p>
                        {history.notes && <p className="text-[#A0522D] font-bold mt-0.5">{history.notes}</p>}
                        <p className="text-[9px] text-stone-400 font-bold mt-1">
                          Changed by {history.changedBy?.name || 'System'} ({history.changedBy?.role || 'SYSTEM'})
                        </p>
                      </div>
                      <span className="text-[10px] text-stone-400 font-bold shrink-0">
                        {new Date(history.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff status transition controls */}
            {canModifyStatus && !['COMPLETED', 'CANCELLED', 'VOIDED'].includes(selectedOrder.status) && (
              <div className="space-y-3.5 border-t border-stone-200 pt-4">
                <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D]">Transition Order Status</h4>

                {/* Owner Override checkbox options */}
                {isOwner && (
                  <div className="space-y-2 bg-amber-50/50 border border-amber-200 p-3 rounded-xl">
                    <label className="flex items-center gap-2 font-bold cursor-pointer text-[#5C3A21]">
                      <input
                        type="checkbox"
                        checked={isOverrideChecked}
                        onChange={(e) => setIsOverrideChecked(e.target.checked)}
                        className="w-4 h-4 accent-[#A0522D]"
                      />
                      <span>Enable Owner Override correction</span>
                    </label>
                    {isOverrideChecked && (
                      <input
                        type="text"
                        placeholder="Reason for override status jump..."
                        value={overrideReasonText}
                        onChange={(e) => setOverrideReasonText(e.target.value)}
                        className="w-full p-2 bg-white border border-amber-300 rounded-lg focus:outline-none"
                      />
                    )}
                  </div>
                )}

                {/* Transitions buttons list */}
                <div className="flex flex-wrap gap-2">
                  {/* RECEIVED -> ACCEPTED */}
                  {selectedOrder.status === 'RECEIVED' && (isOwner || isManager) && (
                    <Button
                      onClick={() => executeStatusUpdate('ACCEPTED')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg"
                    >
                      Accept Order
                    </Button>
                  )}

                  {/* ACCEPTED -> PREPARING */}
                  {selectedOrder.status === 'ACCEPTED' && (isOwner || isManager) && (
                    <Button
                      onClick={() => executeStatusUpdate('PREPARING')}
                      className="bg-[#8F6A50] hover:bg-[#5C3A21] text-white font-bold px-4 py-2 rounded-lg"
                    >
                      Start Preparation
                    </Button>
                  )}

                  {/* PREPARING -> READY */}
                  {selectedOrder.status === 'PREPARING' && (isOwner || isManager) && (
                    <Button
                      onClick={() => executeStatusUpdate('READY')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg"
                    >
                      Mark Ready to Serve
                    </Button>
                  )}

                  {/* READY -> SERVED */}
                  {selectedOrder.status === 'READY' && (isOwner || isManager || isWaiter) && (
                    <Button
                      onClick={() => executeStatusUpdate('SERVED')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg"
                    >
                      Mark Served
                    </Button>
                  )}

                  {/* SERVED -> COMPLETED */}
                  {selectedOrder.status === 'SERVED' && (isOwner || isManager || isCashier) && (
                    <Button
                      onClick={() => executeStatusUpdate('COMPLETED')}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg"
                    >
                      Complete Order
                    </Button>
                  )}

                  {/* Fallback override action buttons */}
                  {isOverrideChecked && isOwner && (
                    <div className="w-full grid grid-cols-2 gap-2 mt-2 border-t border-amber-200/50 pt-2.5">
                      {(['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'] as const).map((destStatus) => (
                        <button
                          key={destStatus}
                          onClick={() => executeStatusUpdate(destStatus)}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold py-1.5 px-2 rounded-lg transition-colors"
                        >
                          Jump to {destStatus}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cancel panel */}
                {(!isWaiter) && (
                  <div className="space-y-2 border-t border-stone-200/60 pt-3">
                    <h5 className="font-extrabold text-[#5C3A21]">Cancel Order</h5>
                    <div className="flex gap-2">
                      <select
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        className="border border-stone-200 rounded-lg p-2 text-xs bg-white text-[#5C3A21] focus:outline-none"
                      >
                        <option value="CUSTOMER_CANCELLED">Customer Request</option>
                        <option value="ITEM_UNAVAILABLE">Item Out of Stock</option>
                        <option value="WRONG_ORDER">Wrong Selections</option>
                        <option value="DUPLICATE_ORDER">Duplicate Order</option>
                        <option value="KITCHEN_ISSUE">Kitchen Issue</option>
                        <option value="PAYMENT_ISSUE">Payment Issue</option>
                        <option value="OTHER">Other Reason</option>
                      </select>
                      {cancellationReason === 'OTHER' && (
                        <input
                          type="text"
                          placeholder="Custom cancellation reason..."
                          value={customCancelReasonText}
                          onChange={(e) => setCustomCancelReasonText(e.target.value)}
                          className="flex-1 border border-stone-200 rounded-lg p-2 text-xs focus:outline-none"
                        />
                      )}
                      <Button
                        onClick={() => cancelOrderMutation.mutate({
                          id: selectedOrder.id,
                          reason: cancellationReason,
                          customReason: cancellationReason === 'OTHER' ? customCancelReasonText : undefined,
                        })}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-2 rounded-lg leading-none"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Owner Void panel */}
                {isOwner && (
                  <div className="space-y-2 border-t border-stone-200/60 pt-3">
                    <h5 className="font-extrabold text-[#5C3A21]">Administrative Void Order</h5>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Void correction reason details..."
                        value={voidReasonText}
                        onChange={(e) => setVoidReasonText(e.target.value)}
                        className="flex-1 border border-stone-200 rounded-lg p-2 text-xs focus:outline-none"
                      />
                      <Button
                        onClick={() => voidOrderMutation.mutate({
                          id: selectedOrder.id,
                          reason: voidReasonText,
                        })}
                        disabled={!voidReasonText.trim()}
                        className="bg-stone-800 hover:bg-stone-900 text-white font-bold px-3 py-2 rounded-lg leading-none"
                      >
                        Void Order
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CustomModal>
      )}
    </div>
  );
}
