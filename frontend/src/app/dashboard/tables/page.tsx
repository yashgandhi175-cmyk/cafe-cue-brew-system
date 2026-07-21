'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { QrCode, Plus, Edit2, ToggleLeft, ToggleRight, Download, Printer, RefreshCw, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QRCode from 'qrcode';

interface TableQrToken {
  token: string;
}

interface RestaurantTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  isActive: boolean;
  qrToken: TableQrToken | null;
}

// Sub-component to render and print QR codes
function TableQrCard({ table }: { table: RestaurantTable }) {
  const [qrUrl, setQrUrl] = useState('');

  const publicUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const customerMenuUrl = `${publicUrl}/menu.html?table=${table.id}&token=${table.qrToken?.token || ''}`;

  useEffect(() => {
    if (table.qrToken?.token) {
      QRCode.toDataURL(customerMenuUrl, { width: 300, margin: 2 })
        .then((url) => setQrUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [table, customerMenuUrl]);

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `QR_${table.tableNumber.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!qrUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR - ${table.tableNumber}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              margin: 0;
              background-color: white;
            }
            .container {
              border: 2px solid #3c2a21;
              border-radius: 24px;
              padding: 40px;
              text-align: center;
              box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            }
            h1 {
              color: #3c2a21;
              margin: 0 0 10px 0;
              font-size: 28px;
              font-weight: 800;
            }
            p {
              color: #666;
              margin: 0 0 20px 0;
              font-size: 14px;
            }
            img {
              width: 250px;
              height: 250px;
            }
            .footer {
              margin-top: 20px;
              font-size: 11px;
              color: #aaa;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>CAFE CUE & BREW</h1>
            <p>Scan to view digital menu and place order</p>
            <img src="${qrUrl}" alt="QR Code" />
            <div style="font-size: 24px; font-weight: 700; color: #3c2a21; margin-top: 15px;">
              ${table.tableNumber}
            </div>
            <div class="footer">Cafe Cue & Brew Restaurant System</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#EAD8C0]/30 flex flex-col items-center gap-3">
      {qrUrl ? (
        <img src={qrUrl} alt="QR Code" className="w-40 h-40 border border-gray-100 rounded-lg shadow-sm" />
      ) : (
        <div className="w-40 h-40 bg-gray-100 animate-pulse rounded-lg flex items-center justify-center">
          <QrCode className="h-8 w-8 text-gray-300" />
        </div>
      )}
      
      <div className="flex gap-2 w-full">
        <button
          onClick={handleDownload}
          disabled={!qrUrl}
          className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-[#EAD8C0] text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
        <button
          onClick={handlePrint}
          disabled={!qrUrl}
          className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-[#EAD8C0] text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>
    </div>
  );
}

export default function TablesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog Modals
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form State
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [status, setStatus] = useState<'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'>('AVAILABLE');
  const [formError, setFormError] = useState('');

  // 1. Fetch Tables
  const { data: tables, isLoading } = useQuery<RestaurantTable[]>({
    queryKey: ['adminTables'],
    queryFn: async () => {
      const response = await api.get('/tables?all=true');
      return response.data;
    },
  });

  // 2. Create Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { tableNumber: string; capacity: number }) => {
      return api.post('/tables', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to create table');
    },
  });

  // 3. Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; tableNumber?: string; capacity?: number; status?: string; isActive?: boolean }) => {
      const { id, ...data } = payload;
      return api.put(`/tables/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to update table');
    },
  });

  // 4. Soft Delete / Toggle Active Status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/tables/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
    },
  });

  // 5. Regenerate Token Mutation
  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/tables/${id}/regenerate-token`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
    },
  });

  const openCreateDialog = () => {
    setEditId(null);
    setTableNumber('');
    setCapacity(4);
    setStatus('AVAILABLE');
    setFormError('');
    setIsOpen(true);
  };

  const openEditDialog = (table: RestaurantTable) => {
    setEditId(table.id);
    setTableNumber(table.tableNumber);
    setCapacity(table.capacity);
    setStatus(table.status);
    setFormError('');
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setEditId(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) {
      setFormError('Table number/name is required');
      return;
    }

    if (editId) {
      updateMutation.mutate({
        id: editId,
        tableNumber: tableNumber.trim(),
        capacity: Number(capacity),
        status,
      });
    } else {
      createMutation.mutate({
        tableNumber: tableNumber.trim(),
        capacity: Number(capacity),
      });
    }
  };

  const filteredTables = tables?.filter((t) =>
    t.tableNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#3C2A21] flex items-center gap-2">
            <QrCode className="h-6 w-6 text-[#8F6A50]" />
            Restaurant Tables
          </h1>
          <p className="text-xs text-gray-500 mt-1">Configure physical dine-in tables and secure QR parameters</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11"
        >
          <Plus className="h-4.5 w-4.5" />
          Add Table
        </Button>
      </div>

      {/* Search */}
      <div className="flex bg-white p-4 rounded-2xl border border-[#EAD8C0]/20 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search table by name/number..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/15 outline-none rounded-xl text-sm transition-all"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-72 bg-white border border-[#EAD8C0]/10 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : !tables || tables.length === 0 ? (
        <div className="bg-white border border-[#EAD8C0]/10 rounded-2xl p-12 text-center text-gray-500">
          <QrCode className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">No tables found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredTables?.map((table) => (
            <div
              key={table.id}
              className={`bg-white rounded-3xl p-5 border shadow-sm flex flex-col justify-between transition-all ${
                table.isActive ? 'border-[#EAD8C0]/25' : 'border-gray-200 bg-gray-50/50 opacity-70'
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Details */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{table.tableNumber}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 font-medium">
                      <Users className="h-4 w-4 text-gray-400" />
                      Capacity: {table.capacity} Guests
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Status</span>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${
                        table.status === 'AVAILABLE'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : table.status === 'OCCUPIED'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : table.status === 'RESERVED'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-purple-50 border-purple-200 text-purple-700' // CLEANING
                      }`}
                    >
                      {table.status}
                    </span>
                  </div>

                  {/* Quick Controls */}
                  <div className="flex items-center gap-1 pb-2">
                    <button
                      onClick={() => openEditDialog(table)}
                      className="p-2 hover:bg-[#FAF8F5] rounded-xl text-gray-600 hover:text-[#3C2A21] transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="h-4.5 w-4.5" />
                    </button>
                    <button
                      onClick={() => regenerateTokenMutation.mutate(table.id)}
                      disabled={regenerateTokenMutation.isPending}
                      className="p-2 hover:bg-[#FAF8F5] rounded-xl text-[#8F6A50] hover:text-[#3C2A21] transition-colors disabled:opacity-50"
                      title="Regenerate QR Token (Invalidates old QR)"
                    >
                      <RefreshCw className={`h-4.5 w-4.5 ${regenerateTokenMutation.isPending ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: table.id, isActive: !table.isActive })}
                      className={`p-2 rounded-xl transition-colors ${
                        table.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={table.isActive ? 'Deactivate (Soft Delete)' : 'Reactivate'}
                    >
                      {table.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                    </button>
                  </div>
                </div>

                {/* QR Section */}
                {table.isActive && <TableQrCard table={table} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIALOG MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editId ? 'Edit Dining Table' : 'Create Dining Table'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Configure physical identifier and seating parameters</p>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Table Number/Label</label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. Table 5, Table 10"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Capacity (Max Guests)</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  placeholder="4"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                  min="1"
                  required
                />
              </div>

              {editId && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Current Status</label>
                  <select
                    value={status}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING')}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm text-gray-600 focus:border-[#8F6A50]"
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="OCCUPIED">OCCUPIED</option>
                    <option value="RESERVED">RESERVED</option>
                    <option value="CLEANING">CLEANING</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button type="button" onClick={closeDialog} variant="ghost" className="rounded-xl h-10 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Table'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
