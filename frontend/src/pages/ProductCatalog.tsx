import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  UploadCloud, 
  Check, 
  PackagePlus, 
  PackageCheck,
  Building2,
  X,
  Layers,
  Barcode,
  Tag,
  Sparkles
} from 'lucide-react';
import type { Product, AppSettings } from '../types';
import { api } from '../services/api';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { WipeCatalogModal } from '../components/WipeCatalogModal';
import { ProductBatchesModal } from '../components/ProductBatchesModal';
import { BarcodeLabelModal } from '../components/BarcodeLabelModal';

interface ProductCatalogProps {
  settings: AppSettings | null;
  currentUser?: any;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ settings, currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'stocked' | 'catalog_only'>('all');

  // Modals
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatColor, setNewCatColor] = useState<string>('#3b82f6');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [suggestedBarcode, setSuggestedBarcode] = useState<string>('1000030');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchModalProduct, setBatchModalProduct] = useState<Product | null>(null);

  // Barcode Labels Modal
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState<boolean>(false);
  const [barcodeProducts, setBarcodeProducts] = useState<Product[]>([]);

  // Stocking Modal
  const [stockingProduct, setStockingProduct] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState<{
    stock_quantity: number;
    min_stock_level: number;
    shelf_location: string;
    batch_number: string;
    expiry_date: string;
  }>({
    stock_quantity: 20,
    min_stock_level: 10,
    shelf_location: '',
    batch_number: '',
    expiry_date: '',
  });

  const [notification, setNotification] = useState<string | null>(null);

  const currency = settings?.currency_symbol || 'Rs.';
  const isAdmin = currentUser?.role === 'admin';
  const isSupervisor = currentUser?.role === 'supervisor';
  const canManage = isAdmin || isSupervisor;

  useEffect(() => {
    loadData(1);
  }, [search, filterCategory, filterStockStatus, pageSize]);

  const loadData = async (pageToLoad: number = currentPage) => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        page: pageToLoad,
        limit: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (filterCategory) params.category_id = filterCategory;
      if (filterStockStatus === 'stocked') params.in_inventory = 'true';
      if (filterStockStatus === 'catalog_only') params.in_inventory = 'false';

      const [res, cats] = await Promise.all([
        api.getPaginatedProducts(params),
        fetch('/api/products/categories').then((r) => (r.ok ? r.json() : [])),
      ]);
      setProducts(res.products || []);
      setTotalProducts(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setCurrentPage(res.page || 1);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = async () => {
    let nextCode = '1000030';
    try {
      nextCode = await api.getNextBarcode();
    } catch {
      nextCode = '1000030';
    }
    setSuggestedBarcode(nextCode);

    setEditingProduct({
      barcode: nextCode,
      sku: nextCode,
      name: '',
      brand: '',
      category_id: categories[0]?.id || '',
      cost_price: 0,
      selling_price: 0,
      mrp: 0,
      unit: 'pcs',
      is_quick_pick: 0,
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct({ ...prod });
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await api.saveProduct(editingProduct);
      setIsEditModalOpen(false);
      setEditingProduct(null);
      setNotification(`Product "${editingProduct.name}" saved to Master Catalog.`);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently delete "${name}" from the Master Catalog?`)) {
      try {
        await api.deleteProduct(id);
        setNotification(`Product "${name}" deleted from catalog.`);
        loadData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleOpenStocking = (prod: Product) => {
    setStockingProduct(prod);
    setStockForm({
      stock_quantity: prod.stock_quantity > 0 ? prod.stock_quantity : 20,
      min_stock_level: prod.min_stock_level || 10,
      shelf_location: prod.shelf_location || '',
      batch_number: prod.batch_number || '',
      expiry_date: prod.expiry_date || '',
    });
  };

  const handleConfirmStocking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockingProduct) return;
    try {
      await api.addToInventory(stockingProduct.id, {
        stock_quantity: Number(stockForm.stock_quantity),
        min_stock_level: Number(stockForm.min_stock_level),
        shelf_location: stockForm.shelf_location,
        batch_number: stockForm.batch_number,
        expiry_date: stockForm.expiry_date,
      });
      setNotification(`"${stockingProduct.name}" is now stocked in Store Inventory with ${stockForm.stock_quantity} ${stockingProduct.unit || 'units'}.`);
      setStockingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const exportMasterCatalogCsv = async () => {
    try {
      const allProducts = await api.getProducts({ all: 'true' });
      if (!allProducts.length) {
        alert('No products in catalog to export.');
        return;
      }
      const isCashier = currentUser?.role === 'cashier';
      const headers = isCashier
        ? 'Barcode,SKU,Product Name,Brand,Category,Selling Price,MRP,Store Stocked,Stock Qty,Unit\n'
        : 'Barcode,SKU,Product Name,Brand,Category,Cost Price,Selling Price,MRP,Store Stocked,Stock Qty,Unit\n';

      const rows = allProducts
        .map((p) => {
          const isStocked = (p.is_in_inventory === 1 || p.stock_quantity > 0) ? 'YES' : 'NO';
          const qty = p.stock_quantity || 0;
          if (isCashier) {
            return `"${p.barcode}","${p.sku || ''}","${p.name}","${p.brand || ''}","${p.category_name || ''}",${p.selling_price},${p.mrp || p.selling_price},"${isStocked}",${qty},"${p.unit || 'pcs'}"`;
          }
          return `"${p.barcode}","${p.sku || ''}","${p.name}","${p.brand || ''}","${p.category_name || ''}",${p.cost_price || 0},${p.selling_price},${p.mrp || p.selling_price},"${isStocked}",${qty},"${p.unit || 'pcs'}"`;
        })
        .join('\n');

      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `product_master_catalog_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (err: any) {
      alert('Failed to export catalog: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 p-3 sm:p-6 overflow-hidden select-none">
      {/* Header & Master Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-800 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400 shrink-0" />
            <span>Product Master Catalog</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Master database of performance parts, modification hardware, and vehicle accessories ({totalProducts.toLocaleString()} items total).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsWipeModalOpen(true)}
              title="Administrator only: Wipe master product catalog"
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Wipe Catalog</span>
            </button>
          )}

          {canManage && (
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Catalog CSV</span>
            </button>
          )}

          <button
            onClick={exportMasterCatalogCsv}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-700 cursor-pointer"
          >
            Export Catalog CSV
          </button>

          {canManage && (
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Tag className="w-4 h-4" />
              <span>Categories</span>
            </button>
          )}

          {canManage && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-950/40 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 py-3 sm:py-4 shrink-0">
        <div className="relative flex-1 w-full max-w-full sm:max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master catalog by Barcode, SKU, Brand, or Name..."
            className="w-full bg-slate-900 border border-slate-750 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 outline-hidden focus:border-blue-400 transition"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-900 border border-slate-750 text-xs text-slate-200 rounded-xl py-2 px-3 outline-hidden focus:border-blue-400 flex-1 sm:flex-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filterStockStatus}
            onChange={(e) => setFilterStockStatus(e.target.value as any)}
            className="bg-slate-900 border border-slate-750 text-xs text-slate-200 rounded-xl py-2 px-3 outline-hidden focus:border-blue-400 font-medium flex-1 sm:flex-none"
          >
            <option value="all">All Catalog Items</option>
            <option value="stocked">Stocked in Store Inventory</option>
            <option value="catalog_only">Catalog Only (Not Stocked)</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-slate-900 border border-slate-750 text-xs text-slate-200 rounded-xl py-2 px-3 outline-hidden focus:border-blue-400"
          >
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[650px] text-left border-collapse text-xs">
            <thead className="bg-slate-950/80 text-slate-400 sticky top-0 z-10 border-b border-slate-800 select-none">
              <tr>
                <th className="py-3 px-4 font-semibold">Barcode / SKU</th>
                <th className="py-3 px-4 font-semibold">Product Name & Brand</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold text-center">Store Stock Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Loading master catalog items...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No products found matching the criteria.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isStocked = (p.is_in_inventory === 1 || p.stock_quantity > 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        <div className="font-semibold text-slate-300">{p.barcode}</div>
                        {p.sku && p.sku !== p.barcode && (
                          <div className="text-[10px] text-slate-500">SKU: {p.sku}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-100">{p.name}</div>
                        {p.brand && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-2.5 h-2.5 text-slate-500" />
                            <span>{p.brand}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                          style={{
                            backgroundColor: `${p.category_color || '#3b82f6'}15`,
                            borderColor: `${p.category_color || '#3b82f6'}40`,
                            color: p.category_color || '#60a5fa',
                          }}
                        >
                          {p.category_name || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isStocked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                            <PackageCheck className="w-3 h-3 text-emerald-400" />
                            <span>In Stock ({p.stock_quantity} {p.unit || 'pcs'})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-800/80 border border-slate-700 text-slate-400">
                            <span>Catalog Only</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isStocked && (
                            <button
                              onClick={() => {
                                setBatchModalProduct(p);
                                setIsBatchModalOpen(true);
                              }}
                              title="Manage Batches & Prices (Delete stale revisions)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                            >
                              <Layers className="w-3.5 h-3.5 text-amber-400" />
                              <span>Batches</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenStocking(p)}
                            title={isStocked ? 'Update store stock quantity' : 'Stock this item in Store Inventory'}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              isStocked 
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50'
                            }`}
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>{isStocked ? 'Stock' : 'Add to Stock'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setBarcodeProducts([p]);
                              setIsBarcodeModalOpen(true);
                            }}
                            title="Print Barcode Stickers (Xprinter XP-365B)"
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => handleOpenEdit(p)}
                              title="Edit Master Product Details"
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteProduct(p.id, p.name)}
                              title="Delete from Catalog"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div>
            Showing {(currentPage - 1) * pageSize + (products.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts.toLocaleString()} items
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="font-mono text-slate-300 font-semibold">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => loadData(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Stocking Modal (Add Catalog Item to Store Inventory) */}
      {stockingProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Stock in Store Inventory</h2>
                  <p className="text-[11px] text-slate-400 truncate max-w-[260px]">{stockingProduct.name}</p>
                </div>
              </div>
              <button
                onClick={() => setStockingProduct(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmStocking} className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">Barcode: <span className="font-mono text-slate-200 font-bold">{stockingProduct.barcode}</span></div>
                {Number(stockingProduct.selling_price) > 0 && (
                  <div className="text-[11px] text-slate-400">Selling Price: <span className="font-mono text-emerald-400 font-bold">{currency} {Number(stockingProduct.selling_price).toFixed(2)}</span></div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Physical Stock Quantity *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={stockForm.stock_quantity}
                  onChange={(e) => setStockForm({ ...stockForm, stock_quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono text-sm outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Measured in {stockingProduct.unit || 'pcs'}. Setting this adds the item directly to active store inventory.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Min Stock Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stockForm.min_stock_level}
                    onChange={(e) => setStockForm({ ...stockForm, min_stock_level: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Shelf / Aisle Location
                  </label>
                  <input
                    type="text"
                    value={stockForm.shelf_location}
                    onChange={(e) => setStockForm({ ...stockForm, shelf_location: e.target.value })}
                    placeholder="e.g. Bay 2, Rack C-04"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Batch / Lot Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={stockForm.batch_number}
                    onChange={(e) => setStockForm({ ...stockForm, batch_number: e.target.value })}
                    placeholder="e.g. LOT-2026-X"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={stockForm.expiry_date}
                    onChange={(e) => setStockForm({ ...stockForm, expiry_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStockingProduct(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  Confirm & Stock Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Master Product Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <span>{editingProduct.id ? 'Edit Catalog Product' : 'Add New Product to Catalog'}</span>
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-semibold">Barcode *</label>
                    {suggestedBarcode && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProduct((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  barcode: suggestedBarcode,
                                  sku: prev.sku === prev.barcode || !prev.sku ? suggestedBarcode : prev.sku,
                                }
                              : prev
                          )
                        }
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 cursor-pointer transition"
                        title="Click to apply suggested incremental GTIN / Barcode"
                      >
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        <span>Suggested: <strong>{suggestedBarcode}</strong></span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={editingProduct.barcode || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        barcode: e.target.value,
                        sku: editingProduct.sku === editingProduct.barcode ? e.target.value : (editingProduct.sku || e.target.value),
                      })
                    }
                    placeholder={`e.g. ${suggestedBarcode || '1000030'}`}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-blue-400"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Sequential GTIN/Barcode (starts at 1000030). Fully editable.
                  </p>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    placeholder="Defaults to barcode"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="e.g. HKS Hi-Power Exhaust Muffler 76mm"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Brand</label>
                  <input
                    type="text"
                    value={editingProduct.brand || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    placeholder="e.g. Brembo, HKS, Motul, BC Racing"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={editingProduct.category_id || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-blue-400"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Unit of Measurement</label>
                <select
                  value={editingProduct.unit || 'pcs'}
                  onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-blue-400"
                >
                  <option value="pcs">Pieces (pcs) - Individual Parts / Hardware</option>
                  <option value="set">Set (set) - Complete Suspension, Bushings or Plugs</option>
                  <option value="kit">Kit (kit) - Turbo, Big Brake or Intercooler Kits</option>
                  <option value="pair">Pair (pr) - Front/Rear Lights, Wheel Spacers or Discs</option>
                  <option value="can">Can (can) - 1L / 4L Engine Oil, Degreaser or Additives</option>
                  <option value="bottle">Bottle (btl) - Brake Fluid, Coolant or Injector Cleaner</option>
                  <option value="roll">Roll (roll) - Heat Wrap, Decals, Tint or Vacuum Hoses</option>
                  <option value="meter">Meter (m) - Braided Fuel Lines or Silicone Tubing</option>
                  <option value="box">Box (bx) - Fasteners, Gaskets or Clamps</option>
                  <option value="pack">Pack (pk) - Clip Sets or O-Rings</option>
                  <option value="l">Liters (L) - Bulk Fluids / Gear Oils</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-lg shadow-blue-950/40 cursor-pointer"
                >
                  Save to Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Bulk Upload Modal (Target: Catalog) */}
      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          setNotification('Master catalog CSV imported successfully.');
          loadData();
        }}
      />

      {/* Wipe Catalog Modal */}
      <WipeCatalogModal
        isOpen={isWipeModalOpen}
        productCount={totalProducts}
        onClose={() => setIsWipeModalOpen(false)}
        onSuccess={(count) => {
          setNotification(`Product catalog wiped successfully. Removed ${count} products.`);
          loadData();
        }}
      />

      {/* Batches & Prices Management Modal */}
      {isBatchModalOpen && batchModalProduct && (
        <ProductBatchesModal
          product={batchModalProduct}
          isOpen={isBatchModalOpen}
          settings={settings}
          currentUser={currentUser}
          onClose={() => {
            setIsBatchModalOpen(false);
            setBatchModalProduct(null);
          }}
          onBatchesUpdated={() => {
            loadData();
          }}
        />
      )}

      {/* Barcode & Label Sticker Designer/Printer Modal */}
      {isBarcodeModalOpen && barcodeProducts.length > 0 && (
        <BarcodeLabelModal
          isOpen={isBarcodeModalOpen}
          onClose={() => {
            setIsBarcodeModalOpen(false);
            setBarcodeProducts([]);
          }}
          products={barcodeProducts}
          settings={settings}
        />
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-400" />
                <span>Manage Modification Categories</span>
              </h2>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add new Category */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCatName.trim()) return;
                try {
                  await api.createCategory({ name: newCatName.trim(), color: newCatColor });
                  setNewCatName('');
                  const updated = await api.getCategories();
                  setCategories(updated);
                  setNotification(`Category "${newCatName.trim()}" created successfully.`);
                } catch (err: any) {
                  alert(err.message || 'Failed to create category');
                }
              }}
              className="mt-4 flex gap-2"
            >
              <input
                type="text"
                placeholder="New Category Name (e.g. Turbochargers, ECU Tuning)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-purple-400"
              />
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="w-10 h-9 p-0.5 rounded-xl border border-slate-700 bg-slate-950 cursor-pointer"
                title="Category theme color"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-md transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* List of categories */}
            <div className="mt-4 flex-1 overflow-y-auto space-y-2 max-h-72 pr-1 custom-scrollbar">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: c.color || '#3b82f6' }}
                    />
                    <span className="font-semibold text-white">{c.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`Delete category "${c.name}"? Products under this category will become Uncategorized.`)) {
                        try {
                          await api.deleteCategory(c.id);
                          const updated = await api.getCategories();
                          setCategories(updated);
                          setNotification(`Category "${c.name}" deleted.`);
                        } catch (err: any) {
                          alert(err.message || 'Failed to delete category');
                        }
                      }
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-850 transition cursor-pointer"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
