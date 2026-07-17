'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { jsPDF } from 'jspdf';
import {
  BarChart3,
  Calendar,
  FileSpreadsheet,
  FileText,
  Percent,
  Receipt,
  Users,
  AlertTriangle,
  Coffee,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ClipboardList,
  Utensils,
  ShoppingBag,
  Ticket
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  Cell
} from 'recharts';

type ReportTab = 'analytics' | 'daily-sales' | 'payments' | 'gst' | 'credit' | 'cancellations' | 'orders' | 'items' | 'customers' | 'discounts' | 'coupons';
type DateRange = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
type AgingFilter = 'ALL' | 'DUE_TODAY' | 'DUE_1_7' | 'DUE_8_30' | 'DUE_30_PLUS';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('analytics');
  const [dateRange, setDateRange] = useState<DateRange>('LAST_7_DAYS');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('ALL');

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const limit = 20;

  // Loading & states
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  
  // Data caches
  const [overview, setOverview] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [ordersSummary, setOrdersSummary] = useState<any>(null);
  const [paymentsSummary, setPaymentsSummary] = useState<any>(null);
  const [discountsSummary, setDiscountsSummary] = useState<any>(null);
  const [itemsSummary, setItemsSummary] = useState<any>(null);
  const [customersSummary, setCustomersSummary] = useState<any>(null);
  const [performanceSummary, setPerformanceSummary] = useState<any>(null);
  const [waiterSummary, setWaiterSummary] = useState<any>(null);
  const [tablesSummary, setTablesSummary] = useState<any[]>([]);
  const [couponSummary, setCouponSummary] = useState<any>(null);

  // Detailed paginated report lists
  const [reportData, setReportData] = useState<any[]>([]);



  const fetchReportData = async () => {
    if (dateRange === 'CUSTOM' && (!customStart || !customEnd)) return;

    try {
      setLoading(true);
      setForbidden(false);
      const queryStr = `range=${dateRange}&startDate=${customStart}&endDate=${customEnd}&page=${page}&limit=${limit}`;

      if (activeTab === 'analytics') {
        const [
          resOverview,
          resTrend,
          resOrders,
          resPayments,
          resDiscounts,
          resItems,
          resCust,
          resPerf,
          resWaiter,
          resTables
        ] = await Promise.all([
          api.get(`/analytics/overview?${queryStr}`),
          api.get(`/analytics/sales-trend?${queryStr}&groupBy=DAILY`),
          api.get(`/analytics/orders?${queryStr}`),
          api.get(`/analytics/payments?${queryStr}`),
          api.get(`/analytics/discounts?${queryStr}`),
          api.get(`/analytics/items?${queryStr}`),
          api.get(`/analytics/customers?${queryStr}`),
          api.get(`/analytics/order-performance?${queryStr}`),
          api.get(`/analytics/waiter-calls?${queryStr}`),
          api.get(`/analytics/tables?${queryStr}`)
        ]);

        setOverview(resOverview.data);
        setSalesTrend(resTrend.data);
        setOrdersSummary(resOrders.data);
        setPaymentsSummary(resPayments.data);
        setDiscountsSummary(resDiscounts.data);
        setItemsSummary(resItems.data);
        setCustomersSummary(resCust.data);
        setPerformanceSummary(resPerf.data);
        setWaiterSummary(resWaiter.data);
        setTablesSummary(resTables.data);
      } else {
        // Detailed paginated reports
        let endpoint = '';
        if (activeTab === 'daily-sales') endpoint = `/reports/daily-sales?${queryStr}`;
        else if (activeTab === 'payments') endpoint = `/reports/payments?${queryStr}`;
        else if (activeTab === 'gst') endpoint = `/reports/gst?${queryStr}`;
        else if (activeTab === 'credit') endpoint = `/reports/credit-due?${queryStr}&filter=${agingFilter}`;
        else if (activeTab === 'cancellations') endpoint = `/reports/cancellations?${queryStr}`;
        else if (activeTab === 'orders') endpoint = `/reports/orders?${queryStr}`;
        else if (activeTab === 'items') endpoint = `/reports/items?${queryStr}`;
        else if (activeTab === 'customers') endpoint = `/reports/customers?${queryStr}`;
        else if (activeTab === 'discounts') endpoint = `/reports/discounts?${queryStr}`;
        else if (activeTab === 'coupons') {
          endpoint = `/reports/coupons?${queryStr}`;
          const summaryRes = await api.get(`/analytics/coupons?range=${dateRange}&startDate=${customStart}&endDate=${customEnd}`);
          setCouponSummary(summaryRes.data);
        }

        const res = await api.get(endpoint);
        const fetched = res.data;
        if (fetched && fetched.items !== undefined) {
          setReportData(fetched.items);
          setTotalItems(fetched.total || 0);
          setTotalPages(Math.ceil((fetched.total || 0) / limit) || 1);
        } else if (Array.isArray(fetched)) {
          // Fallback if returned unpaginated array
          setReportData(fetched);
          setTotalItems(fetched.length);
          setTotalPages(1);
        } else {
          // Special object return like cancellations
          setReportData(fetched.cancellations || []);
          setTotalItems(fetched.total || fetched.cancellations?.length || 0);
          setTotalPages(Math.ceil((fetched.total || fetched.cancellations?.length || 0) / limit) || 1);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setForbidden(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, dateRange, customStart, customEnd, agingFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReportData().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [dateRange, customStart, customEnd, activeTab, agingFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCsvExport = async (type: string) => {
    try {
      setExporting(true);
      const queryStr = `range=${dateRange}&startDate=${customStart}&endDate=${customEnd}&filter=${agingFilter}`;
      
      const response = await api.get(`/reports/${type}/export.csv?${queryStr}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}-${dateRange}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to export CSV report.');
    } finally {
      setExporting(false);
    }
  };

  // Dedicated PDF Exporters for key views using actual backend data
  const exportPdfReport = async (type: 'daily-sales' | 'gst' | 'payments' | 'credit') => {
    try {
      setLoading(true);
      const queryStr = `range=${dateRange}&startDate=${customStart}&endDate=${customEnd}&filter=${agingFilter}`;
      const response = await api.get(`/reports/${type}?${queryStr}`);
      const data = response.data.items || response.data;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(60, 42, 33);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('CUE & BREW REPORTS', 15, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text(`Report Ledger: ${type.toUpperCase()}`, 15, 25);
      doc.text(`Time Range: ${dateRange} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 15, 30);

      doc.setTextColor(60, 42, 33);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');

      let y = 55;
      if (type === 'daily-sales') {
        doc.text('Date', 15, y);
        doc.text('Orders', 45, y);
        doc.text('Gross Sales', 75, y);
        doc.text('Settled', 110, y);
        doc.text('Credit Due', 145, y);
        doc.text('Outstanding', 175, y);
        doc.line(15, y + 2, 195, y + 2);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        data.forEach((row: any) => {
          y += 8;
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(row.date, 15, y);
          doc.text(String(row.orders), 45, y);
          doc.text(`INR ${row.billedSales}`, 75, y);
          doc.text(`INR ${row.settledCollection}`, 110, y);
          doc.text(`INR ${row.credit}`, 145, y);
          doc.text(`INR ${row.outstanding}`, 175, y);
        });
      } else if (type === 'gst') {
        doc.text('Invoice No', 15, y);
        doc.text('Date', 50, y);
        doc.text('Taxable Sub', 85, y);
        doc.text('CGST', 120, y);
        doc.text('SGST', 150, y);
        doc.text('Total Grand', 175, y);
        doc.line(15, y + 2, 195, y + 2);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        data.forEach((row: any) => {
          y += 8;
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(row.invoiceNumber || 'DRAFT', 15, y);
          doc.text(row.finalizedAt ? new Date(row.finalizedAt).toLocaleDateString('en-IN') : '--', 50, y);
          doc.text(`INR ${row.taxableAmount}`, 85, y);
          doc.text(`INR ${row.cgst}`, 120, y);
          doc.text(`INR ${row.sgst}`, 150, y);
          doc.text(`INR ${row.grandTotal}`, 175, y);
        });
      } else if (type === 'payments') {
        doc.text('Date', 15, y);
        doc.text('Invoice', 45, y);
        doc.text('Method', 75, y);
        doc.text('Amount', 105, y);
        doc.text('Tendered', 135, y);
        doc.text('Received By', 165, y);
        doc.line(15, y + 2, 195, y + 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        data.forEach((row: any) => {
          y += 8;
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(new Date(row.paidAt).toLocaleDateString('en-IN'), 15, y);
          doc.text(row.bill?.invoiceNumber || 'DRAFT', 45, y);
          doc.text(row.method, 75, y);
          doc.text(`INR ${row.amount}`, 105, y);
          doc.text(row.amountTendered ? `INR ${row.amountTendered}` : '--', 135, y);
          doc.text(row.receivedBy?.name || 'Cashier', 165, y);
        });
      } else if (type === 'credit') {
        doc.text('Name', 15, y);
        doc.text('Phone', 50, y);
        doc.text('Invoice', 85, y);
        doc.text('Grand Total', 120, y);
        doc.text('Outstanding', 155, y);
        doc.text('Age (Days)', 185, y);
        doc.line(15, y + 2, 195, y + 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        data.forEach((row: any) => {
          y += 8;
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(row.customerName, 15, y);
          doc.text(row.customerPhoneSafe, 50, y);
          doc.text(row.invoiceNumber, 85, y);
          doc.text(`INR ${row.grandTotal}`, 120, y);
          doc.text(`INR ${row.outstanding}`, 155, y);
          doc.text(`${row.ageDays} Days`, 185, y);
        });
      }

      doc.save(`ledger-${type}-${dateRange}.pdf`);
    } catch (err) {
      alert('Failed to generate PDF ledger.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title & Exporters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3C2A21] tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-[#8F6A50] mt-1">
            Authoritative financial dashboard for managers and owners. View trends, GST records, and aging credit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {activeTab !== 'analytics' && ['daily-sales', 'gst', 'payments', 'credit'].includes(activeTab) && (
            <button
              onClick={() => exportPdfReport(activeTab as any)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/35 hover:border-[#8F6A50] text-[#8F6A50] rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <FileText className="h-4 w-4" />
              Download PDF Report
            </button>
          )}

          {activeTab !== 'analytics' && (
            <button
              onClick={() => handleCsvExport(activeTab)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#8F6A50] hover:bg-[#3C2A21] text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV Ledger'}
            </button>
          )}
        </div>
      </div>

      {/* Date Range Selector Header */}
      <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-[#8F6A50] flex-shrink-0" />
          <span className="text-sm font-bold text-[#3C2A21]">Date Boundary Filters</span>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21] outline-none"
          >
            <option value="TODAY">Today (Kolkata)</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="LAST_7_DAYS">Last 7 Days</option>
            <option value="LAST_30_DAYS">Last 30 Days</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_MONTH">Last Month</option>
            <option value="CUSTOM">Custom Range</option>
          </select>

          {dateRange === 'CUSTOM' && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1.5 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
              />
              <span className="text-xs text-[#8F6A50] font-bold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-[#EAD8C0]/30 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'analytics' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Analytics Dashboard
        </button>
        <button
          onClick={() => setActiveTab('daily-sales')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'daily-sales' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Daily Sales
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'payments' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Payments Journal
        </button>
        <button
          onClick={() => setActiveTab('gst')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'gst' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Receipt className="h-4 w-4" />
          GST Invoices
        </button>
        <button
          onClick={() => setActiveTab('credit')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'credit' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Users className="h-4 w-4" />
          Credit & Aging
        </button>
        <button
          onClick={() => setActiveTab('cancellations')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'cancellations' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <XCircle className="h-4 w-4" />
          Cancellations
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'orders' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Orders Report
        </button>
        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'items' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Utensils className="h-4 w-4" />
          Item Sales
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'customers' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Users className="h-4 w-4" />
          Customer Spend
        </button>
        <button
          onClick={() => setActiveTab('discounts')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'discounts' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Percent className="h-4 w-4" />
          Discounts Applied
        </button>
        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all flex-shrink-0 ${
            activeTab === 'coupons' ? 'border-[#8F6A50] text-[#8F6A50]' : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21]'
          }`}
        >
          <Ticket className="h-4 w-4" />
          Coupon Redemptions
        </button>
      </div>

      {forbidden ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-8 rounded-3xl text-center space-y-4 max-w-lg mx-auto shadow-sm">
          <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto" />
          <h3 className="text-lg font-bold">Access Denied</h3>
          <p className="text-sm text-rose-700/80 font-medium">
            Your staff account is restricted from viewing financial reports or analytics. Please contact the restaurant Owner to update your permissions.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center space-y-3">
            <Coffee className="animate-spin h-10 w-10 text-[#8F6A50] mx-auto" />
            <p className="text-sm text-[#3C2A21] font-semibold">Aggregating report ledgers...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* TAB 1: ANALYTICS OVERVIEW */}
          {activeTab === 'analytics' && overview && (
            <div className="space-y-8">
              {/* Stats KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-3">
                  <span className="text-xs uppercase tracking-widest text-[#8F6A50] font-extrabold">Billed Sales (Gross)</span>
                  <div className="text-3xl font-extrabold text-[#3C2A21]">₹{Number(overview.billedSales).toLocaleString('en-IN')}</div>
                  <p className="text-xs text-[#8F6A50]/70">Gross invoice totals generated in this period.</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-3">
                  <span className="text-xs uppercase tracking-widest text-[#8F6A50] font-extrabold">Collected Revenue</span>
                  <div className="text-3xl font-extrabold text-emerald-700">₹{Number(overview.settledCollection).toLocaleString('en-IN')}</div>
                  <p className="text-xs text-[#8F6A50]/70">Settled Cash, UPI and Card collections.</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-3">
                  <span className="text-xs uppercase tracking-widest text-[#8F6A50] font-extrabold">Outstanding Credit Due</span>
                  <div className="text-3xl font-extrabold text-rose-700">₹{Number(overview.outstanding).toLocaleString('en-IN')}</div>
                  <p className="text-xs text-[#8F6A50]/70">Includes credit balances pending settlement.</p>
                </div>
              </div>

              {/* Charts Section */}
              {salesTrend.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                  <h3 className="text-base font-bold text-[#3C2A21]">Billed Sales vs Collections Trend</h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesTrend}>
                        <XAxis dataKey="label" stroke="#8F6A50" fontSize={10} tickLine={false} />
                        <YAxis stroke="#8F6A50" fontSize={10} tickLine={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="billedSales" name="Billed Sales" fill="#8F6A50" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="settledCollection" name="Settled Collected" fill="#3C2A21" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Items & Table Heatmaps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {itemsSummary?.topSellingQty?.length > 0 && (
                  <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-[#3C2A21]">Top Selling Menu Items</h3>
                    <div className="space-y-3">
                      {itemsSummary.topSellingQty.slice(0, 5).map((item: any, idx: number) => (
                        <div key={item.name} className="flex items-center justify-between text-sm py-1 border-b border-[#FAF8F5]/80">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-[#EAD8C0]/30 text-xs font-bold text-[#8F6A50] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-[#3C2A21]">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-[#8F6A50] font-bold">{item.qty} sold</span>
                            <span className="font-bold text-[#3C2A21]">₹{Number(item.rev).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tablesSummary?.length > 0 && (
                  <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-[#3C2A21]">Table Revenue Performance</h3>
                    <div className="space-y-3">
                      {tablesSummary.slice(0, 5).map((t: any) => (
                        <div key={t.tableLabel} className="flex items-center justify-between text-sm py-1 border-b border-[#FAF8F5]/80">
                          <span className="font-semibold text-[#3C2A21]">Table {t.tableLabel}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-[#8F6A50] font-bold">{t.orderCount} orders</span>
                            <span className="font-bold text-[#3C2A21]">₹{Number(t.totalSales).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DAILY SALES */}
          {activeTab === 'daily-sales' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-center">Orders</th>
                      <th className="px-6 py-4 text-right">Billed Sales</th>
                      <th className="px-6 py-4 text-right">Settled</th>
                      <th className="px-6 py-4 text-right">Cash</th>
                      <th className="px-6 py-4 text-right">UPI</th>
                      <th className="px-6 py-4 text-right">Card</th>
                      <th className="px-6 py-4 text-right text-rose-700">Credit Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.date} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold text-[#3C2A21]">{row.date}</td>
                        <td className="px-6 py-4 text-center font-medium">{row.orders}</td>
                        <td className="px-6 py-4 text-right font-bold text-[#3C2A21]">₹{Number(row.billedSales).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-emerald-700">₹{Number(row.settledCollection).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.cash).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.upi).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.card).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-rose-600 font-bold">₹{Number(row.credit).toFixed(2)}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-sm text-[#8F6A50]/70">
                          No daily sales logs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Invoice No</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                      <th className="px-6 py-4 text-right">Tendered</th>
                      <th className="px-6 py-4 text-right">Change Due</th>
                      <th className="px-6 py-4">Received By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.id} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 text-xs text-[#8F6A50]">{new Date(row.paidAt).toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 font-bold text-[#3C2A21]">{row.bill?.invoiceNumber || 'DRAFT'}</td>
                        <td className="px-6 py-4 text-xs font-extrabold uppercase">{row.method}</td>
                        <td className="px-6 py-4 text-right font-bold">₹{Number(row.amount).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">₹{row.amountTendered ? Number(row.amountTendered).toFixed(2) : '--'}</td>
                        <td className="px-6 py-4 text-right">₹{row.changeDue ? Number(row.changeDue).toFixed(2) : '--'}</td>
                        <td className="px-6 py-4">{row.receivedBy?.name}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-sm text-[#8F6A50]/70">No payments found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: GST INVOICES */}
          {activeTab === 'gst' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Invoice Number</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-right">Taxable Amount</th>
                      <th className="px-6 py-4 text-right">CGST</th>
                      <th className="px-6 py-4 text-right">SGST</th>
                      <th className="px-6 py-4 text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.invoiceNumber} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold text-[#3C2A21]">{row.invoiceNumber}</td>
                        <td className="px-6 py-4 text-xs text-[#8F6A50]">{row.finalizedAt ? new Date(row.finalizedAt).toLocaleDateString('en-IN') : '--'}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.taxableAmount).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.cgst).toFixed(2)} ({row.cgstRateSnapshot}%)</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.sgst).toFixed(2)} ({row.sgstRateSnapshot}%)</td>
                        <td className="px-6 py-4 text-right font-bold">₹{Number(row.grandTotal).toFixed(2)}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#8F6A50]/70">No GST transactions found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: CREDIT DUE & AGING */}
          {activeTab === 'credit' && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 pb-2">
                {(['ALL', 'DUE_TODAY', 'DUE_1_7', 'DUE_8_30', 'DUE_30_PLUS'] as AgingFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAgingFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      agingFilter === f ? 'bg-[#8F6A50] text-white' : 'bg-[#FAF8F5] text-[#8F6A50]'
                    }`}
                  >
                    {f === 'ALL' && 'All Dues'}
                    {f === 'DUE_TODAY' && 'Due Today'}
                    {f === 'DUE_1_7' && '1-7 Days'}
                    {f === 'DUE_8_30' && '8-30 Days'}
                    {f === 'DUE_30_PLUS' && '30+ Days'}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                      <tr>
                        <th className="px-6 py-4">Customer Name</th>
                        <th className="px-6 py-4">Phone</th>
                        <th className="px-6 py-4">Invoice No</th>
                        <th className="px-6 py-4 text-right">Grand Total</th>
                        <th className="px-6 py-4 text-right text-rose-700">Credit Outstanding</th>
                        <th className="px-6 py-4 text-center">Due Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAF8F5]">
                      {reportData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#FAF8F5]/30">
                          <td className="px-6 py-4 font-bold">{row.customerName}</td>
                          <td className="px-6 py-4">{row.customerPhoneSafe}</td>
                          <td className="px-6 py-4 font-semibold text-[#8F6A50]">{row.invoiceNumber}</td>
                          <td className="px-6 py-4 text-right">₹{Number(row.grandTotal).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-rose-700 font-bold">₹{Number(row.outstanding).toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-[#EAD8C0]/20 text-[#8F6A50]">
                              {row.ageDays === 0 ? 'Today' : `${row.ageDays} Days`}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {reportData.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-[#8F6A50]/70">No outstanding credits found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CANCELLATIONS */}
          {activeTab === 'cancellations' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Order Number</th>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4 text-right">Grand Total</th>
                      <th className="px-6 py-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.orderNumber} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold text-[#3C2A21]">{row.orderNumber}</td>
                        <td className="px-6 py-4 text-xs">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4">{row.customerName}</td>
                        <td className="px-6 py-4 text-right font-semibold">₹{Number(row.grandTotal).toFixed(2)}</td>
                        <td className="px-6 py-4 text-xs text-rose-700 italic bg-rose-50/20">{row.reason}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-[#8F6A50]/70">No cancellations recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: ORDERS REPORT */}
          {activeTab === 'orders' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Order No</th>
                      <th className="px-6 py-4">Date/Time</th>
                      <th className="px-6 py-4">Source</th>
                      <th className="px-6 py-4">Table</th>
                      <th className="px-6 py-4 text-right">Grand Total</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.id} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold">{row.orderNumber}</td>
                        <td className="px-6 py-4 text-xs">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4">{row.source}</td>
                        <td className="px-6 py-4">{row.table?.tableNumber || 'Takeaway'}</td>
                        <td className="px-6 py-4 text-right font-bold">₹{Number(row.grandTotal).toFixed(2)}</td>
                        <td className="px-6 py-4 text-xs font-extrabold">{row.status}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-[#8F6A50]/70">No orders logged.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: ITEM SALES */}
          {activeTab === 'items' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Item Name</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4 text-center">Qty Sold</th>
                      <th className="px-6 py-4 text-right">Unit Price</th>
                      <th className="px-6 py-4 text-right">Discount</th>
                      <th className="px-6 py-4 text-right">Net Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold">{row.name} {row.variant && `(${row.variant})`}</td>
                        <td className="px-6 py-4 font-semibold text-[#8F6A50]">{row.category}</td>
                        <td className="px-6 py-4 text-center font-bold">{row.qty}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-rose-600">₹{Number(row.discount).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right font-bold">₹{Number(row.netRevenue).toFixed(2)}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-[#8F6A50]/70">No item sales found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: CUSTOMER SPEND */}
          {activeTab === 'customers' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Customer Name</th>
                      <th className="px-6 py-4">Phone</th>
                      <th className="px-6 py-4 text-center">Orders Count</th>
                      <th className="px-6 py-4 text-right">Total Spend</th>
                      <th className="px-6 py-4">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.customerId} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold">{row.name}</td>
                        <td className="px-6 py-4">{row.phone}</td>
                        <td className="px-6 py-4 text-center font-semibold">{row.orderCount}</td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-700">₹{Number(row.totalSpend).toFixed(2)}</td>
                        <td className="px-6 py-4 text-xs">{new Date(row.lastVisit).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-[#8F6A50]/70">No customer spend metrics logged.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 10: DISCOUNTS APPLIED */}
          {activeTab === 'discounts' && (
            <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                    <tr>
                      <th className="px-6 py-4">Invoice No</th>
                      <th className="px-6 py-4">Finalized At</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4 text-right">Subtotal</th>
                      <th className="px-6 py-4 text-right">Coupon Discount</th>
                      <th className="px-6 py-4 text-right">Manual Discount</th>
                      <th className="px-6 py-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF8F5]">
                    {reportData.map((row) => (
                      <tr key={row.id} className="hover:bg-[#FAF8F5]/30">
                        <td className="px-6 py-4 font-bold">{row.invoiceNumber || 'DRAFT'}</td>
                        <td className="px-6 py-4 text-xs">{row.finalizedAt ? new Date(row.finalizedAt).toLocaleString('en-IN') : '--'}</td>
                        <td className="px-6 py-4">{row.order?.customer?.name || 'Walk-in'}</td>
                        <td className="px-6 py-4 text-right">₹{Number(row.subtotal).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-rose-600">₹{Number(row.couponDiscount).toFixed(2)} {row.couponCodeSnapshot && `(${row.couponCodeSnapshot})`}</td>
                        <td className="px-6 py-4 text-right text-rose-600 font-bold">₹{Number(row.manualDiscount).toFixed(2)}</td>
                        <td className="px-6 py-4 text-xs italic">{row.manualDiscountReason || '--'} ({row.manualDiscountAppliedBy || 'Owner'})</td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-[#8F6A50]/70">No discounts applied in this range.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 11: COUPON ANALYTICS + REDEMPTIONS */}
          {activeTab === 'coupons' && (
            <div className="space-y-8">

              {/* KPI Cards */}
              {couponSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-[#8F6A50] uppercase tracking-widest">Total Discount</p>
                    <p className="text-2xl font-black text-[#3C2A21]">₹{Number(couponSummary.totalDiscount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-[#8F6A50] uppercase tracking-widest">Redemptions</p>
                    <p className="text-2xl font-black text-[#3C2A21]">{couponSummary.redemptions}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest">Active</p>
                    <p className="text-2xl font-black text-emerald-700">{couponSummary.activeCount}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest">Reversed</p>
                    <p className="text-2xl font-black text-rose-700">{couponSummary.reversedCount}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-[#8F6A50] uppercase tracking-widest">Unique Customers</p>
                    <p className="text-2xl font-black text-[#3C2A21]">{couponSummary.uniqueCustomers}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
                    <p className="text-[10px] font-extrabold text-[#8F6A50] uppercase tracking-widest">Avg. Discount</p>
                    <p className="text-2xl font-black text-[#3C2A21]">₹{Number(couponSummary.averageDiscount).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {/* Usage Trend Line Chart */}
              {couponSummary?.usageTrend?.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#3C2A21]">Coupon Usage Trend</h3>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Redemptions, active and reversed coupon usages over the selected period.</p>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={couponSummary.usageTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAD8C0" />
                        <XAxis dataKey="period" stroke="#8F6A50" fontSize={10} tickLine={false} />
                        <YAxis stroke="#8F6A50" fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: '1px solid #EAD8C0', fontSize: 12 }}
                          formatter={(val: any, name: any) => [
                            name === 'totalDiscount' ? `₹${Number(val).toFixed(2)}` : val,
                            name === 'redemptions' ? 'Redemptions' : name === 'activeUsages' ? 'Active' : name === 'reversedUsages' ? 'Reversed' : 'Total Discount'
                          ]}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="redemptions" name="Redemptions" stroke="#8F6A50" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="activeUsages" name="Active" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="reversedUsages" name="Reversed" stroke="#e11d48" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Coupons Bar Chart */}
              {couponSummary?.topCoupons?.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#3C2A21]">Top Coupons by Usage</h3>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Most redeemed coupons by redemption count and total discount value.</p>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={couponSummary.topCoupons} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                        <XAxis type="number" stroke="#8F6A50" fontSize={10} tickLine={false} />
                        <YAxis type="category" dataKey="code" stroke="#8F6A50" fontSize={10} tickLine={false} width={60} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: '1px solid #EAD8C0', fontSize: 12 }}
                          formatter={(val: any, name: any) => [
                            name === 'totalDiscountValue' ? `₹${Number(val).toFixed(2)}` : val,
                            name === 'usageCount' ? 'Redemptions' : 'Total Discount'
                          ]}
                        />
                        <Legend />
                        <Bar dataKey="usageCount" name="Redemptions" fill="#8F6A50" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="totalDiscountValue" name="Total Discount (₹)" fill="#3C2A21" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Limit Utilization */}
              {couponSummary?.limitUtilization?.filter((c: any) => c.usageLimit).length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#3C2A21]">Coupon Limit Utilization</h3>
                    <p className="text-xs text-[#8F6A50] mt-0.5">How close each active coupon is to exhausting its global usage limit.</p>
                  </div>
                  <div className="space-y-4">
                    {couponSummary.limitUtilization
                      .filter((c: any) => c.usageLimit)
                      .map((c: any) => {
                        const pct = Math.min(100, c.utilizationPercent);
                        const color = pct >= 90 ? '#e11d48' : pct >= 65 ? '#f59e0b' : '#059669';
                        return (
                          <div key={c.code} className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-extrabold tracking-wider text-[#3C2A21]">{c.code}</span>
                              <span className="text-xs font-bold" style={{ color }}>
                                {c.usedCount} / {c.usageLimit} uses ({pct.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full h-2.5 bg-[#FAF8F5] rounded-full border border-[#EAD8C0]/25 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Redemptions Ledger Table */}
              <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#EAD8C0]/10 bg-[#FAF8F5]">
                  <h3 className="text-sm font-bold text-[#3C2A21]">Redemption Ledger</h3>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Individual coupon redemption records for the selected date range.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] uppercase border-b border-[#EAD8C0]/15">
                      <tr>
                        <th className="px-6 py-4">Date/Time</th>
                        <th className="px-6 py-4">Coupon Code</th>
                        <th className="px-6 py-4">Coupon Name</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4">Order No</th>
                        <th className="px-6 py-4">Invoice No</th>
                        <th className="px-6 py-4 text-right">Applied Discount</th>
                        <th className="px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAF8F5]">
                      {reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-[#FAF8F5]/30">
                          <td className="px-6 py-4 text-xs text-[#8F6A50]">{new Date(row.usedAt || row.createdAt).toLocaleString('en-IN')}</td>
                          <td className="px-6 py-4 font-bold tracking-wider">{row.couponCodeSnapshot}</td>
                          <td className="px-6 py-4 text-xs text-[#8F6A50]">{row.couponNameSnapshot}</td>
                          <td className="px-6 py-4">{row.customer?.name || 'Walk-in/Anonymous'}</td>
                          <td className="px-6 py-4 font-semibold text-[#8F6A50]">{row.order?.orderNumber}</td>
                          <td className="px-6 py-4 font-bold">{row.bill?.invoiceNumber || 'DRAFT'}</td>
                          <td className="px-6 py-4 text-right font-bold text-emerald-700">₹{Number(row.appliedDiscountSnapshot).toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              row.status === 'ACTIVE'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-800'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {reportData.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-10 text-center text-[#8F6A50]/70">No coupon redemptions found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {activeTab !== 'analytics' && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#EAD8C0]/15 pt-6">
              <span className="text-xs font-bold text-[#8F6A50]">
                Showing Page {page} of {totalPages} ({totalItems} total records)
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl disabled:opacity-50 hover:border-[#8F6A50] text-[#8F6A50]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl disabled:opacity-50 hover:border-[#8F6A50] text-[#8F6A50]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
