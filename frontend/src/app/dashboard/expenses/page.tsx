'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Wallet,
  Plus,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Expense {
  id: string;
  expenseDate: string;
  category: string;
  title: string;
  amount: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  status: 'ACTIVE' | 'VOIDED';
  voidReason: string | null;
  notes: string | null;
  createdById: string;
  createdBy: { name: string };
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidingExpenseId, setVoidingExpenseId] = useState<string | null>(null);

  // Form State
  const [expenseForm, setExpenseForm] = useState({
    expenseDate: new Date().toISOString().split('T')[0],
    category: 'RAW_MATERIALS',
    title: '',
    amount: 0,
    paymentMethod: 'CASH',
    referenceNumber: '',
    notes: '',
  });

  const [voidReason, setVoidReason] = useState('');

  // Queries
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const res = await api.get('/expenses');
      return res.data;
    },
  });

  // Mutations
  const expenseMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/expenses', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-contribution'] });
      setIsExpenseModalOpen(false);
      // Reset form
      setExpenseForm({
        expenseDate: new Date().toISOString().split('T')[0],
        category: 'RAW_MATERIALS',
        title: '',
        amount: 0,
        paymentMethod: 'CASH',
        referenceNumber: '',
        notes: '',
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return api.post(`/expenses/${id}/void`, { voidReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-contribution'] });
      setIsVoidModalOpen(false);
      setVoidReason('');
      setVoidingExpenseId(null);
    },
  });

  const handleExport = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('ccb_token');
    if (!token) return;
    window.open(`${baseUrl}/expenses/export?token=${token}`, '_blank');
  };

  // Metrics
  const activeExpenses = expenses.filter((e) => e.status === 'ACTIVE');
  const totalExpenses = activeExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const rawMaterials = activeExpenses.filter((e) => e.category === 'RAW_MATERIALS').reduce((sum, e) => sum + Number(e.amount), 0);
  const utilities = activeExpenses.filter((e) => e.category === 'UTILITIES').reduce((sum, e) => sum + Number(e.amount), 0);
  const rent = activeExpenses.filter((e) => e.category === 'RENT').reduce((sum, e) => sum + Number(e.amount), 0);
  const salary = activeExpenses.filter((e) => e.category === 'STAFF_WAGES').reduce((sum, e) => sum + Number(e.amount), 0);
  const other = totalExpenses - rawMaterials - utilities - rent - salary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAD8C0]/25 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#3C2A21] flex items-center gap-2">
            <Wallet className="h-8 w-8 text-[#8F6A50]" />
            Operating Expenses Log
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
            Cafe Cue & Brew Cash & Credit Outflows
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            className="border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold gap-2 rounded-xl"
          >
            <Download className="h-4 w-4" /> Export Expenses CSV
          </Button>
          <Button
            onClick={() => setIsExpenseModalOpen(true)}
            className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
          >
            <Plus className="h-4.5 w-4.5" /> Record Expense
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm col-span-1 md:col-span-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-wider">Total Active Expenses</span>
          <span className="text-2xl font-black text-rose-600 mt-1 block">
            ₹{totalExpenses.toFixed(2)}
          </span>
          <span className="text-[10px] text-gray-400 block mt-2">Active logging</span>
        </div>

        <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm col-span-1 md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[9px] font-bold text-gray-400 uppercase block tracking-wider">Raw Materials</span>
            <span className="text-base font-bold text-gray-800 mt-1 block">₹{rawMaterials.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-gray-400 uppercase block tracking-wider">Rent & Leases</span>
            <span className="text-base font-bold text-gray-800 mt-1 block">₹{rent.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-gray-400 uppercase block tracking-wider">Staff Wages</span>
            <span className="text-base font-bold text-gray-800 mt-1 block">₹{salary.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-gray-400 uppercase block tracking-wider">Utilities & Others</span>
            <span className="text-base font-bold text-gray-800 mt-1 block">₹{(utilities + other).toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Expenses Log Table */}
      <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
              <th className="py-4 px-5">Expense Title</th>
              <th className="py-4 px-5">Category</th>
              <th className="py-4 px-5">Date</th>
              <th className="py-4 px-5 text-right">Amount</th>
              <th className="py-4 px-5">Payment Method</th>
              <th className="py-4 px-5">Status</th>
              <th className="py-4 px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-xs">
            {expenses.map((e) => (
              <tr key={e.id} className={`hover:bg-[#FAF8F5]/30 ${e.status === 'VOIDED' ? 'opacity-50 line-through bg-gray-50/50' : ''}`}>
                <td className="py-3.5 px-5 font-bold text-gray-800">
                  {e.title}
                  {e.status === 'VOIDED' && e.voidReason && (
                    <span className="block text-[9px] text-rose-500 font-bold mt-1 line-through-none">
                      Void Reason: {e.voidReason}
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-5">
                  <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600 font-semibold uppercase">
                    {e.category}
                  </span>
                </td>
                <td className="py-3.5 px-5 text-gray-500">{new Date(e.expenseDate).toLocaleDateString()}</td>
                <td className="py-3.5 px-5 text-right font-bold text-gray-800">₹{e.amount.toFixed(2)}</td>
                <td className="py-3.5 px-5 text-gray-600 uppercase font-mono">{e.paymentMethod || '-'}</td>
                <td className="py-3.5 px-5">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                    e.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {e.status}
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  {e.status === 'ACTIVE' && (
                    <Button
                      onClick={() => {
                        setVoidingExpenseId(e.id);
                        setIsVoidModalOpen(true);
                      }}
                      variant="ghost"
                      className="h-7 px-2.5 hover:bg-rose-50 text-rose-600 font-bold text-[10px] rounded-lg"
                    >
                      Void
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-xs text-gray-400 py-12">
                  No operating expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==========================================
          MODALS & DIALOGS
      ========================================== */}

      {/* 1. RECORD EXPENSE MODAL */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">Record Operating Expense</h2>
            <p className="text-xs text-gray-400 mb-6">Log capital outflows and category distributions</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (expenseForm.amount <= 0) {
                  alert('Please enter a valid amount.');
                  return;
                }
                expenseMutation.mutate(expenseForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Expense Title</label>
                <input
                  type="text"
                  required
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  placeholder="e.g. Monthly Rent Payment"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expenseForm.amount || ''}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Expense Date</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold"
                  >
                    <option value="RAW_MATERIALS">Raw Materials / Inventory</option>
                    <option value="RENT">Rent & Leases</option>
                    <option value="UTILITIES">Utilities (Electricity/Water)</option>
                    <option value="STAFF_WAGES">Staff Wages / Salary</option>
                    <option value="MARKETING">Marketing & Ads</option>
                    <option value="REPAIRS_MAINTENANCE">Repairs & Maintenance</option>
                    <option value="OTHER">Other Miscellaneous</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Payment Method</label>
                  <select
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="NET_BANKING">Net Banking</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                    <option value="DEBIT_CARD">Debit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reference / Invoice #</label>
                <input
                  type="text"
                  value={expenseForm.referenceNumber}
                  onChange={(e) => setExpenseForm({ ...expenseForm, referenceNumber: e.target.value })}
                  placeholder="e.g. INV-12345"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notes</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  placeholder="Additional descriptions..."
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm h-16"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={expenseMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  {expenseMutation.isPending ? 'Saving...' : 'Record'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. VOID EXPENSE MODAL */}
      {isVoidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">Void Operating Expense</h2>
            <p className="text-xs text-gray-400 mb-6">Voiding excludes the expense from operating contribution metrics</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!voidReason.trim()) {
                  alert('Please enter a void reason.');
                  return;
                }
                if (voidingExpenseId) {
                  voidMutation.mutate({ id: voidingExpenseId, reason: voidReason });
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason for Void</label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Double entry, mistake"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setIsVoidModalOpen(false);
                    setVoidReason('');
                    setVoidingExpenseId(null);
                  }}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={voidMutation.isPending}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold px-5"
                >
                  Confirm Void
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
