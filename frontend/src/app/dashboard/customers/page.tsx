'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Users,
  Search,
  SlidersHorizontal,
  Download,
  Plus,
  Eye,
  Edit2,
  X,
  Calendar,
  DollarSign,
  TrendingUp,
  Tag,
  AlertTriangle,
  Mail,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendWhatsAppMessage, buildOfferMessage, buildCreditReminderMessage } from '@/lib/whatsapp';

interface TagAssignment {
  tagId: string;
  tag: {
    id: string;
    name: string;
    description: string | null;
  };
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  anniversary: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  marketingConsentSource: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdAt: string;
  tagAssignments: TagAssignment[];
  metrics: {
    totalSpend: number;
    totalOrders: number;
    visits: number;
    averageSpend: number;
    firstVisit: string | null;
    lastVisit: string | null;
    segmentFlags: {
      NEW: boolean;
      REGULAR: boolean;
      VIP: boolean;
      HIGH_SPENDER: boolean;
      AT_RISK: boolean;
      INACTIVE: boolean;
    };
    primaryLifecycleSegment: string;
  };
}

interface CustomerTag {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [staffRole, setStaffRole] = useState<string>('MANAGER');

  useEffect(() => {
    const staff = localStorage.getItem('ccb_staff');
    if (staff) {
      try {
        setStaffRole(JSON.parse(staff).role || 'MANAGER');
      } catch (e) {
        // Fallback
      }
    }
  }, []);

  const isOwner = staffRole === 'OWNER';

