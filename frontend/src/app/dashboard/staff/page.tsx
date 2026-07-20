'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Plus, Edit2, KeyRound, Search, Loader2, UserCheck, UserX, AlertCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StaffMember {
  id: string;
  name: string;
  phone: string;
  role: 'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER';
  status: 'ACTIVE' | 'INACTIVE';
  mustChangePin: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLogin: string | null;
  createdAt: string;
}

export default function StaffRegistryPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Main Form Dialog State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER'>('WAITER');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState('');

  // PIN Dialog State
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pinTargetId, setPinTargetId] = useState<string | null>(null);
  const [pinTargetName, setPinTargetName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // 1. Fetch Staff List
  const { data: staffList, isLoading, isError } = useQuery<StaffMember[]>({
    queryKey: ['adminStaff'],
    queryFn: async () => {
      const response = await api.get('/staff');
      return response.data;
    },
  });

  // 2. Create Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; phone: string; role: string; pin: string }) => {
      return api.post('/staff', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      closeFormDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to register staff');
    },
  });

  // 3. Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name?: string; phone?: string; role?: string; status?: string }) => {
      const { id, ...data } = payload;
      return api.put(`/staff/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      closeFormDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to update staff member');
    },
  });

  // 4. Change PIN Mutation
  const changePinMutation = useMutation({
    mutationFn: async ({ id, newPin }: { id: string; newPin: string }) => {
      return api.put(`/staff/${id}/pin`, { newPin });
    },
    onSuccess: () => {
      setPinSuccess('PIN updated successfully!');
      setNewPin('');
      setTimeout(() => {
        closePinDialog();
      }, 1500);
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setPinError(axiosError.response?.data?.message || 'Failed to update PIN');
    },
  });

  // 5. Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) => {
      return api.put(`/staff/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
    },
  });

  const openCreateDialog = () => {
    setEditId(null);
    setName('');
    setPhone('');
    setRole('WAITER');
    setPin('');
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditDialog = (staff: StaffMember) => {
    setEditId(staff.id);
    setName(staff.name);
    setPhone(staff.phone);
    setRole(staff.role);
    setPin('');
    setFormError('');
    setIsFormOpen(true);
  };

  const closeFormDialog = () => {
    setIsFormOpen(false);
    setEditId(null);
    setName('');
    setPhone('');
    setRole('WAITER');
    setPin('');
    setFormError('');
  };

  const openPinDialog = (staff: StaffMember) => {
    setPinTargetId(staff.id);
    setPinTargetName(staff.name);
    setNewPin('');
    setPinError('');
    setPinSuccess('');
    setIsPinOpen(true);
  };

  const closePinDialog = () => {
    setIsPinOpen(false);
    setPinTargetId(null);
    setPinTargetName('');
    setNewPin('');
    setPinError('');
    setPinSuccess('');
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone number is required');
      return;
    }

    if (editId) {
      updateMutation.mutate({
        id: editId,
        name: name.trim(),
        phone: phone.trim(),
        role,
      });
    } else {
      if (!pin.trim()) {
        setFormError('Initial PIN is required');
        return;
      }
      if (pin.length !== 4 && pin.length !== 6) {
        setFormError('PIN must be exactly 4 or 6 digits');
        return;
      }
      createMutation.mutate({
        name: name.trim(),
        phone: phone.trim(),
        role,
        pin,
      });
    }
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (!newPin.trim()) {
      setPinError('PIN is required');
      return;
    }
    if (newPin.length !== 4 && newPin.length !== 6) {
      setPinError('PIN must be exactly 4 or 6 digits');
      return;
    }

    if (pinTargetId) {
      changePinMutation.mutate({ id: pinTargetId, newPin });
    }
  };

  const handleToggleStatus = (staff: StaffMember) => {
    if (staff.role === 'OWNER') {
      alert('Cannot change the status of an Owner');
      return;
    }
    const newStatus = staff.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    toggleStatusMutation.mutate({ id: staff.id, status: newStatus });
  };

  const filteredStaff = staffList?.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#3C2A21] flex items-center gap-2">
            <Users className="h-6 w-6 text-[#8F6A50]" />
            Staff Registry
          </h1>
          <p className="text-xs text-gray-500 mt-1">Configure restaurant crew members, edit profiles, and reset security credentials.</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11 shadow-md"
        >
          <Plus className="h-4.5 w-4.5" />
          Add Staff Member
        </Button>
      </div>

      {/* Search and Quick Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#EAD8C0]/20 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or phone number..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/15 outline-none rounded-xl text-sm transition-all"
          />
        </div>
        <div className="text-xs text-gray-400 font-medium">
          Total Registered Crew: <span className="font-extrabold text-[#3C2A21]">{staffList?.length || 0}</span>
        </div>
      </div>

      {/* Main Staff Table */}
      <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 text-[#8F6A50] animate-spin" />
            <p className="text-sm text-gray-400 font-medium">Fetching registered crew...</p>
          </div>
        ) : isError ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-rose-600">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-semibold">Failed to load staff list. Please verify server connectivity.</p>
          </div>
        ) : filteredStaff?.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-400 font-semibold">No staff members found matching search filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-[#EAD8C0]/20">
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Name & ID</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Phone</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">System Role</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Security</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Last Login</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff?.map((staff) => {
                  let roleColor = 'bg-gray-100 text-gray-700';
                  if (staff.role === 'OWNER') roleColor = 'bg-purple-50 text-purple-700 border border-purple-100';
                  else if (staff.role === 'MANAGER') roleColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                  else if (staff.role === 'CASHIER') roleColor = 'bg-amber-50 text-amber-700 border border-amber-100';
                  else if (staff.role === 'WAITER') roleColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';

                  const isOwner = staff.role === 'OWNER';

                  return (
                    <tr key={staff.id} className="hover:bg-[#FAF8F5]/30 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-800 text-sm">{staff.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{staff.id}</div>
                      </td>
                      <td className="p-4 text-sm font-semibold text-gray-600">{staff.phone}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${roleColor}`}>
                          {staff.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => handleToggleStatus(staff)}
                          disabled={isOwner}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                            staff.status === 'ACTIVE'
                              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600'
                              : 'bg-rose-50/50 border-rose-200 text-rose-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600'
                          } ${isOwner ? 'opacity-80 cursor-not-allowed hover:bg-emerald-50/50 hover:border-emerald-200 hover:text-emerald-700' : ''}`}
                        >
                          {staff.status === 'ACTIVE' ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              Active
                            </>
                          ) : (
                            <>
                              <UserX className="h-3.5 w-3.5" />
                              Inactive
                            </>
                          )}
                        </button>
                      </td>
                      <td className="p-4">
                        {staff.mustChangePin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-[10px] font-bold animate-pulse">
                            Mandatory PIN Change
                          </span>
                        )}
                        {!staff.mustChangePin && (
                          <span className="text-xs text-gray-400 font-medium">Secured</span>
                        )}
                      </td>
                      <td className="p-4 text-xs font-medium text-gray-400">
                        {staff.lastLogin ? new Date(staff.lastLogin).toLocaleString() : 'Never logged in'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openPinDialog(staff)}
                            title="Reset PIN"
                            className="p-2 hover:bg-[#FAF8F5] border border-gray-100 hover:border-[#EAD8C0]/60 text-gray-600 hover:text-[#8F6A50] rounded-xl transition-all"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEditDialog(staff)}
                            title="Edit Details"
                            className="p-2 hover:bg-[#FAF8F5] border border-gray-100 hover:border-[#EAD8C0]/60 text-gray-600 hover:text-[#8F6A50] rounded-xl transition-all"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE & EDIT DIALOG */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#EAD8C0]/10 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editId ? 'Edit Staff Profile' : 'Register New Staff Member'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {editId ? 'Modify profile info and role attributes.' : 'Provide details and set an initial security PIN.'}
            </p>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Phone Number (E.164)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +919999999999"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">System Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm transition-all"
                >
                  <option value="WAITER">Waiter (Waitstaff)</option>
                  <option value="CASHIER">Cashier (POS Operator)</option>
                  <option value="MANAGER">Manager (Administrator)</option>
                  <option value="OWNER">Owner (Full Admin Access)</option>
                </select>
              </div>

              {!editId && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Initial Login PIN (4 or 6 Digits)</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="e.g. 1234"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm transition-all font-mono"
                    required
                  />
                  <span className="text-[10px] text-gray-400 block mt-1.5">Note: The staff member will be required to change this PIN on their first login.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button
                  type="button"
                  onClick={closeFormDialog}
                  variant="ghost"
                  className="rounded-xl h-10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md flex items-center gap-1.5"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {editId ? 'Save Profile' : 'Register Staff'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANGE PIN DIALOG */}
      {isPinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#EAD8C0]/10 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              Reset Security PIN
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Update credentials for <strong className="text-gray-700">{pinTargetName}</strong>. This forces session logout.
            </p>

            {pinError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {pinSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs flex items-center gap-1.5 font-medium">
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>{pinSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSavePin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">New PIN (4 or 6 Digits)</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Enter new code"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm transition-all font-mono"
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button
                  type="button"
                  onClick={closePinDialog}
                  variant="ghost"
                  className="rounded-xl h-10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={changePinMutation.isPending}
                  className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl px-6 h-10 text-xs shadow-md flex items-center gap-1.5"
                >
                  {changePinMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Save New PIN
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
