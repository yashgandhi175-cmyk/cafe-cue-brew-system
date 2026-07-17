'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Settings, Save, Percent, Shield, Receipt, QrCode, Sliders, AlertCircle, CheckCircle2, Users, Coins } from 'lucide-react';

interface RestaurantSettings {
  id: string;
  name: string;
  logo: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  whatsAppNumber: string | null;
  email: string | null;
  openingTime: string | null;
  closingTime: string | null;
  currency: string;
  timezone: string;
  enableCash: boolean;
  enableUpi: boolean;
  enableCard: boolean;
  enableCredit: boolean;
  upiId: string | null;
  enableRoundOff: boolean;
  enableServiceCharge: boolean;
  serviceChargePercentage: number;
  invoicePrefix: string;
  enableGst: boolean;
  gstPercentage: number;
  cgstPercentage: number;
  sgstPercentage: number;
  gstin: string | null;
  taxInclusivePricing: boolean;
  enableNightCharges: boolean;
  nightStart: string | null;
  nightEnd: string | null;
  nightChargeType: string | null;
  nightChargeValue: number;
  cashierMaxDiscountPercent: number;
  managerMaxDiscountPercent: number;
  managerCanViewFinancialAnalytics: boolean;
  managerCanViewFinancialReports: boolean;
  qrOrderingEnabled: boolean;
  requireCustomerName: boolean;
  requireCustomerPhone: boolean;
  manualAcceptQrOrders: boolean;
  managerCanViewCustomerCRM: boolean;
  managerCanManageCustomerCRM: boolean;
  newCustomerWindowDays: number;
  regularCustomerVisitThreshold: number;
  vipCustomerSpendThreshold: number;
  highSpenderAverageSpendThreshold: number;
  atRiskDays: number;
  inactiveDays: number;

  enableLoyalty: boolean;
  loyaltySpendAmount: number;
  loyaltyPointsEarned: number;
  loyaltyRedemptionPoints: number;
  loyaltyRedemptionValue: number;
  loyaltyMinimumRedeemPoints: number;
  loyaltyMaximumRedeemPercent: number;
  loyaltyRedemptionRequestExpiryMinutes: number;
  managerCanAdjustLoyaltyPoints: boolean;
  managerCanApproveLoyaltyRedemption: boolean;
  managerCanManageCoupons: boolean;
}

type TabType = 'discounts' | 'taxes' | 'qr' | 'general' | 'crm' | 'loyalty';

