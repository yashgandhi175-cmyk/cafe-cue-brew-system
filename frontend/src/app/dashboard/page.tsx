'use client';

import React, { useEffect, useState } from 'react';
import { FolderTree, Utensils, QrCode } from 'lucide-react';
import Link from 'next/link';

interface StaffSession {
  name: string;
  role: string;
}

export default function DashboardHome() {
  const [staff, setStaff] = useState<StaffSession | null>(null);

  useEffect(() => {
    const staffData = localStorage.getItem('ccb_staff');
    if (staffData) {
      try {
        const parsed = JSON.parse(staffData) as StaffSession;
        setTimeout(() => {
          setStaff(parsed);
        }, 0);
      } catch {
        // ignore
      }
    }
  }, []);

  return (
    <div className="space-y-8">
      {/* Header welcome banner */}
      <div className="bg-gradient-to-r from-[#3C2A21] to-[#8F6A50] rounded-3xl p-8 md:p-10 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-[#EAD8C0]/10 blur-2xl"></div>
        <div className="relative z-10 space-y-3">
          <span className="text-xs uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full font-bold">
            Console Hub
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Welcome back, {staff?.name || 'Staff member'}!
          </h1>
          <p className="text-sm md:text-base text-[#DDBEAA] max-w-xl font-light">
            You are logged in as <strong className="font-bold text-white uppercase">{staff?.role || 'Staff'}</strong>.
            Use the dashboard toolset below to manage categories, recipes, tables, and system configurations.
          </p>
        </div>
      </div>

      {/* Main console cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Categories Card */}
        <Link
          href="/dashboard/categories"
          className="group p-6 bg-white border border-[#EAD8C0]/20 hover:border-[#8F6A50] rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAD8C0]/20 flex items-center justify-center text-[#8F6A50] group-hover:bg-[#8F6A50] group-hover:text-white transition-colors duration-300">
              <FolderTree className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Category Management</h2>
              <p className="text-xs text-gray-400 mt-1">
                Organize your items into custom menu sections such as burgers, pizza, desserts, coolers, or freyo towers.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#8F6A50] mt-6 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Go to Categories &rarr;
          </span>
        </Link>

        {/* Menu Items Card */}
        <Link
          href="/dashboard/menu"
          className="group p-6 bg-white border border-[#EAD8C0]/20 hover:border-[#8F6A50] rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAD8C0]/20 flex items-center justify-center text-[#8F6A50] group-hover:bg-[#8F6A50] group-hover:text-white transition-colors duration-300">
              <Utensils className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Menu & Variants</h2>
              <p className="text-xs text-gray-400 mt-1">
                Configure base pricing, veg/non-veg status, special tags, size variants (small/large) and extra add-ons.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#8F6A50] mt-6 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Go to Menu Items &rarr;
          </span>
        </Link>

        {/* Tables & QR Card */}
        <Link
          href="/dashboard/tables"
          className="group p-6 bg-white border border-[#EAD8C0]/20 hover:border-[#8F6A50] rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAD8C0]/20 flex items-center justify-center text-[#8F6A50] group-hover:bg-[#8F6A50] group-hover:text-white transition-colors duration-300">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Tables & secure QR codes</h2>
              <p className="text-xs text-gray-400 mt-1">
                Manage seating capacities, check real-time table statuses, generate secure tokens, and download QR codes.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#8F6A50] mt-6 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Go to Tables &rarr;
          </span>
        </Link>

      </div>
    </div>
  );
}
