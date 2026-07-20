'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Image as ImageIcon,
  Plus,
  Edit2,
  Sliders,
  Eye,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  Search,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Banner {
  id: string;
  title: string;
  description: string | null;
  subtitle?: string | null;
  imageUrl: string;
  buttonText: string | null;
  targetType: 'NONE' | 'CATEGORY' | 'MENU_ITEM' | 'CUSTOM';
  targetAction: string | null;
  displayOrder: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('');
  const [denied, setDenied] = useState(false);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [targetType, setTargetType] = useState<'NONE' | 'CATEGORY' | 'MENU_ITEM' | 'CUSTOM'>('NONE');
  const [targetAction, setTargetAction] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploading, setUploading] = useState(false);

  // Helper date formatter
  const formatDatetimeLocal = (dateString?: string | Date | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', fileList[0]);

    try {
      const response = await api.post('/uploads?folder=banners', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(response.data.filePath);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  // Fetch Session
  const fetchSessionAndData = async () => {
    try {
      const stored = localStorage.getItem('ccb_staff');
      if (stored) {
        const parsed = JSON.parse(stored);
        setRole(parsed.role);
        if (parsed.role === 'WAITER' || parsed.role === 'CASHIER') {
          setDenied(true);
          setLoading(false);
          return;
        }
      } else {
        setDenied(true);
        setLoading(false);
        return;
      }

      await fetchBanners();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const res = await api.get('/banners');
      setBanners(res.data || []);
    } catch (err) {
      console.error('Failed to load banners:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionAndData();
  }, []);

  const openCreateModal = () => {
    setIsEdit(false);
    setSelectedId('');
    setTitle('');
    setDescription('');
    setImageUrl('');
    setButtonText('');
    setTargetType('NONE');
    setTargetAction('');
    setDisplayOrder(0);
    setIsActive(true);
    setStartDate(formatDatetimeLocal(new Date()));
    setEndDate('');
    setShowModal(true);
  };

  const openEditModal = (banner: Banner) => {
    setIsEdit(true);
    setSelectedId(banner.id);
    setTitle(banner.title);
    setDescription(banner.description || banner.subtitle || '');
    setImageUrl(banner.imageUrl);
    setButtonText(banner.buttonText || '');
    setTargetType(banner.targetType);
    setTargetAction(banner.targetAction || '');
    setDisplayOrder(banner.displayOrder);
    setIsActive(banner.isActive);
    setStartDate(formatDatetimeLocal(banner.startDate));
    setEndDate(banner.endDate ? formatDatetimeLocal(banner.endDate) : '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !imageUrl) return;

    let targetActionBackend: 'COUPON' | 'MENU_ITEM' | 'CATEGORY' | 'NONE' = 'NONE';
    let targetCouponId: string | null = null;
    let targetMenuItemId: string | null = null;
    let targetCategoryId: string | null = null;

    if (targetType === 'CATEGORY') {
      targetActionBackend = 'CATEGORY';
      targetCategoryId = targetAction.trim();
    } else if (targetType === 'MENU_ITEM') {
      targetActionBackend = 'MENU_ITEM';
      targetMenuItemId = targetAction.trim();
    } else if (targetType === 'CUSTOM') {
      targetActionBackend = 'COUPON';
      targetCouponId = targetAction.trim();
    }

    const startObj = startDate ? new Date(startDate) : new Date();
    const endObj = endDate ? new Date(endDate) : new Date(Date.now() + 50 * 365 * 24 * 60 * 60 * 1000);

    if (startDate && endDate && startObj >= endObj) {
      alert('End date must be after start date.');
      return;
    }

    const payload = {
      image: imageUrl.trim(),
      title: title.trim(),
      subtitle: description.trim() || null,
      buttonText: buttonText.trim() || null,
      buttonAction: null,
      startDate: startObj.toISOString(),
      endDate: endObj.toISOString(),
      priority: Number(displayOrder),
      isActive,
      targetAction: targetActionBackend,
      targetCouponId: targetCouponId || null,
      targetMenuItemId: targetMenuItemId || null,
      targetCategoryId: targetCategoryId || null,
    };

    try {
      if (isEdit) {
        await api.put(`/banners/${selectedId}`, payload);
      } else {
        await api.post('/banners', payload);
      }
      setShowModal(false);
      await fetchBanners();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save banner.');
    }
  };

  const toggleBannerStatus = async (id: string, current: boolean) => {
    try {
      await api.patch(`/banners/${id}/status`, { isActive: !current });
      await fetchBanners();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to toggle banner status.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <ImageIcon className="animate-spin h-10 w-10 text-[#8F6A50] mx-auto" />
          <p className="text-sm text-[#3C2A21] font-semibold">Loading promotions board...</p>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl border border-rose-100 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#3C2A21]">Access Restrained</h2>
        <p className="text-sm text-[#8F6A50]">
          Your account role ({role}) does not possess the permissions required to edit promo banner definitions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3C2A21] tracking-tight">Promo Banners</h1>
          <p className="text-sm text-[#8F6A50] mt-1">
            Display beautiful hero banners on the customer digital menu, linking directly to categories or items.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm shadow-md"
        >
          <Plus className="w-4 h-4" /> Create Banner
        </Button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banners.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-[#EAD8C0]/15 text-[#8F6A50] font-medium">
            No banners defined. Create one to display on the Customer digital menu.
          </div>
        ) : (
          banners.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-3xl overflow-hidden border border-[#EAD8C0]/15 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300 group"
            >
              {/* Image Preview */}
              <div className="relative h-44 bg-[#FAF8F5] overflow-hidden">
                <img
                  src={b.imageUrl}
                  alt={b.title}
                  onError={(e) => {
                    (e.target as any).src = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=500';
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3">
                  <button
                    onClick={() => toggleBannerStatus(b.id, b.isActive)}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold border shadow-sm ${
                      b.isActive
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {b.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>

              {/* Details */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-[#3C2A21] line-clamp-1">{b.title}</h3>
                  <p className="text-xs text-[#8F6A50] line-clamp-2 font-medium">{b.description || 'No description provided.'}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#EAD8C0]/10 text-xs font-semibold text-[#8F6A50]">
                  <div className="flex justify-between">
                    <span>Target Type:</span>
                    <span className="font-bold text-[#3C2A21]">{b.targetType}</span>
                  </div>
                  {b.targetAction && (
                    <div className="flex justify-between">
                      <span>Target Value:</span>
                      <span className="font-bold text-[#3C2A21] truncate max-w-[120px]">{b.targetAction}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Rank Order:</span>
                    <span className="font-bold text-[#3C2A21]">{b.displayOrder}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => openEditModal(b)}
                    className="flex-1 bg-[#FAF8F5] border border-[#EAD8C0]/35 text-[#8F6A50] hover:bg-[#8F6A50] hover:text-white rounded-xl text-xs font-bold py-2.5"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Modify
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EAD8C0]/15 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-[#EAD8C0]/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#3C2A21]">
                {isEdit ? 'Modify Promo Banner' : 'Create Promo Banner'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#8F6A50] hover:text-[#3C2A21] font-bold text-lg p-2"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8F6A50] uppercase">Banner Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 20% Off Coffee This Weekend!"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-semibold outline-none focus:border-[#8F6A50]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8F6A50] uppercase">Subtext / Description</label>
                <textarea
                  rows={2}
                  placeholder="Additional details displaying under the title..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-medium outline-none focus:border-[#8F6A50] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8F6A50] uppercase block mb-1">Banner Image</label>
                {imageUrl && (
                  <div className="relative w-full h-32 mb-2 rounded-xl overflow-hidden border border-[#EAD8C0]/25">
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-2 right-2 bg-rose-600 text-white text-xs px-2 py-1 rounded-lg font-bold shadow-md hover:bg-rose-700 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="banner-image-upload"
                  />
                  <label
                    htmlFor="banner-image-upload"
                    className="flex-1 flex items-center justify-center px-4 py-2.5 bg-[#FAF8F5] border-2 border-dashed border-[#EAD8C0]/30 hover:border-[#8F6A50] rounded-xl text-sm font-semibold text-[#8F6A50] cursor-pointer transition-colors"
                  >
                    {uploading ? 'Uploading image...' : imageUrl ? 'Replace Image File' : 'Select Image File'}
                  </label>
                  <input
                    type="text"
                    placeholder="Or paste external URL..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Button Call to Action Text</label>
                  <input
                    type="text"
                    placeholder="e.g. Order Now (default: View Details)"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Display Rank Order</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Click Target Type</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm font-bold text-[#3C2A21]"
                  >
                    <option value="NONE">NO TARGET ACTION</option>
                    <option value="CATEGORY">LINK TO CATEGORY</option>
                    <option value="MENU_ITEM">LINK TO MENU ITEM</option>
                    <option value="CUSTOM">CUSTOM LINK ACTION</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase">Target Action Value (ID / Slug)</label>
                  <input
                    type="text"
                    placeholder="Category ID, Item ID, or external link..."
                    value={targetAction}
                    onChange={(e) => setTargetAction(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase block">Start Date / Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8F6A50] uppercase block">End Date / Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EAD8C0]/25 rounded-xl text-sm outline-none focus:border-[#8F6A50]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FAF8F5] rounded-2xl">
                <div>
                  <h4 className="font-bold text-sm text-[#3C2A21]">Active Status</h4>
                  <p className="text-xs text-[#8F6A50] mt-0.5">Toggle visibility on the digital menu carousel.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isActive ? 'bg-[#8F6A50]' : 'bg-[#EAD8C0]/45'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#EAD8C0]/10">
                <Button
                  type="button"
                  onClick={() => setShowModal(false)}
                  variant="ghost"
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8F6A50]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#8F6A50] hover:bg-[#3C2A21] text-white px-5 py-2.5 rounded-xl text-sm font-bold"
                >
                  Save Banner
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