export default function SettingsPage() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('discounts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to load restaurant settings.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // setLoading is already true by default. Fetch asynchronous data in microtask.
    const timer = setTimeout(() => {
      fetchSettings().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, []);


  const handleToggle = (key: keyof RestaurantSettings) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleChange = (key: keyof RestaurantSettings, val: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [key]: val,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      setMessage(null);

      // Perform clean payload transformations
      const payload = {
        ...settings,
        cashierMaxDiscountPercent: Number(settings.cashierMaxDiscountPercent),
        managerMaxDiscountPercent: Number(settings.managerMaxDiscountPercent),
        gstPercentage: Number(settings.gstPercentage),
        cgstPercentage: Number(settings.cgstPercentage),
        sgstPercentage: Number(settings.sgstPercentage),
        serviceChargePercentage: Number(settings.serviceChargePercentage),
        nightChargeValue: Number(settings.nightChargeValue),
        loyaltySpendAmount: Number(settings.loyaltySpendAmount),
        loyaltyPointsEarned: Number(settings.loyaltyPointsEarned),
        loyaltyRedemptionPoints: Number(settings.loyaltyRedemptionPoints),
        loyaltyRedemptionValue: Number(settings.loyaltyRedemptionValue),
        loyaltyMinimumRedeemPoints: Number(settings.loyaltyMinimumRedeemPoints),
        loyaltyMaximumRedeemPercent: Number(settings.loyaltyMaximumRedeemPercent),
        loyaltyRedemptionRequestExpiryMinutes: Number(settings.loyaltyRedemptionRequestExpiryMinutes),
      };

      await api.put('/settings', payload);
      setMessage({ type: 'success', text: 'Restaurant settings updated successfully.' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <Settings className="animate-spin h-10 w-10 text-[#8F6A50] mx-auto" />
          <p className="text-sm text-[#3C2A21] font-semibold">Loading settings panel...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <span>Failed to initialize settings layout. Please try again.</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Welcome & Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3C2A21] tracking-tight">System Settings</h1>
          <p className="text-sm text-[#8F6A50] mt-1">Configure discount controls, taxation, billing preferences and general restaurant information.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-start gap-3 border transition-all duration-300 ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-[#EAD8C0]/30 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('discounts')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'discounts'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <Sliders className="h-4 w-4" />
          Discount Controls
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'taxes'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Tax & Surcharges
        </button>
        <button
          onClick={() => setActiveTab('qr')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'qr'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <QrCode className="h-4 w-4" />
          QR Ordering
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'general'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <Settings className="h-4 w-4" />
          General Info
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'crm'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <Users className="h-4 w-4" />
          CRM Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide border-b-2 transition-all ${
            activeTab === 'loyalty'
              ? 'border-[#8F6A50] text-[#8F6A50]'
              : 'border-transparent text-[#3C2A21]/60 hover:text-[#3C2A21] hover:border-[#EAD8C0]/50'
          }`}
        >
          <Coins className="h-4 w-4" />
          Loyalty Program
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#EAD8C0]/15 space-y-8">
        
        {/* Tab 1: Discount Controls */}
        {activeTab === 'discounts' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EAD8C0]/10">
              <Percent className="h-5 w-5 text-[#8F6A50]" />
              <h2 className="text-lg font-bold text-[#3C2A21]">Discount Limits (Settings-Backed)</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                  Cashier Maximum Discount (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.cashierMaxDiscountPercent}
                    onChange={(e) => handleChange('cashierMaxDiscountPercent', e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8F6A50]">%</span>
                </div>
                <p className="text-xs text-[#8F6A50]/70 font-light">Limits cashier-level staff members on total discount allowed per order.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                  Manager Maximum Discount (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.managerMaxDiscountPercent}
                    onChange={(e) => handleChange('managerMaxDiscountPercent', e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8F6A50]">%</span>
                </div>
                <p className="text-xs text-[#8F6A50]/70 font-light">Limits manager-level staff members on total discount allowed per order.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tax & Surcharges */}
        {activeTab === 'taxes' && (
          <div className="space-y-8">
            {/* GST Block */}
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#EAD8C0]/10">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[#8F6A50]" />
                  <h2 className="text-lg font-bold text-[#3C2A21]">GST Configuration</h2>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('enableGst')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enableGst ? 'bg-[#8F6A50]' : 'bg-[#FAF8F5] border border-[#EAD8C0]/50'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableGst ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {settings.enableGst && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                      GSTIN (GST Identification Number)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 22AAAAA0000A1Z5"
                      value={settings.gstin || ''}
                      onChange={(e) => handleChange('gstin', e.target.value)}
                      className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                      Pricing Strategy
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => handleChange('taxInclusivePricing', true)}
                        className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                          settings.taxInclusivePricing
                            ? 'bg-[#8F6A50] text-white border-transparent'
                            : 'bg-white border-[#EAD8C0]/40 text-[#3C2A21]/70'
                        }`}
                      >
                        Tax Inclusive
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChange('taxInclusivePricing', false)}
                        className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                          !settings.taxInclusivePricing
                            ? 'bg-[#8F6A50] text-white border-transparent'
                            : 'bg-white border-[#EAD8C0]/40 text-[#3C2A21]/70'
                        }`}
                      >
                        Tax Exclusive
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                      CGST Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={settings.cgstPercentage}
                      onChange={(e) => handleChange('cgstPercentage', e.target.value)}
                      className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">
                      SGST Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={settings.sgstPercentage}
                      onChange={(e) => handleChange('sgstPercentage', e.target.value)}
                      className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Service Charge & Night Charge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Service Charge */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#EAD8C0]/10">
                  <h3 className="font-bold text-[#3C2A21]">Service Charge</h3>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableServiceCharge')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.enableServiceCharge ? 'bg-[#8F6A50]' : 'bg-[#FAF8F5] border border-[#EAD8C0]/50'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enableServiceCharge ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {settings.enableServiceCharge && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Charge Percentage (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.serviceChargePercentage}
                      onChange={(e) => handleChange('serviceChargePercentage', e.target.value)}
                      className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                    />
                  </div>
                )}
              </div>

              {/* Night Charges */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#EAD8C0]/10">
                  <h3 className="font-bold text-[#3C2A21]">Night Surcharge</h3>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableNightCharges')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.enableNightCharges ? 'bg-[#8F6A50]' : 'bg-[#FAF8F5] border border-[#EAD8C0]/50'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enableNightCharges ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {settings.enableNightCharges && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#8F6A50]">Start Time</label>
                        <input
                          type="time"
                          value={settings.nightStart || ''}
                          onChange={(e) => handleChange('nightStart', e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#8F6A50]">End Time</label>
                        <input
                          type="time"
                          value={settings.nightEnd || ''}
                          onChange={(e) => handleChange('nightEnd', e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#8F6A50]">Type</label>
                        <select
                          value={settings.nightChargeType || 'PERCENTAGE'}
                          onChange={(e) => handleChange('nightChargeType', e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
                        >
                          <option value="PERCENTAGE">PERCENTAGE</option>
                          <option value="FLAT">FLAT</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#8F6A50]">Value</label>
                        <input
                          type="number"
                          step="0.01"
                          value={settings.nightChargeValue}
                          onChange={(e) => handleChange('nightChargeValue', e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-xs font-bold text-[#3C2A21]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: QR Ordering */}
        {activeTab === 'qr' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EAD8C0]/10">
              <QrCode className="h-5 w-5 text-[#8F6A50]" />
              <h2 className="text-lg font-bold text-[#3C2A21]">Customer Self-Ordering</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Enable QR Ordering</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Allows customers to scan table QR codes and place orders via mobile browser.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('qrOrderingEnabled')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.qrOrderingEnabled ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.qrOrderingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Require Customer Name</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Prompt the customer to input their name prior to accessing the menu.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('requireCustomerName')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.requireCustomerName ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.requireCustomerName ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Require Customer WhatsApp / Phone</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Require customer phone number to verify, build loyalty profiles, or message receipts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('requireCustomerPhone')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.requireCustomerPhone ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.requireCustomerPhone ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Manual Kitchen Order Acceptance</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Forces orders sent by table QR to wait in a &quot;Pending Approval&quot; state on the POS order board.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('manualAcceptQrOrders')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.manualAcceptQrOrders ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.manualAcceptQrOrders ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: General Restaurant Info */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EAD8C0]/10">
              <Shield className="h-5 w-5 text-[#8F6A50]" />
              <h2 className="text-lg font-bold text-[#3C2A21]">Brand & Contact Details</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Restaurant Name</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-semibold outline-none focus:border-[#8F6A50]"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Tagline / Slogan</label>
                <input
                  type="text"
                  value={settings.tagline || ''}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Contact Telephone</label>
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">WhatsApp Number</label>
                <input
                  type="text"
                  value={settings.whatsAppNumber || ''}
                  onChange={(e) => handleChange('whatsAppNumber', e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Physical Address</label>
                <textarea
                  rows={2}
                  value={settings.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50] resize-none"
                />
              </div>

              <div className="md:col-span-2 border-t border-[#EAD8C0]/10 pt-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#8F6A50]">Manager Access Rights</h3>
                
                <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                  <div>
                    <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can View Financial Analytics</h4>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to view overview charts, table revenues, payments, and discount values.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('managerCanViewFinancialAnalytics')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.managerCanViewFinancialAnalytics ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.managerCanViewFinancialAnalytics ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                  <div>
                    <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can View Financial Reports</h4>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to view Daily Sales, GST invoice list, and Credit Dues ledgers.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('managerCanViewFinancialReports')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.managerCanViewFinancialReports ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.managerCanViewFinancialReports ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                  <div>
                    <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can Manage Coupons</h4>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to create, edit, activate/deactivate, and view reports/analytics for coupons.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('managerCanManageCoupons')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.managerCanManageCoupons ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.managerCanManageCoupons ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'crm' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-extrabold text-[#3C2A21] tracking-tight">Customer CRM Configuration</h2>
              <p className="text-xs text-[#8F6A50] mt-1">Configure automated segmentation thresholds and manager permissions.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">New Customer Window (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.newCustomerWindowDays}
                  onChange={(e) => handleChange('newCustomerWindowDays', parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Regular Customer Visit Threshold</label>
                <input
                  type="number"
                  min={1}
                  value={settings.regularCustomerVisitThreshold}
                  onChange={(e) => handleChange('regularCustomerVisitThreshold', parseInt(e.target.value) || 3)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">VIP Spend Threshold (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={settings.vipCustomerSpendThreshold}
                  onChange={(e) => handleChange('vipCustomerSpendThreshold', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">High Spender Avg Visit Spend (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={settings.highSpenderAverageSpendThreshold}
                  onChange={(e) => handleChange('highSpenderAverageSpendThreshold', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">At Risk Inactivity Window (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.atRiskDays}
                  onChange={(e) => handleChange('atRiskDays', parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Churned Inactive Window (Days)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.inactiveDays}
                  onChange={(e) => handleChange('inactiveDays', parseInt(e.target.value) || 60)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="md:col-span-2 border-t border-[#EAD8C0]/10 pt-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#8F6A50]">Manager CRM Permissions</h3>
                
                <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                  <div>
                    <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can View Customer CRM</h4>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to view customer metrics, search profiles, and see tags.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('managerCanViewCustomerCRM')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.managerCanViewCustomerCRM ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.managerCanViewCustomerCRM ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                  <div>
                    <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can Manage Customer CRM</h4>
                    <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to update profiles, assign tags, and toggle marketing consents.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('managerCanManageCustomerCRM')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.managerCanManageCustomerCRM ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.managerCanManageCustomerCRM ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Loyalty Program */}
        {activeTab === 'loyalty' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-[#EAD8C0]/10">
              <Coins className="h-5 w-5 text-[#8F6A50]" />
              <h2 className="text-lg font-extrabold text-[#3C2A21]">Loyalty Program Config</h2>
            </div>

            <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
              <div>
                <h4 className="font-bold text-sm text-[#3C2A21]">Enable Loyalty Program</h4>
                <p className="text-xs text-[#8F6A50] mt-0.5">Activate points earning and redemption for eligible customer transactions.</p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('enableLoyalty')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableLoyalty ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enableLoyalty ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Earning: Spend Amount (₹)</label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={settings.loyaltySpendAmount}
                  onChange={(e) => handleChange('loyaltySpendAmount', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Earning: Points Awarded</label>
                <input
                  type="number"
                  min={1}
                  value={settings.loyaltyPointsEarned}
                  onChange={(e) => handleChange('loyaltyPointsEarned', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Redemption: Points Required</label>
                <input
                  type="number"
                  min={1}
                  value={settings.loyaltyRedemptionPoints}
                  onChange={(e) => handleChange('loyaltyRedemptionPoints', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Redemption: Value (₹)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={settings.loyaltyRedemptionValue}
                  onChange={(e) => handleChange('loyaltyRedemptionValue', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Minimum Points to Redeem</label>
                <input
                  type="number"
                  min={0}
                  value={settings.loyaltyMinimumRedeemPoints}
                  onChange={(e) => handleChange('loyaltyMinimumRedeemPoints', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Maximum Redeem Percent (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={settings.loyaltyMaximumRedeemPercent}
                  onChange={(e) => handleChange('loyaltyMaximumRedeemPercent', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Request Expiry (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={settings.loyaltyRedemptionRequestExpiryMinutes}
                  onChange={(e) => handleChange('loyaltyRedemptionRequestExpiryMinutes', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0]/35 rounded-xl text-[#3C2A21] font-medium outline-none focus:border-[#8F6A50]"
                />
              </div>
            </div>

            <div className="border-t border-[#EAD8C0]/10 pt-6 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#8F6A50]">Staff & Manager Permissions</h3>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can Adjust Loyalty Points</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to manually add or remove loyalty points on customer profiles.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('managerCanAdjustLoyaltyPoints')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.managerCanAdjustLoyaltyPoints ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.managerCanAdjustLoyaltyPoints ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Manager Can Approve Loyalty Redemption</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Allows managers to approve or reject pending customer redemption requests.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('managerCanApproveLoyaltyRedemption')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.managerCanApproveLoyaltyRedemption ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/40'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.managerCanApproveLoyaltyRedemption ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            <div className="p-4 bg-[#8F6A50]/5 border border-[#8F6A50]/20 rounded-2xl space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8F6A50]">Earning & Redemption Preview</h4>
              <p className="text-sm text-[#3C2A21] font-semibold">
                Spend ₹{settings.loyaltySpendAmount} &rarr; Earn {settings.loyaltyPointsEarned} Point{settings.loyaltyPointsEarned > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-[#8F6A50]">
                Redeem {settings.loyaltyRedemptionPoints} Points &rarr; Value of ₹{settings.loyaltyRedemptionValue}
              </p>
            </div>
          </div>
        )}

        {/* Form Actions Footer */}
        <div className="flex justify-end pt-4 border-t border-[#EAD8C0]/10">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3.5 bg-[#8F6A50] hover:bg-[#3C2A21] text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Settings className="animate-spin h-4 w-4 text-white" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 text-white" />
                Commit Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
