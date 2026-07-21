'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Coffee,
  LayoutDashboard,
  ClipboardList,
  Utensils,
  FolderTree,
  QrCode,
  Users,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ShoppingBag,
  Receipt,
  BarChart3,
  Settings,
  Package,
  Wallet,
  Ticket,
  Image,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

interface StaffSession {
  id: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'WAITER' | 'CASHIER';
  mustChangePin?: boolean;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('ccb_token');
      const staffData = localStorage.getItem('ccb_staff');

      if (!token || !staffData) {
        router.push('/login');
        return;
      }

      try {
        const parsedStaff = JSON.parse(staffData) as StaffSession;
        if (parsedStaff.mustChangePin) {
          router.push('/change-pin');
          return;
        }
        setTimeout(() => {
          setStaff(parsedStaff);
          setLoading(false);
        }, 0);
      } catch {
        router.push('/login');
        return;
      }
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ccb_token');
      localStorage.removeItem('ccb_staff');
      router.push('/login');
    }
  };

  if (loading || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-[#3C2A21] font-semibold flex items-center gap-2">
          <Coffee className="animate-spin text-[#8F6A50]" /> Loading console...
        </div>
      </div>
    );
  }

  // Sidebar Links based on Role
  const allLinks = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'POS Console',
      href: '/dashboard/pos',
      icon: ShoppingBag,
      roles: ['OWNER', 'MANAGER', 'CASHIER'],
    },
    {
      name: 'Settlements',
      href: '/dashboard/bills',
      icon: Receipt,
      roles: ['OWNER', 'MANAGER', 'CASHIER'],
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      icon: ClipboardList,
      roles: ['OWNER', 'MANAGER', 'WAITER', 'CASHIER'],
    },
    {
      name: 'Categories',
      href: '/dashboard/categories',
      icon: FolderTree,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Menu Items',
      href: '/dashboard/menu',
      icon: Utensils,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Tables & QR',
      href: '/dashboard/tables',
      icon: QrCode,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Inventory Console',
      href: '/dashboard/inventory',
      icon: Package,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Operating Expenses',
      href: '/dashboard/expenses',
      icon: Wallet,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Customers & CRM',
      href: '/dashboard/customers',
      icon: Users,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Credit Ledger',
      href: '/dashboard/credits',
      icon: BookOpen,
      roles: ['OWNER', 'MANAGER', 'CASHIER'],
    },
    {
      name: 'Reports & Analytics',
      href: '/dashboard/reports',
      icon: BarChart3,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Coupons',
      href: '/dashboard/coupons',
      icon: Ticket,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Promo Banners',
      href: '/dashboard/banners',
      icon: Image,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      name: 'Staff Registry',
      href: '/dashboard/staff',
      icon: Users,
      roles: ['OWNER'],
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      roles: ['OWNER'],
    },
  ];

  const filteredLinks = allLinks.filter((link) => link.roles.includes(staff.role));

  return (
    <div className="min-h-screen flex bg-[#FAF8F5]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-[#3C2A21] text-[#EAD8C0] flex-col justify-between p-6 shadow-xl border-r border-[#3C2A21]/30 h-screen sticky top-0">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2">
            <Coffee className="h-7 w-7 text-[#DDBEAA]" />
            <span className="font-extrabold tracking-wider text-base text-white">CUE & BREW</span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {filteredLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 ${
                    isActive
                      ? 'bg-[#8F6A50] text-white shadow-md'
                      : 'hover:bg-[#FAF8F5]/5 hover:text-white text-[#DDBEAA]/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span>{link.name}</span>
                  </div>
                  {isActive && <ChevronRight className="h-4 w-4" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer profile info & Logout */}
        <div className="border-t border-[#FAF8F5]/10 pt-4 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-[#EAD8C0]/20 flex items-center justify-center font-bold text-white text-sm">
              {staff.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{staff.name}</p>
              <p className="text-xs text-[#DDBEAA]/60 uppercase tracking-widest font-bold truncate mt-0.5">
                {staff.role}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header & Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between bg-[#3C2A21] text-white px-5 py-4 shadow-md">
          <div className="flex items-center gap-2">
            <Coffee className="h-6 w-6 text-[#DDBEAA]" />
            <span className="font-extrabold tracking-wider text-sm">CUE & BREW</span>
          </div>
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-1 hover:bg-[#FAF8F5]/10 rounded-lg"
          >
            {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Drawer Navigation */}
        {isMobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setIsMobileOpen(false)}>
            <div
              className="w-64 max-w-[80vw] h-full bg-[#3C2A21] text-[#EAD8C0] p-6 flex flex-col justify-between shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="flex items-center gap-2.5 pb-4 border-b border-[#FAF8F5]/10">
                  <Coffee className="h-7 w-7 text-[#DDBEAA]" />
                  <span className="font-extrabold tracking-wider text-white">CUE & BREW</span>
                </div>
                <nav className="space-y-1">
                  {filteredLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
                    return (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                          isActive
                            ? 'bg-[#8F6A50] text-white shadow-md'
                            : 'hover:bg-[#FAF8F5]/5 hover:text-white text-[#DDBEAA]/80'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5" />
                          <span>{link.name}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t border-[#FAF8F5]/10 pt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#EAD8C0]/20 flex items-center justify-center font-bold text-white text-sm">
                    {staff.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{staff.name}</p>
                    <p className="text-xs text-[#DDBEAA]/60 uppercase tracking-widest font-bold mt-0.5">{staff.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
