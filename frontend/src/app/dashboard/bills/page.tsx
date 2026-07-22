'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import {
  Receipt,
  Search,
  CheckCircle,
  AlertCircle,
  Plus,
  Printer,
  ChevronRight,
  Info,
  DollarSign,
  Coins,
} from 'lucide-react';

interface OrderItem {
  id: string;
  nameSnapshot: string;
  variantNameSnapshot?: string;
  priceSnapshot: number;
  variantPriceSnapshot?: number;
  quantity: number;
  totalPrice: number;
  addons: Array<{ nameSnapshot: string; priceSnapshot: number }>;
}

interface Bill {
  id: string;
  invoiceNumber?: string;
  status: 'DRAFT' | 'FINALIZED' | 'PAID' | 'VOIDED';
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
  subtotal: number;
  discount: number;
  couponDiscount: number;
  loyaltyDiscount: number;
  manualDiscount: number;
  couponCodeSnapshot?: string | null;
  couponNameSnapshot?: string | null;
  manualDiscountType?: string;
  manualDiscountValue?: number;
  manualDiscountReason?: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  serviceCharge: number;
  nightCharge: number;
  roundOff: number;
  grandTotal: number;
  finalizedAt?: string;
}

interface Payment {
  id: string;
  method: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  amount: number;
  amountTendered?: number;
  changeDue?: number;
  reference?: string;
  paidAt: string;
  isSettled: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  cgst?: number;
  sgst?: number;
  serviceCharge?: number;
  nightCharge?: number;
  roundOff?: number;
  grandTotal: number;
  createdAt: string;
  tableSessionId?: string | null;
  tableNumberSnapshot?: string;
  customer?: { name: string; phone: string };
  items: OrderItem[];
  bills: Bill[];
  payments: Payment[];
}

