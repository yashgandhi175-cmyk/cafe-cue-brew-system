'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  TrendingUp,
  DollarSign
} from 'lucide-react';

export default function CampaignReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/marketing/campaigns', {
        params: {
          page,
          limit: 10,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      });
      const items = res.data.items || res.data.data || (Array.isArray(res.data) ? res.data : []);
      const total = res.data.total ?? res.data.pagination?.total ?? items.length;
      const pages = res.data.pages ?? Math.ceil(total / 10) ?? 1;
      setReports(items);
      setTotalPages(pages);
      setTotalRecords(total);
    } catch (err) {
      console.error('Failed to fetch reports', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [typeFilter, statusFilter, startDate, endDate, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4 no-print">
        <Link href="/dashboard/campaigns" className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Performance Reports</h1>
          <p className="text-gray-500">View, filter, and print summary performance tables for marketing campaigns.</p>
        </div>
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block text-center border-b pb-4">
        <h1 className="text-2xl font-bold">Cafe Cue & Brew Restaurant</h1>
        <h2 className="text-lg font-semibold text-gray-600">Marketing Campaign Performance Report</h2>
        <p className="text-xs text-gray-500">Generated on: {new Date().toLocaleString()}</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm no-print space-y-4">
        <h3 className="font-semibold text-md flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" /> Filter Criteria
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Channel Channel</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none w-full"
            >
              <option value="ALL">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="PUSH">Push</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none w-full"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 text-gray-700"
          >
            <FileText className="mr-2 h-4 w-4" /> Print PDF Report
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center no-print">
          <h3 className="font-bold text-lg">Performance Records ({totalRecords})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3">Campaign Name</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Audience</th>
                <th className="px-6 py-3 text-right">Delivery Rate</th>
                <th className="px-6 py-3 text-right">Read Rate</th>
                <th className="px-6 py-3 text-right">Conversion Rate</th>
                <th className="px-6 py-3 text-right">Revenue</th>
                <th className="px-6 py-3 text-right">Cost</th>
                <th className="px-6 py-3 text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10">Loading performance records...</td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10">No records found matching filters.</td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.campaignId} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900">{r.campaignName}</td>
                    <td className="px-6 py-4 text-xs">{r.type}</td>
                    <td className="px-6 py-4 text-xs">{r.status}</td>
                    <td className="px-6 py-4 text-right">{r.totalAudience}</td>
                    <td className="px-6 py-4 text-right">{r.deliveryRate.toFixed(1)}%</td>
                    <td className="px-6 py-4 text-right">{r.readRate.toFixed(1)}%</td>
                    <td className="px-6 py-4 text-right">{r.conversionRate.toFixed(1)}%</td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-600">${r.revenue.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">${r.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-blue-600">{r.roi.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t bg-gray-50 no-print">
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
