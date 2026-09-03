'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  Download,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Ingredient {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category: string;
  currentStock: number;
  averageCost: number | null;
  lastPurchaseCost: number | null;
  minimumStock: number;
  reorderLevel: number;
  preferredSupplierId: string | null;
  preferredSupplier?: { id: string; name: string };
}

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
}

interface Recipe {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  addonId: string | null;
  ingredientId: string;
  quantity: number;
  menuItem?: { id: string; name: string };
  variant?: { id: string; name: string; menuItem?: { name: string } };
  addon?: { id: string; name: string };
  ingredient: { id: string; name: string; unit: string; averageCost: number | null };
}

interface PurchaseItem {
  id: string;
  ingredientId: string;
  ingredientNameSnapshot: string;
  purchaseUnit: string;
  purchaseQuantity: number;
  conversionFactor: number;
  baseQuantityAdded: number;
  unitPurchaseCost: number;
  baseUnitCostSnapshot: number;
  tax: number;
  lineTotal: number;
  ingredient?: { id: string; name: string };
}

interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  purchaseDate: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  subtotal: number;
  discount: number;
  tax: number;
  otherCharges: number;
  grandTotal: number;
  notes: string | null;
  supplier: { id: string; name: string };
  items: PurchaseItem[];
}

interface WastageEntry {
  id: string;
  ingredientId: string;
  quantity: number;
  reason: 'SPOILED' | 'SPILLED' | 'EXPIRED' | 'CUSTOMER_RETURN' | 'OTHER';
  notes: string | null;
  recordedById: string;
  recordedAt: string;
  ingredient: { name: string; unit: string };
  recordedBy: { name: string };
}

interface MenuItem {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
}

