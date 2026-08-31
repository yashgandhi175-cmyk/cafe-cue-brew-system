'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Ticket,
  Plus,
  Edit2,
  Trash2,
  Sliders,
  Calendar,
  DollarSign,
  Users,
  Search,
  Lock,
  CheckCircle,
  XCircle,
  Eye,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendWhatsAppMessage, buildOfferMessage } from '@/lib/whatsapp';

interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'FLAT' | 'PERCENTAGE';
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  usageLimit: number | null;
  perCustLimit: number | null;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [role, setRole] = useState<string>('');
  const [denied, setDenied] = useState(false);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'FLAT' | 'PERCENTAGE'>('FLAT');
  const [value, setValue] = useState(0);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(null);
  const [minOrder, setMinOrder] = useState(0);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  const [perCustLimit, setPerCustLimit] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState<'ALL' | 'SCHEDULED' | 'CURRENT' | 'EXPIRED'>('ALL');

  // Summary and Ledger
  const [summary, setSummary] = useState<{
    totalDiscount: number;
    redemptions: number;
    activeCount: number;
    reversedCount: number;
    uniqueCustomers: number;
    averageDiscount: number;
  } | null>(null);

  const [ledgerItems, setLedgerItems] = useState<any[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLimit] = useState(10);
  const [showLedgerDrawer, setShowLedgerDrawer] = useState(false);

  const fetchSessionAndSettings = async () => {
    try {
      const stored = localStorage.getItem('ccb_staff');
      if (stored) {
        const parsed = JSON.parse(stored);
        setRole(parsed.role);
        if (parsed.role === 'WAITER' || parsed.role === 'CASHIER') {
          setDenied(true);
          setLoading(false);
          return;
        }

        const settingsRes = await api.get('/settings');
        setSettings(settingsRes.data);

        if (parsed.role === 'MANAGER' && !settingsRes.data.managerCanManageCoupons) {
          setDenied(true);
          setLoading(false);
          return;
        }
      } else {
        setDenied(true);
        setLoading(false);
        return;
      }

      await fetchCoupons();
      await fetchAnalyticsAndLedger();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await api.get('/coupons');
      setCoupons(res.data.items || res.data || []);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyticsAndLedger = async () => {
    try {
      const analyticsRes = await api.get('/analytics/coupons?range=LAST_30_DAYS');
      setSummary(analyticsRes.data);
    } catch (err) {
      console.error('Failed to load coupon analytics:', err);
    }
  };

  const fetchLedger = async (page: number) => {
    try {
      const ledgerRes = await api.get(`/reports/coupons?range=LAST_30_DAYS&page=${page}&limit=${ledgerLimit}`);
      setLedgerItems(ledgerRes.data.items || []);
      setLedgerTotal(ledgerRes.data.total || 0);
      setLedgerPage(page);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    }
  };

  useEffect(() => {
    fetchSessionAndSettings();
  }, []);

  const openCreateModal = () => {
    setIsEdit(false);
    setSelectedId('');
    setCode('');
    setName('');
    setDescription('');
    setType('FLAT');
    setValue(0);
    setMaxDiscount(null);
    setMinOrder(0);
    setUsageLimit(null);
    setPerCustLimit(null);
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEndDate(nextMonth.toISOString().split('T')[0]);
    setIsActive(true);
    setShowModal(true);
  };

  const openEditModal = (coupon: Coupon) => {
    setIsEdit(true);
    setSelectedId(coupon.id);
    setCode(coupon.code);
    setName(coupon.name);
    setDescription(coupon.description || '');
    setType(coupon.type);
    setValue(Number(coupon.value));
    setMaxDiscount(coupon.maxDiscount ? Number(coupon.maxDiscount) : null);
    setMinOrder(Number(coupon.minOrder));
    setUsageLimit(coupon.usageLimit);
    setPerCustLimit(coupon.perCustLimit);
    setStartDate(new Date(coupon.startDate).toISOString().split('T')[0]);
    setEndDate(new Date(coupon.endDate).toISOString().split('T')[0]);
    setIsActive(coupon.isActive);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !startDate || !endDate) return;

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || null,
      type,
      value: Number(value),
      maxDiscount: maxDiscount !== null ? Number(maxDiscount) : null,
      minOrder: Number(minOrder),
      usageLimit: usageLimit !== null ? Number(usageLimit) : null,
      perCustLimit: perCustLimit !== null ? Number(perCustLimit) : null,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      isActive,
    };

    try {
      if (isEdit) {
        await api.put(`/coupons/${selectedId}`, payload);
      } else {
        await api.post('/coupons', payload);
      }
      setShowModal(false);
      await fetchCoupons();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save coupon.');
    }
  };

  const toggleCouponStatus = async (id: string, current: boolean) => {
    try {
      await api.patch(`/coupons/${id}/status`, { isActive: !current });
      await fetchCoupons();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to toggle status.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <Ticket className="animate-spin h-10 w-10 text-[#8F6A50] mx-auto" />
          <p className="text-sm text-[#3C2A21] font-semibold">Loading coupons console...</p>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl border border-rose-100 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#3C2A21]">Access Restrained</h2>
        <p className="text-sm text-[#8F6A50]">
          Your account role ({role}) does not possess the permissions required to edit coupon definitions.
        </p>
      </div>
    );
  }

  const filteredCoupons = coupons.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase());
    const matchesActive =
      filterActive === 'ALL' ||
      (filterActive === 'ACTIVE' && c.isActive) ||
      (filterActive === 'INACTIVE' && !c.isActive);

    let matchesLifecycle = true;
    if (lifecycleFilter !== 'ALL') {
      const now = new Date();
      const start = c.startDate ? new Date(c.startDate) : null;
      const end = c.endDate ? new Date(c.endDate) : null;

      if (lifecycleFilter === 'SCHEDULED') {
        matchesLifecycle = !!(start && start > now);
      } else if (lifecycleFilter === 'CURRENT') {
        matchesLifecycle = c.isActive && (!start || start <= now) && (!end || end >= now);
      } else if (lifecycleFilter === 'EXPIRED') {
        matchesLifecycle = !!(end && end < now);
      }
    }

    return matchesSearch && matchesActive && matchesLifecycle;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3C2A21] tracking-tight">Coupons & Campaigns</h1>
          <p className="text-sm text-[#8F6A50] mt-1">
            Build target loyalty campaigns, flat/percentage discounts, and coupon limits for checkouts.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setShowLedgerDrawer(true);
              fetchLedger(1);
            }}
            variant="ghost"
            className="border border-[#EAD8C0]/35 text-[#8F6A50] hover:bg-[#8F6A50] hover:text-white flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm"
          >
            <Eye className="w-4 h-4" /> Usage Ledger
          </Button>
          <Button
            onClick={openCreateModal}
            className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm shadow-md"
          >
            <Plus className="w-4 h-4" /> Create Coupon
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Total Discount</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">₹{summary.totalDiscount.toFixed(2)}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Redemptions</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">{summary.redemptions}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Active Usages</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">{summary.activeCount}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Reversed Usages</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">{summary.reversedCount}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Unique Customers</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">{summary.uniqueCustomers}</p>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-[#EAD8C0]/15 shadow-sm space-y-1">
            <p className="text-xs font-bold text-[#8F6A50] uppercase">Avg. Discount</p>
            <p className="text-xl font-extrabold text-[#3C2A21]">₹{summary.averageDiscount.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-2xl border border-[#EAD8C0]/15">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search coupon code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-medium outline-none focus:border-[#8F6A50]"
          />
          <Search className="w-4 h-4 text-[#8F6A50] absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2 items-center">
            <span className="text-xs font-bold text-[#8F6A50] uppercase">Status:</span>
            {['ALL', 'ACTIVE', 'INACTIVE'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterActive(f as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterActive === f
                    ? 'bg-[#8F6A50] text-white'
                    : 'bg-[#FAF8F5] border border-[#EAD8C0]/25 text-[#3C2A21]/70 hover:bg-[#EAD8C0]/10'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-xs font-bold text-[#8F6A50] uppercase">Lifecycle:</span>
            {['ALL', 'SCHEDULED', 'CURRENT', 'EXPIRED'].map((lf) => (
              <button
                key={lf}
                type="button"
                onClick={() => setLifecycleFilter(lf as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  lifecycleFilter === lf
                    ? 'bg-[#8F6A50] text-white'
                    : 'bg-[#FAF8F5] border border-[#EAD8C0]/25 text-[#3C2A21]/70 hover:bg-[#EAD8C0]/10'
                }`}
              >
                {lf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Coupons Table Grid */}
      <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF8F5] border-b border-[#EAD8C0]/15 text-[#8F6A50] font-bold text-xs uppercase tracking-wider">
                <th className="p-4 pl-6">Coupon Code</th>
                <th className="p-4">Discount details</th>
                <th className="p-4">Validity</th>
                <th className="p-4">Redemptions</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAD8C0]/10 text-sm font-medium text-[#3C2A21]">
              {filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#8F6A50] font-medium">
                    No coupons found matching filters.
                  </td>
                </tr>
              ) : (
                filteredCoupons.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF8F5]/30 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#8F6A50]/10 rounded-xl flex items-center justify-center text-[#8F6A50]">
                          <Ticket className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-extrabold tracking-wider">{c.code}</p>
                          <p className="text-xs text-[#8F6A50] font-semibold">{c.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-[#8F6A50]">
                        {c.type === 'FLAT' ? `₹${c.value} Off` : `${c.value}% Off`}
                      </p>
                      <p className="text-xs text-[#8F6A50]/70 font-light mt-0.5">
                        Min Order: ₹{c.minOrder}
                        {c.maxDiscount ? ` | Max: ₹${c.maxDiscount}` : ''}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-semibold">
                        {new Date(c.startDate).toLocaleDateString('en-IN')} -{' '}
                        {new Date(c.endDate).toLocaleDateString('en-IN')}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold">
                        {c.usedCount}
                        <span className="text-xs text-[#8F6A50] font-light">
                          {c.usageLimit ? ` / ${c.usageLimit}` : ' / Unlimited'}
                        </span>
                      </p>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleCouponStatus(c.id, c.isActive)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-all border ${
                          c.isActive
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        {c.isActive ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            const discountStr = c.type === 'FLAT' ? `₹${c.value} OFF` : `${c.value}% OFF`;
                            const msg = buildOfferMessage('Valued Customer', `${c.name} (${c.code})`, `Use coupon ${c.code} for ${discountStr} on your next order!`);
                            const phone = prompt('Enter customer phone number (e.g. 9876543210):');
                            if (phone !== null) {
                              sendWhatsAppMessage(phone, msg);
                            }
                          }}
                          className="h-8 px-2.5 text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-extrabold rounded-lg flex items-center gap-1 shadow-xs"
                          title="Send Coupon Offer via WhatsApp"
                        >
                          <span>Send WhatsApp</span>
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => openEditModal(c)}
                          className="w-8 h-8 p-0 text-[#8F6A50] hover:text-[#3C2A21] rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal dialog for creating/editing coupons */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-[#EAD8C0]/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#3C2A21]">
                {isEdit ? `Edit Coupon: ${code}` : 'Create Campaign Coupon'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#8F6A50] hover:text-[#3C2A21] font-bold text-lg p-2"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Coupon Code</label>
                  <input
                    type="text"
                    required
                    disabled={isEdit}
                    placeholder="e.g. WELCOME100"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold uppercase tracking-wider outline-none focus:border-[#8F6A50] disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Coupon Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. First Visit Welcome Discount"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-medium outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8F6A50] uppercase">Description</label>
                <textarea
                  rows={2}
                  placeholder="Details displayed on public menu or cart select..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-medium outline-none focus:border-[#8F6A50] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Discount Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-bold text-[#3C2A21]"
                  >
                    <option value="FLAT">FLAT AMOUNT (₹)</option>
                    <option value="PERCENTAGE">PERCENTAGE (%)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Discount Value</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={value}
                    onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Minimum Order subtotal (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={minOrder}
                    onChange={(e) => setMinOrder(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Maximum Discount Capping (₹)</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={maxDiscount || ''}
                    onChange={(e) => setMaxDiscount(parseFloat(e.target.value) || null)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Global Usage Limit (Times)</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={usageLimit || ''}
                    onChange={(e) => setUsageLimit(parseInt(e.target.value) || null)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Per Customer Usage Limit (Times)</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={perCustLimit || ''}
                    onChange={(e) => setPerCustLimit(parseInt(e.target.value) || null)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Active Status</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Toggle whether this coupon is currently eligible to be applied.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isActive ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/45'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#EAD8C0]/10">
                <Button
                  type="button"
                  onClick={() => setShowModal(false)}
                  variant="ghost"
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8F6A50]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-5 py-2.5 rounded-xl text-sm font-bold"
                >
                  Save Coupon
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Ledger History Drawer / Dialog */}
      {showLedgerDrawer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-4xl h-full shadow-2xl flex flex-col justify-between border-l border-[#EAD8C0]/15 transition-all duration-300">
            <div className="p-6 border-b border-[#EAD8C0]/10 flex justify-between items-center bg-[#FAF8F5]">
              <div>
                <h3 className="text-xl font-extrabold text-[#3C2A21]">Coupon Redemption History</h3>
                <p className="text-xs text-[#8F6A50] mt-0.5">Real-time ledger of applied and reversed coupon discounts (Last 30 Days)</p>
              </div>
              <button
                onClick={() => setShowLedgerDrawer(false)}
                className="text-[#8F6A50] hover:text-[#3C2A21] font-bold text-lg p-2"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-[#EAD8C0]/15">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF8F5] border-b border-[#EAD8C0]/15 text-[#8F6A50] font-bold uppercase tracking-wider">
                      <th className="p-3 pl-4">Date/Time</th>
                      <th className="p-3">Coupon Code</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Order / Bill No.</th>
                      <th className="p-3">Discount</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 pr-4">Reversed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAD8C0]/10 font-semibold text-[#3C2A21]">
                    {ledgerItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-[#8F6A50]">
                          No redemption records found.
                        </td>
                      </tr>
                    ) : (
                      ledgerItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FAF8F5]/30">
                          <td className="p-3 pl-4">
                            {new Date(item.createdAt).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="p-3">
                            <span className="font-extrabold tracking-wider bg-[#8F6A50]/5 px-2 py-1 rounded text-[#8F6A50]">
                              {item.couponCodeSnapshot}
                            </span>
                          </td>
                          <td className="p-3">
                            {item.customer ? item.customer.name : 'Walk-in/Anonymous'}
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-bold">#{item.order?.orderNumber || 'N/A'}</p>
                              <p className="text-[10px] text-[#8F6A50] font-medium">{item.bill?.invoiceNumber || 'N/A'}</p>
                            </div>
                          </td>
                          <td className="p-3 text-rose-600 font-extrabold">
                            -₹{Number(item.appliedDiscountSnapshot).toFixed(2)}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                item.status === 'ACTIVE'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-rose-50 border-rose-200 text-rose-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 pr-4 text-[#8F6A50] font-medium">
                            {item.reversedAt
                              ? new Date(item.reversedAt).toLocaleString('en-IN', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {ledgerTotal > ledgerLimit && (
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-[#8F6A50]">
                    Showing {(ledgerPage - 1) * ledgerLimit + 1} -{' '}
                    {Math.min(ledgerPage * ledgerLimit, ledgerTotal)} of {ledgerTotal} items
                  </span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => fetchLedger(ledgerPage - 1)}
                      disabled={ledgerPage <= 1}
                      variant="ghost"
                      className="px-3 py-1.5 text-xs border border-[#EAD8C0]/25 rounded-xl font-bold"
                    >
                      Prev
                    </Button>
                    <Button
                      onClick={() => fetchLedger(ledgerPage + 1)}
                      disabled={ledgerPage * ledgerLimit >= ledgerTotal}
                      variant="ghost"
                      className="px-3 py-1.5 text-xs border border-[#EAD8C0]/25 rounded-xl font-bold"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-[#EAD8C0]/10 flex justify-end bg-[#FAF8F5]">
              <Button
                onClick={() => setShowLedgerDrawer(false)}
                className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-6 py-2.5 rounded-xl font-bold text-sm"
              >
                Close Ledger
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
