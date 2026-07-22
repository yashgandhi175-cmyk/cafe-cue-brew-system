'use client';

import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Search,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  X,
  CreditCard,
  User,
  Phone,
  ArrowLeftRight,
  Plus,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface CreditSummary {
  customerId: string;
  name: string;
  phone: string;
  outstandingAmount: number;
  invoiceCount: number;
  overdueDays: number;
  status: 'OVERDUE' | 'ACTIVE';
}

interface CreditInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  billAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate: string;
  creditType: string;
  settlementStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  notes: string | null;
  overdue: boolean;
}

interface TimelineEvent {
  type: 'INVOICE_CREATED' | 'PAYMENT_RECEIVED';
  date: string;
  description: string;
  amount: number;
  outstanding?: number;
  receivedBy?: string;
  meta: {
    ledgerId: string;
    invoiceNumber: string;
  };
}

interface CreditDetails {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    totalOutstanding: number;
  };
  invoices: CreditInvoice[];
  timeline: TimelineEvent[];
}

interface CreditAnalytics {
  totalOutstanding: number;
  todaysCreditSales: number;
  todaysCreditCollections: number;
  weeklyCollections: number;
  monthlyCollections: number;
  overdueCustomers: number;
  largestOutstandingCustomer: string;
  averageCreditPeriod: number;
}