interface Addon {
  id: string;
  name: string;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ingredients' | 'recipes' | 'suppliers' | 'purchases' | 'wastage'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & form state
  const [isIngModalOpen, setIsIngModalOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<Ingredient | null>(null);
  const [ingForm, setIngForm] = useState({
    name: '',
    sku: '',
    unit: '',
    category: 'OTHER',
    minimumStock: 0,
    reorderLevel: 0,
    preferredSupplierId: '',
  });

  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjIngId, setAdjIngId] = useState('');
  const [adjForm, setAdjForm] = useState({
    quantityChange: 0,
    reason: '',
  });

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
  });

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [recipeForm, setRecipeForm] = useState({
    menuItemId: '',
    variantId: '',
    addonId: '',
    ingredientId: '',
    quantity: 0,
  });

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    discount: 0,
    otherCharges: 0,
    notes: '',
    items: [] as Array<{
      ingredientId: string;
      purchaseUnit: string;
      purchaseQuantity: number;
      conversionFactor: number;
      unitPurchaseCost: number;
      tax: number;
    }>,
  });

  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [wastageForm, setWastageForm] = useState({
    ingredientId: '',
    quantity: 0,
    reason: 'SPOILED',
    notes: '',
  });

  // Queries
  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const res = await api.get('/inventory/ingredients');
      return res.data;
    },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/inventory/suppliers');
      return res.data;
    },
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: async () => {
      const res = await api.get('/inventory/recipes');
      return res.data;
    },
  });

  const { data: purchases = [] } = useQuery<Purchase[]>({
    queryKey: ['purchases'],
    queryFn: async () => {
      const res = await api.get('/inventory/purchases');
      return res.data;
    },
  });

  const { data: wastage = [] } = useQuery<WastageEntry[]>({
    queryKey: ['wastage'],
    queryFn: async () => {
      const res = await api.get('/inventory/wastage');
      return res.data;
    },
  });

  const { data: valueEstimate } = useQuery({
    queryKey: ['analytics-value'],
    queryFn: async () => {
      const res = await api.get('/inventory/analytics/value');
      return res.data;
    },
  });

  const { data: foodCost } = useQuery({
    queryKey: ['analytics-food-cost'],
    queryFn: async () => {
      const res = await api.get('/inventory/analytics/food-cost');
      return res.data;
    },
  });

  const { data: wastageAnalytics } = useQuery({
    queryKey: ['analytics-wastage'],
    queryFn: async () => {
      const res = await api.get('/inventory/analytics/wastage');
      return res.data;
    },
  });

  const { data: contribution } = useQuery({
    queryKey: ['analytics-contribution'],
    queryFn: async () => {
      const res = await api.get('/inventory/analytics/operating-contribution');
      return res.data;
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['menuItems-dropdown'],
    queryFn: async () => {
      const res = await api.get('/menu/items');
      return res.data;
    },
  });

  const { data: addons = [] } = useQuery<Addon[]>({
    queryKey: ['addons-dropdown'],
    queryFn: async () => {
      const res = await api.get('/menu/addons/all');
      return res.data || [];
    },
    retry: false,
  });

  // Mutations
  const ingredientMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingIng) {
        return api.patch(`/inventory/ingredients/${editingIng.id}`, payload);
      }
      return api.post('/inventory/ingredients', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
      setIsIngModalOpen(false);
      setEditingIng(null);
    },
  });

  const deleteIngredientMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/inventory/ingredients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
    },
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/inventory/ingredients/adjust', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
      setIsAdjModalOpen(false);
    },
  });

  const supplierMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingSupplier) {
        return api.patch(`/inventory/suppliers/${editingSupplier.id}`, payload);
      }
      return api.post('/inventory/suppliers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/inventory/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const recipeMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingRecipe) {
        return api.patch(`/inventory/recipes/${editingRecipe.id}`, payload);
      }
      return api.post('/inventory/recipes', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setIsRecipeModalOpen(false);
      setEditingRecipe(null);
    },
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/inventory/recipes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/inventory/purchases', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setIsPurchaseModalOpen(false);
    },
  });

  const finalizePurchaseMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/inventory/purchases/${id}/finalize`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
    },
  });

  const reversePurchaseMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/inventory/purchases/${id}/reverse`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
    },
  });

  const wastageMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return api.post('/inventory/wastage', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wastage'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-value'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-wastage'] });
      setIsWastageModalOpen(false);
    },
  });

  const handleExport = (type: 'ledger' | 'stock-balance' | 'wastage') => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    const token = localStorage.getItem('ccb_token');
    if (!token) return;
    window.open(`${baseUrl}/inventory/export/${type}?token=${token}`, '_blank');
  };

  // Dialog helpers
  const openIngModal = (ing?: Ingredient) => {
    if (ing) {
      setEditingIng(ing);
      setIngForm({
        name: ing.name,
        sku: ing.sku || '',
        unit: ing.unit,
        category: ing.category,
        minimumStock: ing.minimumStock,
        reorderLevel: ing.reorderLevel,
        preferredSupplierId: ing.preferredSupplierId || '',
      });
    } else {
      setEditingIng(null);
      setIngForm({
        name: '',
        sku: '',
        unit: '',
        category: 'OTHER',
        minimumStock: 0,
        reorderLevel: 0,
        preferredSupplierId: '',
      });
    }
    setIsIngModalOpen(true);
  };

  const openSupplierModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSupplier(sup);
      setSupplierForm({
        name: sup.name,
        contactPerson: sup.contactPerson || '',
        phone: sup.phone,
        email: sup.email || '',
        address: sup.address || '',
      });
    } else {
      setEditingSupplier(null);
      setSupplierForm({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
      });
    }
    setIsSupplierModalOpen(true);
  };

  const openRecipeModal = (rec?: Recipe) => {
    if (rec) {
      setEditingRecipe(rec);
      setRecipeForm({
        menuItemId: rec.menuItemId || '',
        variantId: rec.variantId || '',
        addonId: rec.addonId || '',
        ingredientId: rec.ingredientId,
        quantity: rec.quantity,
      });
    } else {
      setEditingRecipe(null);
      setRecipeForm({
        menuItemId: '',
        variantId: '',
        addonId: '',
        ingredientId: '',
        quantity: 0,
      });
    }
    setIsRecipeModalOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAD8C0]/25 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#3C2A21] flex items-center gap-2">
            <Package className="h-8 w-8 text-[#8F6A50]" />
            Inventory Command Center
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
            Cafe Cue & Brew Stock & Cost Ledger Control
          </p>
        </div>

        {/* Action Buttons for CSV Export */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleExport('stock-balance')}
            variant="outline"
            className="border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold gap-2 rounded-xl"
          >
            <Download className="h-4 w-4" /> Export Balance CSV
          </Button>
          <Button
            onClick={() => handleExport('ledger')}
            variant="outline"
            className="border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold gap-2 rounded-xl"
          >
            <Download className="h-4 w-4" /> Export Ledger CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['dashboard', 'ingredients', 'recipes', 'suppliers', 'purchases', 'wastage'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSearchQuery('');
            }}
            className={`px-4 py-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all ${
              activeTab === tab
                ? 'border-[#8F6A50] text-[#3C2A21]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 1. DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-wider">Estimated Stock Value</span>
              <span className="text-2xl font-black text-[#3C2A21] mt-1 block">
                ₹{valueEstimate?.totalEstimatedValue !== undefined && valueEstimate?.totalEstimatedValue !== null ? Number(valueEstimate.totalEstimatedValue).toFixed(2) : '0.00'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-2">Weighted average calculation</span>
            </div>

            <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-wider">Food Cost Percentage</span>
              <span className="text-2xl font-black text-[#8F6A50] mt-1 block">
                {foodCost?.foodCostPercentage !== undefined && foodCost?.foodCostPercentage !== null ? Number(foodCost.foodCostPercentage).toFixed(1) : '0.0'}%
              </span>
              <span className="text-[10px] text-gray-400 block mt-2">
                Sales: ₹{foodCost?.totalSales !== undefined && foodCost?.totalSales !== null ? Number(foodCost.totalSales).toFixed(0) : '0'} | Food Cost: ₹{foodCost?.totalFoodCost !== undefined && foodCost?.totalFoodCost !== null ? Number(foodCost.totalFoodCost).toFixed(0) : '0'}
              </span>
            </div>

            <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-wider">Wastage Analytics</span>
              <span className="text-2xl font-black text-rose-600 mt-1 block">
                ₹{wastageAnalytics?.totalWastageCost !== undefined && wastageAnalytics?.totalWastageCost !== null ? Number(wastageAnalytics.totalWastageCost).toFixed(0) : '0'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-2">For selected time range</span>
            </div>

            <div className="bg-white border border-[#EAD8C0]/20 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase block tracking-wider">Estimated Operating Contribution</span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                ₹{contribution?.estimatedOperatingContribution !== undefined && contribution?.estimatedOperatingContribution !== null ? Number(contribution.estimatedOperatingContribution).toFixed(0) : '0'}
              </span>
              <span className="text-[10px] text-gray-400 block mt-2">
                Contribution margin: {contribution?.contributionMarginPercent !== undefined && contribution?.contributionMarginPercent !== null ? Number(contribution.contributionMarginPercent).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>

          {/* Low Stock Warning List */}
          <div className="bg-white border border-yellow-100 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-extrabold text-[#3C2A21] flex items-center gap-2 text-sm uppercase tracking-wider">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Low Stock & Reorder Warnings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ingredients
                .filter((ing) => ing.currentStock <= ing.reorderLevel)
                .map((ing) => {
                  const isMin = ing.currentStock <= ing.minimumStock;
                  return (
                    <div
                      key={ing.id}
                      className={`p-4 rounded-2xl border flex items-center justify-between ${
                        isMin
                          ? 'bg-rose-50/50 border-rose-100 text-rose-900'
                          : 'bg-yellow-50/50 border-yellow-100 text-yellow-900'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs">{ing.name}</span>
                        <div className="text-[10px] opacity-70 mt-1">
                          Stock: {ing.currentStock} {ing.unit} | Reorder: {ing.reorderLevel}
                        </div>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isMin ? 'bg-rose-100 text-rose-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {isMin ? 'Critical' : 'Reorder'}
                      </span>
                    </div>
                  );
                })}
              {ingredients.filter((ing) => ing.currentStock <= ing.reorderLevel).length === 0 && (
                <div className="col-span-3 text-center text-xs text-gray-400 py-6">
                  All ingredients have safe stock levels.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. INGREDIENTS TAB */}
      {activeTab === 'ingredients' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
              <input
                type="text"
                placeholder="Search ingredients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white border border-[#EAD8C0]/50 focus:border-[#8F6A50] outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={() => openIngModal()}
              className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
            >
              <Plus className="h-4.5 w-4.5" /> Add Ingredient
            </Button>
          </div>

          {/* Ingredient List */}
          <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="py-4 px-5">Ingredient Name</th>
                  <th className="py-4 px-5">SKU</th>
                  <th className="py-4 px-5">Category</th>
                  <th className="py-4 px-5 text-right">Current Stock</th>
                  <th className="py-4 px-5 text-right">Average Cost</th>
                  <th className="py-4 px-5 text-right">Last Purchase</th>
                  <th className="py-4 px-5">Preferred Supplier</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {ingredients
                  .filter((ing) => ing.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((ing) => (
                    <tr key={ing.id} className="hover:bg-[#FAF8F5]/30">
                      <td className="py-3 px-5 font-bold text-gray-800">{ing.name}</td>
                      <td className="py-3 px-5 text-gray-500">{ing.sku || '-'}</td>
                      <td className="py-3 px-5">
                        <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600 font-semibold uppercase">
                          {ing.category}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right font-semibold">
                        <span className={ing.currentStock <= ing.reorderLevel ? 'text-red-500' : 'text-gray-700'}>
                          {ing.currentStock} {ing.unit}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right text-gray-600 font-mono">
                        {ing.averageCost !== undefined && ing.averageCost !== null ? `₹${Number(ing.averageCost).toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="py-3 px-5 text-right text-gray-600 font-mono">
                        {ing.lastPurchaseCost !== undefined && ing.lastPurchaseCost !== null ? `₹${Number(ing.lastPurchaseCost).toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="py-3 px-5 text-gray-600">{ing.preferredSupplier?.name || '-'}</td>
                      <td className="py-3 px-5 text-right space-x-1">
                        <Button
                          onClick={() => {
                            setAdjIngId(ing.id);
                            setIsAdjModalOpen(true);
                          }}
                          variant="ghost"
                          className="h-7 px-2 hover:bg-[#FAF8F5] text-amber-600 font-bold text-[10px] rounded-lg"
                        >
                          Adjust
                        </Button>
                        <Button
                          onClick={() => openIngModal(ing)}
                          variant="ghost"
                          className="p-1 hover:bg-[#FAF8F5] text-blue-600 rounded-lg"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm('Delete this ingredient?')) {
                              deleteIngredientMutation.mutate(ing.id);
                            }
                          }}
                          variant="ghost"
                          className="p-1 hover:bg-rose-50 text-rose-600 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. RECIPES TAB */}
      {activeTab === 'recipes' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
              <input
                type="text"
                placeholder="Search recipes by item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white border border-[#EAD8C0]/50 focus:border-[#8F6A50] outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={() => openRecipeModal()}
              className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
            >
              <Plus className="h-4.5 w-4.5" /> Add Recipe
            </Button>
          </div>

          {/* Recipes List */}
          <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="py-4 px-5">Recipe Owner</th>
                  <th className="py-4 px-5">Ingredient</th>
                  <th className="py-4 px-5 text-right">Quantity Required</th>
                  <th className="py-4 px-5 text-right">Approx Cost</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {recipes
                  .filter((r) => {
                    const ownerName = r.menuItem?.name || r.variant?.menuItem?.name || r.addon?.name || '';
                    return ownerName.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map((r) => {
                    const ownerName = r.menuItem?.name
                      ? `Menu Item: ${r.menuItem.name}`
                      : r.variant?.menuItem?.name
                      ? `Variant: ${r.variant.menuItem.name} (${r.variant.name})`
                      : r.addon?.name
                      ? `Addon: ${r.addon.name}`
                      : 'Unknown';
                    const cost = r.ingredient.averageCost ? r.ingredient.averageCost * r.quantity : null;
                    return (
                      <tr key={r.id} className="hover:bg-[#FAF8F5]/30">
                        <td className="py-3 px-5 font-bold text-gray-800">{ownerName}</td>
                        <td className="py-3 px-5 text-gray-600">{r.ingredient.name}</td>
                        <td className="py-3 px-5 text-right">
                          {r.quantity} {r.ingredient.unit}
                        </td>
                        <td className="py-3 px-5 text-right text-gray-600 font-mono">
                          {cost !== null ? `₹${Number(cost).toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="py-3 px-5 text-right space-x-1">
                          <Button
                            onClick={() => openRecipeModal(r)}
                            variant="ghost"
                            className="p-1 hover:bg-[#FAF8F5] text-blue-600 rounded-lg"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => {
                              if (confirm('Delete this recipe?')) {
                                deleteRecipeMutation.mutate(r.id);
                              }
                            }}
                            variant="ghost"
                            className="p-1 hover:bg-rose-50 text-rose-600 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SUPPLIERS TAB */}
      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white border border-[#EAD8C0]/50 focus:border-[#8F6A50] outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={() => openSupplierModal()}
              className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
            >
              <Plus className="h-4.5 w-4.5" /> Add Supplier
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="py-4 px-5">Supplier Name</th>
                  <th className="py-4 px-5">Contact Person</th>
                  <th className="py-4 px-5">Phone</th>
                  <th className="py-4 px-5">Email</th>
                  <th className="py-4 px-5">Address</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {suppliers
                  .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-[#FAF8F5]/30">
                      <td className="py-3 px-5 font-bold text-gray-800">{s.name}</td>
                      <td className="py-3 px-5 text-gray-600">{s.contactPerson || '-'}</td>
                      <td className="py-3 px-5 text-gray-600">{s.phone}</td>
                      <td className="py-3 px-5 text-gray-600">{s.email || '-'}</td>
                      <td className="py-3 px-5 text-gray-500">{s.address || '-'}</td>
                      <td className="py-3 px-5 text-right space-x-1">
                        <Button
                          onClick={() => openSupplierModal(s)}
                          variant="ghost"
                          className="p-1 hover:bg-[#FAF8F5] text-blue-600 rounded-lg"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm('Delete this supplier?')) {
                              deleteSupplierMutation.mutate(s.id);
                            }
                          }}
                          variant="ghost"
                          className="p-1 hover:bg-rose-50 text-rose-600 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PURCHASES TAB */}
      {activeTab === 'purchases' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
              <input
                type="text"
                placeholder="Search purchases by number/supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white border border-[#EAD8C0]/50 focus:border-[#8F6A50] outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={() => {
                setPurchaseForm({
                  supplierId: '',
                  purchaseDate: new Date().toISOString().split('T')[0],
                  discount: 0,
                  otherCharges: 0,
                  notes: '',
                  items: [],
                });
                setIsPurchaseModalOpen(true);
              }}
              className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
            >
              <Plus className="h-4.5 w-4.5" /> Record Purchase (Draft)
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="py-4 px-5">Purchase #</th>
                  <th className="py-4 px-5">Supplier</th>
                  <th className="py-4 px-5">Date</th>
                  <th className="py-4 px-5 text-right">Grand Total</th>
                  <th className="py-4 px-5 text-center">Status</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {purchases
                  .filter((p) => {
                    return (
                      p.purchaseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      p.supplier.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                  })
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-[#FAF8F5]/30">
                      <td className="py-3 px-5 font-mono font-bold text-gray-800">{p.purchaseNumber}</td>
                      <td className="py-3 px-5 text-gray-600">{p.supplier.name}</td>
                      <td className="py-3 px-5 text-gray-500">{new Date(p.purchaseDate).toLocaleDateString()}</td>
                      <td className="py-3 px-5 text-right font-black text-gray-800">₹{Number(p.grandTotal).toFixed(2)}</td>
                      <td className="py-3 px-5 text-center">
                        <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          p.status === 'FINALIZED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : p.status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right space-x-1">
                        {p.status === 'DRAFT' && (
                          <Button
                            onClick={() => {
                              if (confirm('Finalize this purchase? Average costs will be updated.')) {
                                finalizePurchaseMutation.mutate(p.id);
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] h-7 px-2.5 rounded-lg"
                          >
                            Finalize
                          </Button>
                        )}
                        {p.status === 'FINALIZED' && (
                          <Button
                            onClick={() => {
                              if (confirm('Reverse this purchase? Stock additions will be rolled back if possible.')) {
                                reversePurchaseMutation.mutate(p.id);
                              }
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] h-7 px-2.5 rounded-lg"
                          >
                            Reverse
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. WASTAGE TAB */}
      {activeTab === 'wastage' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4.5 w-4.5" />
              <input
                type="text"
                placeholder="Search wastage entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white border border-[#EAD8C0]/50 focus:border-[#8F6A50] outline-none rounded-xl text-sm transition-all"
              />
            </div>
            <Button
              onClick={() => {
                setWastageForm({
                  ingredientId: '',
                  quantity: 0,
                  reason: 'SPOILED',
                  notes: '',
                });
                setIsWastageModalOpen(true);
              }}
              className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold gap-2 px-5"
            >
              <Plus className="h-4.5 w-4.5" /> Record Wastage
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-[#EAD8C0]/20 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="py-4 px-5">Ingredient</th>
                  <th className="py-4 px-5 text-right">Quantity</th>
                  <th className="py-4 px-5">Reason</th>
                  <th className="py-4 px-5">Notes</th>
                  <th className="py-4 px-5">Recorded By</th>
                  <th className="py-4 px-5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {wastage
                  .filter((w) => w.ingredient.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((w) => (
                    <tr key={w.id} className="hover:bg-[#FAF8F5]/30">
                      <td className="py-3 px-5 font-bold text-gray-800">{w.ingredient.name}</td>
                      <td className="py-3 px-5 text-right font-semibold text-rose-600">
                        -{w.quantity} {w.ingredient.unit}
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-[9px] bg-rose-50 border border-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold uppercase">
                          {w.reason}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-gray-500">{w.notes || '-'}</td>
                      <td className="py-3 px-5 text-gray-600">{w.recordedBy.name}</td>
                      <td className="py-3 px-5 text-gray-400">{new Date(w.recordedAt).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================
          MODALS & DIALOGS
      ========================================== */}

      {/* 1. INGREDIENT MODAL */}
      {isIngModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editingIng ? 'Edit Ingredient' : 'Create Ingredient'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Specify stock levels and units</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ingredientMutation.mutate(ingForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ingredient Name</label>
                <input
                  type="text"
                  required
                  value={ingForm.name}
                  onChange={(e) => setIngForm({ ...ingForm, name: e.target.value })}
                  placeholder="e.g. Milk, Espresso Beans"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">SKU</label>
                  <input
                    type="text"
                    value={ingForm.sku}
                    onChange={(e) => setIngForm({ ...ingForm, sku: e.target.value })}
                    placeholder="e.g. MILK-1L"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Stock Unit</label>
                  <input
                    type="text"
                    required
                    value={ingForm.unit}
                    onChange={(e) => setIngForm({ ...ingForm, unit: e.target.value })}
                    placeholder="e.g. Ltr, KG, PCS"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Category</label>
                <select
                  value={ingForm.category}
                  onChange={(e) => setIngForm({ ...ingForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                >
                  <option value="DAIRY">Dairy</option>
                  <option value="COFFEE_BEANS">Coffee Beans</option>
                  <option value="SYRUP">Syrup</option>
                  <option value="BAKERY">Bakery</option>
                  <option value="MEAT">Meat</option>
                  <option value="VEGETABLES">Vegetables</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Min Stock Limit</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ingForm.minimumStock}
                    onChange={(e) => setIngForm({ ...ingForm, minimumStock: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reorder Level</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ingForm.reorderLevel}
                    onChange={(e) => setIngForm({ ...ingForm, reorderLevel: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Preferred Supplier</label>
                <select
                  value={ingForm.preferredSupplierId}
                  onChange={(e) => setIngForm({ ...ingForm, preferredSupplierId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                >
                  <option value="">No Preferred Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsIngModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={ingredientMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  {ingredientMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. STOCK ADJUSTMENT MODAL */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">Adjust Stock Balance</h2>
            <p className="text-xs text-gray-400 mb-6">Manually add or subtract stock levels</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                adjustmentMutation.mutate({
                  ingredientId: adjIngId,
                  quantityChange: adjForm.quantityChange,
                  reason: adjForm.reason || 'Manual correction',
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Quantity Change</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={adjForm.quantityChange}
                  onChange={(e) => setAdjForm({ ...adjForm, quantityChange: Number(e.target.value) })}
                  placeholder="e.g. -5.5 or 10"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Use negative numbers to deduct stock</span>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  required
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  placeholder="e.g. Stock count correction"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={adjustmentMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  Confirm Adjustment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. SUPPLIER MODAL */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editingSupplier ? 'Edit Supplier' : 'Create Supplier'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Add vendor details for purchase ledger</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                supplierMutation.mutate(supplierForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="e.g. Fresh Dairy Distributors"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Contact Person</label>
                <input
                  type="text"
                  value={supplierForm.contactPerson}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                  placeholder="e.g. Amit Sharma"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Email Address</label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  placeholder="e.g. contact@supplier.com"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Address</label>
                <textarea
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  placeholder="Street details..."
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm h-20"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={supplierMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. RECIPE MODAL */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editingRecipe ? 'Edit Recipe Link' : 'Create Recipe Link'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Link exactly one recipe owner (item, variant, or addon) to an ingredient</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Ensure ownerCount === 1 validation in frontend too
                const ownerCount = (recipeForm.menuItemId ? 1 : 0) + (recipeForm.variantId ? 1 : 0) + (recipeForm.addonId ? 1 : 0);
                if (ownerCount !== 1) {
                  alert('Strict Recipe Ownership: A recipe must belong to exactly one MenuItem, MenuVariant, or Addon.');
                  return;
                }
                recipeMutation.mutate({
                  menuItemId: recipeForm.menuItemId || null,
                  variantId: recipeForm.variantId || null,
                  addonId: recipeForm.addonId || null,
                  ingredientId: recipeForm.ingredientId,
                  quantity: recipeForm.quantity,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ingredient</label>
                <select
                  required
                  value={recipeForm.ingredientId}
                  onChange={(e) => setRecipeForm({ ...recipeForm, ingredientId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                >
                  <option value="">Select Ingredient</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Quantity Required</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={recipeForm.quantity}
                  onChange={(e) => setRecipeForm({ ...recipeForm, quantity: Number(e.target.value) })}
                  placeholder="e.g. 0.05"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  Recipe Owner (Choose exactly one)
                </span>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Menu Item</label>
                    <select
                      value={recipeForm.menuItemId}
                      onChange={(e) =>
                        setRecipeForm({
                          ...recipeForm,
                          menuItemId: e.target.value,
                          variantId: '',
                          addonId: '',
                        })
                      }
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    >
                      <option value="">None</option>
                      {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Or Menu Variant</label>
                    <select
                      value={recipeForm.variantId}
                      onChange={(e) =>
                        setRecipeForm({
                          ...recipeForm,
                          variantId: e.target.value,
                          menuItemId: '',
                          addonId: '',
                        })
                      }
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    >
                      <option value="">None</option>
                      {menuItems.flatMap((item) =>
                        item.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {item.name} - {v.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Or Add-on</label>
                    <select
                      value={recipeForm.addonId}
                      onChange={(e) =>
                        setRecipeForm({
                          ...recipeForm,
                          addonId: e.target.value,
                          menuItemId: '',
                          variantId: '',
                        })
                      }
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    >
                      <option value="">None</option>
                      {addons.map((add) => (
                        <option key={add.id} value={add.id}>
                          {add.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsRecipeModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={recipeMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. DRAFT PURCHASE MODAL */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">Create Purchase Record (Draft)</h2>
            <p className="text-xs text-gray-400 mb-6">Enter supplier and incoming item details</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!purchaseForm.supplierId) {
                  alert('Please select a supplier.');
                  return;
                }
                if (purchaseForm.items.length === 0) {
                  alert('Please add at least one item.');
                  return;
                }
                purchaseMutation.mutate(purchaseForm);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Supplier</label>
                  <select
                    required
                    value={purchaseForm.supplierId}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={purchaseForm.purchaseDate}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="border border-[#EAD8C0]/20 rounded-2xl p-4 bg-[#FAF8F5]/30 space-y-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Items Added</span>
                {purchaseForm.items.map((item, idx) => {
                  const ing = ingredients.find((i) => i.id === item.ingredientId);
                  return (
                    <div key={idx} className="bg-white border border-[#EAD8C0]/25 rounded-xl p-3 flex justify-between items-center gap-4 text-xs">
                      <div>
                        <span className="font-bold">{ing?.name || 'Unknown Ingredient'}</span>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {item.purchaseQuantity} {item.purchaseUnit} (CF: {item.conversionFactor}) | Cost: ₹{item.unitPurchaseCost} | Tax: ₹{item.tax}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          const copy = [...purchaseForm.items];
                          copy.splice(idx, 1);
                          setPurchaseForm({ ...purchaseForm, items: copy });
                        }}
                        variant="ghost"
                        className="p-1 hover:bg-rose-50 text-rose-600 rounded-lg"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}

                {/* Add Item form */}
                <div className="bg-white border border-dashed border-[#EAD8C0] rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Add Purchase Line</span>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      id="item-ing"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    >
                      <option value="">Select Ingredient</option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name}
                        </option>
                      ))}
                    </select>
                    <input
                      id="item-unit"
                      type="text"
                      placeholder="Unit (e.g. Case of 12)"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <input
                      id="item-qty"
                      type="number"
                      placeholder="Qty"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    />
                    <input
                      id="item-cf"
                      type="number"
                      placeholder="CF"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    />
                    <input
                      id="item-cost"
                      type="number"
                      placeholder="Cost"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    />
                    <input
                      id="item-tax"
                      type="number"
                      placeholder="Tax"
                      className="px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      const ingId = (document.getElementById('item-ing') as HTMLSelectElement).value;
                      const unit = (document.getElementById('item-unit') as HTMLInputElement).value;
                      const qty = Number((document.getElementById('item-qty') as HTMLInputElement).value);
                      const cf = Number((document.getElementById('item-cf') as HTMLInputElement).value);
                      const cost = Number((document.getElementById('item-cost') as HTMLInputElement).value);
                      const tax = Number((document.getElementById('item-tax') as HTMLInputElement).value || 0);

                      if (!ingId || !unit || qty <= 0 || cf <= 0 || cost < 0) {
                        alert('Please fill out all line item fields correctly.');
                        return;
                      }

                      setPurchaseForm({
                        ...purchaseForm,
                        items: [
                          ...purchaseForm.items,
                          {
                            ingredientId: ingId,
                            purchaseUnit: unit,
                            purchaseQuantity: qty,
                            conversionFactor: cf,
                            unitPurchaseCost: cost,
                            tax,
                          },
                        ],
                      });

                      // Reset fields
                      (document.getElementById('item-ing') as HTMLSelectElement).value = '';
                      (document.getElementById('item-unit') as HTMLInputElement).value = '';
                      (document.getElementById('item-qty') as HTMLInputElement).value = '';
                      (document.getElementById('item-cf') as HTMLInputElement).value = '';
                      (document.getElementById('item-cost') as HTMLInputElement).value = '';
                      (document.getElementById('item-tax') as HTMLInputElement).value = '';
                    }}
                    className="w-full bg-[#FAF8F5] border border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold text-[#8F6A50] rounded-xl py-2"
                  >
                    + Add Item Line
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Discount (₹)</label>
                  <input
                    type="number"
                    value={purchaseForm.discount}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, discount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Other Charges (₹)</label>
                  <input
                    type="number"
                    value={purchaseForm.otherCharges}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, otherCharges: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notes</label>
                <textarea
                  value={purchaseForm.notes}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                  placeholder="Notes/comments..."
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm h-20"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={purchaseMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  Save Draft
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. RECORD WASTAGE MODAL */}
      {isWastageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">Record Wastage</h2>
            <p className="text-xs text-gray-400 mb-6">Wasted stock will be deducted from inventory balance</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!wastageForm.ingredientId) {
                  alert('Please select an ingredient.');
                  return;
                }
                wastageMutation.mutate(wastageForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ingredient</label>
                <select
                  required
                  value={wastageForm.ingredientId}
                  onChange={(e) => setWastageForm({ ...wastageForm, ingredientId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                >
                  <option value="">Select Ingredient</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Quantity Wasted</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={wastageForm.quantity}
                  onChange={(e) => setWastageForm({ ...wastageForm, quantity: Number(e.target.value) })}
                  placeholder="0.5"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason</label>
                <select
                  value={wastageForm.reason}
                  onChange={(e) => setWastageForm({ ...wastageForm, reason: e.target.value as 'SPOILED' | 'SPILLED' | 'EXPIRED' | 'CUSTOMER_RETURN' | 'OTHER' })}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                >
                  <option value="SPOILED">Spoiled / Rotten</option>
                  <option value="SPILLED">Spilled / Damaged</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="CUSTOMER_RETURN">Customer Return / Comped</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notes</label>
                <input
                  type="text"
                  value={wastageForm.notes}
                  onChange={(e) => setWastageForm({ ...wastageForm, notes: e.target.value })}
                  placeholder="e.g. Fridge temperature fluctuation"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] outline-none rounded-xl text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setIsWastageModalOpen(false)}
                  variant="outline"
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={wastageMutation.isPending}
                  className="bg-[#8F6A50] hover:bg-[#7A5A43] text-white rounded-xl text-xs font-bold px-5"
                >
                  Confirm Wastage
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
