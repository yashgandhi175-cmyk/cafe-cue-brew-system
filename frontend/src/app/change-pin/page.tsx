'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Coffee, Lock, KeyRound, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChangePinPage() {
  const router = useRouter();
  
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [activeField, setActiveField] = useState<'current' | 'new' | 'confirm'>('current');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mutation to update PIN
  const changePinMutation = useMutation({
    mutationFn: async (payload: { currentPin: string; newPin: string; confirmPin: string }) => {
      const response = await api.put('/staff/me/pin', payload);
      return response.data;
    },
    onSuccess: () => {
      setSuccess('PIN changed successfully! Logging out...');
      setError('');
      // Invalidate frontend token & redirect to login after a brief delay
      setTimeout(() => {
        localStorage.removeItem('ccb_token');
        localStorage.removeItem('ccb_staff');
        router.push('/login?pin_changed=true');
      }, 2000);
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      const errMsg = axiosError.response?.data?.message || 'Failed to update PIN. Please verify your current PIN.';
      setError(errMsg);
      // Reset inputs on error
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setActiveField('current');
    },
  });

  const handleKeyPress = (num: string) => {
    setError('');
    if (activeField === 'current') {
      if (currentPin.length < 6) setCurrentPin((prev) => prev + num);
    } else if (activeField === 'new') {
      if (newPin.length < 6) setNewPin((prev) => prev + num);
    } else {
      if (confirmPin.length < 6) setConfirmPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setError('');
    if (activeField === 'current') {
      setCurrentPin((prev) => prev.slice(0, -1));
    } else if (activeField === 'new') {
      setNewPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setError('');
    if (activeField === 'current') setCurrentPin('');
    else if (activeField === 'new') setNewPin('');
    else setConfirmPin('');
  };

  const handleSubmit = () => {
    setError('');
    if (!currentPin || !newPin || !confirmPin) {
      setError('All PIN fields are required');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and Confirm PIN do not match');
      return;
    }
    if (newPin === currentPin) {
      setError('New PIN cannot be the same as the current bootstrap PIN');
      return;
    }
    changePinMutation.mutate({ currentPin, newPin, confirmPin });
  };

  const handleLogout = () => {
    // Call backend logout
    api.post('/auth/logout')
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('ccb_token');
        localStorage.removeItem('ccb_staff');
        router.push('/login');
      });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#EAD8C0]/20 p-8 relative">
        <div className="flex items-center justify-center gap-2 mb-6 text-xl font-bold text-[#3C2A21]">
          <Coffee className="h-6 w-6 text-[#8F6A50]" />
          <span>CAFE CUE & BREW</span>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold text-[#3C2A21]">Mandatory PIN Change</h2>
          <p className="text-xs text-rose-600 font-medium mt-1">
            You are using a temporary default PIN. You must configure a new PIN before proceeding.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium animate-pulse">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs text-center font-medium">
            {success}
          </div>
        )}

        {/* PIN Inputs Indicators */}
        <div className="space-y-4 mb-6">
          {/* Current PIN Field */}
          <button
            onClick={() => setActiveField('current')}
            className={`w-full p-3 rounded-xl border transition-all text-left flex justify-between items-center ${
              activeField === 'current'
                ? 'border-[#8F6A50] bg-[#FAF8F5] ring-2 ring-[#8F6A50]/15'
                : 'border-gray-200 hover:bg-[#FAF8F5]/50'
            }`}
          >
            <div>
              <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Current PIN</span>
              <div className="flex gap-2 mt-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full border ${
                      i < currentPin.length ? 'bg-[#3C2A21] border-[#3C2A21]' : 'border-gray-300'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
            <KeyRound className="h-5 w-5 text-gray-400" />
          </button>

          {/* New PIN Field */}
          <button
            onClick={() => setActiveField('new')}
            className={`w-full p-3 rounded-xl border transition-all text-left flex justify-between items-center ${
              activeField === 'new'
                ? 'border-[#8F6A50] bg-[#FAF8F5] ring-2 ring-[#8F6A50]/15'
                : 'border-gray-200 hover:bg-[#FAF8F5]/50'
            }`}
          >
            <div>
              <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">New PIN (4 or 6 Digits)</span>
              <div className="flex gap-2 mt-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full border ${
                      i < newPin.length ? 'bg-[#3C2A21] border-[#3C2A21]' : 'border-gray-300'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
            <Lock className="h-5 w-5 text-gray-400" />
          </button>

          {/* Confirm PIN Field */}
          <button
            onClick={() => setActiveField('confirm')}
            className={`w-full p-3 rounded-xl border transition-all text-left flex justify-between items-center ${
              activeField === 'confirm'
                ? 'border-[#8F6A50] bg-[#FAF8F5] ring-2 ring-[#8F6A50]/15'
                : 'border-gray-200 hover:bg-[#FAF8F5]/50'
            }`}
          >
            <div>
              <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Confirm New PIN</span>
              <div className="flex gap-2 mt-1">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full border ${
                      i < confirmPin.length ? 'bg-[#3C2A21] border-[#3C2A21]' : 'border-gray-300'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
            <Lock className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Dial Pad Grid */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="w-14 h-14 rounded-full bg-[#FAF8F5] hover:bg-[#EAD8C0]/20 border border-[#EAD8C0]/30 text-gray-800 text-lg font-bold flex items-center justify-center transition-all active:scale-95"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="w-14 h-14 rounded-full text-xs font-semibold text-gray-400 hover:text-gray-600 flex items-center justify-center"
          >
            Clear
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="w-14 h-14 rounded-full bg-[#FAF8F5] hover:bg-[#EAD8C0]/20 border border-[#EAD8C0]/30 text-gray-800 text-lg font-bold flex items-center justify-center transition-all active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="w-14 h-14 rounded-full text-gray-500 hover:text-gray-700 flex items-center justify-center active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={changePinMutation.isPending || newPin.length < 4 || confirmPin.length < 4}
            className="w-full bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl h-11 text-sm font-semibold shadow-md"
          >
            {changePinMutation.isPending ? 'Updating PIN...' : 'Update & Save PIN'}
          </Button>

          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-700 rounded-xl h-10 text-xs"
          >
            Cancel & Log Out
          </Button>
        </div>
      </div>
    </main>
  );
}
