'use client';

import React, { useState, Suspense } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coffee, User, Delete, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PublicStaff {
  id: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER';
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';

  const [selectedStaff, setSelectedStaff] = useState<PublicStaff | null>(null);
  const [manualStaffId, setManualStaffId] = useState('');
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // Fetch public staff list
  const { data: staffList, isLoading, isError } = useQuery<PublicStaff[]>({
    queryKey: ['publicStaff'],
    queryFn: async () => {
      const response = await api.get('/staff/public');
      return response.data;
    },
  });

  // Login Mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: { staffId: string; pin: string }) => {
      const response = await api.post('/auth/login', credentials);
      return response.data;
    },
    onSuccess: (data) => {
      // Store credentials
      localStorage.setItem('ccb_token', data.token);
      localStorage.setItem('ccb_staff', JSON.stringify(data.staff));

      if (data.staff.mustChangePin) {
        router.push('/change-pin');
        return;
      }

      // Redirect based on role
      const role = data.staff.role;
      if (role === 'OWNER' || role === 'MANAGER') {
        router.push('/dashboard');
      } else if (role === 'WAITER') {
        router.push('/waiter/tables');
      } else if (role === 'CASHIER') {
        router.push('/cashier/bills');
      }
    },
    onError: (err: unknown) => {
      setPin('');
      const axiosError = err as { response?: { data?: { message?: string } } };
      const errMsg = axiosError.response?.data?.message || 'Login failed. Please check your PIN.';
      setError(errMsg);
    },
  });

  const handleKeyPress = (num: string) => {
    setError('');
    // Max 6 digits
    if (pin.length < 6) {
      setPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError('');
    setPin('');
  };

  const handleSubmit = () => {
    const staffId = isManualEntry ? manualStaffId.trim() : selectedStaff?.id;
    if (!staffId) {
      setError('Please select a staff profile or enter a staff ID');
      return;
    }
    if (pin.length !== 4 && pin.length !== 6) {
      setError('PIN must be exactly 4 or 6 digits');
      return;
    }
    loginMutation.mutate({ staffId, pin });
  };

  const handleBackToProfiles = () => {
    setSelectedStaff(null);
    setPin('');
    setError('');
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-[#FAF8F5]">
      {/* Left Column: Branding (Desktop) */}
      <section className="hidden md:flex md:w-1/2 bg-[#3C2A21] text-[#EAD8C0] flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle decorative coffee beans pattern or ambient light */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(60,42,33,0.8),rgba(30,15,10,1))] opacity-95"></div>
        <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-[#8E7AB5] opacity-5 blur-3xl"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-wider">
            <Coffee className="h-8 w-8 text-[#DDBEAA] animate-bounce" />
            <span>CAFE CUE & BREW</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6 max-w-lg">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight md:text-5xl">
            Where Precision <br />
            Meets Passion.
          </h1>
          <p className="text-lg text-[#DDBEAA] font-light">
            Manage orders, billing, tables, and analytics with the exclusive Cafe Cue & Brew restaurant management console.
          </p>
        </div>

        <div className="relative z-10 text-xs text-[#DDBEAA]/50">
          © {new Date().getFullYear()} Cafe Cue & Brew. All rights reserved.
        </div>
      </section>

      {/* Right Column: Interactive Login Container */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#EAD8C0]/20 p-8 relative">
          
          {/* Mobile branding header */}
          <div className="flex md:hidden items-center justify-center gap-2 mb-8 text-xl font-bold text-[#3C2A21]">
            <Coffee className="h-6 w-6 text-[#8F6A50]" />
            <span>CAFE CUE & BREW</span>
          </div>

          {sessionExpired && (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm text-center">
              Your session has expired. Please log in again.
            </div>
          )}

          {error && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm text-center font-medium animate-pulse">
              {error}
            </div>
          )}

          {/* SECTION 1: Select Profile */}
          {!selectedStaff && !isManualEntry && (
            <div className="space-y-6">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-extrabold text-[#3C2A21]">Staff Login</h2>
                <p className="text-sm text-gray-500 mt-1">Select your profile to continue</p>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-2 gap-4 py-8">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl"></div>
                  ))}
                </div>
              ) : isError || !staffList || staffList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <User className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                  <p>No active staff profiles found.</p>
                  <p className="text-xs text-gray-400 mt-1">Please use manual entry or seed database.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 max-h-[320px] overflow-y-auto pr-1">
                  {staffList.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() => setSelectedStaff(staff)}
                      className="group flex flex-col items-center justify-center p-4 bg-[#FAF8F5] border border-[#EAD8C0]/30 hover:border-[#8F6A50] hover:bg-[#FAF6F0] rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#EAD8C0]/30 flex items-center justify-center text-[#3C2A21] font-semibold group-hover:bg-[#8F6A50] group-hover:text-white transition-colors duration-300">
                        {staff.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-gray-800 text-sm mt-3 group-hover:text-[#3C2A21] transition-colors">
                        {staff.name}
                      </span>
                      <span className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider font-medium">
                        {staff.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-[#EAD8C0]/20 pt-6">
                <Button
                  onClick={() => setIsManualEntry(true)}
                  variant="outline"
                  className="w-full border-[#EAD8C0] text-[#3C2A21] hover:bg-[#FAF8F5] rounded-xl h-11"
                >
                  Enter Staff ID Manually
                </Button>
              </div>
            </div>
          )}

          {/* SECTION 2: Manual Staff ID Entry */}
          {isManualEntry && !selectedStaff && (
            <div className="space-y-6">
              <div>
                <button
                  onClick={() => setIsManualEntry(false)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#3C2A21] font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Profiles
                </button>
                <h2 className="text-2xl font-extrabold text-[#3C2A21] mt-4">Enter Staff ID</h2>
                <p className="text-sm text-gray-500 mt-1">Please provide your employee identifier</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={manualStaffId}
                    onChange={(e) => setManualStaffId(e.target.value)}
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    className="w-full pl-11 pr-4 py-3 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm text-gray-800 transition-all font-mono"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (manualStaffId.trim()) {
                      setSelectedStaff({ id: manualStaffId.trim(), name: 'Staff Member', role: 'WAITER' });
                      setError('');
                    } else {
                      setError('Please enter a valid Staff ID');
                    }
                  }}
                  className="w-full bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl h-11"
                >
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* SECTION 3: PIN Dial-Pad Entry */}
          {selectedStaff && (
            <div className="space-y-6">
              <div>
                <button
                  onClick={handleBackToProfiles}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#3C2A21] font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Change Profile
                </button>
                <div className="flex items-center justify-between mt-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#3C2A21]">{selectedStaff.name}</h2>
                    <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mt-0.5">
                      {selectedStaff.role}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#EAD8C0]/30 flex items-center justify-center text-sm font-bold text-[#3C2A21]">
                    {selectedStaff.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Dots indicator */}
              <div className="flex flex-col items-center justify-center py-4 space-y-4">
                <div className="flex gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full transition-all duration-150 border-2 ${
                        i < pin.length
                          ? 'bg-[#3C2A21] border-[#3C2A21] scale-110 shadow-sm'
                          : 'bg-transparent border-[#EAD8C0]'
                      }`}
                    ></div>
                  ))}
                </div>
                <span className="text-xs text-gray-400">Enter your security PIN</span>
              </div>

              {/* Dial Pad Grid */}
              <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleKeyPress(num)}
                    className="w-16 h-16 rounded-full bg-[#FAF8F5] hover:bg-[#EAD8C0]/20 border border-[#EAD8C0]/30 text-gray-800 text-xl font-bold flex items-center justify-center transition-all active:scale-95 active:bg-[#EAD8C0]/40"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="w-16 h-16 rounded-full text-xs font-semibold text-gray-400 hover:text-gray-600 flex items-center justify-center"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleKeyPress('0')}
                  className="w-16 h-16 rounded-full bg-[#FAF8F5] hover:bg-[#EAD8C0]/20 border border-[#EAD8C0]/30 text-gray-800 text-xl font-bold flex items-center justify-center transition-all active:scale-95 active:bg-[#EAD8C0]/40"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="w-16 h-16 rounded-full text-gray-500 hover:text-gray-700 flex items-center justify-center active:scale-95"
                >
                  <Delete className="h-6 w-6" />
                </button>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={loginMutation.isPending || (pin.length !== 4 && pin.length !== 6)}
                  className="w-full bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl h-12 text-base font-semibold shadow-md disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {loginMutation.isPending ? 'Verifying PIN...' : 'Verify & Log In'}
                </Button>
              </div>
            </div>
          )}

        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-[#3C2A21] font-semibold flex items-center gap-2">
          <Coffee className="animate-spin text-[#8F6A50]" /> Loading login interface...
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
