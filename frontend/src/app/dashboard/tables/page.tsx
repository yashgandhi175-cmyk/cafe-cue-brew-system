'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  QrCode,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
  Printer,
  RefreshCw,
  Users,
  Search,
  ArrowRightLeft,
  GitMerge,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import QRCode from 'qrcode';

interface TableQrToken {
  id?: string;
  tableId?: string;
  token: string;
}

interface RestaurantTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  isActive: boolean;
  qr_token: TableQrToken | null;
}

// Sub-component to render and print QR codes
function TableQrCard({ table }: { table: RestaurantTable }) {
  const [qrUrl, setQrUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const rawToken = table.qr_token?.token || '';
  const publicUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const customerMenuUrl = rawToken ? `${publicUrl}/menu?table=${table.id}&token=${rawToken}` : '';

  useEffect(() => {
    let isMounted = true;
    if (rawToken && customerMenuUrl) {
      setIsGenerating(true);
      QRCode.toDataURL(customerMenuUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#3C2A21',
          light: '#FFFFFF',
        },
      })
        .then((url) => {
          if (isMounted) {
            setQrUrl(url);
            setIsGenerating(false);
          }
        })
        .catch((err) => {
          console.error('QR code generation error:', err);
          if (isMounted) setIsGenerating(false);
        });
    } else {
      setQrUrl('');
      setIsGenerating(false);
    }
    return () => {
      isMounted = false;
    };
  }, [table.id, rawToken, customerMenuUrl]);

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
          <title>Print QR - Table ${table.tableNumber}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 95vh;
              margin: 0;
              background-color: #fcfbf9;
            }
            .container {
              border: 3px solid #3C2A21;
              border-radius: 28px;
              padding: 40px;
              text-align: center;
              background: #ffffff;
              box-shadow: 0 10px 25px rgba(60, 42, 33, 0.08);
              max-width: 380px;
            }
            .badge {
              display: inline-block;
              background-color: #EAD8C0;
              color: #3C2A21;
              padding: 4px 14px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 1px;
              margin-bottom: 12px;
            }
            h1 {
              color: #3C2A21;
              margin: 0 0 6px 0;
              font-size: 26px;
              font-weight: 900;
              letter-spacing: -0.5px;
            }
            p {
              color: #795744;
              margin: 0 0 24px 0;
              font-size: 13px;
              font-weight: 500;
            }
            img {
              width: 240px;
              height: 240px;
              border-radius: 16px;
              border: 1px solid #EAD8C0;
              padding: 8px;
            }
            .table-label {
              font-size: 28px;
              font-weight: 900;
              color: #3C2A21;
              margin-top: 18px;
              letter-spacing: -0.5px;
            }
            .footer {
              margin-top: 20px;
              font-size: 10px;
              font-weight: 600;
              color: #A08370;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="badge">DINE-IN ORDERING</div>
            <h1>CAFE CUE & BREW</h1>
            <p>Scan to explore menu & place your order</p>
            <img src="${qrUrl}" alt="Table QR Code" />
            <div class="table-label">Table ${table.tableNumber}</div>
            <div class="footer">Powered by Cafe Cue & Brew System</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 600);
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
        <img
          src={qrUrl}
          alt={`QR Code Table ${table.tableNumber}`}
          className="w-40 h-40 border border-stone-200 rounded-xl shadow-sm bg-white p-1"
        />
      ) : isGenerating ? (
        <div className="w-40 h-40 bg-stone-100 animate-pulse rounded-xl flex items-center justify-center">
          <RefreshCw className="h-6 w-6 text-stone-400 animate-spin" />
        </div>
      ) : (
        <div className="w-40 h-40 bg-stone-100 rounded-xl flex flex-col items-center justify-center p-2 text-center">
          <QrCode className="h-8 w-8 text-stone-300 mb-1" />
          <span className="text-[11px] text-stone-400 font-medium">No active QR token</span>
        </div>
      )}

      <div className="flex gap-2 w-full">
        <button
          onClick={handleDownload}
          disabled={!qrUrl}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-[#EAD8C0] text-gray-700 rounded-lg text-xs font-bold hover:bg-[#FAF8F5] hover:text-[#3C2A21] transition-colors disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5 text-[#8F6A50]" /> Download
        </button>
        <button
          onClick={handlePrint}
          disabled={!qrUrl}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white border border-[#EAD8C0] text-gray-700 rounded-lg text-xs font-bold hover:bg-[#FAF8F5] hover:text-[#3C2A21] transition-colors disabled:opacity-40"
        >
          <Printer className="h-3.5 w-3.5 text-[#8F6A50]" /> Print
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

  // Delete State
  const [deleteTargetTable, setDeleteTargetTable] = useState<RestaurantTable | null>(null);
  const [deleteError, setDeleteError] = useState('');

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

  // 5. Delete Mutation (Hard delete or soft archive if referenced)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
      setDeleteTargetTable(null);
      setDeleteError('');
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setDeleteError(axiosError.response?.data?.message || 'Failed to delete table');
    },
  });

  // 6. Regenerate Token Mutation
  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/tables/${id}/regenerate-token`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
    },
  });

  // Shift & Merge States
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [shiftSourceId, setShiftSourceId] = useState('');
  const [shiftTargetId, setShiftTargetId] = useState('');
  const [shiftReason, setShiftReason] = useState('');
  const [shiftError, setShiftError] = useState('');

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [mergeError, setMergeError] = useState('');

  // 7. Shift Table Mutation
  const shiftMutation = useMutation({
    mutationFn: async (payload: { sourceTableId: string; targetTableId: string; reason?: string }) => {
      return api.post('/tables/shift', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
      setIsShiftOpen(false);
      setShiftSourceId('');
      setShiftTargetId('');
      setShiftReason('');
      setShiftError('');
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setShiftError(axiosError.response?.data?.message || 'Failed to shift table');
    },
  });

  // 8. Merge Tables Mutation
  const mergeMutation = useMutation({
    mutationFn: async (payload: { sourceTableIds: string[]; targetTableId: string; reason?: string }) => {
      return api.post('/tables/merge', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTables'] });
      setIsMergeOpen(false);
      setMergeSourceIds([]);
      setMergeTargetId('');
      setMergeReason('');
      setMergeError('');
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setMergeError(axiosError.response?.data?.message || 'Failed to merge tables');
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
            Restaurant Tables & QR
          </h1>
          <p className="text-xs text-gray-500 mt-1">Configure dine-in seating, print high-resolution QR badges, and manage sessions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setShiftSourceId('');
              setShiftTargetId('');
              setShiftReason('');
              setShiftError('');
              setIsShiftOpen(true);
            }}
            variant="outline"
            className="border-[#3C2A21]/30 text-[#3C2A21] hover:bg-[#3C2A21]/5 rounded-xl flex items-center gap-1.5 h-11 text-xs font-bold"
          >
            <ArrowRightLeft className="h-4 w-4 text-[#8F6A50]" />
            Shift Table
          </Button>

          <Button
            onClick={() => {
              setMergeSourceIds([]);
              setMergeTargetId('');
              setMergeReason('');
              setMergeError('');
              setIsMergeOpen(true);
            }}
            variant="outline"
            className="border-[#3C2A21]/30 text-[#3C2A21] hover:bg-[#3C2A21]/5 rounded-xl flex items-center gap-1.5 h-11 text-xs font-bold"
          >
            <GitMerge className="h-4 w-4 text-[#8F6A50]" />
            Merge Tables
          </Button>

          <Button
            onClick={openCreateDialog}
            className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11 text-xs font-bold shadow-sm"
          >
            <Plus className="h-4.5 w-4.5" />
            Add Table
          </Button>
        </div>
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
          <p className="text-xs text-gray-400 mt-1">Click &quot;Add Table&quot; to create your first dining table.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredTables?.map((table) => (
            <div
              key={table.id}
              className={`bg-white rounded-3xl p-5 border shadow-sm flex flex-col justify-between transition-all ${
                table.isActive ? 'border-[#EAD8C0]/35' : 'border-gray-200 bg-gray-50/50 opacity-70'
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Details */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">Table {table.tableNumber}</h3>
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
                      title="Edit Table"
                    >
                      <Edit2 className="h-4.5 w-4.5" />
                    </button>
                    {table.status === 'OCCUPIED' && (
                      <button
                        onClick={() => {
                          setShiftSourceId(table.id);
                          setShiftTargetId('');
                          setShiftReason('');
                          setShiftError('');
                          setIsShiftOpen(true);
                        }}
                        className="p-2 hover:bg-amber-50 rounded-xl text-amber-700 transition-colors"
                        title="Shift Table"
                      >
                        <ArrowRightLeft className="h-4.5 w-4.5" />
                      </button>
                    )}
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
                      title={table.isActive ? 'Deactivate (Hide from customer menu)' : 'Reactivate'}
                    >
                      {table.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                    </button>
                    <button
                      onClick={() => {
                        setDeleteError('');
                        setDeleteTargetTable(table);
                      }}
                      className="p-2 hover:bg-rose-50 rounded-xl text-gray-400 hover:text-rose-600 transition-colors"
                      title="Delete Table"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
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

      {/* CREATE / EDIT MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editId ? 'Edit Dining Table' : 'Create Dining Table'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Configure physical identifier and seating parameters</p>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl mb-4 font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Table Number / Label *</label>
                <input
                  type="text"
                  placeholder="e.g., Table 1, Patio 4, VIP 2"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Seating Capacity (Guests)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm font-semibold"
                />
              </div>

              {editId && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING')}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm font-semibold text-gray-700"
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
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md font-bold"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editId ? 'Update Table' : 'Create Table'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTargetTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-rose-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Remove Table</h2>
                <p className="text-xs text-gray-500">Confirm permanent removal or archiving</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to remove <span className="font-bold text-[#3C2A21]">Table {deleteTargetTable.tableNumber}</span>?
              <br />
              <span className="text-xs text-gray-400 block mt-2">
                If this table has existing order history, it will be safely deactivated to preserve accounting records.
              </span>
            </p>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl mb-4 font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-3 border-t border-gray-100">
              <Button
                type="button"
                onClick={() => {
                  setDeleteTargetTable(null);
                  setDeleteError('');
                }}
                variant="ghost"
                className="rounded-xl h-10 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTargetTable.id)}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-5 h-10 text-xs shadow-md font-bold"
              >
                {deleteMutation.isPending ? 'Removing...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT MODAL */}
      {isShiftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1 flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-[#8F6A50]" />
              Shift Table Orders
            </h2>
            <p className="text-xs text-gray-400 mb-6">Transfer active guest orders to a different dining table</p>

            {shiftError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl mb-4 font-semibold">
                {shiftError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!shiftSourceId || !shiftTargetId) {
                  setShiftError('Please select both source and target tables');
                  return;
                }
                if (shiftSourceId === shiftTargetId) {
                  setShiftError('Source and target tables cannot be the same');
                  return;
                }
                shiftMutation.mutate({
                  sourceTableId: shiftSourceId,
                  targetTableId: shiftTargetId,
                  reason: shiftReason,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Source Table (Active Orders) *</label>
                <select
                  value={shiftSourceId}
                  onChange={(e) => setShiftSourceId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold text-gray-700"
                >
                  <option value="">Select Occupied Table</option>
                  {tables
                    ?.filter((t) => t.isActive && t.status === 'OCCUPIED')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.tableNumber} (Occupied)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Destination Table *</label>
                <select
                  value={shiftTargetId}
                  onChange={(e) => setShiftTargetId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold text-gray-700"
                >
                  <option value="">Select Available Table</option>
                  {tables
                    ?.filter((t) => t.isActive && t.id !== shiftSourceId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.tableNumber} ({t.status})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="E.g., Guest requested window booth"
                  value={shiftReason}
                  onChange={(e) => setShiftReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button type="button" onClick={() => setIsShiftOpen(false)} variant="ghost" className="rounded-xl h-10 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={shiftMutation.isPending}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md font-bold"
                >
                  {shiftMutation.isPending ? 'Shifting...' : 'Confirm Shift'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MERGE MODAL */}
      {isMergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1 flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-[#8F6A50]" />
              Merge Tables
            </h2>
            <p className="text-xs text-gray-400 mb-6">Combine orders from multiple tables into a single bill</p>

            {mergeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl mb-4 font-semibold">
                {mergeError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (mergeSourceIds.length === 0 || !mergeTargetId) {
                  setMergeError('Please select source tables and a target destination table');
                  return;
                }
                mergeMutation.mutate({
                  sourceTableIds: mergeSourceIds,
                  targetTableId: mergeTargetId,
                  reason: mergeReason,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Select Tables to Merge *</label>
                <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-[#FAF8F5] border border-[#EAD8C0] rounded-xl">
                  {tables
                    ?.filter((t) => t.isActive && t.id !== mergeTargetId)
                    .map((t) => {
                      const isChecked = mergeSourceIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center justify-between p-2 hover:bg-white rounded-lg cursor-pointer text-xs font-semibold"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMergeSourceIds([...mergeSourceIds, t.id]);
                                } else {
                                  setMergeSourceIds(mergeSourceIds.filter((id) => id !== t.id));
                                }
                              }}
                              className="w-4 h-4 accent-[#3C2A21] rounded"
                            />
                            <span className="text-gray-800">Table {t.tableNumber}</span>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              t.status === 'OCCUPIED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-stone-200 text-stone-600'
                            }`}
                          >
                            {t.status}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Primary / Destination Table *</label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => {
                    const newTarget = e.target.value;
                    setMergeTargetId(newTarget);
                    setMergeSourceIds(mergeSourceIds.filter((id) => id !== newTarget));
                  }}
                  required
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold text-gray-700"
                >
                  <option value="">Select Primary Table</option>
                  {tables
                    ?.filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.tableNumber} ({t.status})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="E.g., Large party combined tables"
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm font-semibold"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button type="button" onClick={() => setIsMergeOpen(false)} variant="ghost" className="rounded-xl h-10 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mergeMutation.isPending}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md font-bold"
                >
                  {mergeMutation.isPending ? 'Merging...' : 'Confirm Merge'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