  // Filters State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [tag, setTag] = useState('');
  const [marketingConsent, setMarketingConsent] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Modals & Panels State
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  
  const [loyaltyProfile, setLoyaltyProfile] = useState<any>(null);
  const [isAdjustPointsOpen, setIsAdjustPointsOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [adjustPointsValue, setAdjustPointsValue] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Form States
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    anniversary: '',
    notes: '',
    marketingConsent: false,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    birthday: '',
    anniversary: '',
    notes: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
  });

  const [newTagName, setNewTagName] = useState('');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [assigningTagId, setAssigningTagId] = useState('');

  // Queries
  const { data: customerData, isLoading } = useQuery<{
    items: Customer[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>({
    queryKey: ['customers', search, status, segment, tag, marketingConsent, sortBy, sortOrder, page],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: page.toString(),
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (status) params.status = status;
      if (segment) params.segment = segment;
      if (tag) params.tag = tag;
      if (marketingConsent) params.marketingConsent = marketingConsent;

      const res = await api.get('/customers', { params });
      return res.data;
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ['customers-analytics'],
    queryFn: async () => {
      const res = await api.get('/customers/analytics');
      return res.data;
    },
  });

  const { data: allTags = [] } = useQuery<CustomerTag[]>({
    queryKey: ['customers-tags'],
    queryFn: async () => {
      const res = await api.get('/customers/tags');
      return res.data;
    },
  });

  // Mutations
  const createCustomerMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.post('/customers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-analytics'] });
      setIsCreateModalOpen(false);
      setCreateForm({
        name: '',
        phone: '',
        email: '',
        birthday: '',
        anniversary: '',
        notes: '',
        marketingConsent: false,
      });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      return api.patch(`/customers/${id}`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-analytics'] });
      setActiveCustomer(res.data);
      setIsEditModalOpen(false);
    },
  });

  const consentMutation = useMutation({
    mutationFn: async ({ id, consent }: { id: string; consent: boolean }) => {
      return api.patch(`/customers/${id}/consent`, {
        marketingConsent: consent,
        source: 'POS_STAFF_CAPTURE',
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-analytics'] });
      if (activeCustomer && activeCustomer.id === res.data.id) {
        setActiveCustomer({ ...activeCustomer, ...res.data });
      }
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.post('/customers/tags', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers-tags'] });
      setNewTagName('');
      setNewTagDescription('');
    },
  });

  const deactivateTagMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/customers/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers-tags'] });
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: async ({ customerId, tagId }: { customerId: string; tagId: string }) => {
      return api.post(`/customers/${customerId}/tags`, { tagId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (activeCustomer) {
        refetchActiveCustomer(activeCustomer.id);
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async ({ customerId, tagId }: { customerId: string; tagId: string }) => {
      return api.delete(`/customers/${customerId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (activeCustomer) {
        refetchActiveCustomer(activeCustomer.id);
      }
    },
  });

  const refetchActiveCustomer = async (id: string) => {
    const res = await api.get(`/customers/${id}`);
    setActiveCustomer(res.data);
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/customers/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `customers_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e) {
      alert('Failed to export CSV. Only Owners are permitted.');
    }
  };

  const openProfile = async (customer: Customer) => {
    setActiveCustomer(customer);
    setIsProfileModalOpen(true);
    setLoyaltyProfile(null);
    try {
      const res = await api.get(`/customers/${customer.id}/loyalty`);
      setLoyaltyProfile(res.data);
    } catch (err) {
      console.error('Failed to load loyalty profile:', err);
    }
  };

  const openEdit = (customer: Customer) => {
    setEditForm({
      name: customer.name,
      email: customer.email || '',
      birthday: customer.birthday ? customer.birthday.slice(0, 10) : '',
      anniversary: customer.anniversary ? customer.anniversary.slice(0, 10) : '',
      notes: customer.notes || '',
      status: customer.status,
    });
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-8 p-1">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3C2A21] tracking-tight">Customer CRM</h1>
          <p className="text-sm text-[#8F6A50] mt-1">
            Manage customer profiles, segments, loyalty status, and marketing consent records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button
              onClick={handleExport}
              className="bg-transparent hover:bg-[#8F6A50]/10 text-[#8F6A50] border border-[#8F6A50]/30 font-medium flex items-center gap-2"
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
          {isOwner && (
            <Button
              onClick={() => setIsTagManagerOpen(true)}
              className="bg-[#DDBEAA] hover:bg-[#DDBEAA]/80 text-[#3C2A21] font-semibold flex items-center gap-2"
            >
              <Tag className="h-4 w-4" /> Global Tags
            </Button>
          )}
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-[#3C2A21] hover:bg-[#3C2A21]/90 text-[#FAF8F5] font-semibold flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Overview Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-[#8F6A50]">
              <span className="text-xs font-semibold uppercase tracking-wider">Total CRM Base</span>
              <Users className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold text-[#3C2A21]">{analytics.totalCustomers}</div>
            <div className="text-xs text-[#8c7365]">Active registered profiles</div>
          </div>
          <div className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-[#8F6A50]">
              <span className="text-xs font-semibold uppercase tracking-wider">New Customers</span>
              <Calendar className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold text-[#3C2A21]">{analytics.newCustomers}</div>
            <div className="text-xs text-[#8c7365]">1 visit inside last 30 days</div>
          </div>
          <div className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-[#8F6A50]">
              <span className="text-xs font-semibold uppercase tracking-wider">Repeat rate</span>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold text-[#3C2A21]">{analytics.repeatCustomerRate}%</div>
            <div className="text-xs text-[#8c7365]">Customers with &gt; 1 visits</div>
          </div>
          <div className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-[#8F6A50]">
              <span className="text-xs font-semibold uppercase tracking-wider">CRM Total Sales</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold text-[#3C2A21]">
              ₹{Number(analytics.totalEligibleCustomerSpend || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-[#8c7365]">Authoritative finalized bills</div>
          </div>
          <div className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-[#8F6A50]">
              <span className="text-xs font-semibold uppercase tracking-wider">Consent Opt-ins</span>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-[#3C2A21]">{analytics.marketingConsentCount}</div>
            <div className="text-xs text-[#8c7365]">Subscribers with consent</div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white border border-[#3C2A21]/10 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8F6A50]" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#FAF8F5] pl-9 pr-4 py-2 border border-[#3C2A21]/10 rounded-lg text-sm text-[#3C2A21] focus:outline-none focus:border-[#8F6A50]/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segment Filter */}
          <select
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setPage(1);
            }}
            className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-lg px-3 py-2 text-sm text-[#8F6A50] focus:outline-none focus:border-[#8F6A50]/50"
          >
            <option value="">All Segments</option>
            <option value="NEW">New</option>
            <option value="REGULAR">Regular</option>
            <option value="VIP">VIP</option>
            <option value="HIGH_SPENDER">High Spender</option>
            <option value="AT_RISK">At Risk</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          {/* Tag Filter */}
          <select
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
            className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-lg px-3 py-2 text-sm text-[#8F6A50] focus:outline-none focus:border-[#8F6A50]/50"
          >
            <option value="">All Tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Consent Filter */}
          <select
            value={marketingConsent}
            onChange={(e) => {
              setMarketingConsent(e.target.value);
              setPage(1);
            }}
            className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-lg px-3 py-2 text-sm text-[#8F6A50] focus:outline-none focus:border-[#8F6A50]/50"
          >
            <option value="">Consent Status</option>
            <option value="true">Consented Only</option>
            <option value="false">No Consent</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#FAF8F5] border border-[#3C2A21]/10 rounded-lg px-3 py-2 text-sm text-[#8F6A50] focus:outline-none focus:border-[#8F6A50]/50"
          >
            <option value="createdAt">Date Created</option>
            <option value="lastVisitAt">Last Visit</option>
            <option value="totalSpending">Total Spending</option>
            <option value="visitCount">Visit Count</option>
            <option value="averageSpend">Avg Spend</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-[#3C2A21]/10 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAF8F5] text-[#3C2A21] border-b border-[#3C2A21]/10 font-semibold uppercase tracking-wider text-xs">
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6">Lifecycle Segment</th>
                <th className="py-4 px-6">Visits</th>
                <th className="py-4 px-6">Total Spend</th>
                <th className="py-4 px-6">Avg Spend</th>
                <th className="py-4 px-6">Last Visit</th>
                <th className="py-4 px-6">Consent</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3C2A21]/5 text-[#3C2A21]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#8F6A50] font-medium">
                    Loading customer list...
                  </td>
                </tr>
              ) : !customerData || customerData.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#8F6A50] font-medium">
                    No customers found matching the selected filters.
                  </td>
                </tr>
              ) : (
                customerData.items.map((customer) => {
                  const hasConsent = customer.marketingConsent;
                  return (
                    <tr key={customer.id} className="hover:bg-[#FAF8F5]/30 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-semibold">{customer.name}</div>
                        <div className="text-xs text-[#8F6A50]">
                          {customer.phone.replace(/(\+91)(\d{5})(\d{5})/, '$1 $2 $3')}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              customer.metrics.primaryLifecycleSegment === 'VIP'
                                ? 'bg-amber-100 text-amber-800'
                                : customer.metrics.primaryLifecycleSegment === 'REGULAR'
                                  ? 'bg-[#8F6A50]/15 text-[#3C2A21]'
                                  : customer.metrics.primaryLifecycleSegment === 'INACTIVE'
                                    ? 'bg-rose-100 text-rose-800'
                                    : customer.metrics.primaryLifecycleSegment === 'AT_RISK'
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {customer.metrics.primaryLifecycleSegment}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-medium">{customer.metrics.visits}</td>
                      <td className="py-4 px-6 font-semibold">₹{customer.metrics.totalSpend.toFixed(2)}</td>
                      <td className="py-4 px-6 font-medium">₹{customer.metrics.averageSpend.toFixed(2)}</td>
                      <td className="py-4 px-6 text-[#8F6A50]">
                        {customer.metrics.lastVisit
                          ? new Date(customer.metrics.lastVisit).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Never'}
                      </td>
                      <td className="py-4 px-6">
                        {hasConsent ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                            <CheckCircle className="h-3.5 w-3.5" /> Consented
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-400 font-semibold">
                            <XCircle className="h-3.5 w-3.5" /> Opted Out
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const msg = buildOfferMessage(customer.name, 'Special Cafe Offer', 'Exclusive discount on your next visit');
                              sendWhatsAppMessage(customer.phone, msg);
                            }}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold rounded-lg transition-colors shadow-xs"
                            title="Send WhatsApp Offer"
                          >
                            Send WhatsApp
                          </button>
                          <button
                            onClick={() => openProfile(customer)}
                            className="p-1.5 hover:bg-[#8F6A50]/10 rounded-lg text-[#8F6A50] transition-colors"
                            title="View Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(customer)}
                            className="p-1.5 hover:bg-sky-500/10 rounded-lg text-sky-600 transition-colors"
                            title="Edit Profile"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {customerData && customerData.meta.totalPages > 1 && (
          <div className="bg-[#FAF8F5] border-t border-[#3C2A21]/10 px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-[#8c7365]">
              Showing page {page} of {customerData.meta.totalPages} ({customerData.meta.total} total customers)
            </span>
            <div className="flex items-center gap-2">
              <Button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3C2A21] px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm"
              >
                Previous
              </Button>
              <Button
                disabled={page === customerData.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3C2A21] px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Profile Drawer/Modal */}
      {isProfileModalOpen && activeCustomer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-slide-in">
            {/* Modal Header */}
            <div className="bg-[#3C2A21] text-[#EAD8C0] p-6 flex justify-between items-center shadow-md">
              <div>
                <h2 className="text-xl font-bold text-white">{activeCustomer.name}</h2>
                <p className="text-xs text-[#DDBEAA] mt-0.5">
                  ID: {activeCustomer.id} | Status:{' '}
                  <span
                    className={`font-semibold ${
                      activeCustomer.status === 'ACTIVE'
                        ? 'text-emerald-400'
                        : activeCustomer.status === 'INACTIVE'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {activeCustomer.status}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-[#EAD8C0] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Marketing consent & notifications banner */}
              {activeCustomer.status === 'BLOCKED' && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-4 text-sm flex gap-2.5 items-start">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Customer Profile Blocked.</span> Normal communications, loyalty
                    earn, and marketing opt-ins are locked for this profile.
                  </div>
                </div>
              )}

              {/* CRM Key Metrics Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                  <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Eligible Spend</div>
                  <div className="text-xl font-bold text-[#3C2A21]">₹{activeCustomer.metrics.totalSpend.toFixed(2)}</div>
                </div>
                <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                  <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Visits count</div>
                  <div className="text-xl font-bold text-[#3C2A21]">{activeCustomer.metrics.visits}</div>
                </div>
                <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                  <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Average Spend</div>
                  <div className="text-xl font-bold text-[#3C2A21]">₹{activeCustomer.metrics.averageSpend.toFixed(2)}</div>
                </div>
                <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                  <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Last Visit</div>
                  <div className="text-lg font-bold text-[#3C2A21]">
                    {activeCustomer.metrics.lastVisit
                      ? new Date(activeCustomer.metrics.lastVisit).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Never'}
                  </div>
                </div>
              </div>

              {/* Segment Flags list */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Segment Identifiers</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(activeCustomer.metrics.segmentFlags)
                    .filter(([_, active]) => active)
                    .map(([flag]) => (
                      <span key={flag} className="bg-[#8F6A50]/10 text-[#3C2A21] text-xs font-semibold px-2.5 py-1 rounded-lg">
                        {flag}
                      </span>
                    ))}
                  {Object.values(activeCustomer.metrics.segmentFlags).every((f) => !f) && (
                    <span className="text-sm text-gray-400 italic">No segment classifications applied yet.</span>
                  )}
                </div>
              </div>

              {/* Tag Management */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Customer Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {activeCustomer.tagAssignments.map((a) => (
                    <span
                      key={a.tagId}
                      className="bg-sky-100 text-sky-800 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    >
                      {a.tag.name}
                      <button
                        onClick={() => removeTagMutation.mutate({ customerId: activeCustomer.id, tagId: a.tagId })}
                        className="hover:text-rose-600 transition-colors"
                        title="Remove Tag"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {activeCustomer.tagAssignments.length === 0 && (
                    <span className="text-sm text-gray-400 italic">No manual tags assigned.</span>
                  )}
                </div>
                {/* Assign Tag control */}
                <div className="flex items-center gap-2 max-w-xs">
                  <select
                    value={assigningTagId}
                    onChange={(e) => setAssigningTagId(e.target.value)}
                    className="flex-1 bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-lg px-2.5 py-1 text-xs text-[#8F6A50] focus:outline-none"
                  >
                    <option value="">Choose Tag...</option>
                    {allTags
                      .filter((t) => t.isActive && !activeCustomer.tagAssignments.some((a) => a.tagId === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    onClick={() => {
                      if (!assigningTagId) return;
                      assignTagMutation.mutate({ customerId: activeCustomer.id, tagId: assigningTagId });
                      setAssigningTagId('');
                    }}
                    disabled={!assigningTagId}
                    className="bg-[#3C2A21] hover:bg-[#3C2A21]/90 text-white text-xs px-2.5 py-1 rounded-lg font-semibold"
                  >
                    Assign
                  </Button>
                </div>
              </div>

              {/* Consent Opt-In Opt-Out Management */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Marketing Consent Details</h3>
                <div className="border border-[#3C2A21]/10 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">SMS / WhatsApp Promotions</div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {activeCustomer.marketingConsent
                          ? `Granted via ${activeCustomer.marketingConsentSource} on ${new Date(
                              activeCustomer.marketingConsentAt!,
                            ).toLocaleDateString('en-IN')}`
                          : 'Opt-out / No consent registered.'}
                      </p>
                    </div>
                    <div>
                      <Button
                        onClick={() =>
                          consentMutation.mutate({
                            id: activeCustomer.id,
                            consent: !activeCustomer.marketingConsent,
                          })
                        }
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                          activeCustomer.marketingConsent
                            ? 'bg-rose-500 hover:bg-rose-600 text-white'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        }`}
                      >
                        {activeCustomer.marketingConsent ? 'Revoke Consent' : 'Grant Consent'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact and Demographics Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">General Information</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-400">Phone Number</div>
                    <div className="font-semibold">{activeCustomer.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Email Address</div>
                    <div className="font-semibold">{activeCustomer.email || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Birthday</div>
                    <div className="font-semibold">
                      {activeCustomer.birthday
                        ? new Date(activeCustomer.birthday).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'long',
                          })
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Anniversary</div>
                    <div className="font-semibold">
                      {activeCustomer.anniversary
                        ? new Date(activeCustomer.anniversary).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'long',
                          })
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400">Notes / Profile Remark</div>
                    <div className="text-sm bg-[#FAF8F5] border border-gray-100 rounded-lg p-3 mt-1 min-h-[60px] text-gray-700 italic">
                      {activeCustomer.notes || 'No CRM remarks recorded.'}
                    </div>
                  </div>
                </div>

                {/* Loyalty Program Section */}
                <div className="space-y-4 pt-6 border-t border-[#EAD8C0]/25">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Loyalty Program Profile</h3>
                    {loyaltyProfile?.loyaltyEnabled && (
                      <Button
                        onClick={() => {
                          setAdjustPointsValue(0);
                          setAdjustReason('');
                          setIsAdjustPointsOpen(true);
                        }}
                        className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold shadow-sm transition-all"
                      >
                        Adjust Points
                      </Button>
                    )}
                  </div>

                  {loyaltyProfile ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                          <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Loyalty Balance</div>
                          <div className="text-lg font-bold text-[#3C2A21] flex items-center gap-1.5">
                            <Coins className="h-4 w-4 text-[#8F6A50]" />
                            {loyaltyProfile.loyaltyPoints} Points
                          </div>
                        </div>
                        <div className="bg-[#FAF8F5] border border-[#3C2A21]/15 rounded-xl p-4 space-y-1">
                          <div className="text-xs text-[#8F6A50] font-medium uppercase tracking-wider">Status</div>
                          <div className={`text-md font-bold ${loyaltyProfile.loyaltyEnabled ? 'text-[#8F6A50]' : 'text-gray-400'}`}>
                            {loyaltyProfile.loyaltyEnabled ? 'Active' : 'Disabled'}
                          </div>
                        </div>
                      </div>

                      {loyaltyProfile.loyaltyEnabled && (
                        <div className="bg-[#FAF8F5] p-3 border border-[#EAD8C0]/25 rounded-xl space-y-1">
                          <div className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Active Rules</div>
                          <p className="text-xs text-[#3C2A21] font-semibold">
                            Earn: 1 Point per ₹{loyaltyProfile.earningRule.spendAmount} Eligible Spend
                          </p>
                          <p className="text-xs text-[#8F6A50]">
                            Redeem: {loyaltyProfile.redemptionRule.redemptionPoints} Points = ₹{loyaltyProfile.redemptionRule.redemptionValue} Discount (Min {loyaltyProfile.redemptionRule.minimumRedeemPoints} Points)
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Recent Activity</h4>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                          {loyaltyProfile.recentTransactions.map((tx: any) => {
                            let typeLabel = tx.type;
                            if (tx.type === 'EARN') typeLabel = 'Earned';
                            else if (tx.type === 'REDEEM') typeLabel = 'Redeemed';
                            else if (tx.type === 'EARN_REVERSAL') typeLabel = 'Earn Reversed';
                            else if (tx.type === 'REDEMPTION_REVERSAL') typeLabel = 'Redemption Restored';
                            else if (tx.type === 'ADJUSTMENT_IN') typeLabel = 'Adjustment Added';
                            else if (tx.type === 'ADJUSTMENT_OUT') typeLabel = 'Adjustment Removed';
                            else if (tx.type === 'EXPIRE') typeLabel = 'Expired';

                            const dateStr = new Date(tx.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            });

                            return (
                              <div key={tx.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                                <div>
                                  <div className="font-bold text-[#3C2A21]">{typeLabel}</div>
                                  <div className="text-gray-400 mt-0.5">{dateStr} {tx.reason && `| ${tx.reason}`}</div>
                                </div>
                                <div className={`font-bold ${tx.pointsChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {tx.pointsChange > 0 ? `+${tx.pointsChange}` : tx.pointsChange} Pts
                                </div>
                              </div>
                            );
                          })}
                          {loyaltyProfile.recentTransactions.length === 0 && (
                            <p className="text-xs text-gray-400 italic">No points history available yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Loading loyalty profile...</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Profile Modal */}
      {isEditModalOpen && activeCustomer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#3C2A21] text-[#EAD8C0] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white">Edit Customer Profile</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-[#EAD8C0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Birthday</label>
                  <input
                    type="date"
                    value={editForm.birthday}
                    onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })}
                    className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Anniversary</label>
                  <input
                    type="date"
                    value={editForm.anniversary}
                    onChange={(e) => setEditForm({ ...editForm, anniversary: e.target.value })}
                    className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Customer Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21] min-h-[80px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">CRM Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-transparent hover:bg-gray-100 text-gray-500 font-medium px-4 py-2 border border-gray-200 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    updateCustomerMutation.mutate({ id: activeCustomer.id, payload: editForm })
                  }
                  className="bg-[#3C2A21] hover:bg-[#3C2A21]/90 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Modal */}
      {isAdjustPointsOpen && activeCustomer && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#3C2A21] text-[#EAD8C0] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white">Adjust Loyalty Points</h3>
              <button
                type="button"
                onClick={() => setIsAdjustPointsOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-[#EAD8C0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (adjustPointsValue <= 0) {
                  alert('Points must be greater than zero.');
                  return;
                }
                if (!adjustReason.trim()) {
                  alert('Reason is required.');
                  return;
                }
                const change = adjustType === 'add' ? adjustPointsValue : -adjustPointsValue;
                try {
                  await api.post(`/customers/${activeCustomer.id}/loyalty/adjust`, {
                    pointsChange: change,
                    reason: adjustReason,
                    idempotencyKey: `ADJUST:${activeCustomer.id}:${Date.now()}`,
                  });
                  alert('Points adjusted successfully.');
                  setIsAdjustPointsOpen(false);
                  // Refresh profile
                  const res = await api.get(`/customers/${activeCustomer.id}/loyalty`);
                  setLoyaltyProfile(res.data);
                } catch (err: any) {
                  alert(err.response?.data?.message || 'Failed to adjust points. Permission denied.');
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Adjustment Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-[#3C2A21]">
                    <input
                      type="radio"
                      name="adjustType"
                      checked={adjustType === 'add'}
                      onChange={() => setAdjustType('add')}
                    />
                    Add Points
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-[#3C2A21]">
                    <input
                      type="radio"
                      name="adjustType"
                      checked={adjustType === 'remove'}
                      onChange={() => setAdjustType('remove')}
                    />
                    Remove Points
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Points Amount</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={adjustPointsValue || ''}
                  onChange={(e) => setAdjustPointsValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Reason for Adjustment</label>
                <textarea
                  required
                  rows={3}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21] min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button
                  type="button"
                  onClick={() => setIsAdjustPointsOpen(false)}
                  className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3C2A21] px-4 py-2 rounded-lg text-sm font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md"
                >
                  Apply Adjustment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#3C2A21] text-[#EAD8C0] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white">Add New Customer Profile</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-[#EAD8C0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Name *</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Phone Number (Indian format) *</label>
                <input
                  type="text"
                  placeholder="e.g. 98765 43210"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Birthday (Optional)</label>
                  <input
                    type="date"
                    value={createForm.birthday}
                    onChange={(e) => setCreateForm({ ...createForm, birthday: e.target.value })}
                    className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Anniversary (Optional)</label>
                  <input
                    type="date"
                    value={createForm.anniversary}
                    onChange={(e) => setCreateForm({ ...createForm, anniversary: e.target.value })}
                    className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8F6A50] mb-1">Notes / CRM Remarks</label>
                <textarea
                  placeholder="Type any specific preferences..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full bg-[#FAF8F5] border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3C2A21] min-h-[80px]"
                />
              </div>
              <div className="flex items-center gap-2 bg-[#FAF8F5] border border-gray-100 rounded-lg p-3">
                <input
                  type="checkbox"
                  id="marketingConsentCheckbox"
                  checked={createForm.marketingConsent}
                  onChange={(e) => setCreateForm({ ...createForm, marketingConsent: e.target.checked })}
                  className="rounded border-gray-300 text-[#3C2A21] focus:ring-[#8F6A50]"
                />
                <label htmlFor="marketingConsentCheckbox" className="text-xs text-[#8F6A50] cursor-pointer">
                  Customer has explicitly consented to receive marketing messages on SMS/WhatsApp.
                </label>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-transparent hover:bg-gray-100 text-gray-500 font-medium px-4 py-2 border border-gray-200 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createCustomerMutation.mutate(createForm)}
                  className="bg-[#3C2A21] hover:bg-[#3C2A21]/90 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  Create Profile
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global CRM Tag Manager Modal */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-[#3C2A21] text-[#EAD8C0] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Tag className="h-4 w-4" /> Global Tags Manager
              </h3>
              <button
                onClick={() => setIsTagManagerOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-[#EAD8C0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Tag creation form */}
              <div className="space-y-3 bg-[#FAF8F5] border border-gray-100 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Create New Tag</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Tag name (e.g. Snooker Customer)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#3C2A21]"
                  />
                  <input
                    type="text"
                    placeholder="Brief description"
                    value={newTagDescription}
                    onChange={(e) => setNewTagDescription(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#3C2A21]"
                  />
                  <Button
                    onClick={() => createTagMutation.mutate({ name: newTagName, description: newTagDescription })}
                    disabled={!newTagName.trim()}
                    className="w-full bg-[#3C2A21] hover:bg-[#3C2A21]/90 text-white font-semibold text-xs py-2 rounded-lg"
                  >
                    Add Global Tag
                  </Button>
                </div>
              </div>

              {/* Tag list */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Active Global Tags</h4>
                <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
                  {allTags.length === 0 ? (
                    <div className="text-center text-xs text-gray-400 py-6">No global tags created yet.</div>
                  ) : (
                    allTags.map((t) => (
                      <div key={t.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div>
                          <div className={`font-semibold text-sm ${!t.isActive ? 'line-through text-gray-400' : ''}`}>
                            {t.name}
                          </div>
                          {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                        </div>
                        {t.isActive && (
                          <Button
                            onClick={() => deactivateTagMutation.mutate(t.id)}
                            className="bg-transparent hover:bg-rose-500/10 text-rose-600 border border-rose-200 hover:border-rose-500 text-xs px-2 py-1 rounded-lg"
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