export default function SettlementsPage() {
  const router = useRouter();

  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Discount inputs
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENTAGE'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState('');

  // Payment Recording inputs
  const [payMethod, setPayMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT'>('CASH');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [payReference, setPayReference] = useState('');
  const [creditType, setCreditType] = useState<'WEEKLY' | 'FIFTEEN_DAYS' | 'MONTHLY' | 'CUSTOM'>('FIFTEEN_DAYS');
  const [dueDate, setDueDate] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Owner completion override inputs
  const [useOwnerOverride, setUseOwnerOverride] = useState(false);
  const [ownerOverrideReason, setOwnerOverrideReason] = useState('');

  // Status/Error
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [staffRole, setStaffRole] = useState<'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER'>('CASHIER');

  // Loyalty states
  const [loyaltyProfile, setLoyaltyProfile] = useState<any>(null);
  const [redeemPointsInput, setRedeemPointsInput] = useState<number>(0);
  const [redemptionRequests, setRedemptionRequests] = useState<any[]>([]);

  useEffect(() => {
    fetchOrders();
    const staffData = localStorage.getItem('ccb_staff');
    if (staffData) {
      try {
        const staff = JSON.parse(staffData);
        setStaffRole(staff.role);
      } catch {}
    }
  }, [paymentFilter]);

  // Filter & Group orders by tableSessionId for active table sessions on Settlements page
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer?.phone.includes(searchQuery);

      const matchesFilter =
        paymentFilter === 'ALL' || o.paymentStatus === paymentFilter;

      return matchesSearch && matchesFilter && o.status !== 'CANCELLED' && o.status !== 'VOIDED';
    });
  }, [orders, searchQuery, paymentFilter]);

  const groupedOrders = useMemo(() => {
    const sessionMap = new Map<string, {
      id: string;
      primaryOrderId: string;
      orderNumber: string;
      tableSessionId: string | null;
      tableNumberSnapshot: string;
      customer?: { name: string; phone: string };
      orders: Order[];
      items: OrderItem[];
      subtotal: number;
      cgst: number;
      sgst: number;
      serviceCharge: number;
      nightCharge: number;
      roundOff: number;
      grandTotal: number;
      paymentStatus: string;
      status: string;
      createdAt: string;
      bills: Bill[];
      payments: Payment[];
    }>();

    const standalone: Order[] = [];

    for (const o of filteredOrders) {
      if (o.tableSessionId) {
        if (!sessionMap.has(o.tableSessionId)) {
          sessionMap.set(o.tableSessionId, {
            id: `session_${o.tableSessionId}`,
            primaryOrderId: o.id,
            orderNumber: `Table ${o.tableNumberSnapshot || 'Session'}`,
            tableSessionId: o.tableSessionId,
            tableNumberSnapshot: o.tableNumberSnapshot || 'Table',
            customer: o.customer,
            orders: [],
            items: [],
            subtotal: 0,
            cgst: 0,
            sgst: 0,
            serviceCharge: 0,
            nightCharge: 0,
            roundOff: 0,
            grandTotal: 0,
            paymentStatus: 'UNPAID',
            status: o.status,
            createdAt: o.createdAt,
            bills: [],
            payments: [],
          });
        }

        const group = sessionMap.get(o.tableSessionId)!;
        group.orders.push(o);
        group.items.push(...(o.items || []));
        group.subtotal += Number(o.subtotal || 0);
        group.cgst += Number(o.cgst || 0);
        group.sgst += Number(o.sgst || 0);
        group.serviceCharge += Number(o.serviceCharge || 0);
        group.nightCharge += Number(o.nightCharge || 0);
        group.roundOff += Number(o.roundOff || 0);
        group.grandTotal += Number(o.grandTotal || 0);

        if (o.bills) group.bills.push(...o.bills);
        if (o.payments) group.payments.push(...o.payments);
      } else {
        standalone.push(o);
      }
    }

    const sessionCards = Array.from(sessionMap.values()).map((g) => {
      const allPaid = g.orders.every((o) => o.paymentStatus === 'PAID');
      const anyPartial = g.orders.some((o) => o.paymentStatus === 'PARTIALLY_PAID' || o.paymentStatus === 'PAID');
      g.paymentStatus = allPaid ? 'PAID' : anyPartial ? 'PARTIALLY_PAID' : 'UNPAID';

      const numOrders = g.orders.length;
      g.orderNumber = numOrders > 1 ? `Table ${g.tableNumberSnapshot} (${numOrders} Orders)` : g.orders[0].orderNumber;
      return g as unknown as Order;
    });

    return [...sessionCards, ...standalone];
  }, [filteredOrders]);

  useEffect(() => {
    if (selectedOrderId) {
      const ord = groupedOrders.find((o) => o.id === selectedOrderId);
      if (ord) {
        setSelectedOrder(ord);
        // Default payAmount to outstanding
        const settled = (ord.payments || [])
          .filter((p) => p.isSettled)
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const outstanding = Math.max(0, Number(ord.grandTotal) - settled);
        setPayAmount(outstanding);
        setCashTendered(outstanding);

        fetchLoyaltyInfoForOrder(ord).catch(() => {});
      }
    } else if (groupedOrders.length > 0) {
      // Auto-select first unpaid order on page load
      const firstUnpaid = groupedOrders.find((o) => o.paymentStatus !== 'PAID') || groupedOrders[0];
      if (firstUnpaid) {
        setSelectedOrderId(firstUnpaid.id);
      }
    } else {
      setSelectedOrder(null);
      setLoyaltyProfile(null);
      setRedemptionRequests([]);
    }
  }, [selectedOrderId, groupedOrders]);

  const fetchLoyaltyInfoForOrder = async (order: Order) => {
    const customerId = (order as any).customerId;
    if (!customerId) {
      setLoyaltyProfile(null);
      setRedemptionRequests([]);
      return;
    }
    try {
      const token = localStorage.getItem('ccb_token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const profileRes = await fetch(`${API_URL}/customers/${customerId}/loyalty`, { headers });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setLoyaltyProfile(profile);
      }

      const activeBill = order.bills.find((b) => b.status === 'DRAFT');
      if (activeBill) {
        const requestsRes = await fetch(`${API_URL}/loyalty/redemption-requests?billId=${activeBill.id}`, { headers });
        if (requestsRes.ok) {
          const requests = await requestsRes.json();
          setRedemptionRequests(requests);
        }
      } else {
        setRedemptionRequests([]);
      }
    } catch (e) {
      console.error('Failed to fetch loyalty info:', e);
    }
  };

  const handleCreateRedemptionRequest = async (billId: string, customerId: string) => {
    if (redeemPointsInput <= 0) {
      alert('Points must be greater than zero.');
      return;
    }
    if (loyaltyProfile && redeemPointsInput > loyaltyProfile.loyaltyPoints) {
      alert('Requested points exceed customer balance.');
      return;
    }
    try {
      setSubmitting(true);
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/loyalty/redemption-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          billId,
          customerId,
          requestedPoints: Number(redeemPointsInput),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create redemption request.');
      }
      alert('Redemption request created successfully!');
      setRedeemPointsInput(0);
      await fetchOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRedemption = async (requestId: string) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/loyalty/redemption-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to approve redemption.');
      alert('Redemption approved successfully!');
      await fetchOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectRedemption = async (requestId: string) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/loyalty/redemption-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reject redemption.');
      alert('Redemption rejected successfully!');
      await fetchOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRedemption = async (requestId: string) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/loyalty/redemption-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to cancel redemption request.');
      alert('Redemption request cancelled successfully!');
      await fetchOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('ccb_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_URL}/orders?limit=100`, { headers });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      setOrders(data.data || []);
      setLoading(false);
    } catch {
      setErrorMsg('Failed to load active orders list.');
      setLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!selectedOrder) return;
    if (discountValue > 0 && !discountReason.trim()) {
      setErrorMsg('A reason is required to apply manual discount.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/billing/orders/${selectedOrder.id}/discount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: discountType,
          value: Number(discountValue),
          reason: discountReason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to apply discount.');
      }

      setSuccessMsg('Manual discount applied successfully.');
      setDiscountValue(0);
      setDiscountReason('');
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeBill = async () => {
    if (!selectedOrder) return;

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('ccb_token');
      const res = await fetch(`${API_URL}/billing/orders/${selectedOrder.id}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to finalize bill.');
      }

      setSuccessMsg('Bill finalized and invoice generated!');
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedOrder) return;
    if (payAmount <= 0) {
      setErrorMsg('Payment amount must be greater than zero.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('ccb_token');
      let currentBill = selectedOrder.bills.find((b) => b.status === 'FINALIZED' || b.status === 'PAID');

      if (!currentBill) {
        // Automatically finalize the bill for the order/session
        const targetId = (selectedOrder as any).primaryOrderId || selectedOrder.id;
        const finRes = await fetch(`${API_URL}/billing/orders/${targetId}/finalize`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const finData = await finRes.json();
        if (!finRes.ok) {
          throw new Error(finData.message || 'Failed to finalize bill prior to payment.');
        }
        currentBill = finData;
      }

      if (!currentBill) {
        throw new Error('Unable to create or locate bill for payment.');
      }

      const res = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          billId: currentBill.id,
          method: payMethod,
          amount: Number(payAmount),
          amountTendered: payMethod === 'CASH' ? Number(cashTendered) : undefined,
          reference: payReference.trim() || undefined,
          paymentIdempotencyKey: 'PAY_' + Date.now() + '_' + Math.random().toString(36).substring(7),
          creditType: payMethod === 'CREDIT' ? creditType : undefined,
          dueDate: payMethod === 'CREDIT' && creditType === 'CUSTOM' ? dueDate || undefined : undefined,
          notes: payMethod === 'CREDIT' ? remarks.trim() || undefined : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to record payment.');
      }

      setSuccessMsg('Payment recorded successfully!');
      setPayReference('');
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('ccb_token');
      const payload: any = { status: 'COMPLETED' };
      if (useOwnerOverride) {
        payload.override = true;
        payload.overrideReason = ownerOverrideReason.trim();
      }

      const res = await fetch(`${API_URL}/orders/${selectedOrder.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to complete order.');
      }

      setSuccessMsg('Order completed and table released!');
      setUseOwnerOverride(false);
      setOwnerOverrideReason('');
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate jsPDF Receipt
  const handlePrintReceipt = () => {
    if (!selectedOrder) return;
    const currentBill = selectedOrder.bills.find((b) => b.status === 'FINALIZED' || b.status === 'PAID');
    if (!currentBill) {
      setErrorMsg('No finalized bill exists to print.');
      return;
    }

    try {
      let totalHeight = 50 + 70; // Header & footer base height in mm
      selectedOrder.items.forEach((item) => {
        totalHeight += 4;
        if (item.variantNameSnapshot) totalHeight += 3.5;
        if ((item as any).addons && (item as any).addons.length > 0) {
          totalHeight += (item as any).addons.length * 3.5;
        }
      });
      totalHeight += 20; // safety margin

      const doc = new jsPDF({
        unit: 'mm',
        format: [80, Math.max(200, totalHeight)], // dynamic height based on item list length
      });

      // Header
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('CAFE CUE & BREW', 40, 10, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('Helvetica', 'normal');
      doc.text('123 Club Road, Cafe Lane', 40, 14, { align: 'center' });
      doc.text('GSTIN: 27AAAAA1111A1Z1', 40, 18, { align: 'center' });
      doc.text('------------------------------------------------------------', 40, 22, { align: 'center' });

      // Invoice info
      doc.setFont('Helvetica', 'bold');
      doc.text(`INVOICE: ${currentBill.invoiceNumber || 'DRAFT'}`, 5, 26);
      doc.setFont('Helvetica', 'normal');
      doc.text(`Order No: ${selectedOrder.orderNumber}`, 5, 30);
      doc.text(`Date: ${new Date(currentBill.finalizedAt || Date.now()).toLocaleDateString()}`, 5, 34);
      if (selectedOrder.tableNumberSnapshot) {
        doc.text(`Table: ${selectedOrder.tableNumberSnapshot} (Dine-in)`, 5, 38);
      } else {
        doc.text(`Order Type: Takeaway`, 5, 38);
      }
      doc.text(`Customer: ${selectedOrder.customer?.name || 'Walk-in'}`, 5, 42);
      doc.text('------------------------------------------------------------', 40, 46, { align: 'center' });

      // Items header
      doc.setFont('Helvetica', 'bold');
      doc.text('Item', 5, 50);
      doc.text('Qty', 52, 50, { align: 'right' });
      doc.text('Price', 63, 50, { align: 'right' });
      doc.text('Total', 75, 50, { align: 'right' });
      doc.setFont('Helvetica', 'normal');
      doc.text('------------------------------------------------------------', 40, 53, { align: 'center' });

      let y = 57;
      selectedOrder.items.forEach((item) => {
        // Truncate item name if too long for 80mm roll
        const name = item.nameSnapshot.length > 18 ? item.nameSnapshot.substring(0, 16) + '..' : item.nameSnapshot;
        doc.text(name, 5, y);
        doc.text(String(item.quantity), 52, y, { align: 'right' });
        doc.text(String(Number(item.priceSnapshot).toFixed(0)), 63, y, { align: 'right' });
        doc.text(String(Number(item.totalPrice).toFixed(0)), 75, y, { align: 'right' });
        y += 4;

        // Print variant if any
        if (item.variantNameSnapshot) {
          doc.setFontSize(7);
          doc.text(`  - ${item.variantNameSnapshot}`, 5, y);
          y += 3.5;
        }

        // Print addons if any
        if ((item as any).addons && (item as any).addons.length > 0) {
          doc.setFontSize(7);
          (item as any).addons.forEach((addon: any) => {
            doc.text(`  + ${addon.nameSnapshot} (+Rs.${Number(addon.priceSnapshot).toFixed(0)})`, 5, y);
            y += 3.5;
          });
        }
        
        // Reset font size
        doc.setFontSize(8);
      });

      doc.text('------------------------------------------------------------', 40, y, { align: 'center' });
      y += 4;

      // Summary
      doc.text(`Subtotal:`, 40, y);
      doc.text(`Rs.${Number(currentBill.subtotal).toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
      const loyaltyDisc = Number((currentBill as any).loyaltyDiscount || 0);
      const couponDisc = Number((currentBill as any).couponDiscount || 0);
      const manualDisc = Number((currentBill as any).manualDiscount || 0);

      if (couponDisc > 0) {
        doc.text(`Coupon Disc:`, 40, y);
        doc.text(`-Rs.${couponDisc.toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (loyaltyDisc > 0) {
        doc.text(`Loyalty Disc:`, 40, y);
        doc.text(`-Rs.${loyaltyDisc.toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (manualDisc > 0) {
        doc.text(`Manual Disc:`, 40, y);
        doc.text(`-Rs.${manualDisc.toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (Number(currentBill.cgst) > 0) {
        doc.text(`CGST (2.5%):`, 40, y);
        doc.text(`Rs.${Number(currentBill.cgst).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
        doc.text(`SGST (2.5%):`, 40, y);
        doc.text(`Rs.${Number(currentBill.sgst).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (Number(currentBill.serviceCharge) > 0) {
        doc.text(`Service Charge:`, 40, y);
        doc.text(`Rs.${Number(currentBill.serviceCharge).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (Number(currentBill.nightCharge) > 0) {
        doc.text(`Night Surcharge:`, 40, y);
        doc.text(`Rs.${Number(currentBill.nightCharge).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      if (Number(currentBill.roundOff) !== 0) {
        doc.text(`Round Off:`, 40, y);
        doc.text(`Rs.${Number(currentBill.roundOff).toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }

      doc.setFont('Helvetica', 'bold');
      doc.text(`GRAND TOTAL:`, 40, y);
      doc.text(`Rs.${Number(currentBill.grandTotal).toFixed(2)}`, 75, y, { align: 'right' });
      y += 5;

      // Payment Summary
      doc.setFont('Helvetica', 'normal');
      const settledSum = selectedOrder.payments
        .filter((p) => p.isSettled)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const creditDueSum = selectedOrder.payments
        .filter((p) => p.method === 'CREDIT')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const outstandingSum = Math.max(0, Number(currentBill.grandTotal) - settledSum);

      doc.text(`Total Settled:`, 40, y);
      doc.text(`Rs.${settledSum.toFixed(2)}`, 75, y, { align: 'right' });
      y += 4;
      if (creditDueSum > 0) {
        doc.text(`CREDIT DUE:`, 40, y);
        doc.text(`Rs.${creditDueSum.toFixed(2)}`, 75, y, { align: 'right' });
        y += 4;
      }
      doc.text(`Outstanding:`, 40, y);
      doc.text(`Rs.${outstandingSum.toFixed(2)}`, 75, y, { align: 'right' });
      y += 5;

      doc.text('------------------------------------------------------------', 40, y, { align: 'center' });
      y += 4;
      doc.setFont('Helvetica', 'bold');
      doc.text('Thank you! Visit again.', 40, y, { align: 'center' });

      doc.save(`receipt-${currentBill.invoiceNumber || 'draft'}.pdf`);
      setSuccessMsg('PDF thermal receipt generated and downloaded!');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch {
      setErrorMsg('Failed to generate PDF thermal receipt.');
    }
  };



  if (loading) {
    return (
      <div className="p-8 text-center text-[#3C2A21] font-semibold">
        Loading Billing Console...
      </div>
    );
  }

  // Calculate outstanding for selected order
  const settledAmount = selectedOrder
    ? selectedOrder.payments
        .filter((p) => p.isSettled)
        .reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const grandTotalVal = selectedOrder ? Number(selectedOrder.grandTotal) : 0;
  const outstandingAmount = Math.max(0, grandTotalVal - settledAmount);

  const activeBill = selectedOrder?.bills.find((b) => b.status !== 'VOIDED');

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-[#FAF8F5] text-[#3C2A21]">
      {/* LEFT: Orders requiring billing */}
      <div className="w-full lg:w-[350px] p-6 lg:border-r border-[#EAD8C0]/40 overflow-y-auto">
        <h1 className="text-xl font-black mb-4 tracking-tight">SETTLEMENTS</h1>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-[#8F6A50]" />
          <input
            type="text"
            placeholder="Search orders, phone..."
            className="w-full pl-10 pr-4 py-2 border border-[#EAD8C0] rounded-xl text-xs bg-white focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status filters */}
        <div className="grid grid-cols-2 gap-1 mb-4 text-[10px] font-bold">
          <button
            onClick={() => setPaymentFilter('ALL')}
            className={`py-1.5 rounded-lg transition border ${
              paymentFilter === 'ALL' ? 'bg-[#3C2A21] text-white border-[#3C2A21]' : 'bg-white border-[#EAD8C0] text-[#8F6A50]'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setPaymentFilter('UNPAID')}
            className={`py-1.5 rounded-lg transition border ${
              paymentFilter === 'UNPAID' ? 'bg-[#3C2A21] text-white border-[#3C2A21]' : 'bg-white border-[#EAD8C0] text-[#8F6A50]'
            }`}
          >
            UNPAID
          </button>
          <button
            onClick={() => setPaymentFilter('PARTIALLY_PAID')}
            className={`py-1.5 rounded-lg transition border ${
              paymentFilter === 'PARTIALLY_PAID' ? 'bg-[#3C2A21] text-white border-[#3C2A21]' : 'bg-white border-[#EAD8C0] text-[#8F6A50]'
            }`}
          >
            PARTIAL
          </button>
          <button
            onClick={() => setPaymentFilter('PAID')}
            className={`py-1.5 rounded-lg transition border ${
              paymentFilter === 'PAID' ? 'bg-[#3C2A21] text-white border-[#3C2A21]' : 'bg-white border-[#EAD8C0] text-[#8F6A50]'
            }`}
          >
            PAID
          </button>
        </div>

        {/* Orders scroll list */}
        <div className="space-y-2">
          {groupedOrders.length === 0 ? (
            <div className="text-center py-10 text-xs text-gray-400">
              No orders matched selection.
            </div>
          ) : (
            groupedOrders.map((o) => {
              const activeInvoiceNo = o.bills?.find((b) => b.status === 'FINALIZED' || b.status === 'PAID')?.invoiceNumber;
              const displayHeader = activeInvoiceNo || o.orderNumber;
              
              const rawTable = o.tableNumberSnapshot || '';
              const displayTable = rawTable
                ? (rawTable.toLowerCase().startsWith('table') ? rawTable : `Table ${rawTable}`)
                : 'Takeaway';
              const displayCustomer = o.customer?.name || 'Walk-in Customer';

              return (
                <div
                  key={o.id}
                  onClick={() => setSelectedOrderId(o.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    selectedOrderId === o.id
                      ? 'border-[#8F6A50] bg-[#FAF8F5] shadow-md ring-1 ring-[#8F6A50]'
                      : 'border-[#EAD8C0]/40 bg-white hover:border-[#EAD8C0]'
                  }`}
                >
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-xs text-[#3C2A21]">{displayHeader}</h4>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {displayTable} | {displayCustomer}
                    </p>
                    <p className="text-[11px] font-black text-[#8F6A50] mt-1">
                      Grand Total: ₹{Number(o.grandTotal).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-between self-stretch">
                    <ChevronRight className="h-4 w-4 text-[#8F6A50]" />
                    <span
                      className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                        o.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-700'
                          : o.paymentStatus === 'PARTIALLY_PAID'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {o.paymentStatus}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Order panel / payments checkout */}
      <div className="flex-1 p-6 overflow-y-auto">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex gap-2 mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 flex gap-2 mb-4">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {!selectedOrder ? (
          <div className="h-full flex items-center justify-center text-[#8F6A50] text-sm py-20">
            Select an order from the list to manage billing and payments.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Invoice Breakdown */}
            <div className="bg-white rounded-2xl p-5 border border-[#EAD8C0]/40 shadow-sm space-y-4">
              <div className="flex justify-between items-start border-b border-[#FAF8F5] pb-3">
                <div>
                  <h3 className="font-extrabold text-sm text-[#3C2A21]">{selectedOrder.orderNumber}</h3>
                  <p className="text-[10px] text-gray-400">
                    Source: {selectedOrder.status} | Time: {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">Invoice Number</span>
                  <span className="font-bold text-xs text-[#8F6A50]">
                    {activeBill?.invoiceNumber || 'DRAFT (Unfinalized)'}
                  </span>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-[10px] text-gray-400">Items Breakup</h4>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between py-1 border-b border-dashed border-gray-100">
                    <div>
                      <span className="font-bold">{item.nameSnapshot}</span> x {item.quantity}
                      {item.variantNameSnapshot && (
                        <span className="text-[10px] text-gray-400 block">
                          Variant: {item.variantNameSnapshot}
                        </span>
                      )}
                    </div>
                    <span className="font-bold">₹{item.totalPrice}</span>
                  </div>
                ))}
              </div>

              {/* Financial calculations summary */}
              <div className="bg-[#FAF8F5] p-3 rounded-xl text-xs space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{Number(activeBill?.subtotal || selectedOrder.subtotal).toFixed(2)}</span>
                </div>
                {Number((activeBill as any)?.couponDiscount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Coupon Discount {activeBill?.couponCodeSnapshot && `(${activeBill.couponCodeSnapshot})`}:</span>
                    <span>-₹{Number((activeBill as any).couponDiscount).toFixed(2)}</span>
                  </div>
                )}
                {Number((activeBill as any)?.loyaltyDiscount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Loyalty Discount:</span>
                    <span>-₹{Number((activeBill as any).loyaltyDiscount).toFixed(2)}</span>
                  </div>
                )}
                {Number((activeBill as any)?.manualDiscount || 0) > 0 && (
                  <div className="flex justify-between text-[#8F6A50] font-bold">
                    <span>Manual Discount:</span>
                    <span>-₹{Number((activeBill as any).manualDiscount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Taxable Amount:</span>
                  <span>₹{Number(activeBill?.taxableAmount || selectedOrder.subtotal).toFixed(2)}</span>
                </div>
                {Number(activeBill?.cgst || 0) > 0 && (
                  <>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>CGST (2.5%):</span>
                      <span>₹{Number(activeBill?.cgst).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>SGST (2.5%):</span>
                      <span>₹{Number(activeBill?.sgst).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {Number(activeBill?.serviceCharge || 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Service Charge:</span>
                    <span>₹{Number(activeBill?.serviceCharge).toFixed(2)}</span>
                  </div>
                )}
                {Number(activeBill?.nightCharge || 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Night Surcharge:</span>
                    <span>₹{Number(activeBill?.nightCharge).toFixed(2)}</span>
                  </div>
                )}
                {Number(activeBill?.roundOff || 0) !== 0 && (
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Round Off:</span>
                    <span>₹{Number(activeBill?.roundOff).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-2 border-t border-[#EAD8C0]/30 text-[#8F6A50]">
                  <span>Grand Total:</span>
                  <span>₹{Number(activeBill?.grandTotal || selectedOrder.grandTotal).toFixed(2)}</span>
                </div>
              </div>

              {/* Finalization and Manual Discounts */}
              {(!activeBill || activeBill.status === 'DRAFT') && (
                <div className="border-t border-[#FAF8F5] pt-4 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-xl p-3 flex gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>Apply manual adjustments or final parameters before generating the invoice number.</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="font-bold text-gray-400 block mb-1">Discount Type</label>
                      <select
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl bg-white focus:outline-none"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as any)}
                      >
                        <option value="PERCENTAGE">PERCENTAGE (%)</option>
                        <option value="FLAT">FLAT (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-gray-400 block mb-1">Discount Value</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl focus:outline-none"
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {discountValue > 0 && (
                    <div className="text-xs">
                      <label className="font-bold text-gray-400 block mb-1">Reason (Required)</label>
                      <input
                        type="text"
                        placeholder="e.g. Corporate discount / goodwill"
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl focus:outline-none bg-amber-50"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Loyalty Redemption Section */}
                  {loyaltyProfile && loyaltyProfile.loyaltyEnabled && (
                    <div className="border-t border-[#EAD8C0]/20 pt-4 mt-4 space-y-3">
                      <h4 className="font-bold text-[#8F6A50] text-[11px] uppercase tracking-wider flex items-center gap-1">
                        <Coins className="h-3.5 w-3.5 text-[#8F6A50]" />
                        Loyalty Points Balance: {loyaltyProfile.loyaltyPoints} Pts
                      </h4>

                      {/* Check request status */}
                      {(() => {
                        const pendingReq = redemptionRequests.find((r) => r.status === 'PENDING');
                        const approvedReq = redemptionRequests.find((r) => r.status === 'APPROVED');

                        if (pendingReq) {
                          return (
                            <div className="bg-amber-50 border border-amber-200 text-[#3C2A21] rounded-xl p-3.5 space-y-2.5 text-xs">
                              <p className="font-semibold text-amber-800">
                                Pending Redemption Request: {pendingReq.requestedPoints} Points
                              </p>
                              <div className="flex gap-2">
                                {(staffRole === 'OWNER' || staffRole === 'MANAGER') && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveRedemption(pendingReq.id)}
                                      disabled={submitting}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-[10px]"
                                    >
                                      APPROVE
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectRedemption(pendingReq.id)}
                                      disabled={submitting}
                                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 rounded-lg text-[10px]"
                                    >
                                      REJECT
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleCancelRedemption(pendingReq.id)}
                                  disabled={submitting}
                                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-1.5 rounded-lg text-[10px]"
                                >
                                  CANCEL
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (approvedReq) {
                          return (
                            <div className="bg-emerald-50 border border-emerald-200 text-[#3C2A21] rounded-xl p-3.5 space-y-2 text-xs">
                              <p className="font-semibold text-emerald-800">
                                Approved Redemption: {approvedReq.requestedPoints} Points
                              </p>
                              <p className="text-[10px] text-gray-500">
                                Will automatically apply discount on finalization.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCancelRedemption(approvedReq.id)}
                                disabled={submitting}
                                className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 rounded-lg text-[10px]"
                              >
                                RELEASE / CANCEL
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="Points to redeem (e.g. 10)"
                              className="w-full p-2 border border-[#EAD8C0] rounded-xl text-xs focus:outline-none"
                              value={redeemPointsInput || ''}
                              onChange={(e) => setRedeemPointsInput(parseInt(e.target.value) || 0)}
                            />
                            <button
                              type="button"
                              onClick={() => activeBill?.id && handleCreateRedemptionRequest(activeBill.id, loyaltyProfile.customerId)}
                              disabled={submitting || redeemPointsInput <= 0 || !activeBill?.id}
                              className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                            >
                              REQUEST
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    {discountValue > 0 && (
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        disabled={submitting}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-xl font-bold transition text-xs"
                      >
                        APPLY DISCOUNT
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleFinalizeBill}
                      disabled={submitting}
                      className="flex-1 bg-[#3C2A21] hover:bg-black text-white py-2 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5"
                    >
                      FINALIZE & LOCK BILL
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Settlements & Payment section */}
            <div className="space-y-6">
              {/* Payment Ledger */}
              <div className="bg-white rounded-2xl p-5 border border-[#EAD8C0]/40 shadow-sm space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Payment Ledger</h3>

                {selectedOrder.payments.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center">
                    No payment history recorded for this order yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedOrder.payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center text-xs p-2.5 bg-[#FAF8F5] rounded-xl">
                        <div>
                          <span className="font-bold">{p.method}</span>
                          {p.reference && <span className="text-[10px] text-gray-400 block">Ref: {p.reference}</span>}
                          {p.amountTendered && (
                            <span className="text-[9px] text-gray-400 block">
                              Tendered: ₹{p.amountTendered} | Change: ₹{p.changeDue}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold">₹{p.amount}</span>
                          <span className="text-[8px] block font-semibold text-emerald-600">
                            {p.isSettled ? 'SETTLED' : 'CREDIT'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Balance check */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs pt-3 border-t border-[#FAF8F5]">
                  <div className="bg-emerald-50 rounded-xl p-2.5">
                    <span className="text-[10px] text-gray-400 font-bold block">SETTLED</span>
                    <span className="font-black text-sm text-emerald-700">₹{settledAmount.toFixed(2)}</span>
                  </div>
                  <div className="bg-red-50 rounded-xl p-2.5">
                    <span className="text-[10px] text-gray-400 font-bold block">OUTSTANDING</span>
                    <span className="font-black text-sm text-red-700">₹{outstandingAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Print trigger */}
                {activeBill?.status && activeBill.status !== 'DRAFT' && (
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="w-full bg-[#FAF8F5] hover:bg-[#EAD8C0]/20 text-[#8F6A50] border border-[#EAD8C0] py-2 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> GENERATE PDF THERMAL RECEIPT
                  </button>
                )}
              </div>

              {/* Checkout settlements form */}
              {outstandingAmount > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-[#EAD8C0]/40 shadow-sm space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Record Settlement</h3>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="font-bold text-gray-400 block mb-1">Method</label>
                      <select
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl bg-white focus:outline-none"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as any)}
                      >
                        <option value="CASH">CASH</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">CARD / POS TERMINAL</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-gray-400 block mb-1">Amount to settle</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl focus:outline-none"
                        value={payAmount || ''}
                        onChange={(e) => {
                          setPayAmount(Number(e.target.value));
                          if (payMethod === 'CASH') setCashTendered(Number(e.target.value));
                        }}
                      />
                    </div>
                  </div>

                  {payMethod === 'CASH' && (
                    <div className="grid grid-cols-2 gap-2 text-xs bg-amber-50 p-3 rounded-xl">
                      <div>
                        <label className="font-bold text-amber-800 block mb-1">Cash Tendered</label>
                        <input
                          type="number"
                          className="w-full p-1.5 border border-amber-300 rounded-lg focus:outline-none bg-white font-bold"
                          value={cashTendered || ''}
                          onChange={(e) => setCashTendered(Number(e.target.value))}
                        />
                      </div>
                      <div className="flex flex-col justify-end pb-1 pl-2">
                        <span className="text-[10px] text-amber-800 font-bold block">CHANGE DUE:</span>
                        <span className="font-black text-sm text-[#3C2A21]">
                          ₹{Math.max(0, cashTendered - payAmount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {payMethod !== 'CASH' && payMethod !== 'CREDIT' && (
                    <div className="text-xs">
                      <label className="font-bold text-gray-400 block mb-1">Reference (TXN / Card ID)</label>
                      <input
                        type="text"
                        placeholder="Enter transaction code..."
                        className="w-full p-2 border border-[#EAD8C0] rounded-xl focus:outline-none"
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                      />
                    </div>
                  )}

                  {payMethod === 'CREDIT' && (
                    <div className="space-y-2 text-xs bg-amber-50 p-3 rounded-xl">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-bold text-amber-800 block mb-1">Credit Period</label>
                          <select
                            className="w-full p-1.5 border border-amber-300 rounded-lg focus:outline-none bg-white font-bold text-[#3C2A21]"
                            value={creditType}
                            onChange={(e) => setCreditType(e.target.value as any)}
                          >
                            <option value="WEEKLY">Weekly (7 Days)</option>
                            <option value="FIFTEEN_DAYS">15 Days</option>
                            <option value="MONTHLY">Monthly (30 Days)</option>
                            <option value="CUSTOM">Custom Due Date</option>
                          </select>
                        </div>
                        {creditType === 'CUSTOM' ? (
                          <div>
                            <label className="font-bold text-amber-800 block mb-1">Due Date</label>
                            <input
                              type="date"
                              className="w-full p-1 border border-amber-300 rounded-lg focus:outline-none bg-white font-bold text-xs"
                              value={dueDate}
                              onChange={(e) => setDueDate(e.target.value)}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col justify-end pb-1 pl-2">
                            <span className="text-[10px] text-amber-800 font-bold block">AUTO DUE DATE:</span>
                            <span className="font-black text-xs text-[#3C2A21]">
                              {(() => {
                                const d = new Date();
                                if (creditType === 'WEEKLY') d.setDate(d.getDate() + 7);
                                else if (creditType === 'FIFTEEN_DAYS') d.setDate(d.getDate() + 15);
                                else if (creditType === 'MONTHLY') d.setDate(d.getDate() + 30);
                                return d.toLocaleDateString();
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="font-bold text-amber-800 block mb-1">Remarks / Notes</label>
                        <input
                          type="text"
                          placeholder="E.g. Authorized by Manager..."
                          className="w-full p-1.5 border border-amber-300 rounded-lg focus:outline-none bg-white text-xs"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRecordPayment}
                    disabled={submitting}
                    className="w-full bg-[#8F6A50] hover:bg-[#3C2A21] text-white py-3 rounded-xl font-bold transition text-xs shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <DollarSign className="h-4 w-4" /> RECORD SETTLEMENT
                  </button>
                </div>
              )}

              {/* Order Closing / Complete triggers */}
              {activeBill && activeBill.status !== 'DRAFT' && (
                <div className="bg-white rounded-2xl p-5 border border-[#EAD8C0]/40 shadow-sm space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Close Order</h3>

                  {outstandingAmount > 0 ? (
                    <div className="space-y-4">
                      <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-3 flex gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Order closing is blocked. Settlement of outstanding balance is required.</span>
                      </div>

                      {/* Owner override option */}
                      {staffRole === 'OWNER' && (
                        <div className="border border-red-200 rounded-xl p-3 bg-red-50/30 space-y-3">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-red-700">
                            <input
                              type="checkbox"
                              checked={useOwnerOverride}
                              onChange={(e) => setUseOwnerOverride(e.target.checked)}
                              className="accent-red-600"
                            />
                            Apply Owner Override bypass (Force Complete)
                          </label>

                          {useOwnerOverride && (
                            <div className="text-xs">
                              <label className="font-bold text-gray-400 block mb-1">Override Reason</label>
                              <input
                                type="text"
                                placeholder="Enter override reason..."
                                className="w-full p-2 border border-red-300 rounded-xl focus:outline-none bg-white text-xs"
                                value={ownerOverrideReason}
                                onChange={(e) => setOwnerOverrideReason(e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span>Order is fully paid! Ready to complete order and release table.</span>
                    </div>
                  )}

                  {((outstandingAmount === 0) || (useOwnerOverride && ownerOverrideReason.trim())) && (
                    <button
                      type="button"
                      onClick={handleCompleteOrder}
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="h-4 w-4" /> COMPLETE ORDER & RELEASE TABLE
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
