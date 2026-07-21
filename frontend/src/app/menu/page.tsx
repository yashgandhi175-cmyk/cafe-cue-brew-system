'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Coffee,
  ShoppingBag,
  Search,
  Plus,
  Minus,
  X,
  ChevronRight,
  Check,
  Loader2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Base API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  image: string | null;
  isVeg: boolean;
  available: boolean;
  popular: boolean;
  recommended: boolean;
  bestSeller: boolean;
  prepTime: number;
  variants: Array<{
    id: string;
    name: string;
    price: string;
    isActive: boolean;
  }>;
  menuItemAddons: Array<{
    addon: {
      id: string;
      name: string;
      price: string;
      isActive: boolean;
    };
  }>;
}

interface Category {
  id: string;
  name: string;
}

interface Banner {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  buttonText: string | null;
  targetType: 'NONE' | 'CATEGORY' | 'MENU_ITEM' | 'CUSTOM';
  targetAction: string | null;
}

interface RestaurantSettings {
  name: string;
  tagline: string;
  requireCustomerName: boolean;
  requireCustomerPhone: boolean;
  enableGst: boolean;
  gstPercentage: number;
  cgstPercentage: number;
  sgstPercentage: number;
  taxInclusivePricing: boolean;
  enableServiceCharge: boolean;
  serviceChargePercentage: number;
  enableNightCharges: boolean;
  nightStart: string;
  nightEnd: string;
  nightChargeType: 'FLAT' | 'PERCENTAGE';
  nightChargeValue: number;
  allowAddons: boolean;
  showOfferCarousel: boolean;
  showUnavailableItems: boolean;
  showVegNonVeg: boolean;
  showPreparationTime: boolean;
  carouselRotationSeconds: number;
  enableCallWaiter: boolean;
  timezone: string;
}

interface CartItem {
  menuItem: MenuItem;
  selectedVariant?: {
    id: string;
    name: string;
    price: string;
  };
  selectedAddons: Array<{
    id: string;
    name: string;
    price: string;
  }>;
  quantity: number;
  notes: string;
}

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

