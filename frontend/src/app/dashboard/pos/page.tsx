/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { fetchWithAuth } from '@/lib/api';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Check,
  User,
  Phone,
  Tag,
  AlertCircle,
} from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  basePrice: string;
  imageUrl?: string;
  isActive: boolean;
  available: boolean;
  categoryId: string;
  variants: Array<{ id: string; name: string; price: string; isActive: boolean }>;
  menuItemAddons: Array<{
    addon: { id: string; name: string; price: string; isActive: boolean };
  }>;
}

interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

interface RestaurantTable {
  id: string;
  tableNumber: string;
  status: string;
  isActive: boolean;
}

interface CartItem {
  id: string; // unique cart entry key (menuItemId + variantId + sorted addonIds)
  menuItem: MenuItem;
  variant?: { id: string; name: string; price: string };
  selectedAddons: Array<{ id: string; name: string; price: string }>;
  quantity: number;
  notes: string;
}

export default function PosConsolePage() {
  const router = useRouter();

  // Core Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [validatedCouponCode, setValidatedCouponCode] = useState('');
  const [validatedCouponDiscount, setValidatedCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [manualDiscountType, setManualDiscountType] = useState<'FLAT' | 'PERCENTAGE'>('PERCENTAGE');
  const [manualDiscountValue, setManualDiscountValue] = useState<number>(0);
  const [manualDiscountReason, setManualDiscountReason] = useState('');
  const marketingConsent = false;

  // Available Coupons State
  const [showCouponListModal, setShowCouponListModal] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);

  // Modal / Customize State
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState('');

  // Status/Error
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [catRes, itemRes, tableRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/categories`),
        fetchWithAuth(`${API_URL}/menu/items`),
        fetchWithAuth(`${API_URL}/tables`),
      ]);

      if (!catRes.ok || !itemRes.ok) {
        throw new Error('Failed to load menu data.');
      }

      const cats = await catRes.json();
      const items = await itemRes.json();
      const tbls = await tableRes.json();

      setCategories(Array.isArray(cats) ? cats.filter((c: Category) => c.isActive) : []);
      setMenuItems(Array.isArray(items) ? items.filter((i: MenuItem) => i.isActive) : []);
      setTables(Array.isArray(tbls) ? tbls.filter((t: RestaurantTable) => t.isActive) : []);
      setLoading(false);
    } catch {
      setErrorMsg('Failed to load menu data. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Keyboard Shortcuts for POS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search dishes"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        setOrderType((prev) => (prev === 'DINE_IN' ? 'TAKEAWAY' : 'DINE_IN'));
      } else if (e.key === 'F3') {
        e.preventDefault();
        const phoneInput = document.querySelector('input[placeholder*="10-digit"]') as HTMLInputElement;
        const nameInput = document.querySelector('input[placeholder*="Walk-in"]') as HTMLInputElement;
        if (phoneInput) {
          phoneInput.focus();
        } else if (nameInput) {
          nameInput.focus();
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && !submitting) {
          handleCreateOrder();
        }
      } else if (e.key === 'Escape') {
        setCustomizingItem(null);
        setShowCouponListModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, submitting]);

  // Filtered menu list
  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = activeCategory === 'ALL' || item.categoryId === activeCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.basePrice.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const handleSelectItem = (item: MenuItem) => {
    if (!item.available) return;

    if (item.variants.length > 0 || item.menuItemAddons.length > 0) {
      // Open customization modal
      setCustomizingItem(item);
      setSelectedVariantId(item.variants[0]?.id || '');
      setSelectedAddonIds([]);
      setCustomNotes('');
    } else {
      // Add straight to cart
      addToCartDirect(item);
    }
  };

  const triggerCartChangeReset = () => {
    setValidatedCouponCode('');
    setValidatedCouponDiscount(0);
    setCouponError('');
  };

  const addToCartDirect = (item: MenuItem) => {
    triggerCartChangeReset();
    const entryId = `direct-${item.id}`;
    const existing = cart.find((c) => c.id === entryId);

    if (existing) {
      setCart(
        cart.map((c) => (c.id === entryId ? { ...c, quantity: c.quantity + 1 } : c)),
      );
    } else {
      setCart([
        ...cart,
        {
          id: entryId,
          menuItem: item,
          quantity: 1,
          selectedAddons: [],
          notes: '',
        },
      ]);
    }
    setSuccessMsg(`Added ${item.name} to cart.`);
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleAddCustomized = () => {
    if (!customizingItem) return;
    triggerCartChangeReset();

    const variantObj = customizingItem.variants.find((v) => v.id === selectedVariantId);
    const addonsObj = customizingItem.menuItemAddons
      .map((ma) => ma.addon)
      .filter((a) => selectedAddonIds.includes(a.id));

    // Create unique cart entry ID
    const entryId = `${customizingItem.id}-${selectedVariantId}-${selectedAddonIds.sort().join('_')}`;

    const existing = cart.find((c) => c.id === entryId);

    if (existing) {
      setCart(
        cart.map((c) => (c.id === entryId ? { ...c, quantity: c.quantity + 1 } : c)),
      );
    } else {
      setCart([
        ...cart,
        {
          id: entryId,
          menuItem: customizingItem,
          variant: variantObj,
          selectedAddons: addonsObj.map((a) => ({ id: a.id, name: a.name, price: a.price })),
          quantity: 1,
          notes: customNotes,
        },
      ]);
    }

    setCustomizingItem(null);
    setSuccessMsg(`Added ${customizingItem.name} customization to cart.`);
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const updateQuantity = (id: string, delta: number) => {
    triggerCartChangeReset();
    setCart(
      cart
        .map((c) => {
          if (c.id === id) {
            const newQty = c.quantity + delta;
            return newQty > 0 ? { ...c, quantity: newQty } : null;
          }
          return c;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeCartItem = (id: string) => {
    triggerCartChangeReset();
    setCart(cart.filter((c) => c.id !== id));
  };



  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    setCouponError('');
    try {
      const token = localStorage.getItem('ccb_token');
      const itemsPayload = cart.map((c) => ({
        menuItemId: c.menuItem.id,
        variantId: c.variant?.id,
        addonIds: c.selectedAddons.map((a) => a.id),
        quantity: c.quantity,
      }));
      const res = await fetchWithAuth(`${API_URL}/public/coupons/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          items: itemsPayload,
          customerPhone: customerPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setValidatedCouponCode(data.normalizedCode);
        setValidatedCouponDiscount(Number(data.appliedDiscountEstimate));
        setCouponError('');
      } else {
        setCouponError(data.message || 'This coupon is not valid.');
        setValidatedCouponCode('');
        setValidatedCouponDiscount(0);
      }
    } catch {
      setCouponError('Coupon validation failed.');
      setValidatedCouponCode('');
      setValidatedCouponDiscount(0);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const loadAvailableCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const token = localStorage.getItem('ccb_token');
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch public active coupons
      const cRes = await fetchWithAuth(`${API_URL}/public/coupons`);
      const couponsList = await cRes.json();

      // 2. Validate each coupon against current cart in parallel
      const itemsPayload = cart.map((c) => ({
        menuItemId: c.menuItem.id,
        variantId: c.variant?.id,
        addonIds: c.selectedAddons.map((a) => a.id),
        quantity: c.quantity,
      }));

      const validatedList = await Promise.all(
        couponsList.map(async (c: any) => {
          try {
            const vRes = await fetchWithAuth(`${API_URL}/public/coupons/validate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code: c.code,
                items: itemsPayload,
                customerPhone: customerPhone.trim() || undefined,
              }),
            });
            const vData = await vRes.json();
            return {
              ...c,
              valid: vData.valid,
              message: vData.message || '',
              appliedDiscountEstimate: vData.appliedDiscountEstimate || 0,
            };
          } catch {
            return {
              ...c,
              valid: false,
              message: 'Failed to validate.',
              appliedDiscountEstimate: 0,
            };
          }
        })
      );

      setAvailableCoupons(validatedList);
    } catch (err) {
      console.error('Failed to load available coupons:', err);
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleClearCoupon = () => {
    setCouponCode('');
    setValidatedCouponCode('');
    setValidatedCouponDiscount(0);
    setCouponError('');
  };

  // Calculations
  const getSubtotal = () => {
    return cart.reduce((sum, item) => {
      const unitPrice = item.variant ? Number(item.variant.price) : Number(item.menuItem.basePrice);
      const addonsCost = item.selectedAddons.reduce((aSum, a) => aSum + Number(a.price), 0);
      return sum + (unitPrice + addonsCost) * item.quantity;
    }, 0);
  };

  const subtotal = getSubtotal();

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      setErrorMsg('Cart is empty.');
      return;
    }

    if (orderType === 'DINE_IN' && !selectedTableId) {
      setErrorMsg('Please select a table for Dine-in.');
      return;
    }

    if (manualDiscountValue > 0 && !manualDiscountReason.trim()) {
      setErrorMsg('Please provide a reason for the manual discount.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('ccb_token');
      const payload = {
        orderType,
        tableId: orderType === 'DINE_IN' ? selectedTableId : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        marketingConsent,
        couponCode: couponCode.trim() || undefined,
        manualDiscountType: manualDiscountValue > 0 ? manualDiscountType : undefined,
        manualDiscountValue: manualDiscountValue > 0 ? Number(manualDiscountValue) : undefined,
        manualDiscountReason: manualDiscountValue > 0 ? manualDiscountReason.trim() : undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItem.id,
          variantId: c.variant?.id,
          addonIds: c.selectedAddons.map((a) => a.id),
          quantity: c.quantity,
          notes: c.notes || undefined,
        })),
        idempotencyKey: 'POS_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      };

      const res = await fetchWithAuth(`${API_URL}/orders/pos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit POS order');
      }

      setSuccessMsg('POS Order created successfully!');
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setSelectedTableId('');
      handleClearCoupon();
      setManualDiscountValue(0);
      setManualDiscountReason('');
      setTimeout(() => {
        setSuccessMsg('');
        router.push('/dashboard/orders');
      }, 1500);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred.';
      setErrorMsg(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-[#3C2A21] font-semibold">
        Loading POS Menu System...
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)] overflow-hidden bg-[#FAF8F5] text-[#3C2A21]">
      {/* LEFT: Menu list */}
      <div className="flex-1 p-6 lg:border-r border-[#EAD8C0]/40 overflow-y-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#3C2A21] tracking-tight">
              POS CONSOLE
            </h1>
            <div className="flex flex-wrap gap-1.5 text-[9px] text-gray-400 font-bold mt-1">
              <span className="bg-[#EAD8C0]/20 border border-[#EAD8C0]/40 px-2 py-0.5 rounded-md">F1: Search</span>
              <span className="bg-[#EAD8C0]/20 border border-[#EAD8C0]/40 px-2 py-0.5 rounded-md">F2: Dine/Takeaway</span>
              <span className="bg-[#EAD8C0]/20 border border-[#EAD8C0]/40 px-2 py-0.5 rounded-md">F3: Cust Phone</span>
              <span className="bg-[#EAD8C0]/20 border border-[#EAD8C0]/40 px-2 py-0.5 rounded-md">F4: Submit</span>
              <span className="bg-[#EAD8C0]/20 border border-[#EAD8C0]/40 px-2 py-0.5 rounded-md">ESC: Close Modals</span>
            </div>
          </div>
          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-[#8F6A50]" />
            <input
              type="text"
              placeholder="Search dishes, drinks, price..."
              className="w-full pl-10 pr-4 py-2 border border-[#EAD8C0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8F6A50]/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category Scrollbar */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-thin">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase whitespace-nowrap transition ${
              activeCategory === 'ALL'
                ? 'bg-[#3C2A21] text-white'
                : 'bg-white border border-[#EAD8C0] text-[#8F6A50] hover:bg-[#FAF8F5]'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase whitespace-nowrap transition ${
                activeCategory === cat.id
                  ? 'bg-[#3C2A21] text-white'
                  : 'bg-white border border-[#EAD8C0] text-[#8F6A50] hover:bg-[#FAF8F5]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid items */}
        {filteredItems.length === 0 ? (
          <div className="py-20 text-center text-[#8F6A50]">
            No active menu items match your search filters.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectItem(item)}
                className={`bg-white rounded-2xl p-4 border border-[#EAD8C0]/50 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between ${
                  !item.available ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-32 object-cover rounded-xl mb-3"
                    />
                  )}
                  <h3 className="font-bold text-sm text-[#3C2A21] line-clamp-2 leading-tight">
                    {item.name}
                  </h3>
                </div>

                <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#FAF8F5]">
                  <span className="font-black text-sm text-[#8F6A50]">
                    ₹{item.basePrice}
                  </span>
                  {!item.available ? (
                    <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                      OUT OF STOCK
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      AVAILABLE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: Cart Details */}
      <div className="w-full lg:w-[420px] bg-white shadow-xl flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          <div className="flex items-center justify-between border-b border-[#EAD8C0]/30 pb-4 mb-4">
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-[#8F6A50]" /> CART
            </h2>
            <span className="text-xs bg-[#FAF8F5] text-[#8F6A50] px-2.5 py-1 rounded-lg font-bold">
              {cart.reduce((a, b) => a + b.quantity, 0)} Items
            </span>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex gap-2 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 flex gap-2 mb-4">
              <Check className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Cart item listing */}
          <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400">
                Cart is empty. Select items to add them here.
              </div>
            ) : (
              cart.map((item) => {
                const unitPrice = item.variant ? Number(item.variant.price) : Number(item.menuItem.basePrice);
                const addonsPrice = item.selectedAddons.reduce((sum, a) => sum + Number(a.price), 0);
                const total = (unitPrice + addonsPrice) * item.quantity;

                return (
                  <div key={item.id} className="flex justify-between items-start gap-2 bg-[#FAF8F5] p-3 rounded-xl">
                    <div className="flex-1">
                      <h4 className="font-bold text-xs leading-tight">{item.menuItem.name}</h4>
                      {item.variant && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Variant: {item.variant.name} (+₹{item.variant.price})
                        </p>
                      )}
                      {item.selectedAddons.length > 0 && (
                        <p className="text-[10px] text-gray-400">
                          Addons: {item.selectedAddons.map((a) => `${a.name} (+₹${a.price})`).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-[10px] italic text-[#8F6A50] mt-1">
                          Note: &quot;{item.notes}&quot;
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-black text-xs">₹{total}</span>
                      <div className="flex items-center gap-1.5 mt-2 bg-white border border-[#EAD8C0] px-1 rounded-lg">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="p-1 hover:text-red-500"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="p-1 hover:text-emerald-600"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeCartItem(item.id)}
                          className="p-1 text-gray-400 hover:text-red-500 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Form parameters */}
          <div className="border-t border-[#FAF8F5] pt-4 space-y-4 text-xs">
            <div>
              <label className="font-bold text-[11px] uppercase tracking-wider text-gray-400 block mb-1">
                Order Placement Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType('DINE_IN')}
                  className={`py-2 rounded-xl font-bold border transition ${
                    orderType === 'DINE_IN'
                      ? 'bg-[#3C2A21] border-[#3C2A21] text-white'
                      : 'border-[#EAD8C0] text-[#8F6A50]'
                  }`}
                >
                  Dine In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderType('TAKEAWAY');
                    setSelectedTableId('');
                  }}
                  className={`py-2 rounded-xl font-bold border transition ${
                    orderType === 'TAKEAWAY'
                      ? 'bg-[#3C2A21] border-[#3C2A21] text-white'
                      : 'border-[#EAD8C0] text-[#8F6A50]'
                  }`}
                >
                  Takeaway
                </button>
              </div>
            </div>

            {orderType === 'DINE_IN' && (
              <div>
                <label className="font-bold text-[11px] uppercase tracking-wider text-gray-400 block mb-1">
                  Assign Dine-in Table
                </label>
                <select
                  className="w-full p-2 border border-[#EAD8C0] rounded-xl bg-white focus:outline-none"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                >
                  <option value="">Select Table...</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status === 'OCCUPIED'}>
                      {t.tableNumber} ({t.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[11px] uppercase tracking-wider text-gray-400 block mb-1">
                  Customer Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Walk-in Customer"
                    className="w-full pl-8 pr-2 py-2 border border-[#EAD8C0] rounded-xl focus:outline-none"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-[11px] uppercase tracking-wider text-gray-400 block mb-1">
                  Customer Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="10-digit number"
                    className="w-full pl-8 pr-2 py-2 border border-[#EAD8C0] rounded-xl focus:outline-none"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[#FAF8F5] pt-4 space-y-2">
              <h3 className="font-bold text-xs uppercase text-gray-400 tracking-wider">
                Discounts & Surcharges
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[10px] text-gray-400 mb-0.5 block">
                    Coupon Discount
                    <button
                      type="button"
                      onClick={() => {
                        setShowCouponListModal(true);
                        loadAvailableCoupons();
                      }}
                      className="text-[#8F6A50] hover:underline text-[9px] font-bold float-right uppercase"
                    >
                      Available Coupons
                    </button>
                  </label>
                  <div className="flex gap-1">
                    <div className="relative flex-1">
                      <Tag className="absolute left-2 top-2 h-3 w-3 text-gray-400" />
                      <input
                        type="text"
                        placeholder="COUPON50"
                        className="w-full pl-7 pr-1 py-1.5 border border-[#EAD8C0] rounded-lg text-xs uppercase"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    {validatedCouponCode ? (
                      <button
                        type="button"
                        onClick={handleClearCoupon}
                        className="px-2.5 py-1.5 border border-rose-200 text-rose-600 bg-rose-50 rounded-lg text-xs font-bold"
                      >
                        Clear
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleValidateCoupon}
                        disabled={isValidatingCoupon || !couponCode.trim()}
                        className="px-2.5 py-1.5 bg-[#8F6A50] hover:bg-[#3C2A21] text-white rounded-lg text-xs font-bold disabled:opacity-40"
                      >
                        {isValidatingCoupon ? '...' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {couponError && (
                    <p className="text-red-500 text-[10px] mt-1 font-semibold">{couponError}</p>
                  )}
                  {validatedCouponCode && (
                    <p className="text-emerald-600 text-[10px] mt-1 font-bold">
                      ✓ Applied (Est: -₹{validatedCouponDiscount.toFixed(2)})
                    </p>
                  )}
                </div>
                <div>
                  <label className="font-bold text-[10px] text-gray-400 mb-0.5 block">Manual Discount</label>
                  <div className="flex gap-1">
                    <select
                      className="p-1 border border-[#EAD8C0] rounded-lg text-[10px] focus:outline-none"
                      value={manualDiscountType}
                      onChange={(e) => setManualDiscountType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                    >
                      <option value="PERCENTAGE">%</option>
                      <option value="FLAT">₹</option>
                    </select>
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full p-1 border border-[#EAD8C0] rounded-lg text-xs"
                      value={manualDiscountValue || ''}
                      onChange={(e) => setManualDiscountValue(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {manualDiscountValue > 0 && (
                <div>
                  <label className="font-bold text-[10px] text-gray-400 mb-0.5 block">Discount Reason</label>
                  <input
                    type="text"
                    placeholder="Enter auth reason..."
                    className="w-full p-1.5 border border-amber-300 bg-amber-50 rounded-lg text-xs focus:outline-none"
                    value={manualDiscountReason}
                    onChange={(e) => setManualDiscountReason(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CART TOTALS */}
        <div className="border-t border-[#EAD8C0]/30 p-6 bg-white shrink-0">
          <div className="flex justify-between items-center text-sm font-semibold mb-2">
            <span>Subtotal:</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>

          {validatedCouponDiscount > 0 && (
            <div className="flex justify-between items-center text-xs font-bold text-emerald-700 mb-2">
              <span>Coupon Discount ({validatedCouponCode}):</span>
              <span>-₹{validatedCouponDiscount.toFixed(2)}</span>
            </div>
          )}

          {manualDiscountValue > 0 && (
            <div className="flex justify-between items-center text-xs font-bold text-[#8F6A50] mb-2">
              <span>Manual Discount ({manualDiscountType === 'PERCENTAGE' ? `${manualDiscountValue}%` : 'Flat'}):</span>
              <span>
                -₹
                {(manualDiscountType === 'PERCENTAGE'
                  ? subtotal * (manualDiscountValue / 100)
                  : manualDiscountValue
                ).toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-base font-black text-[#3C2A21] border-t border-[#EAD8C0]/35 pt-2 mt-2 mb-4">
            <span>Est. Grand Total:</span>
            <span>
              ₹
              {Math.max(
                0,
                Math.round(
                  subtotal -
                    validatedCouponDiscount -
                    (manualDiscountValue > 0
                      ? manualDiscountType === 'PERCENTAGE'
                        ? subtotal * (manualDiscountValue / 100)
                        : manualDiscountValue
                      : 0)
                )
              ).toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCreateOrder}
            disabled={submitting || cart.length === 0}
            className="w-full bg-[#8F6A50] hover:bg-[#3C2A21] text-white py-3 rounded-xl font-bold tracking-wide transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? 'PROCESSING...' : 'SUBMIT POS ORDER'}
          </button>
        </div>
      </div>

      {/* CUSTOMIZE MODAL */}
      {customizingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl text-[#3C2A21]">
            <h3 className="text-lg font-black tracking-tight mb-1">
              Customize: {customizingItem.name}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Specify pricing variations and supplementary addons.
            </p>

            <div className="space-y-4 text-xs">
              {/* Variant selection */}
              {customizingItem.variants.length > 0 && (
                <div>
                  <h4 className="font-bold mb-2">Variation Options</h4>
                  <div className="space-y-2">
                    {customizingItem.variants.map((v) => (
                      <label
                        key={v.id}
                        className={`flex justify-between items-center p-2.5 border rounded-xl cursor-pointer transition ${
                          selectedVariantId === v.id
                            ? 'border-[#8F6A50] bg-[#FAF8F5]'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="variant"
                            value={v.id}
                            checked={selectedVariantId === v.id}
                            onChange={() => setSelectedVariantId(v.id)}
                            className="accent-[#8F6A50]"
                          />
                          <span className="font-bold">{v.name}</span>
                        </div>
                        <span className="font-black text-[#8F6A50]">₹{v.price}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Addons selection */}
              {customizingItem.menuItemAddons.length > 0 && (
                <div>
                  <h4 className="font-bold mb-2">Available Addons</h4>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {customizingItem.menuItemAddons.map((ma) => {
                      const a = ma.addon;
                      const isSelected = selectedAddonIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex justify-between items-center p-2.5 border rounded-xl cursor-pointer transition ${
                            isSelected ? 'border-[#8F6A50] bg-[#FAF8F5]' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedAddonIds(selectedAddonIds.filter((id) => id !== a.id));
                                } else {
                                  setSelectedAddonIds([...selectedAddonIds, a.id]);
                                }
                              }}
                              className="accent-[#8F6A50]"
                            />
                            <span className="font-semibold">{a.name}</span>
                          </div>
                          <span className="font-black text-[#8F6A50]">+₹{a.price}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <h4 className="font-bold mb-1">Kitchen Instruction Notes</h4>
                <input
                  type="text"
                  placeholder="e.g. Extra hot, Less sugar, No ice"
                  className="w-full p-2 border border-[#EAD8C0] rounded-xl focus:outline-none text-xs"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-[#FAF8F5]">
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomized}
                className="flex-1 bg-[#8F6A50] hover:bg-[#3C2A21] text-white py-2.5 rounded-xl font-bold shadow-md"
              >
                Add To Cart
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Available Coupons Selection Modal */}
      {showCouponListModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col justify-between max-h-[85vh]">
            <div className="p-5 border-b border-[#EAD8C0]/10 flex justify-between items-center bg-[#FAF8F5]">
              <div>
                <h3 className="font-extrabold text-base text-[#3C2A21]">Available Coupons</h3>
                <p className="text-[10px] text-[#8F6A50] font-medium mt-0.5">Select a valid promotional coupon for this checkout</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCouponListModal(false)}
                className="text-[#8F6A50] hover:text-[#3C2A21] font-bold text-lg p-2"
              >
                &times;
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              {loadingCoupons ? (
                <div className="text-center py-6 text-[#8F6A50] font-medium text-xs">
                  Checking coupon eligibility...
                </div>
              ) : availableCoupons.length === 0 ? (
                <div className="text-center py-6 text-[#8F6A50] font-medium text-xs">
                  No active coupons found.
                </div>
              ) : (
                availableCoupons.map((c) => {
                  let statusMessage = c.message;
                  let isDisabled = !c.valid;

                  // Safe message if customer is missing for per-cust limit
                  if (!c.valid && c.message === 'Customer registration is required to use this coupon.') {
                    statusMessage = 'Select customer to check eligibility';
                  }

                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all duration-300 ${
                        isDisabled
                          ? 'bg-[#FAF8F5]/60 border-gray-100 opacity-60'
                          : 'bg-white border-[#EAD8C0]/40 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-extrabold tracking-wider bg-[#8F6A50]/5 px-2 py-0.5 rounded text-xs text-[#8F6A50]">
                            {c.code}
                          </span>
                          <h4 className="font-extrabold text-sm text-[#3C2A21] mt-1.5">{c.name}</h4>
                          {c.description && (
                            <p className="text-xs text-[#8F6A50] font-medium mt-0.5">{c.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-black text-[#8F6A50] text-sm block">
                            {c.type === 'FLAT' ? `₹${c.value} Off` : `${c.value}% Off`}
                          </span>
                          <span className="text-[10px] text-[#8F6A50] font-medium block">
                            Min Order: ₹{c.minOrder}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-dashed border-[#EAD8C0]/15">
                        <div className="text-[10px]">
                          {isDisabled ? (
                            <span className="text-rose-500 font-bold">✕ {statusMessage}</span>
                          ) : (
                            <span className="text-emerald-600 font-extrabold">
                              ✓ Eligible (Est: -₹{c.appliedDiscountEstimate.toFixed(2)})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            setCouponCode(c.code);
                            setShowCouponListModal(false);
                            // Run the validate coupon flow immediately
                            setTimeout(() => {
                              const token = localStorage.getItem('ccb_token');
                              const itemsPayload = cart.map((item) => ({
                                menuItemId: item.menuItem.id,
                                variantId: item.variant?.id,
                                addonIds: item.selectedAddons.map((a) => a.id),
                                quantity: item.quantity,
                              }));
                              fetch(`${API_URL}/public/coupons/validate`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                  code: c.code,
                                  items: itemsPayload,
                                  customerPhone: customerPhone.trim() || undefined,
                                }),
                              })
                                .then((r) => r.json())
                                .then((data) => {
                                  if (data.valid) {
                                    setValidatedCouponCode(data.normalizedCode);
                                    setValidatedCouponDiscount(Number(data.appliedDiscountEstimate));
                                    setCouponError('');
                                  } else {
                                    setCouponError(data.message || 'This coupon is not valid.');
                                    setValidatedCouponCode('');
                                    setValidatedCouponDiscount(0);
                                  }
                                });
                            }, 50);
                          }}
                          className="px-3.5 py-1.5 bg-[#8F6A50] hover:bg-[#3C2A21] text-white rounded-xl text-xs font-bold disabled:opacity-40"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-[#EAD8C0]/10 flex justify-end bg-[#FAF8F5]">
              <button
                type="button"
                onClick={() => setShowCouponListModal(false)}
                className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-5 py-2.5 rounded-xl font-bold text-xs"
              >
                Close List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