export default function CreditLedgerPage() {
  // Lists & Analytics States
  const [summaries, setSummaries] = useState<CreditSummary[]>([]);
  const [analytics, setAnalytics] = useState<CreditAnalytics | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer States
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [details, setDetails] = useState<CreditDetails | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Settlement Form States
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [settleRef, setSettleRef] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleSuccess, setSettleSuccess] = useState<boolean>(false);

  const fetchCreditsData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch summaries
      const summaryUrl = search
        ? `${API_URL}/credits/summary?search=${encodeURIComponent(search)}`
        : `${API_URL}/credits/summary`;
      
      const summaryRes = await fetchWithAuth(summaryUrl);
      if (!summaryRes.ok) throw new Error('Failed to fetch credit summaries');
      const summaryData = await summaryRes.json();
      setSummaries(summaryData);

      // Fetch analytics
      const analyticsRes = await fetchWithAuth(`${API_URL}/credits/analytics`);
      if (!analyticsRes.ok) throw new Error('Failed to fetch credit analytics');
      const analyticsData = await analyticsRes.json();
      setAnalytics(analyticsData);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading credit data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetails = async (customerId: string) => {
    setDrawerLoading(true);
    setSettleError(null);
    setSettleSuccess(false);
    try {
      const res = await fetchWithAuth(`${API_URL}/credits/customer/${customerId}`);
      if (!res.ok) throw new Error('Failed to fetch customer credit details');
      const data = await res.json();
      setDetails(data);

      // Set default invoice for settlement dropdown (first unpaid/partial invoice)
      const unpaidInvoices = data.invoices.filter((i: any) => i.settlementStatus !== 'PAID');
      if (unpaidInvoices.length > 0) {
        setSelectedLedgerId(unpaidInvoices[0].id);
        setSettleAmount(unpaidInvoices[0].outstandingAmount);
      } else {
        setSelectedLedgerId('');
        setSettleAmount(0);
      }
    } catch (err: any) {
      setSettleError(err.message || 'Failed to load ledger details.');
    } finally {
      setDrawerLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditsData();
  }, [search]);

  // Handle drawer open
  const handleOpenLedger = (customerId: string) => {
    setSelectedCustomerId(customerId);
    fetchCustomerDetails(customerId);
  };

  // Handle drawer close
  const handleCloseLedger = () => {
    setSelectedCustomerId(null);
    setDetails(null);
    setSettleAmount(0);
    setSettleRef('');
    setSettleError(null);
    setSettleSuccess(false);
  };

  // Settle invoice submit
  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLedgerId) return;
    if (settleAmount <= 0) {
      setSettleError('Amount must be greater than zero.');
      return;
    }

    setSettleLoading(true);
    setSettleError(null);
    setSettleSuccess(false);

    try {
      const res = await fetchWithAuth(`${API_URL}/credits/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ledgerId: selectedLedgerId,
          amount: Number(settleAmount),
          method: settleMethod,
          reference: settleRef.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to process payment');

      setSettleSuccess(true);
      setSettleRef('');
      // Reload drawer details and main board summary
      if (selectedCustomerId) {
        fetchCustomerDetails(selectedCustomerId);
      }
      fetchCreditsData();
    } catch (err: any) {
      setSettleError(err.message || 'Failed to record settlement.');
    } finally {
      setSettleLoading(false);
    }
  };

  // Handle select invoice in settlement form to automatically update amount input
  const handleInvoiceSelectChange = (ledgerId: string) => {
    setSelectedLedgerId(ledgerId);
    if (details) {
      const inv = details.invoices.find((i) => i.id === ledgerId);
      if (inv) {
        setSettleAmount(inv.outstandingAmount);
      }
    }
  };

  return (
    <div className="space-y-8 relative">
      {/* Header welcome banner */}
      <div className="bg-gradient-to-r from-[#3C2A21] to-[#8F6A50] rounded-3xl p-8 md:p-10 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-[#EAD8C0]/10 blur-2xl"></div>
        <div className="relative z-10 space-y-3">
          <span className="text-xs uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full font-bold">
            Finances Hub
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Customer Credit Ledger
          </h1>
          <p className="text-sm md:text-base text-[#DDBEAA] max-w-xl font-light">
            Manage company credit details, track invoice aging periods, analyze collections efficiency, and log customer invoice settlements.
          </p>
        </div>
      </div>

      {/* Analytics Dashboard Grid */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Metric 1 */}
          <div className="bg-white border border-[#EAD8C0]/20 p-6 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Total Outstanding</span>
              <span className="text-2xl font-black text-red-600 block">₹{analytics.totalOutstanding.toLocaleString('en-IN')}</span>
              <span className="text-[10px] text-gray-400 font-medium">Largest: {analytics.largestOutstandingCustomer}</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle className="h-6 w-6 animate-pulse" />
            </div>
          </div>

          {/* Metric 2 */}
          <div className="bg-white border border-[#EAD8C0]/20 p-6 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Today's Credit Sales</span>
              <span className="text-2xl font-black text-amber-800 block">₹{analytics.todaysCreditSales.toLocaleString('en-IN')}</span>
              <span className="text-[10px] text-emerald-600 font-bold">New credits today</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-800">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>

          {/* Metric 3 */}
          <div className="bg-white border border-[#EAD8C0]/20 p-6 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Today's Collections</span>
              <span className="text-2xl font-black text-emerald-600 block">₹{analytics.todaysCreditCollections.toLocaleString('en-IN')}</span>
              <span className="text-[10px] text-gray-400 font-medium">Monthly: ₹{analytics.monthlyCollections.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </div>

          {/* Metric 4 */}
          <div className="bg-white border border-[#EAD8C0]/20 p-6 rounded-2xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Overdue Invoices</span>
              <span className="text-2xl font-black text-orange-600 block">{analytics.overdueCustomers} Accounts</span>
              <span className="text-[10px] text-gray-400 font-medium">Avg Collection Period: {analytics.averageCreditPeriod} Days</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </div>
      )}

      {/* Main Ledger Table Console */}
      <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#FAF8F5]/30">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Accounts Receivable Summary</h2>
            <p className="text-xs text-gray-400 mt-0.5">Timelines, collections, and settlement records</p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer name/phone..."
              className="w-full pl-10 pr-4 py-2 text-xs border border-[#EAD8C0] focus:border-[#8F6A50] focus:outline-none rounded-xl bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-[#8F6A50] animate-spin mb-4" />
            <span className="text-gray-400 text-xs font-bold font-mono">Loading Credit Registry...</span>
          </div>
        ) : error ? (
          <div className="p-20 text-center text-red-500 font-semibold text-sm">{error}</div>
        ) : summaries.length === 0 ? (
          <div className="p-20 text-center text-gray-400 text-xs font-semibold">No active credit ledger records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 text-stone-400 font-extrabold uppercase border-b border-gray-100">
                  <th className="py-4 px-6">Customer Profile</th>
                  <th className="py-4 px-6 text-right">Invoices count</th>
                  <th className="py-4 px-6 text-right">Total Outstanding</th>
                  <th className="py-4 px-6 text-center">Overdue Days</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                {summaries.map((s) => (
                  <tr key={s.customerId} className="hover:bg-amber-50/20 transition-colors">
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#3C2A21]/10 rounded-full flex items-center justify-center text-[#3C2A21]">
                        <User className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="font-extrabold text-gray-800">{s.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{s.phone}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right text-gray-600 font-black">{s.invoiceCount}</td>
                    <td className="py-4 px-6 text-right text-gray-800 font-black">₹{s.outstandingAmount.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-center font-mono">
                      {s.overdueDays > 0 ? (
                        <span className="text-red-600 font-black">{s.overdueDays} Days</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase ${
                        s.status === 'OVERDUE'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={() => handleOpenLedger(s.customerId)}
                        className="inline-flex items-center gap-1 text-xs text-[#8F6A50] hover:text-[#3C2A21] hover:underline bg-[#EAD8C0]/15 hover:bg-[#EAD8C0]/30 px-3 py-1.5 rounded-full transition-colors"
                      >
                        <span>Ledger Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-out Drawer Panel overlay */}
      {selectedCustomerId && (
        <div className="fixed inset-0 bg-[#3C2A21]/30 backdrop-blur-xs z-50 flex justify-end">
          {/* Drawer Body Container */}
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden relative animate-slide-in">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#3C2A21] text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-[#EAD8C0]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">Customer Ledger Details</h3>
                  <p className="text-[10px] text-[#DDBEAA] mt-0.5 font-bold uppercase tracking-wider">
                    Timeline & payments breakdown
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseLedger}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body Scroll Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FAF8F5]/30">
              {drawerLoading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#3C2A21] animate-spin mb-4" />
                  <span className="text-gray-400 text-xs font-bold font-mono">Loading credit history...</span>
                </div>
              ) : details ? (
                <>
                  {/* Customer Information Panel */}
                  <div className="bg-white border border-[#EAD8C0]/20 p-5 rounded-2xl shadow-xs grid grid-cols-3 gap-4">
                    <div className="flex items-start gap-2.5">
                      <User className="w-4.5 h-4.5 text-amber-800 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-gray-400 block font-extrabold uppercase">Customer</span>
                        <span className="font-extrabold text-sm text-gray-800">{details.customer.name}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Phone className="w-4.5 h-4.5 text-amber-800 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-gray-400 block font-extrabold uppercase">Phone Number</span>
                        <span className="font-extrabold text-xs text-gray-800">{details.customer.phone}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <DollarSign className="w-4.5 h-4.5 text-amber-800 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] text-gray-400 block font-extrabold uppercase">Total Outstanding</span>
                        <span className="font-black text-sm text-red-600">₹{details.customer.totalOutstanding.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Settle Outstanding Invoice Form */}
                  {details.invoices.some((i) => i.settlementStatus !== 'PAID') && (
                    <form onSubmit={handleRecordSettlement} className="bg-amber-50/50 border border-amber-200/60 p-5 rounded-2xl space-y-4">
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                        <Plus className="w-4 h-4" />
                        <span>Settle Credit Invoice</span>
                      </h4>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-amber-900 block mb-1">Select Invoice</label>
                          <select
                            className="w-full p-2 border border-amber-200 rounded-lg bg-white focus:outline-none font-bold text-gray-700"
                            value={selectedLedgerId}
                            onChange={(e) => handleInvoiceSelectChange(e.target.value)}
                          >
                            {details.invoices
                              .filter((i) => i.settlementStatus !== 'PAID')
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.invoiceNumber} (O/S: ₹{i.outstandingAmount})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-amber-900 block mb-1">Settlement Amount (₹)</label>
                          <input
                            type="number"
                            className="w-full p-2 border border-amber-200 rounded-lg focus:outline-none bg-white font-bold text-gray-700"
                            value={settleAmount || ''}
                            onChange={(e) => setSettleAmount(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-amber-900 block mb-1">Collection Method</label>
                          <select
                            className="w-full p-2 border border-amber-200 rounded-lg bg-white focus:outline-none font-bold text-gray-700"
                            value={settleMethod}
                            onChange={(e) => setSettleMethod(e.target.value as any)}
                          >
                            <option value="CASH">CASH</option>
                            <option value="UPI">UPI / QR CODE</option>
                            <option value="CARD">CARD PAYMENT</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-amber-900 block mb-1">Reference / Txn Code</label>
                          <input
                            type="text"
                            placeholder="Enter reference details..."
                            className="w-full p-2 border border-amber-200 rounded-lg focus:outline-none bg-white text-gray-700 text-xs"
                            value={settleRef}
                            onChange={(e) => setSettleRef(e.target.value)}
                          />
                        </div>
                      </div>

                      {settleError && (
                        <p className="text-red-600 font-bold text-xs">{settleError}</p>
                      )}

                      {settleSuccess && (
                        <p className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Collection payment recorded successfully!</span>
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={settleLoading}
                        className="w-full bg-[#3C2A21] hover:bg-[#8F6A50] text-[#EAD8C0] py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {settleLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Confirm Collection Settle</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Active Invoices Table */}
                  <div className="space-y-2.5">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-gray-500">Invoice History</h4>
                    <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-100 text-stone-400 font-bold uppercase">
                            <th className="py-2.5 px-4">Invoice #</th>
                            <th className="py-2.5 px-4 text-center">Due Date</th>
                            <th className="py-2.5 px-4 text-right">Amount</th>
                            <th className="py-2.5 px-4 text-right">Outstanding</th>
                            <th className="py-2.5 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                          {details.invoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-amber-50/10">
                              <td className="py-2.5 px-4">
                                <p className="font-black text-gray-800">{inv.invoiceNumber}</p>
                                <p className="text-[9px] text-gray-400 font-semibold">{new Date(inv.invoiceDate).toLocaleDateString()}</p>
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono">
                                <span className={inv.overdue ? 'text-red-600' : 'text-gray-500'}>
                                  {new Date(inv.dueDate).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">₹{inv.billAmount}</td>
                              <td className="py-2.5 px-4 text-right font-black text-gray-800">
                                ₹{inv.outstandingAmount}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] uppercase ${
                                  inv.settlementStatus === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : inv.settlementStatus === 'PARTIAL'
                                    ? 'bg-yellow-50 text-yellow-600'
                                    : 'bg-red-50 text-red-600'
                                }`}>
                                  {inv.settlementStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Chronological Timeline Feed */}
                  <div className="space-y-4">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-gray-500">Timeline events</h4>
                    <div className="relative pl-5 space-y-4 border-l border-stone-200">
                      {details.timeline.map((event, idx) => (
                        <div key={idx} className="relative">
                          {/* Dot */}
                          <div className={`absolute -left-[25.5px] top-1.5 w-2 h-2 rounded-full ${
                            event.type === 'INVOICE_CREATED' ? 'bg-red-500' : 'bg-emerald-500'
                          }`} />
                          
                          <div className="bg-white border border-[#EAD8C0]/10 p-3.5 rounded-xl shadow-xs flex justify-between gap-4">
                            <div>
                              <p className="font-extrabold text-xs text-gray-800">{event.description}</p>
                              <p className="text-[9px] text-gray-400 font-semibold mt-1">
                                {new Date(event.date).toLocaleString()}
                                {event.receivedBy && ` • Settle by ${event.receivedBy}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`font-black text-xs block ${
                                event.type === 'INVOICE_CREATED' ? 'text-red-600' : 'text-emerald-600'
                              }`}>
                                {event.type === 'INVOICE_CREATED' ? '+' : '-'} ₹{event.amount}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            
            {/* Drawer Footer close panel button */}
            <div className="p-4 border-t border-gray-100 flex justify-end bg-stone-50">
              <button
                onClick={handleCloseLedger}
                className="bg-white border border-stone-300 hover:bg-stone-50 px-5 py-2 rounded-xl text-xs font-bold text-gray-700 shadow-sm"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
