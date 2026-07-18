'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  Calendar,
  Users,
  Percent,
  TrendingUp,
  DollarSign,
  Send,
  MessageSquare,
  AlertOctagon,
  Tag,
  Gift,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';

function CampaignDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchAnalytics();
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/marketing/campaigns/${id}/analytics`);
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load campaign analytics', err);
    } finally {
      setLoading(false);
    }
  };

  if (!id) {
    return <div className="p-10 text-center text-red-500">No campaign ID specified in the URL query.</div>;
  }

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading campaign analytics...</div>;
  }

  if (!analytics) {
    return <div className="p-10 text-center text-red-500">Campaign analytics not found.</div>;
  }

  const funnelData = [
    { stage: 'Audience', count: analytics.totalAudience },
    { stage: 'Sent', count: analytics.messagesSent },
    { stage: 'Delivered', count: analytics.delivered },
    { stage: 'Read', count: analytics.read },
  ];

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/campaigns" className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{analytics.campaignName}</h1>
          <p className="text-gray-500">Campaign Channel: <span className="font-semibold text-gray-800">{analytics.type}</span> | Status: <span className="font-semibold text-green-700">{analytics.status}</span></p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center space-y-0 pb-2">
            <span className="text-sm font-medium text-gray-500">Attributed Revenue</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">${analytics.revenueGenerated.toFixed(2)}</div>
          <p className="text-xs text-gray-500">AOV: ${analytics.averageOrderValue.toFixed(2)}</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center space-y-0 pb-2">
            <span className="text-sm font-medium text-gray-500">Campaign Cost</span>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </div>
          <div className="text-2xl font-bold">${analytics.campaignCost.toFixed(2)}</div>
          <p className="text-xs text-gray-500">Based on transmission cost</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center space-y-0 pb-2">
            <span className="text-sm font-medium text-gray-500">ROI Return</span>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{analytics.roi.toFixed(1)}%</div>
          <p className="text-xs text-gray-500">Revenue net cost ratio</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center space-y-0 pb-2">
            <span className="text-sm font-medium text-gray-500">Conversion Rate</span>
            <Percent className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-600">{analytics.conversionRate.toFixed(1)}%</div>
          <p className="text-xs text-gray-500">{analytics.attribution.attributedOrdersCount} attributed orders</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4">Delivery Performance</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip formatter={(value) => [`${value} messages`, 'Count']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {funnelData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-lg mb-4">Attribution Breakdown</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-500" />
                  <span className="font-sans text-gray-700">Coupon Attributions</span>
                </div>
                <span className="font-bold text-gray-900">{analytics.attribution.couponAttributions} orders</span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-purple-500" />
                  <span className="font-sans text-gray-700">Loyalty Attributions</span>
                </div>
                <span className="font-bold text-gray-900">{analytics.attribution.loyaltyAttributions} orders</span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-emerald-500" />
                  <span className="font-sans text-gray-700">Repeat Customer Conversions</span>
                </div>
                <span className="font-bold text-gray-900">{analytics.attribution.repeatCustomerAttributions} orders</span>
              </div>

              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-indigo-500" />
                  <span className="font-sans text-gray-700">First-Time Customer Conversions</span>
                </div>
                <span className="font-bold text-gray-900">{analytics.attribution.firstTimeCustomerAttributions} orders</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 mt-4">
            <Send className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-bold">Attribution Logic Details</p>
              <p>Conversions are mapped based on a strict 72-hour purchase window following message transmission. Repeat vs first-time customer splits are calculated using historical order counts.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading campaign details...</div>}>
      <CampaignDetailContent />
    </Suspense>
  );
}
