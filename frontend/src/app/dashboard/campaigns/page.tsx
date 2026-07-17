'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Megaphone,
  Plus,
  TrendingUp,
  DollarSign,
  Users,
  Percent,
  Calendar,
  Search,
  ChevronRight,
  Eye,
  BarChart2,
  FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';

export default function CampaignsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch overview analytics
      const ovRes = await api.get('/marketing/analytics/overview', {
        params: {
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        }
      });
      setOverview(ovRes.data);

      // 2. Fetch campaign list (from campaign service GET /marketing/campaigns)
      const listRes = await api.get('/marketing/campaigns', {
        params: {
          page,
          limit: 10,
          search: search || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
        }
      });
      setCampaigns(listRes.data.data || []);
      setTotalPages(listRes.data.pagination?.pages || 1);
    } catch (err) {
      console.error('Failed to load campaigns data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [search, statusFilter, typeFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      case 'SCHEDULED': return 'bg-blue-100 text-blue-800';
      case 'QUEUED': return 'bg-yellow-100 text-yellow-800';
      case 'PROCESSING': return 'bg-indigo-100 text-indigo-800';
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'CANCELLED': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Manager</h1>
          <p className="text-gray-500">Manage and track marketing campaigns, target audiences, and conversions.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/campaigns/reports" className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 text-gray-700">
            <FileText className="mr-2 h-4 w-4" /> Reports
          </Link>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </button>
        </div>
      </div>

      {overview && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center space-y-0 pb-2">
              <span className="text-sm font-medium text-gray-500">Attributed Revenue</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">${overview.summary.totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-gray-500">From 72-hour customer purchase attribution</p>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center space-y-0 pb-2">
              <span className="text-sm font-medium text-gray-500">Total Campaign Cost</span>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </div>
            <div className="text-2xl font-bold">${overview.summary.totalCost.toFixed(2)}</div>
            <p className="text-xs text-gray-500">Based on channel transmission rates</p>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center space-y-0 pb-2">
              <span className="text-sm font-medium text-gray-500">Campaign ROI</span>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{overview.summary.roi.toFixed(1)}%</div>
            <p className="text-xs text-gray-500">Attributed ROI performance ratio</p>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between items-center space-y-0 pb-2">
              <span className="text-sm font-medium text-gray-500">Targeted Audience</span>
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-indigo-600">{overview.summary.totalAudience}</div>
            <p className="text-xs text-gray-500">Total recipients targeted by campaigns</p>
          </div>
        </div>
      )}

      {overview?.deliveryFunnel && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-4">Cumulative Delivery Funnel</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.deliveryFunnel} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${value} recipients`, 'Count']} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {overview.deliveryFunnel.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg mb-4">Attributed Conversion Ratios</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-600 font-sans">Delivery Rate</span>
                    <span className="font-bold text-gray-900">{overview.summary.deliveryRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${overview.summary.deliveryRate}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-600 font-sans">Message Read Rate</span>
                    <span className="font-bold text-gray-900">{overview.summary.readRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${overview.summary.readRate}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Channel Performance</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 p-2 rounded">
                  <span className="text-gray-500 block">WhatsApp Messages</span>
                  <span className="font-bold text-gray-800">{overview.summary.messagesSent} sent</span>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <span className="text-gray-500 block">Failures</span>
                  <span className="font-bold text-red-600">{overview.summary.failed} failed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <h3 className="font-bold text-lg">All Marketing Campaigns</h3>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="ALL">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="PUSH">Push Notification</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3">Campaign Name</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Scheduled At</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">Loading campaigns...</td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">No campaigns found.</td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900">{c.name}</td>
                    <td className="px-6 py-4">{c.type}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(c.scheduledAt).toLocaleString()}</td>
                    <td className="px-6 py-4">{c.createdBy?.name || 'System'}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 text-gray-700">
                        <Eye className="mr-1 h-3.5 w-3.5" /> View Analytics
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t bg-gray-50">
            <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
