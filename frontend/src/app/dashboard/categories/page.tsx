'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FolderTree, Plus, Edit2, ToggleLeft, ToggleRight, Camera, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Category {
  id: string;
  name: string;
  image: string | null;
  displayOrder: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog State
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [imagePath, setImagePath] = useState('');
  
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');

  // 1. Fetch Categories (include inactive for administrative list)
  const { data: categories, isLoading, isError } = useQuery<Category[]>({
    queryKey: ['adminCategories'],
    queryFn: async () => {
      const response = await api.get('/categories?all=true');
      return response.data;
    },
  });

  // 2. Image Upload Mutation
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setFormError('');

    const formData = new FormData();
    formData.append('file', fileList[0]);

    try {
      const response = await api.post('/uploads?folder=categories', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImagePath(response.data.filePath);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      const msg = axiosError.response?.data?.message || 'Failed to upload image';
      setFormError(msg);
    } finally {
      setUploading(false);
    }
  };

  // 3. Create Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; displayOrder: number; image?: string }) => {
      return api.post('/categories', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCategories'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to create category');
    },
  });

  // 4. Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name?: string; displayOrder?: number; image?: string; isActive?: boolean }) => {
      const { id, ...data } = payload;
      return api.put(`/categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCategories'] });
      closeDialog();
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setFormError(axiosError.response?.data?.message || 'Failed to update category');
    },
  });

  // 5. Soft Delete / Toggle Active Status Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/categories/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCategories'] });
    },
  });

  const openCreateDialog = () => {
    setEditId(null);
    setName('');
    setDisplayOrder(categories ? categories.length : 0);
    setImagePath('');
    setFormError('');
    setIsOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditId(category.id);
    setName(category.name);
    setDisplayOrder(category.displayOrder);
    setImagePath(category.image || '');
    setFormError('');
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setEditId(null);
    setName('');
    setDisplayOrder(0);
    setImagePath('');
    setFormError('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Category name is required');
      return;
    }

    const payload = {
      name: name.trim(),
      displayOrder: Number(displayOrder),
      image: imagePath || undefined,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredCategories = categories?.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#3C2A21] flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-[#8F6A50]" />
            Categories
          </h1>
          <p className="text-xs text-gray-500 mt-1">Manage digital menu sections and explore categories</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl flex items-center gap-1.5 h-11"
        >
          <Plus className="h-4.5 w-4.5" />
          Add Category
        </Button>
      </div>

      {/* Search and Quick Filters */}
      <div className="flex bg-white p-4 rounded-2xl border border-[#EAD8C0]/20 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search categories by name..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/40 focus:border-[#8F6A50] focus:ring-2 focus:ring-[#8F6A50]/15 outline-none rounded-xl text-sm transition-all"
          />
        </div>
      </div>

      {/* Categories Grid/List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white border border-[#EAD8C0]/10 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : isError || !categories || categories.length === 0 ? (
        <div className="bg-white border border-[#EAD8C0]/10 rounded-2xl p-12 text-center text-gray-500">
          <FolderTree className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">No categories found</p>
          <p className="text-xs text-gray-400 mt-1">Add a new category to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories?.map((category) => (
            <div
              key={category.id}
              className={`bg-white rounded-2xl p-5 border shadow-sm transition-all flex justify-between items-center ${
                category.isActive ? 'border-[#EAD8C0]/25' : 'border-gray-200 bg-gray-50/50 opacity-70'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Image display */}
                <div className="w-16 h-16 rounded-xl bg-[#FAF8F5] border border-gray-100 flex items-center justify-center overflow-hidden">
                  {category.image ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/${category.image}`}
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FolderTree className="h-6 w-6 text-gray-400" />
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-gray-800 text-sm">{category.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-[#FAF8F5] border border-[#EAD8C0]/30 px-2 py-0.5 rounded-full text-gray-500 font-semibold">
                      Order: {category.displayOrder}
                    </span>
                    {!category.isActive && (
                      <span className="text-[10px] bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditDialog(category)}
                  className="p-2 hover:bg-[#FAF8F5] rounded-xl text-gray-600 hover:text-[#3C2A21] transition-colors"
                  title="Edit"
                >
                  <Edit2 className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => toggleActiveMutation.mutate({ id: category.id, isActive: !category.isActive })}
                  className={`p-2 rounded-xl transition-colors ${
                    category.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'
                  }`}
                  title={category.isActive ? 'Deactivate (Soft Delete)' : 'Reactivate'}
                >
                  {category.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE & EDIT DIALOG MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#EAD8C0]/20 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-extrabold text-[#3C2A21] mb-1">
              {editId ? 'Edit Category' : 'Create Category'}
            </h2>
            <p className="text-xs text-gray-400 mb-6">Define details and display orders</p>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs text-center font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Category Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Category Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cold Beverages, Burgers"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                  required
                />
              </div>

              {/* Display Order */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Display Order</label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAD8C0] focus:border-[#8F6A50] focus:ring-1 focus:ring-[#8F6A50]/20 outline-none rounded-xl text-sm"
                  min="0"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Category Image</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-[#FAF8F5] border border-[#EAD8C0]/30 flex items-center justify-center overflow-hidden relative group">
                    {imagePath ? (
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/${imagePath}`}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FolderTree className="h-6 w-6 text-gray-300" />
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-4 py-2 border border-[#EAD8C0] hover:bg-[#FAF8F5] text-xs font-bold text-gray-600 rounded-xl transition-colors">
                      <Camera className="h-4 w-4" />
                      Choose File
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[10px] text-gray-400 block mt-1.5">Max 5MB. WebP, JPG, PNG formats supported.</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-6">
                <Button
                  type="button"
                  onClick={closeDialog}
                  variant="ghost"
                  className="rounded-xl h-10 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending || uploading}
                  className="bg-[#3C2A21] text-[#EAD8C0] hover:bg-[#4A3525] rounded-xl px-6 h-10 text-xs shadow-md"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