// Handcrafted Modal Component for compile safety and zero dependency overhead
function CustomModal({ isOpen, onClose, title, description, children }: CustomModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-opacity">
      <div className="bg-[#FDFBF7] text-[#5C3A21] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 bg-stone-100 border-b border-stone-200 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-base leading-none text-[#5C3A21]">{title}</h3>
            {description && <p className="text-stone-500 text-xs font-semibold mt-1.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-[#5C3A21]/60 hover:text-[#5C3A21]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MenuPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tableId = searchParams.get('table') || '';
  const token = searchParams.get('token') || '';

  // Core States
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  
  // Settings & Data States
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  
  // Filtering & Search
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showVegOnly, setShowVegOnly] = useState(false);

  // Cart & Customization States
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [activeTrackingToken, setActiveTrackingToken] = useState<string | null>(null);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customVariant, setCustomVariant] = useState<{ id: string; name: string; price: string } | null>(null);
  const [customAddons, setCustomAddons] = useState<Array<{ id: string; name: string; price: string }>>([]);
  const [customQuantity, setCustomQuantity] = useState(1);
  const [customNotes, setCustomNotes] = useState('');

  // Call Waiter States
  const [waiterCallLoading, setWaiterCallLoading] = useState(false);
  const [waiterCallCooldown, setWaiterCallCooldown] = useState(0);
  const [waiterCallMessage, setWaiterCallMessage] = useState<string | null>(null);

  // Carousel State
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);

  // Checkout States
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Coupon States
  interface CouponPromo {
    id: string;
    code: string;
    name: string;
    description: string | null;
    type: 'FLAT' | 'PERCENTAGE';
    value: number;
    minOrder: number;
    maxDiscount: number | null;
  }

  const [couponCode, setCouponCode] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [appliedCouponDiscount, setAppliedCouponDiscount] = useState(0);
  const [couponValidationError, setCouponValidationError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<CouponPromo[]>([]);

  // 300ms Debounce Search Query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // QR Validation on Mount
  useEffect(() => {
    const validateQRAndLoadData = async () => {
      if (!tableId || !token) {
        setValidationError('Invalid QR code context. Please scan a valid table QR code.');
        setIsValidating(false);
        return;
      }

      try {
        // 1. Validate QR Token on Backend
        const valRes = await axios.get(`${API_URL}/public/tables/validate`, {
          params: { tableId, token },
        });
        setTableNumber(valRes.data.tableNumber);
        localStorage.setItem('ccb_last_token', token);

        // 2. Load settings, categories, banners, coupons
        const [settingsRes, categoriesRes, bannersRes, couponsRes] = await Promise.all([
          axios.get(`${API_URL}/public/settings`),
          axios.get(`${API_URL}/public/categories`),
          axios.get(`${API_URL}/public/banners`),
          axios.get(`${API_URL}/public/coupons`),
        ]);

        setSettings(settingsRes.data);
        setCategories(categoriesRes.data);
        setBanners(bannersRes.data);
        setAvailableCoupons(couponsRes.data);
        setIsValidating(false);

        // 3. Setup Idempotency Key
        let currentKey = localStorage.getItem('ccb_idempotency_key');
        if (!currentKey) {
          currentKey = 'idemp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
          localStorage.setItem('ccb_idempotency_key', currentKey);
        }
        setIdempotencyKey(currentKey);

        // Load Persistent Cart scoped to Table ID from Backend (fallback to LocalStorage)
        try {
          const cartRes = await axios.get(`${API_URL}/public/orders/cart/${tableId}`);
          if (cartRes.data && cartRes.data.items && cartRes.data.items.length > 0) {
            const backendCart: { [key: string]: CartItem } = {};
            cartRes.data.items.forEach((item: any) => {
              const addonsList = item.selectedAddons || [];
              const addonIdsStr = addonsList.map((a: any) => a.id).sort().join('-');
              const cartKey = `${item.menuItem.id}_${item.selectedVariant?.id || 'base'}_${addonIdsStr}`;
              backendCart[cartKey] = {
                menuItem: item.menuItem,
                selectedVariant: item.selectedVariant || null,
                selectedAddons: addonsList,
                quantity: item.quantity,
                notes: item.notes || '',
              };
            });
            setCart(backendCart);
            localStorage.setItem(`ccb_cart_${tableId}`, JSON.stringify(backendCart));
          } else {
            const storedCart = localStorage.getItem(`ccb_cart_${tableId}`);
            if (storedCart) {
              try {
                const parsed = JSON.parse(storedCart);
                if (Object.keys(parsed).length > 0) {
                  setCart(parsed);
                  saveCart(parsed);
                }
              } catch {
                // ignore
              }
            }
          }
        } catch {
          const storedCart = localStorage.getItem(`ccb_cart_${tableId}`);
          if (storedCart) {
            try {
              setCart(JSON.parse(storedCart));
            } catch {
              // ignore
            }
          }
        }

        // Load active tracking token for table if any
        try {
          const tokenRes = await axios.get(`${API_URL}/public/orders/active-token/${tableId}`);
          if (tokenRes.data && tokenRes.data.trackingToken) {
            setActiveTrackingToken(tokenRes.data.trackingToken);
            localStorage.setItem(`ccb_active_tracking_token_${tableId}`, tokenRes.data.trackingToken);
            localStorage.setItem('ccb_last_token', tokenRes.data.trackingToken);
          } else {
            const cachedToken = localStorage.getItem(`ccb_active_tracking_token_${tableId}`) || localStorage.getItem('ccb_last_token');
            if (cachedToken) {
              setActiveTrackingToken(cachedToken);
            }
          }
        } catch {
          const cachedToken = localStorage.getItem(`ccb_active_tracking_token_${tableId}`) || localStorage.getItem('ccb_last_token');
          if (cachedToken) {
            setActiveTrackingToken(cachedToken);
          }
        }
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setValidationError(axiosError.response?.data?.message || 'Verification failed. This QR code may be invalid or expired.');
        setIsValidating(false);
      }
    };

    validateQRAndLoadData();
  }, [tableId, token]);

  // Fetch Menu Items when filter/search triggers
  useEffect(() => {
    if (isValidating || validationError) return;

    const fetchMenu = async () => {
      try {
        const params: Record<string, string> = {};
        if (selectedCategoryId) params.categoryId = selectedCategoryId;
        if (debouncedSearch) params.search = debouncedSearch;
        if (showVegOnly) params.veg = 'true';

        const res = await axios.get(`${API_URL}/public/menu`, { params });
        setMenuItems(res.data);
      } catch {
        // ignore errors
      }
    };

    fetchMenu();
  }, [selectedCategoryId, debouncedSearch, showVegOnly, isValidating, validationError]);

  // Banner Carousel Auto-rotation
  useEffect(() => {
    if (banners.length <= 1) return;
    const rotTime = (settings?.carouselRotationSeconds || 5) * 1000;
    const timer = setInterval(() => {
      setActiveBannerIdx((prev) => (prev + 1) % banners.length);
    }, rotTime);
    return () => clearInterval(timer);
  }, [banners, settings]);

  // Waiter Call Cooldown Tracker
  useEffect(() => {
    if (waiterCallCooldown <= 0) return;
    const timer = setInterval(() => {
      setWaiterCallCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [waiterCallCooldown]);

  // Save Cart to LocalStorage and Sync to Backend
  const saveCart = async (newCart: { [key: string]: CartItem }) => {
    setCart(newCart);
    localStorage.setItem(`ccb_cart_${tableId}`, JSON.stringify(newCart));
    try {
      const itemsPayload = Object.values(newCart).map((ci) => ({
        menuItemId: ci.menuItem.id,
        variantId: ci.selectedVariant?.id,
        addonIds: ci.selectedAddons.map((a) => a.id),
        quantity: ci.quantity,
        notes: ci.notes || undefined,
      }));
      await axios.put(`${API_URL}/public/orders/cart/${tableId}`, {
        items: itemsPayload,
      });
    } catch {
      // ignore
    }
  };

  // Add Item Handler
  const handleAddItemClick = (item: MenuItem) => {
    const activeVariants = item.variants.filter((v) => v.isActive);
    const activeAddons = item.menuItemAddons.filter((ma) => ma.addon.isActive);

    if (activeVariants.length > 0 || (activeAddons.length > 0 && settings?.allowAddons)) {
      setCustomizingItem(item);
      setCustomVariant(activeVariants.length > 0 ? activeVariants[0] : null);
      setCustomAddons([]);
      setCustomQuantity(1);
      setCustomNotes('');
    } else {
      // Direct add to cart
      const cartKey = item.id;
      const existing = cart[cartKey];
      const newCart = { ...cart };
      if (existing) {
        newCart[cartKey].quantity += 1;
      } else {
        newCart[cartKey] = {
          menuItem: item,
          selectedAddons: [],
          quantity: 1,
          notes: '',
        };
      }
      saveCart(newCart);
    }
  };

  // Customization Modal Confirm
  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    const cartKey = `${customizingItem.id}_${customVariant?.id || 'base'}_${customAddons.map((a) => a.id).sort().join('-')}`;
    const newCart = { ...cart };

    if (newCart[cartKey]) {
      newCart[cartKey].quantity += customQuantity;
    } else {
      newCart[cartKey] = {
        menuItem: customizingItem,
        selectedVariant: customVariant || undefined,
        selectedAddons: customAddons,
        quantity: customQuantity,
        notes: customNotes,
      };
    }

    saveCart(newCart);
    setCustomizingItem(null);
  };

  // Update Cart Quantity
  const handleUpdateCartQuantity = (key: string, delta: number) => {
    const newCart = { ...cart };
    if (!newCart[key]) return;

    newCart[key].quantity += delta;
    if (newCart[key].quantity <= 0) {
      delete newCart[key];
    }
    saveCart(newCart);
  };

  // Call Waiter Button Action
  const handleCallWaiter = async () => {
    if (waiterCallCooldown > 0) return;
    setWaiterCallLoading(true);
    setWaiterCallMessage(null);

    try {
      const res = await axios.post(`${API_URL}/public/tables/call-waiter`, {
        tableId,
        token,
      });

      setWaiterCallMessage(res.data.message);
      if (res.data.cooldownSeconds > 0) {
        setWaiterCallCooldown(res.data.cooldownSeconds);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setWaiterCallMessage(axiosError.response?.data?.message || 'Failed to request waiter.');
    } finally {
      setWaiterCallLoading(false);
    }
  };

  const handleBannerClick = (b: Banner) => {
    if (b.targetType === 'CATEGORY' && b.targetAction) {
      setSelectedCategoryId(b.targetAction);
    } else if (b.targetType === 'MENU_ITEM' && b.targetAction) {
      const item = menuItems.find((mi) => mi.id === b.targetAction);
      if (item) {
        handleAddItemClick(item);
      }
    }
  };

  // Calculate Cart Estimates
  const calculateCartEstimates = () => {
    let subtotal = 0;
    Object.values(cart).forEach((ci) => {
      const unitPrice = ci.selectedVariant ? Number(ci.selectedVariant.price) : Number(ci.menuItem.basePrice);
      const addonsPrice = ci.selectedAddons.reduce((acc, a) => acc + Number(a.price), 0);
      subtotal += (unitPrice + addonsPrice) * ci.quantity;
    });

    const subtotalRounded = Math.round(subtotal * 100) / 100;
    const discount = appliedCouponDiscount || 0;
    const taxableAmount = Math.max(0, subtotalRounded - discount);

    let cgst = 0;
    let sgst = 0;
    let baseTaxable = taxableAmount;

    if (settings?.enableGst) {
      const gstPercent = Number(settings.gstPercentage);
      const cgstPercent = Number(settings.cgstPercentage);
      const sgstPercent = Number(settings.sgstPercentage);

      if (settings.taxInclusivePricing) {
        cgst = Math.round(((taxableAmount * cgstPercent) / (100 + gstPercent)) * 100) / 100;
        sgst = Math.round(((taxableAmount * sgstPercent) / (100 + gstPercent)) * 100) / 100;
        baseTaxable = Math.round((taxableAmount - (cgst + sgst)) * 100) / 100;
      } else {
        cgst = Math.round((taxableAmount * (cgstPercent / 100)) * 100) / 100;
        sgst = Math.round((taxableAmount * (sgstPercent / 100)) * 100) / 100;
      }
    }

    let serviceCharge = 0;
    if (settings?.enableServiceCharge) {
      serviceCharge = Math.round((baseTaxable * (settings.serviceChargePercentage / 100)) * 100) / 100;
    }

    const nightCharge = 0;

    const grandTotalExact = baseTaxable + cgst + sgst + serviceCharge + nightCharge;
    const grandTotalRounded = Math.round(grandTotalExact);
    const roundOff = Math.round((grandTotalRounded - grandTotalExact) * 100) / 100;

    return {
      subtotal: subtotalRounded,
      discount,
      cgst,
      sgst,
      serviceCharge,
      roundOff,
      grandTotal: grandTotalRounded,
    };
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    setCouponValidationError(null);

    const itemsPayload = Object.values(cart).map((ci) => ({
      menuItemId: ci.menuItem.id,
      variantId: ci.selectedVariant?.id || undefined,
      addonIds: ci.selectedAddons.map((a) => a.id),
      quantity: ci.quantity,
    }));

    try {
      const res = await axios.post(`${API_URL}/public/coupons/validate`, {
        code: couponCode.trim().toUpperCase(),
        customerId: null,
        items: itemsPayload,
      });

      if (res.data.valid) {
        setAppliedCouponCode(couponCode.trim().toUpperCase());
        setAppliedCouponDiscount(res.data.appliedDiscountEstimate);
        setCouponValidationError(null);
      } else {
        setCouponValidationError(res.data.message || 'This coupon code is invalid.');
        setAppliedCouponCode('');
        setAppliedCouponDiscount(0);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setCouponValidationError(axiosError.response?.data?.message || 'Failed to validate coupon.');
      setAppliedCouponCode('');
      setAppliedCouponDiscount(0);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setAppliedCouponCode('');
    setAppliedCouponDiscount(0);
    setCouponValidationError(null);
  };

  // Checkout Handler
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(cart).length === 0) return;

    if (settings?.requireCustomerName && !customerName.trim()) {
      setCheckoutError('Please enter your name.');
      return;
    }
    if (settings?.requireCustomerPhone && !customerPhone.trim()) {
      setCheckoutError('Please enter your mobile number.');
      return;
    }

    setIsSubmittingOrder(true);
    setCheckoutError(null);

    const itemsPayload = Object.values(cart).map((ci) => ({
      menuItemId: ci.menuItem.id,
      variantId: ci.selectedVariant?.id || undefined,
      addonIds: ci.selectedAddons.map((a) => a.id),
      quantity: ci.quantity,
      notes: ci.notes || undefined,
    }));

    try {
      const res = await axios.post(`${API_URL}/public/orders`, {
        tableId,
        token,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        marketingConsent,
        items: itemsPayload,
        idempotencyKey,
        couponCode: appliedCouponCode || undefined,
      });

      // Clear Cart on successful checkout
      setCart({});
      localStorage.removeItem(`ccb_cart_${tableId}`);
      handleRemoveCoupon();

      // Rotate Idempotency Key for future checkouts
      const newKey = 'idemp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('ccb_idempotency_key', newKey);
      setIdempotencyKey(newKey);

      setCheckoutOpen(false);

      if (res.data?.publicTrackingToken) {
        setActiveTrackingToken(res.data.publicTrackingToken);
        localStorage.setItem(`ccb_active_tracking_token_${tableId}`, res.data.publicTrackingToken);
        localStorage.setItem('ccb_last_token', res.data.publicTrackingToken);
      }

      router.push(`/menu/track.html?token=${res.data.publicTrackingToken}`);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setCheckoutError(axiosError.response?.data?.message || 'Failed to submit order. Please try again.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-[#5C3A21] animate-spin mb-4" />
        <h2 className="text-[#5C3A21] font-semibold text-lg">Verifying table context...</h2>
        <p className="text-stone-500 text-sm mt-1">Cafe Cue & Brew Restaurant Management System</p>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-red-700 mb-2">Invalid Table Access</h1>
        <p className="text-stone-600 text-sm mb-6 max-w-sm">{validationError}</p>
        <div className="bg-stone-100 p-4 rounded-lg text-left text-stone-500 text-xs w-full max-w-sm">
          <p className="font-semibold text-stone-700 mb-1">How to access digital menu:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Scan the physical QR code sticker placed on your table.</li>
            <li>Ensure the URL contains correct table ID & secure token credentials.</li>
            <li>Do not modify table parameter query keys manually.</li>
          </ul>
        </div>
      </div>
    );
  }

  const totals = calculateCartEstimates();
  const activeBanners = banners;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#5C3A21] max-w-md mx-auto shadow-xl relative pb-24">
      {/* Header Banner */}
      <header className="sticky top-0 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-stone-200/80 p-4 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#5C3A21] rounded-full flex items-center justify-center shadow-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-none text-[#5C3A21]">Cafe Cue & Brew</h1>
            <p className="text-stone-500 text-xs font-medium mt-1">Dining at <span className="text-[#A0522D] font-bold">{tableNumber}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTrackingToken && (
            <Button
              size="sm"
              onClick={() => router.push(`/menu/track.html?token=${activeTrackingToken}`)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-full shadow-sm text-xs px-3 h-8 flex items-center gap-1.5 animate-pulse"
              title="Track your active dining order"
            >
              <Clock className="w-3.5 h-3.5 text-white" />
              <span>Track Order</span>
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => setCartModalOpen(true)}
            className="bg-[#5C3A21] hover:bg-[#A0522D] text-white font-bold rounded-full shadow-sm text-xs px-3 h-8 flex items-center gap-1.5 relative"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Cart ({Object.values(cart).reduce((acc, ci) => acc + ci.quantity, 0)})</span>
          </Button>

          {settings?.enableCallWaiter && (
            <Button
              size="sm"
              onClick={handleCallWaiter}
              disabled={waiterCallLoading || waiterCallCooldown > 0}
              className="bg-[#A0522D] hover:bg-[#5C3A21] text-white font-semibold rounded-full shadow-sm text-xs px-3 h-8 flex items-center gap-1.5"
            >
              {waiterCallLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : waiterCallCooldown > 0 ? (
                <span>Waiter ({waiterCallCooldown}s)</span>
              ) : (
                <>
                  <Flame className="w-3.5 h-3.5 fill-amber-300 animate-pulse text-amber-300" />
                  <span>Call Waiter</span>
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Alert message for Waiter calls */}
      {waiterCallMessage && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-[#5C3A21] text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{waiterCallMessage}</span>
          <button onClick={() => setWaiterCallMessage(null)} className="text-stone-400 hover:text-stone-600">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      )}

      {/* Offer Banner Carousel */}
      {settings?.showOfferCarousel && activeBanners.length > 0 && (
        <div
          onClick={() => handleBannerClick(activeBanners[activeBannerIdx])}
          className="mx-4 mt-4 relative rounded-2xl overflow-hidden aspect-[21/9] shadow-md bg-stone-900 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <img
            src={activeBanners[activeBannerIdx].imageUrl}
            alt={activeBanners[activeBannerIdx].title}
            className="w-full h-full object-cover opacity-90 transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent to-transparent flex flex-col justify-end p-4">
            <h3 className="text-white font-bold text-sm leading-tight drop-shadow-sm">{activeBanners[activeBannerIdx].title}</h3>
            {activeBanners[activeBannerIdx].description && (
              <p className="text-stone-200 text-xs mt-0.5 font-medium drop-shadow-xs">{activeBanners[activeBannerIdx].description}</p>
            )}
          </div>
          
          {/* Carousel Dots */}
          {activeBanners.length > 1 && (
            <div className="absolute top-3 right-3 flex gap-1.5 bg-black/35 px-2 py-1 rounded-full">
              {activeBanners.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    idx === activeBannerIdx ? 'bg-white scale-110' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Veg Filter */}
      <div className="p-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-3 text-stone-400" />
          <input
            type="text"
            placeholder="Search our delicious menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-stone-100 rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-[#A0522D] text-[#5C3A21] placeholder-stone-400 text-sm font-medium"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {settings?.showVegNonVeg && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowVegOnly(!showVegOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                showVegOnly
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className="w-2.5 h-2.5 border border-emerald-600 rounded-sm flex items-center justify-center p-0.5">
                <span className="w-full h-full bg-emerald-600 rounded-full" />
              </span>
              Veg Only
            </button>
          </div>
        )}
      </div>

      {/* Featured Recommendations Section (Only when no search query is active) */}
      {!searchQuery && !selectedCategoryId && (
        <>
          {/* Featured Section */}
          {menuItems.filter(item => item.recommended && item.available).length > 0 && (
            <div className="py-4 border-b border-stone-100 bg-[#FAF8F5]/45">
              <h3 className="px-4 text-xs font-black uppercase tracking-wider text-[#A0522D] mb-3 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 fill-[#A0522D] text-[#A0522D]" />
                Chef's Rooftop Specials
              </h3>
              <div className="flex gap-4 overflow-x-auto no-scrollbar px-4">
                {menuItems.filter(item => item.recommended && item.available).map((item) => {
                  const hasVariants = item.variants.filter((v) => v.isActive).length > 0;
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-stone-200/60 p-3 rounded-2xl flex flex-col justify-between shadow-xs shrink-0 w-44 hover:shadow-md transition-shadow relative"
                    >
                      {/* Veg/Non-Veg Badge */}
                      {settings?.showVegNonVeg && (
                        <span
                          className={`absolute top-3 left-3 w-4 h-4 border rounded-sm flex items-center justify-center p-0.5 z-10 bg-white ${
                            item.isVeg ? 'border-emerald-600' : 'border-red-600'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                        </span>
                      )}
                      
                      <div className="w-full h-24 rounded-xl overflow-hidden bg-stone-100 relative mb-2">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#5C3A21] bg-[#FAF8F5]">
                            <Coffee className="w-6 h-6 opacity-35" />
                          </div>
                        )}
                      </div>
                      
                      <div className="min-w-0 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-xs text-[#5C3A21] truncate">{item.name}</h4>
                          <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">{item.description || 'Cafe Special'}</p>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-[#A0522D] font-extrabold text-xs">
                            ₹{hasVariants ? `${item.variants.filter((v) => v.isActive)[0].price}+` : item.basePrice}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleAddItemClick(item)}
                            className="bg-[#FDFBF7] hover:bg-[#5C3A21]/5 text-[#A0522D] hover:text-[#5C3A21] border border-[#A0522D]/40 font-bold text-[10px] px-2.5 h-6 rounded-full flex items-center gap-0.5 shadow-sm shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Popular Section */}
          {menuItems.filter(item => item.popular && item.available).length > 0 && (
            <div className="py-4 border-b border-stone-100">
              <h3 className="px-4 text-xs font-black uppercase tracking-wider text-[#A0522D] mb-3 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 fill-[#A0522D] text-[#A0522D]" />
                Trending & Popular
              </h3>
              <div className="flex gap-4 overflow-x-auto no-scrollbar px-4">
                {menuItems.filter(item => item.popular && item.available).map((item) => {
                  const hasVariants = item.variants.filter((v) => v.isActive).length > 0;
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-stone-200/60 p-3 rounded-2xl flex flex-col justify-between shadow-xs shrink-0 w-36 hover:shadow-md transition-shadow relative"
                    >
                      {/* Veg/Non-Veg Badge */}
                      {settings?.showVegNonVeg && (
                        <span
                          className={`absolute top-3 left-3 w-4 h-4 border rounded-sm flex items-center justify-center p-0.5 z-10 bg-white ${
                            item.isVeg ? 'border-emerald-600' : 'border-red-600'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                        </span>
                      )}

                      <div className="min-w-0 flex-1 flex flex-col justify-between">
                        <div className="mb-2">
                          <h4 className="font-bold text-xs text-[#5C3A21] truncate">{item.name}</h4>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider mt-1.5 inline-block">Popular</span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[#A0522D] font-extrabold text-xs">
                            ₹{hasVariants ? `${item.variants.filter((v) => v.isActive)[0].price}+` : item.basePrice}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleAddItemClick(item)}
                            className="bg-[#FDFBF7] hover:bg-[#5C3A21]/5 text-[#A0522D] hover:text-[#5C3A21] border border-[#A0522D]/40 font-bold text-[10px] px-2 h-6 rounded-full flex items-center gap-0.5 shadow-sm shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Categories Horizontal scrollbar */}
      <div className="sticky top-[72px] bg-[#FDFBF7]/95 backdrop-blur-md px-4 pb-2 border-b border-stone-100 z-30 shadow-xs">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategoryId === null
                ? 'bg-[#5C3A21] text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            All Menu
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategoryId === cat.id
                  ? 'bg-[#5C3A21] text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items List */}
      <div className="p-4 space-y-4">
        {menuItems.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-stone-400 font-semibold text-sm">No items found matching filter criteria.</p>
          </div>
        ) : (
          menuItems.map((item) => {
            const hasVariants = item.variants.filter((v) => v.isActive).length > 0;
            const isAvailable = item.available;

            if (!isAvailable && !settings?.showUnavailableItems) {
              return null;
            }

            return (
              <div
                key={item.id}
                className={`bg-white border border-stone-200/60 p-3 rounded-2xl flex gap-3 shadow-xs relative ${
                  !isAvailable ? 'opacity-65' : ''
                }`}
              >
                {/* Veg Tag */}
                {settings?.showVegNonVeg && (
                  <span
                    className={`absolute top-3 left-3 w-4 h-4 border rounded-sm flex items-center justify-center p-0.5 z-10 bg-white ${
                      item.isVeg ? 'border-emerald-600' : 'border-red-600'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                  </span>
                )}

                {/* Item Image */}
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-stone-100 relative shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#5C3A21] bg-stone-100">
                      <Coffee className="w-8 h-8 opacity-45" />
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex flex-col justify-between flex-1 min-w-0">
                  <div>
                    <div className="flex items-start gap-1">
                      <h4 className="font-bold text-sm text-[#5C3A21] truncate">{item.name}</h4>
                      {item.bestSeller && (
                        <span className="bg-amber-100 border border-amber-300 text-amber-800 text-[9px] font-black px-1 py-0.5 rounded-sm shrink-0 uppercase leading-none">
                          Best Seller
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-stone-500 text-xs mt-1 leading-tight line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[#A0522D] font-extrabold text-sm">
                        ₹{hasVariants ? `${item.variants.filter((v) => v.isActive)[0].price}+` : item.basePrice}
                      </span>
                      {settings?.showPreparationTime && item.prepTime > 0 && (
                        <span className="text-stone-400 text-[10px] font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.prepTime} mins
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add to Cart Actions */}
                  <div className="flex justify-end mt-2">
                    {!isAvailable ? (
                      <span className="text-stone-400 font-bold text-xs py-1 px-3 border border-stone-200 rounded-full bg-stone-50 uppercase leading-none mt-1">
                        Out of Stock
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAddItemClick(item)}
                        className="bg-[#FDFBF7] hover:bg-[#5C3A21]/5 text-[#A0522D] hover:text-[#5C3A21] border border-[#A0522D]/40 font-bold text-xs px-4 h-7 rounded-full flex items-center gap-1 shadow-sm shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Cart Button/Bar */}
      {Object.keys(cart).length > 0 && (
        <div
          onClick={() => setCartModalOpen(true)}
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#FDFBF7] border-t border-stone-200 shadow-2xl p-4 z-40 flex items-center justify-between pb-6 cursor-pointer hover:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#5C3A21] rounded-full flex items-center justify-center text-white relative shadow-md">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-1.5 -right-1.5 bg-[#A0522D] text-white font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border border-white">
                {Object.values(cart).reduce((acc, ci) => acc + ci.quantity, 0)}
              </span>
            </div>
            <div>
              <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Review Cart</p>
              <p className="text-[#A0522D] font-black text-sm">₹{totals.grandTotal}</p>
            </div>
          </div>

          <Button
            onClick={(e) => {
              e.stopPropagation();
              setCartModalOpen(true);
            }}
            className="bg-[#5C3A21] hover:bg-[#A0522D] text-white font-bold px-5 py-2 rounded-full flex items-center gap-1.5 shadow-lg"
          >
            <span>🛒 Cart ({Object.values(cart).reduce((acc, ci) => acc + ci.quantity, 0)})</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Cart Review CustomModal */}
      {cartModalOpen && (
        <CustomModal
          isOpen={true}
          onClose={() => setCartModalOpen(false)}
          title="Review Your Cart"
          description="Manage quantities or checkout"
        >
          <div className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
            {Object.keys(cart).length === 0 ? (
              <p className="text-stone-500 text-center py-6 font-semibold">Your cart is empty.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {Object.entries(cart).map(([key, ci]) => {
                  const itemUnit = ci.selectedVariant ? Number(ci.selectedVariant.price) : Number(ci.menuItem.basePrice);
                  const itemAddon = ci.selectedAddons.reduce((acc, a) => acc + Number(a.price), 0);
                  return (
                    <div key={key} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-800 truncate">{ci.menuItem.name}</p>
                        {ci.selectedVariant && (
                          <p className="text-stone-400 text-[10px] font-bold mt-0.5">Size: {ci.selectedVariant.name}</p>
                        )}
                        {ci.selectedAddons.length > 0 && (
                          <p className="text-[#A0522D] text-[10px] font-semibold mt-0.5">
                            Addons: {ci.selectedAddons.map((a) => a.name).join(', ')}
                          </p>
                        )}
                        {ci.notes && (
                          <p className="text-stone-400 text-[10px] italic mt-0.5">Note: "{ci.notes}"</p>
                        )}
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-2 bg-stone-50 rounded-full border px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(key, -1)}
                          className="text-stone-400 hover:text-stone-600 p-1"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-stone-700 w-4 text-center">{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(key, 1)}
                          className="text-[#A0522D] hover:text-[#5C3A21] p-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="font-extrabold text-stone-800 shrink-0">₹{(itemUnit + itemAddon) * ci.quantity}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-stone-200 flex justify-between items-center">
              <span className="font-bold text-[#5C3A21]">Estimated Total:</span>
              <span className="font-black text-lg text-[#A0522D]">₹{totals.grandTotal}</span>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCartModalOpen(false)}
                className="flex-1 rounded-full border-stone-300 font-bold"
              >
                Continue
              </Button>
              <Button
                disabled={Object.keys(cart).length === 0}
                onClick={() => {
                  setCartModalOpen(false);
                  setCheckoutOpen(true);
                }}
                className="flex-1 bg-[#5C3A21] hover:bg-[#A0522D] text-white rounded-full font-bold shadow-md"
              >
                Checkout
              </Button>
            </div>
          </div>
        </CustomModal>
      )}

      {/* Customization CustomModal */}
      {customizingItem && (
        <CustomModal
          isOpen={true}
          onClose={() => setCustomizingItem(null)}
          title={customizingItem.name}
          description="Customize your item selections"
        >
          {/* Customization Options */}
          <div className="p-4 max-h-96 overflow-y-auto space-y-4">
            {/* Variants (Single Choice) */}
            {customizingItem.variants.filter((v) => v.isActive).length > 0 && (
              <div>
                <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D] mb-2">Select Variant (Required)</h4>
                <div className="space-y-2">
                  {customizingItem.variants.filter((v) => v.isActive).map((variant) => (
                    <label
                      key={variant.id}
                      onClick={() => setCustomVariant(variant)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                        customVariant?.id === variant.id
                          ? 'bg-stone-100 border-[#5C3A21]'
                          : 'bg-white border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <span>{variant.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#A0522D] font-bold">₹{variant.price}</span>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          customVariant?.id === variant.id ? 'bg-[#5C3A21] border-[#5C3A21]' : 'border-stone-300 bg-white'
                        }`}>
                          {customVariant?.id === variant.id && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Addons (Multiple Choices) */}
            {settings?.allowAddons && customizingItem.menuItemAddons.filter((ma) => ma.addon.isActive).length > 0 && (
              <div>
                <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D] mb-2">Optional Add-ons</h4>
                <div className="space-y-2">
                  {customizingItem.menuItemAddons.filter((ma) => ma.addon.isActive).map((mapping) => {
                    const isSelected = customAddons.some((a) => a.id === mapping.addon.id);
                    const toggleAddon = () => {
                      if (isSelected) {
                        setCustomAddons(customAddons.filter((a) => a.id !== mapping.addon.id));
                      } else {
                        setCustomAddons([...customAddons, { id: mapping.addon.id, name: mapping.addon.name, price: mapping.addon.price }]);
                      }
                    };
                    return (
                      <label
                        key={mapping.addon.id}
                        onClick={toggleAddon}
                        className={`flex items-center justify-between p-3 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                          isSelected ? 'bg-stone-100 border-[#5C3A21]' : 'bg-white border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <span>{mapping.addon.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500 font-bold">+₹{mapping.addon.price}</span>
                          <div className={`w-4.5 h-4.5 border rounded-md flex items-center justify-center ${
                            isSelected ? 'bg-[#5C3A21] border-[#5C3A21]' : 'border-stone-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Instructions */}
            <div>
              <h4 className="font-black text-xs uppercase tracking-wider text-[#A0522D] mb-1.5">Special Instructions</h4>
              <textarea
                placeholder="E.g., extra spicy, no ice, sugar-free..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className="w-full p-3 bg-stone-100 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#A0522D]"
                rows={2}
              />
            </div>
          </div>

          {/* Customization Footer */}
          <div className="p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between">
            {/* Quantity Controls */}
            <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-full px-3 py-1.5 shadow-sm">
              <button
                onClick={() => setCustomQuantity(Math.max(1, customQuantity - 1))}
                className="text-stone-400 hover:text-stone-600 disabled:opacity-40"
                disabled={customQuantity <= 1}
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-bold text-sm text-stone-800 w-5 text-center">{customQuantity}</span>
              <button
                onClick={() => setCustomQuantity(customQuantity + 1)}
                className="text-[#A0522D] hover:text-[#5C3A21]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Confirm Button */}
            <Button
              onClick={handleConfirmCustomization}
              className="bg-[#5C3A21] hover:bg-[#A0522D] text-white font-bold px-6 py-2.5 rounded-full shadow-md"
            >
              Add to Cart • ₹
              {roundToTwo(
                ((customVariant ? Number(customVariant.price) : Number(customizingItem.basePrice)) +
                  customAddons.reduce((acc, a) => acc + Number(a.price), 0)) *
                  customQuantity
              )}
            </Button>
          </div>
        </CustomModal>
      )}

      {/* Checkout CustomModal */}
      {checkoutOpen && (
        <CustomModal
          isOpen={true}
          onClose={() => setCheckoutOpen(false)}
          title="Checkout Order"
          description="Submit your order details to proceed"
        >
          <form onSubmit={handlePlaceOrder} className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
            {checkoutError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2.5 rounded-lg">
                {checkoutError}
              </div>
            )}

            {/* Customer Contact */}
            <div className="space-y-3 bg-white border border-stone-200/70 p-3.5 rounded-xl shadow-xs">
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#A0522D]">Customer Information</h4>
              
              {settings?.requireCustomerName && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-stone-400 text-xs font-semibold">Your Name *</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    className="p-2.5 bg-stone-100 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#A0522D]"
                  />
                </div>
              )}

              {settings?.requireCustomerPhone && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-stone-400 text-xs font-semibold">Mobile Number *</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                    className="p-2.5 bg-stone-100 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#A0522D]"
                  />
                </div>
              )}

              <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="w-4 h-4 accent-[#A0522D] border-stone-300 rounded-sm mt-0.5"
                />
                <span className="text-stone-500 text-xs leading-snug font-medium">
                  Send me offers, discounts and news updates over WhatsApp/Email.
                </span>
              </label>
            </div>

            {/* Cart Summary */}
            <div className="space-y-3 bg-white border border-stone-200/70 p-3.5 rounded-xl shadow-xs">
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#A0522D]">Item Summary</h4>
              <div className="divide-y divide-stone-100 max-h-36 overflow-y-auto">
                {Object.entries(cart).map(([key, ci]) => {
                  const itemUnit = ci.selectedVariant ? Number(ci.selectedVariant.price) : Number(ci.menuItem.basePrice);
                  const itemAddon = ci.selectedAddons.reduce((acc, a) => acc + Number(a.price), 0);
                  return (
                    <div key={key} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-800 truncate">{ci.menuItem.name}</p>
                        {ci.selectedVariant && (
                          <p className="text-stone-400 text-[10px] font-bold mt-0.5">Size: {ci.selectedVariant.name}</p>
                        )}
                        {ci.selectedAddons.length > 0 && (
                          <p className="text-[#A0522D] text-[10px] font-semibold mt-0.5">
                            Addons: {ci.selectedAddons.map((a) => a.name).join(', ')}
                          </p>
                        )}
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-2 bg-stone-50 rounded-full border px-2 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(key, -1)}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-extrabold text-stone-700 w-4 text-center">{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(key, 1)}
                          className="text-[#A0522D] hover:text-[#5C3A21]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="font-extrabold text-stone-800 shrink-0">₹{(itemUnit + itemAddon) * ci.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coupon Application Panel */}
            <div className="space-y-3 bg-white border border-stone-200/70 p-3.5 rounded-xl shadow-xs">
              <h4 className="font-bold text-xs uppercase tracking-wider text-[#A0522D]">Apply Coupon</h4>
              
              {appliedCouponCode ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-xs">
                  <div>
                    <span className="font-extrabold tracking-wider">{appliedCouponCode}</span> Applied
                    <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Discount: -₹{appliedCouponDiscount.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-emerald-700 hover:text-emerald-900 font-bold"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter promo code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1 p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs uppercase tracking-wider font-semibold focus:outline-none focus:ring-1 focus:ring-[#A0522D]"
                    />
                    <button
                      type="button"
                      onClick={handleValidateCoupon}
                      disabled={isValidatingCoupon || !couponCode.trim()}
                      className="bg-[#5C3A21] hover:bg-[#A0522D] text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-40"
                    >
                      {isValidatingCoupon ? '...' : 'Apply'}
                    </button>
                  </div>
                  {couponValidationError && (
                    <p className="text-red-600 text-[10px] font-semibold">{couponValidationError}</p>
                  )}

                  {/* List of available promotions if any exist */}
                  {availableCoupons.length > 0 && (
                    <div className="pt-1.5 space-y-1.5 border-t border-stone-100">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase">Available Offers</p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {availableCoupons.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCouponCode(c.code);
                              // Validate it immediately!
                              setTimeout(async () => {
                                setIsValidatingCoupon(true);
                                setCouponValidationError(null);
                                const itemsPayload = Object.values(cart).map((ci) => ({
                                  menuItemId: ci.menuItem.id,
                                  variantId: ci.selectedVariant?.id || undefined,
                                  addonIds: ci.selectedAddons.map((a) => a.id),
                                  quantity: ci.quantity,
                                }));
                                try {
                                  const res = await axios.post(`${API_URL}/public/coupons/validate`, {
                                    code: c.code,
                                    customerId: null,
                                    items: itemsPayload,
                                  });
                                  if (res.data.valid) {
                                    setAppliedCouponCode(c.code);
                                    setAppliedCouponDiscount(res.data.appliedDiscountEstimate);
                                  } else {
                                    setCouponValidationError(res.data.message || 'Coupon not valid for these items.');
                                  }
                                } catch (err: unknown) {
                                  const axiosError = err as { response?: { data?: { message?: string } } };
                                  setCouponValidationError(axiosError.response?.data?.message || 'Failed validation.');
                                } finally {
                                  setIsValidatingCoupon(false);
                                }
                              }, 0);
                            }}
                            className="w-full text-left p-1.5 hover:bg-stone-50 border border-dashed border-stone-200 rounded-lg flex items-center justify-between text-[11px]"
                          >
                            <div className="truncate">
                              <span className="font-extrabold text-[#A0522D] tracking-wider bg-[#A0522D]/5 px-1.5 py-0.5 rounded mr-1.5">{c.code}</span>
                              <span className="font-medium text-stone-600 truncate">{c.name}</span>
                            </div>
                            <span className="font-bold text-stone-500 shrink-0 ml-2">Min: ₹{c.minOrder}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Estimates Total Box */}
            <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2 text-xs font-semibold text-stone-500">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-stone-800">₹{totals.subtotal}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold animate-pulse">
                  <span>Coupon Discount</span>
                  <span>-₹{totals.discount}</span>
                </div>
              )}
              {settings?.enableGst && (
                <>
                  <div className="flex justify-between">
                    <span>CGST ({settings.cgstPercentage}%)</span>
                    <span className="text-stone-800">₹{totals.cgst}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST ({settings.sgstPercentage}%)</span>
                    <span className="text-stone-800">₹{totals.sgst}</span>
                  </div>
                </>
              )}
              {settings?.enableServiceCharge && (
                <div className="flex justify-between">
                  <span>Service Charge ({settings.serviceChargePercentage}%)</span>
                  <span className="text-stone-800">₹{totals.serviceCharge}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Round Off</span>
                <span className="text-stone-800">₹{totals.roundOff}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-stone-200/70 pt-2 text-[#5C3A21]">
                <span>Grand Total</span>
                <span className="text-[#A0522D]">₹{totals.grandTotal}</span>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="pt-2 flex gap-3">
              <Button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2.5 rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingOrder}
                className="flex-1 bg-[#5C3A21] hover:bg-[#A0522D] text-white font-bold py-2.5 rounded-full shadow-md flex items-center justify-center gap-1.5"
              >
                {isSubmittingOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Placing Order...</span>
                  </>
                ) : (
                  <>
                    <span>Place Order</span>
                    <ArrowRight className="w-4.5 h-4.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CustomModal>
      )}
    </div>
  );
}

// Utility rounding helper
function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export default function MenuPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-[#5C3A21] animate-spin mb-4" />
        <h2 className="text-[#5C3A21] font-semibold text-lg font-mono">Loading digital menu...</h2>
      </div>
    }>
      <MenuPageContent />
    </Suspense>
  );
}
