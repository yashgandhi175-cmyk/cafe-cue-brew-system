'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl } from '@/lib/api';
import { Utensils, Plus, Edit2, ToggleLeft, ToggleRight, Camera, Loader2, Search, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Category {
  id: string;
  name: string;
}

interface Addon {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface MenuVariant {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface MenuItemAddon {
  addonId: string;
  addon: Addon;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  image: string | null;
  basePrice: number;
  isVeg: boolean;
  available: boolean;
  popular: boolean;
  recommended: boolean;
  bestSeller: boolean;
  prepTime: number | null;
  displayOrder: number;
  isActive: boolean;
  category: Category;
  variants: MenuVariant[];
  menuItemAddons: MenuItemAddon[];
}

export default function MenuPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'items' | 'addons'>('items');
  const [itemSearch, setItemSearch] = useState('');
  const [addonSearch, setAddonSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // Dialog Modals
  const [isItemOpen, setIsItemOpen] = useState(false);
  const [isAddonOpen, setIsAddonOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editAddonId, setEditAddonId] = useState<string | null>(null);

  // Addon Form State
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState(0);
  const [addonError, setAddonError] = useState('');

  // MenuItem Form State
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemCatId, setItemCatId] = useState('');
  const [itemBasePrice, setItemBasePrice] = useState(0);
  const [itemIsVeg, setItemIsVeg] = useState(true);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemPrepTime, setItemPrepTime] = useState(0);
  const [itemDisplayOrder, setItemDisplayOrder] = useState(0);
  const [itemPopular, setItemPopular] = useState(false);
  const [itemRecommended, setItemRecommended] = useState(false);
  const [itemBestSeller, setItemBestSeller] = useState(false);
  const [itemImagePath, setItemImagePath] = useState('');
  
  // Custom arrays for MenuItem Form
  const [formVariants, setFormVariants] = useState<Array<{ name: string; price: number }>>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  
  const [imageUploading, setImageUploading] = useState(false);
  const [itemError, setItemError] = useState('');

  // Bulk Update State
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('all');
  const [bulkUpdateType, setBulkUpdateType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [bulkAction, setBulkAction] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [bulkValue, setBulkValue] = useState(0);
  const [bulkError, setBulkError] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // 1. Fetch Categories for select dropdown
  const { data: categories } = useQuery<Category[]>({
    queryKey: ['menuCategories'],
    queryFn: async () => {
      const response = await api.get('/categories');
      return response.data;
    },
  });

  // 2. Fetch Addons
  const { data: addons, isLoading: addonsLoading } = useQuery<Addon[]>({
    queryKey: ['menuAddons'],
    queryFn: async () => {
      const response = await api.get('/menu/addons?all=true');
      return response.data;
    },
  });

  // 3. Fetch Menu Items
  const { data: menuItems, isLoading: itemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menuItems'],
    queryFn: async () => {
      const response = await api.get('/menu/items?all=true');
      return response.data;
    },
  });

  // ==========================================
  // ADDONS MUTATIONS
  // ==========================================

  const createAddonMutation = useMutation({
    mutationFn: async (payload: { name: string; price: number }) => {
      return api.post('/menu/addons', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuAddons'] });
      closeAddonDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setAddonError(axiosError.response?.data?.message || 'Failed to create addon');
    },
  });

  const updateAddonMutation = useMutation({
    mutationFn: async (payload: { id: string; name?: string; price?: number; isActive?: boolean }) => {
      const { id, ...data } = payload;
      return api.put(`/menu/addons/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuAddons'] });
      closeAddonDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setAddonError(axiosError.response?.data?.message || 'Failed to update addon');
    },
  });

  const toggleAddonActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/menu/addons/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuAddons'] });
    },
  });

  // ==========================================
  // MENU ITEMS MUTATIONS
  // ==========================================

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setImageUploading(true);
    setItemError('');

    const formData = new FormData();
    formData.append('file', files[0]);

    try {
      const response = await api.post('/uploads?folder=menu', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setItemImagePath(response.data.filePath);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setItemError(axiosError.response?.data?.message || 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const createItemMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/menu/items', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      closeItemDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setItemError(axiosError.response?.data?.message || 'Failed to create menu item');
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) => {
      return api.put(`/menu/items/${payload.id}`, payload.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      closeItemDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setItemError(axiosError.response?.data?.message || 'Failed to update menu item');
    },
  });

  const toggleItemActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/menu/items/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
  });

  // ==========================================
  // VIEW TRIGGERS
  // ==========================================

  const openCreateAddon = () => {
    setEditAddonId(null);
    setAddonName('');
    setAddonPrice(0);
    setAddonError('');
    setIsAddonOpen(true);
  };

  const openEditAddon = (addon: Addon) => {
    setEditAddonId(addon.id);
    setAddonName(addon.name);
    setAddonPrice(addon.price);
    setAddonError('');
    setIsAddonOpen(true);
  };

  const closeAddonDialog = () => {
    setIsAddonOpen(false);
    setEditAddonId(null);
  };

  const openCreateItem = () => {
    setEditItemId(null);
    setItemName('');
    setItemDesc('');
    setItemCatId(categories && categories.length > 0 ? categories[0].id : '');
    setItemBasePrice(0);
    setItemIsVeg(true);
    setItemAvailable(true);
    setItemPrepTime(10);
    setItemDisplayOrder(menuItems ? menuItems.length : 0);
    setItemPopular(false);
    setItemRecommended(false);
    setItemBestSeller(false);
    setItemImagePath('');
    setFormVariants([]);
    setSelectedAddonIds([]);
    setItemError('');
    setIsItemOpen(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditItemId(item.id);
    setItemName(item.name);
    setItemDesc(item.description || '');
    setItemCatId(item.categoryId);
    setItemBasePrice(Number(item.basePrice));
    setItemIsVeg(item.isVeg);
    setItemAvailable(item.available);
    setItemPrepTime(item.prepTime || 10);
    setItemDisplayOrder(item.displayOrder);
    setItemPopular(item.popular);
    setItemRecommended(item.recommended);
    setItemBestSeller(item.bestSeller);
    setItemImagePath(item.image || '');
    setFormVariants(item.variants.filter(v => v.isActive).map(v => ({ name: v.name, price: Number(v.price) })));
    setSelectedAddonIds(item.menuItemAddons.map(ma => ma.addonId));
    setItemError('');
    setIsItemOpen(true);
  };

  const closeItemDialog = () => {
    setIsItemOpen(false);
    setEditItemId(null);
  };

  // ==========================================
  // HELPERS
  // ==========================================

  const addVariantField = () => {
    setFormVariants((prev) => [...prev, { name: '', price: 0 }]);
  };

  const removeVariantField = (index: number) => {
    setFormVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVariantChange = (index: number, key: 'name' | 'price', value: string | number) => {
    setFormVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [key]: key === 'price' ? Number(value) : value } : v))
    );
  };

  const handleAddonClick = (addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleAddonSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addonName.trim()) {
      setAddonError('Addon name is required');
      return;
    }

    const payload = {
      name: addonName.trim(),
      price: Number(addonPrice),
    };

    if (editAddonId) {
      updateAddonMutation.mutate({ id: editAddonId, ...payload });
    } else {
      createAddonMutation.mutate(payload);
    }
  };

  const handleItemSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setItemError('Item name is required');
      return;
    }
    if (!itemCatId) {
      setItemError('Please select a category');
      return;
    }

    // Filter out invalid variants
    const validVariants = formVariants.filter((v) => v.name.trim() !== '');

    const data = {
      name: itemName.trim(),
      description: itemDesc.trim() || undefined,
      categoryId: itemCatId,
      basePrice: Number(itemBasePrice),
      isVeg: itemIsVeg,
      available: itemAvailable,
      prepTime: Number(itemPrepTime),
      displayOrder: Number(itemDisplayOrder),
      popular: itemPopular,
      recommended: itemRecommended,
      bestSeller: itemBestSeller,
      image: itemImagePath || undefined,
      variants: validVariants,
      addonIds: selectedAddonIds,
    };

    if (editItemId) {
      updateItemMutation.mutate({ id: editItemId, data });
    } else {
      createItemMutation.mutate(data);
    }
  };

  const handleBulkPriceUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkValue <= 0) {
      setBulkError('Value must be greater than zero');
      return;
    }

    setBulkSubmitting(true);
    setBulkError('');

    try {
      await api.post('/menu/items/bulk-price-update', {
        categoryId: bulkCategory === 'all' ? undefined : bulkCategory,
        updateType: bulkUpdateType,
        action: bulkAction,
        value: bulkValue,
      });

      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setIsBulkUpdateOpen(false);
      setBulkValue(0);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setBulkError(axiosError.response?.data?.message || 'Failed to update prices');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Filters
  const filteredItems = menuItems?.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(itemSearch.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'all' || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredAddons = addons?.filter((addon) =>
    addon.name.toLowerCase().includes(addonSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#3C2A21] flex items-center gap-2">
            <Utensils className="h-6 w-6 text-[#8F6A50]" />
            Menu Management
          </h1>
          <p className="text-xs text-gray-500 mt-1">Configure dishes, variants, add-ons and availability</p>
        </div>
        
        {/* Toggle between items and addons */}
        <div className="flex bg-white border border-[#EAD8C0]/30 p-1.5 rounded-xl shadow-sm self-start">
          <button
            onClick={() => setActiveTab('items')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'items'
                ? 'bg-[#3C2A21] text-white'
                : 'text-gray-500 hover:text-[#3C2A21]'
            }`}
          >
            Menu Items
          </button>
          <button
            onClick={() => setActiveTab('addons')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'addons'
                ? 'bg-[#3C2A21] text-white'
                : 'text-gray-500 hover:text-[#3C2A21]'
            }`}
          >
            Add-ons List
          </button>
        </div>
      </div>

      {/* ==========================================
          TAB 1: MENU ITEMS
          ========================================== */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          {/* Filters & Add action */}
          <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-[#EAD8C0]/20 shadow-sm justify-between">
            <div className="flex flex-wrap gap-3 flex-1 max-w-2xl">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-400" />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search item by name..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/15 outline-none rounded-xl text-sm transition-all"
                />
              </div>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0]/40 outline-none rounded-xl text-sm text-gray-600 focus:border-[#8F6A50]"
              >
                <option value="all">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setIsBulkUpdateOpen(true)}
                className="bg-[#8F6A50] text-white hover:bg-[#72543E] rounded-xl flex items-center gap-1.5 h-11"
              >
                Bulk Price Update
              </Button>
              <Button
                onClick={openCreateItem}
                className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11"
              >
                <Plus className="h-4.5 w-4.5" />
                Add Menu Item
              </Button>
            </div>
          </div>

          {/* Items Grid */}
          {itemsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-44 bg-white border border-[#EAD8C0]/10 rounded-2xl animate-pulse"></div>
              ))}
            </div>
          ) : !filteredItems || filteredItems.length === 0 ? (
            <div className="bg-white border border-[#EAD8C0]/10 rounded-2xl p-12 text-center text-gray-500">
              <Utensils className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-700">No menu items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl p-5 border shadow-sm flex flex-col justify-between transition-all ${
                    item.isActive ? 'border-[#EAD8C0]/25' : 'border-gray-200 bg-gray-50/50 opacity-70'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Upper Details */}
                    <div className="flex gap-4">
                      <div className="w-20 h-20 rounded-xl bg-[#FAF8F5] border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image ? (
                          <img
                            src={getImageUrl(item.image)}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Utensils className="h-8 w-8 text-gray-300" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] font-extrabold ${
                              item.isVeg
                                ? 'border-emerald-600 text-emerald-600 bg-emerald-50'
                                : 'border-red-600 text-red-600 bg-red-50'
                            }`}
                            title={item.isVeg ? 'Veg' : 'Non-Veg'}
                          >
                            ●
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                            {item.category?.name}
                          </span>
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm truncate mt-1">{item.name}</h3>
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 font-light">
                          {item.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>

                    {/* Price and Badges */}
                    <div className="flex items-center justify-between border-t border-[#EAD8C0]/10 pt-3">
                      <div>
                        <span className="text-xs text-gray-400 font-medium">Base Price</span>
                        <p className="font-extrabold text-sm text-[#3C2A21]">&#8377;{Number(item.basePrice)}</p>
                      </div>

                      {/* Configured tags */}
                      <div className="flex gap-1 flex-wrap justify-end">
                        {item.popular && (
                          <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded-full font-bold">
                            Popular
                          </span>
                        )}
                        {item.bestSeller && (
                          <span className="text-[9px] bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 rounded-full font-bold">
                            Bestseller
                          </span>
                        )}
                        {item.variants.filter(v => v.isActive).length > 0 && (
                          <span className="text-[9px] bg-[#EAD8C0]/30 border border-[#EAD8C0] text-[#3C2A21] px-2 py-0.5 rounded-full font-bold">
                            {item.variants.filter(v => v.isActive).length} Variants
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-4">
                    <span className="text-[10px] text-gray-400">Prep time: {item.prepTime || 10} mins</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditItem(item)}
                        className="p-1.5 hover:bg-[#FAF8F5] rounded-xl text-gray-600 hover:text-[#3C2A21] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleItemActiveMutation.mutate({ id: item.id, isActive: !item.isActive })}
                        className={`p-1 rounded-xl transition-colors ${
                          item.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={item.isActive ? 'Deactivate' : 'Reactivate'}
                      >
                        {item.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          TAB 2: ADD-ONS
          ========================================== */}
      {activeTab === 'addons' && (
        <div className="space-y-6">
          {/* Addons Search & Create */}
          <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-[#EAD8C0]/20 shadow-sm justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-400" />
              <input
                type="text"
                value={addonSearch}
                onChange={(e) => setAddonSearch(e.target.value)}
                placeholder="Search addons by name..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/15 outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={openCreateAddon}
              className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11"
            >
              <Plus className="h-4.5 w-4.5" />
              Add Addon
            </Button>
          </div>

          {/* Addons List */}
          {addonsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 bg-white border border-[#EAD8C0]/10 rounded-2xl animate-pulse"></div>
              ))}
            </div>
          ) : !filteredAddons || filteredAddons.length === 0 ? (
            <div className="bg-white border border-[#EAD8C0]/10 rounded-2xl p-12 text-center text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-700">No addons found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAddons.map((addon) => (
                <div
                  key={addon.id}
                  className={`bg-white rounded-xl p-4 border shadow-sm flex justify-between items-center ${
                    addon.isActive ? 'border-[#EAD8C0]/25' : 'border-gray-200 bg-gray-50/50 opacity-70'
                  }`}
                >
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm">{addon.name}</h3>
                    <p className="text-xs text-[#8F6A50] font-extrabold mt-0.5">&#8377;{Number(addon.price)}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditAddon(addon)}
                      className="p-1.5 hover:bg-[#FAF8F5] rounded-xl text-gray-600 hover:text-[#3C2A21] transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleAddonActiveMutation.mutate({ id: addon.id, isActive: !addon.isActive })}
                      className={`p-1 rounded-xl transition-colors ${
                        addon.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={addon.isActive ? 'Deactivate' : 'Reactivate'}
                    >
                      {addon.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          ADDON CREATE/EDIT MODAL
          ========================================== */}
      {isAddonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editAddonId ? 'Edit Addon' : 'Create Addon'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Configure custom addons and base pricing</p>

            {addonError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium">
                {addonError}
              </div>
            )}

            <form onSubmit={handleAddonSave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Addon Name</label>
                <input
                  type="text"
                  value={addonName}
                  onChange={(e) => setAddonName(e.target.value)}
                  placeholder="e.g. Extra Cheese, Extra Sauce"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Price (&#8377;)</label>
                <input
                  type="number"
                  value={addonPrice}
                  onChange={(e) => setAddonPrice(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                  min="0"
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button type="button" onClick={closeAddonDialog} variant="ghost" className="rounded-xl h-10 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createAddonMutation.isPending || updateAddonMutation.isPending}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md"
                >
                  {createAddonMutation.isPending || updateAddonMutation.isPending ? 'Saving...' : 'Save Addon'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MENU ITEM CREATE/EDIT MODAL
          ========================================== */}
      {isItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150 my-8">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editItemId ? 'Edit Menu Item' : 'Create Menu Item'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Configure base parameters, variants, and addons</p>

            {itemError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium">
                {itemError}
              </div>
            )}

            <form onSubmit={handleItemSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Item Name</label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Cheese Pizza, Hot Coffee"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                    required
                  />
                </div>

                {/* Category Select */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Category</label>
                  <select
                    value={itemCatId}
                    onChange={(e) => setItemCatId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm text-gray-600 focus:border-[#8F6A50]"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Description</label>
                <textarea
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Describe the dish ingredients or taste profile..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Base Price */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Base Price (&#8377;)</label>
                  <input
                    type="number"
                    value={itemBasePrice}
                    onChange={(e) => setItemBasePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                    min="0"
                    required
                  />
                </div>

                {/* Prep Time */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Prep Time (mins)</label>
                  <input
                    type="number"
                    value={itemPrepTime}
                    onChange={(e) => setItemPrepTime(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                    min="1"
                  />
                </div>

                {/* Display Order */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Display Order</label>
                  <input
                    type="number"
                    value={itemDisplayOrder}
                    onChange={(e) => setItemDisplayOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] outline-none rounded-xl text-sm"
                    min="0"
                  />
                </div>
              </div>

              {/* Checkboxes: Veg, Popular, Recommended, Bestseller */}
              <div className="flex flex-wrap gap-4 py-2 border-y border-[#EAD8C0]/15">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={itemIsVeg}
                    onChange={(e) => setItemIsVeg(e.target.checked)}
                    className="w-4.5 h-4.5 accent-emerald-600"
                  />
                  Veg Item
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={itemPopular}
                    onChange={(e) => setItemPopular(e.target.checked)}
                    className="w-4.5 h-4.5 accent-amber-500"
                  />
                  Popular Tag
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={itemRecommended}
                    onChange={(e) => setItemRecommended(e.target.checked)}
                    className="w-4.5 h-4.5 accent-[#8F6A50]"
                  />
                  Recommended Tag
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={itemBestSeller}
                    onChange={(e) => setItemBestSeller(e.target.checked)}
                    className="w-4.5 h-4.5 accent-rose-600"
                  />
                  Best Seller Tag
                </label>
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Menu Image</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-[#FAF8F5] border border-[#EAD8C0]/35 flex items-center justify-center overflow-hidden relative">
                    {itemImagePath ? (
                      <img
                        src={getImageUrl(itemImagePath)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Utensils className="h-6 w-6 text-gray-300" />
                    )}
                    {imageUploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 border border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold text-gray-600 rounded-xl transition-colors">
                      <Camera className="h-4 w-4" />
                      Choose File
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    <span className="text-[10px] text-gray-400 block mt-1">PNG, JPG, WebP formats allowed. Max 5MB.</span>
                  </div>
                </div>
              </div>

              {/* VARIANTS SETUP */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase block">Pricing Variants (Optional)</label>
                  <button
                    type="button"
                    onClick={addVariantField}
                    className="text-xs font-bold text-[#8F6A50] hover:text-[#3C2A21] flex items-center gap-1"
                  >
                    + Add Variant
                  </button>
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {formVariants.map((variant, index) => (
                    <div key={index} className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => handleVariantChange(index, 'name', e.target.value)}
                        placeholder="e.g. Small, Regular, 1 Litre"
                        className="flex-1 px-3 py-1.5 bg-[#FAF8F5] border border-gray-200 outline-none rounded-lg text-xs"
                        required
                      />
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => handleVariantChange(index, 'price', e.target.value)}
                        placeholder="Price"
                        className="w-28 px-3 py-1.5 bg-[#FAF8F5] border border-gray-200 outline-none rounded-lg text-xs"
                        min="0"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeVariantField(index)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ADD-ONS SELECTION */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Configure Add-ons</label>
                {addons && addons.filter(a => a.isActive).length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1 border border-gray-100 rounded-xl">
                    {addons.filter(a => a.isActive).map((addon) => {
                      const isSelected = selectedAddonIds.includes(addon.id);
                      return (
                        <button
                          type="button"
                          key={addon.id}
                          onClick={() => handleAddonClick(addon.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            isSelected
                              ? 'bg-[#8F6A50] text-white border-[#8F6A50] shadow-sm'
                              : 'bg-[#FAF8F5] text-gray-500 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {addon.name} (+&#8377;{Number(addon.price)})
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 italic">No addons configured. Toggle Tab above to create addons first.</p>
                )}
              </div>

              {/* Form buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button type="button" onClick={closeItemDialog} variant="ghost" className="rounded-xl h-10 text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createItemMutation.isPending || updateItemMutation.isPending || imageUploading}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md"
                >
                  {createItemMutation.isPending || updateItemMutation.isPending ? 'Saving...' : 'Save Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* BULK PRICE UPDATE DIALOG MODAL */}
      {isBulkUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150 text-[#3C2A21]">
            <h2 className="text-xl font-extrabold mb-1">
              Bulk Price Update
            </h2>
            <p className="text-xs text-gray-400 mb-6">Modify prices across multiple menu items and their variants</p>

            {bulkError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium">
                {bulkError}
              </div>
            )}

            <form onSubmit={handleBulkPriceUpdate} className="space-y-4">
              {/* Category Filter */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Target Category</label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm text-gray-600"
                >
                  <option value="all">All Categories</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action (Increase / Decrease) */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Price Action</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                    <input
                      type="radio"
                      name="bulkAction"
                      value="INCREASE"
                      checked={bulkAction === 'INCREASE'}
                      onChange={() => setBulkAction('INCREASE')}
                      className="accent-[#8F6A50]"
                    />
                    Increase Prices
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                    <input
                      type="radio"
                      name="bulkAction"
                      value="DECREASE"
                      checked={bulkAction === 'DECREASE'}
                      onChange={() => setBulkAction('DECREASE')}
                      className="accent-[#8F6A50]"
                    />
                    Decrease Prices
                  </label>
                </div>
              </div>

              {/* Update Type (Percentage / Flat) */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Price Adjustment Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                    <input
                      type="radio"
                      name="bulkUpdateType"
                      value="PERCENTAGE"
                      checked={bulkUpdateType === 'PERCENTAGE'}
                      onChange={() => setBulkUpdateType('PERCENTAGE')}
                      className="accent-[#8F6A50]"
                    />
                    Percentage (%)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs">
                    <input
                      type="radio"
                      name="bulkUpdateType"
                      value="FLAT"
                      checked={bulkUpdateType === 'FLAT'}
                      onChange={() => setBulkUpdateType('FLAT')}
                      className="accent-[#8F6A50]"
                    />
                    Flat Rate (₹)
                  </label>
                </div>
              </div>

              {/* Adjustment Value */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Adjustment Value</label>
                <input
                  type="number"
                  value={bulkValue || ''}
                  onChange={(e) => setBulkValue(Number(e.target.value))}
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                  min="0.01"
                  step="any"
                  required
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button
                  type="button"
                  onClick={() => setIsBulkUpdateOpen(false)}
                  variant="ghost"
                  className="rounded-xl h-10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md"
                >
                  {bulkSubmitting ? 'Updating...' : 'Apply Update'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
