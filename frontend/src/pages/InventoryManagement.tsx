import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  X, 
  Check, 
  RefreshCw, 
  MapPin, 
  Clock, 
  ArrowUpDown,
  Archive,
  Download,
  Layers
} from 'lucide-react';
import type { Product, AppSettings } from '../types';
import { api } from '../services/api';
import { ProductBatchesModal } from '../components/ProductBatchesModal';

interface InventoryProps {
  settings: AppSettings | null;
  currentUser?: any;
}

export const InventoryManagement: React.FC<InventoryProps> = ({ settings, currentUser }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterLowStock, setFilterLowStock] = useState<boolean>(false);
  const [filterExpiring, setFilterExpiring] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Summary KPIs
  const [summary, setSummary] = useState<{
    total_items: number;
    total_units: number;
    cost_valuation: number;
    retail_valuation: number;
    low_stock_count: number;
    expiring_count: number;
  }>({
    total_items: 0,
    total_units: 0,
    cost_valuation: 0,
    retail_valuation: 0,
    low_stock_count: 0,
    expiring_count: 0,
  });

  // Modals
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustData, setAdjustData] = useState<{
    type: 'RESTOCK' | 'DAMAGE' | 'AUDIT_COUNT';
    amount: number;
    notes: string;
    shelf_location: string;
    batch_number: string;
    expiry_date: string;
    cost_price: number;
    selling_price: number;
    mrp: number;
    is_new_batch: boolean;
  }>({
    type: 'RESTOCK',
    amount: 10,
    notes: '',
    shelf_location: '',
    batch_number: '',
    expiry_date: '',
    cost_price: 0,
    selling_price: 0,
    mrp: 0,
    is_new_batch: false,
  });

  // Add from Catalog Modal
  const [isAddCatalogModalOpen, setIsAddCatalogModalOpen] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [catalogSearching, setCatalogSearching] = useState<boolean>(false);
  const [chosenCatalogProduct, setChosenCatalogProduct] = useState<Product | null>(null);
  const [catalogStockForm, setCatalogStockForm] = useState<{
    stock_quantity: number;
    min_stock_level: number;
    shelf_location: string;
    batch_number: string;
    expiry_date: string;
    cost_price: number;
    selling_price: number;
    mrp: number;
    is_new_batch: boolean;
  }>({
    stock_quantity: 20,
    min_stock_level: 10,
    shelf_location: '',
    batch_number: '',
    expiry_date: '',
    cost_price: 0,
    selling_price: 0,
    mrp: 0,
    is_new_batch: false,
  });

  // Reset Inventory Modal (Admin only)
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Batches & Prices Manager Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchModalProduct, setBatchModalProduct] = useState<Product | null>(null);

  const currency = settings?.currency_symbol || 'Rs.';
  const isExpiryEnabled = settings?.feature_expiry === 'true';
  const isAdmin = currentUser?.role === 'admin';
  const isSupervisor = currentUser?.role === 'supervisor';
  const canManageInventory = isAdmin || isSupervisor;

  useEffect(() => {
    loadData(1);
    loadSummary();
  }, [search, filterCategory, filterLowStock, filterExpiring, pageSize]);

  const loadSummary = async () => {
    try {
      const data = await api.getInventorySummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load inventory summary:', err);
    }
  };

  const loadData = async (pageToLoad: number = currentPage) => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        page: pageToLoad,
        limit: pageSize,
        in_inventory: 'true', // ONLY items actively in store inventory
      };
      if (search.trim()) params.search = search.trim();
      if (filterCategory) params.category_id = filterCategory;
      if (filterLowStock) params.low_stock = 'true';
      if (filterExpiring) params.expiring_soon = 'true';

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
      console.error('Failed to load store inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  // Search catalog items to add into inventory
  const handleCatalogSearch = async (q: string) => {
    setCatalogSearch(q);
    if (!q.trim() || q.length < 2) {
      setCatalogResults([]);
      return;
    }
    try {
      setCatalogSearching(true);
      const res = await api.getPaginatedProducts({ search: q.trim(), limit: 20 });
      setCatalogResults(res.products || []);
    } catch (err) {
      console.error('Catalog search failed:', err);
    } finally {
      setCatalogSearching(false);
    }
  };

  const handleSelectCatalogItem = (prod: Product) => {
    setChosenCatalogProduct(prod);
    setCatalogStockForm({
      stock_quantity: prod.stock_quantity > 0 ? prod.stock_quantity : 20,
      min_stock_level: prod.min_stock_level || 10,
      shelf_location: prod.shelf_location || '',
      batch_number: prod.batch_number || '',
      expiry_date: prod.expiry_date || '',
      cost_price: Number(prod.cost_price || 0),
      selling_price: Number(prod.selling_price || 0),
      mrp: Number(prod.mrp || prod.selling_price || 0),
      is_new_batch: false,
    });
  };

  const handleConfirmAddFromCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenCatalogProduct) return;
    try {
      await api.addToInventory(chosenCatalogProduct.id, {
        stock_quantity: Number(catalogStockForm.stock_quantity),
        min_stock_level: Number(catalogStockForm.min_stock_level),
        shelf_location: catalogStockForm.shelf_location,
        batch_number: catalogStockForm.batch_number,
        expiry_date: catalogStockForm.expiry_date,
        cost_price: Number(catalogStockForm.cost_price),
        selling_price: Number(catalogStockForm.selling_price),
        mrp: Number(catalogStockForm.mrp),
        is_new_batch: catalogStockForm.is_new_batch,
      });
      setNotification(`Added "${chosenCatalogProduct.name}" to store inventory with ${catalogStockForm.stock_quantity} ${chosenCatalogProduct.unit || 'units'}.`);
      setIsAddCatalogModalOpen(false);
      setChosenCatalogProduct(null);
      setCatalogSearch('');
      setCatalogResults([]);
      loadData();
      loadSummary();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenAdjust = (prod: Product) => {
    setSelectedProduct(prod);
    setAdjustData({
      type: 'RESTOCK',
      amount: 10,
      notes: '',
      shelf_location: prod.shelf_location || '',
      batch_number: prod.batch_number || '',
      expiry_date: prod.expiry_date || '',
      cost_price: Number(prod.cost_price || 0),
      selling_price: Number(prod.selling_price || 0),
      mrp: Number(prod.mrp || prod.selling_price || 0),
      is_new_batch: false,
    });
    setIsAdjustModalOpen(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await api.adjustStock({
        product_id: selectedProduct.id,
        type: adjustData.type,
        amount: Number(adjustData.amount),
        notes: adjustData.notes,
        shelf_location: adjustData.shelf_location,
        batch_number: adjustData.batch_number,
        expiry_date: adjustData.expiry_date,
        cost_price: Number(adjustData.cost_price),
        selling_price: Number(adjustData.selling_price),
        mrp: Number(adjustData.mrp),
        is_new_batch: adjustData.is_new_batch,
      });
      setNotification(`Stock adjusted successfully for "${selectedProduct.name}".`);
      setIsAdjustModalOpen(false);
      setSelectedProduct(null);
      loadData();
      loadSummary();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveFromInventory = async (id: string, name: string) => {
    if (window.confirm(`Remove "${name}" from active Store Inventory?\n\nNote: The product will remain in the Product Master Catalog, but will no longer appear in your active store stock.`)) {
      try {
        await api.removeFromInventory(id);
        setNotification(`"${name}" removed from store inventory.`);
        loadData();
        loadSummary();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleResetToCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    try {
      const res = await api.resetAllStockToCatalog(adminPin);
      setNotification(res.message);
      setIsResetModalOpen(false);
      setAdminPin('');
      loadData();
      loadSummary();
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset store stock.');
    }
  };

  const exportStoreInventoryCsv = async () => {
    try {
      // Export ONLY products currently in store inventory
      const allProducts = await api.getProducts({ in_inventory: 'true', all: 'true' });
      if (!allProducts.length) {
        alert('No store inventory items to export.');
        return;
      }
      const isCashier = currentUser?.role === 'cashier';
      const headers = isCashier
        ? 'Barcode,SKU,Product Name,Brand,Category,Selling Price,Stock Quantity,Unit,Shelf Location,Batch Number,Expiry Date\n'
        : 'Barcode,SKU,Product Name,Brand,Category,Cost Price,Selling Price,Stock Quantity,Unit,Shelf Location,Batch Number,Expiry Date\n';

      const rows = allProducts
        .map((p) => {
          if (isCashier) {
            return `"${p.barcode}","${p.sku || ''}","${p.name}","${p.brand || ''}","${p.category_name || ''}",${p.selling_price},${p.stock_quantity},"${p.unit || 'pcs'}","${p.shelf_location || ''}","${p.batch_number || ''}","${p.expiry_date || ''}"`;
          }
          return `"${p.barcode}","${p.sku || ''}","${p.name}","${p.brand || ''}","${p.category_name || ''}",${p.cost_price || 0},${p.selling_price},${p.stock_quantity},"${p.unit || 'pcs'}","${p.shelf_location || ''}","${p.batch_number || ''}","${p.expiry_date || ''}"`;
        })
        .join('\n');

      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `store_inventory_stock_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (err: any) {
      alert('Failed to export inventory: ' + err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-53px)] bg-slate-950 p-6 overflow-hidden select-none">
      {/* Header & Controls */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400" />
            <span>Store Inventory & Physical Stock</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Active in-store stock levels, shelf locations, batch/expiry alerts, and stock adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsResetModalOpen(true)}
              title="Administrator only: Reset all stock to 0 / Catalog only"
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/80 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Stock to Catalog</span>
            </button>
          )}

          <button
            onClick={exportStoreInventoryCsv}
            title="Exports strictly the goods your store has in stock"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-700 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Inventory CSV</span>
          </button>

          {canManageInventory && (
            <button
              onClick={() => setIsAddCatalogModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Items from Catalog</span>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 my-3 shrink-0">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">In-Stock SKUs</span>
          <div className="text-lg font-black text-white mt-0.5">{summary.total_items.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500 mt-0.5">Active carried products</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Stock Units</span>
          <div className="text-lg font-black text-amber-400 mt-0.5">{summary.total_units.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500 mt-0.5">Physical items on floor</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Retail Stock Value</span>
          <div className="text-lg font-black text-emerald-400 mt-0.5">
            {currency} {Number(summary.retail_valuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">At selling prices</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Low Stock Alerts</span>
          <div className={`text-lg font-black mt-0.5 ${summary.low_stock_count > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {summary.low_stock_count}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">At or below threshold</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Expiring Soon (14d)</span>
          <div className={`text-lg font-black mt-0.5 ${summary.expiring_count > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {summary.expiring_count}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">Batches near expiry</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 pb-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store inventory by Barcode, SKU, Brand, or Name..."
            className="w-full bg-slate-900 border border-slate-750 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 outline-hidden focus:border-amber-400 transition"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-slate-900 border border-slate-750 text-xs text-slate-200 rounded-xl py-2 px-3 outline-hidden focus:border-amber-400"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setFilterLowStock(!filterLowStock)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
            filterLowStock
              ? 'bg-rose-950 border-rose-700 text-rose-300'
              : 'bg-slate-900 border-slate-750 text-slate-400 hover:text-white'
          }`}
        >
          Low Stock Only
        </button>

        {isExpiryEnabled && (
          <button
            onClick={() => setFilterExpiring(!filterExpiring)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
              filterExpiring
                ? 'bg-amber-950 border-amber-700 text-amber-300'
                : 'bg-slate-900 border-slate-750 text-slate-400 hover:text-white'
            }`}
          >
            Expiring Soon
          </button>
        )}

        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="bg-slate-900 border border-slate-750 text-xs text-slate-200 rounded-xl py-2 px-3 outline-hidden focus:border-amber-400 ml-auto"
        >
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
        </select>
      </div>

      {/* Inventory Table */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-950/80 text-slate-400 sticky top-0 z-10 border-b border-slate-800 select-none">
              <tr>
                <th className="py-3 px-4 font-semibold">Barcode / SKU</th>
                <th className="py-3 px-4 font-semibold">Product Name & Location</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold text-right">Cost Price</th>
                <th className="py-3 px-4 font-semibold text-right">Selling Price</th>
                <th className="py-3 px-4 font-semibold text-right">MRP (Actual)</th>
                <th className="py-3 px-4 font-semibold text-center">Stock Level</th>
                <th className="py-3 px-4 font-semibold">Batch & Expiry</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading in-store inventory...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Archive className="w-8 h-8 text-slate-600" />
                      <p className="font-semibold text-slate-400">No products in Store Inventory yet.</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Your master catalog is safe. Click <strong>"Add Items from Catalog"</strong> above to stock goods into your store.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const minLevel = p.min_stock_level || 10;
                  const isLow = p.stock_quantity <= minLevel;
                  const isOut = p.stock_quantity <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-855/50 transition">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        <div className="font-semibold text-slate-300">{p.barcode}</div>
                        {p.sku && p.sku !== p.barcode && (
                          <div className="text-[10px] text-slate-500">SKU: {p.sku}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-100">{p.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          {p.shelf_location ? (
                            <span className="flex items-center gap-1 text-amber-400/90 font-medium">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{p.shelf_location}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">No shelf assigned</span>
                          )}
                          {p.brand && <span>• {p.brand}</span>}
                        </div>
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
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {currency} {Number(p.cost_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {currency} {Number(p.selling_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {currency} {Number(p.mrp || p.selling_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                              isOut 
                                ? 'bg-rose-950/80 border-rose-700 text-rose-400'
                                : isLow
                                ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                                : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                            }`}
                          >
                            <span>{p.stock_quantity} {p.unit || 'pcs'}</span>
                          </span>
                          {isLow && (
                            <span className="text-[9px] text-rose-400 font-semibold mt-0.5">
                              {isOut ? 'Out of Stock' : `Low Stock (≤ ${minLevel})`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[11px] text-slate-300 font-mono">
                          {p.batch_number ? <span>Batch: {p.batch_number}</span> : <span className="text-slate-500">—</span>}
                        </div>
                        {p.expiry_date && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5 text-slate-500" />
                            <span>Exp: {p.expiry_date}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageInventory && (
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
                          {canManageInventory && (
                            <button
                              onClick={() => handleOpenAdjust(p)}
                              title="Stock Adjustment (+ / - / Audit)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/50 transition cursor-pointer"
                            >
                              <ArrowUpDown className="w-3.5 h-3.5" />
                              <span>Adjust</span>
                            </button>
                          )}
                          {canManageInventory && (
                            <button
                              onClick={() => handleRemoveFromInventory(p.id, p.name)}
                              title="Remove from Store Stock (Keeps in Master Catalog)"
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

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-amber-400" />
                  <span>Adjust Stock Quantity</span>
                </h2>
                <p className="text-[11px] text-slate-400 truncate max-w-[280px]">{selectedProduct.name}</p>
              </div>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Current Stock:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">{selectedProduct.stock_quantity} {selectedProduct.unit || 'pcs'}</span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Adjustment Action *</label>
                <select
                  value={adjustData.type}
                  onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-amber-400 font-semibold"
                >
                  <option value="RESTOCK">Receive / Restock (+) Add to current stock</option>
                  <option value="DAMAGE">Damage / Spoilage (-) Subtract from stock</option>
                  <option value="AUDIT_COUNT">Physical Count Audit (=) Set exact stock</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {adjustData.type === 'AUDIT_COUNT' ? 'New Exact Count Quantity *' : 'Quantity Units *'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={adjustData.amount}
                  onChange={(e) => setAdjustData({ ...adjustData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono text-sm outline-hidden focus:border-amber-400"
                />
              </div>

              {/* Prices: Cost Price, Selling Price, MRP (Actual) */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Price Updates</span>
                  <span className="text-amber-400/90 font-normal">Cost, Selling & MRP</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Cost Price</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={adjustData.cost_price}
                      onChange={(e) => setAdjustData({ ...adjustData, cost_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-white font-mono text-xs outline-hidden focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-emerald-300 font-semibold mb-1 text-[11px]">Selling Price *</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={adjustData.selling_price}
                      onChange={(e) => setAdjustData({ ...adjustData, selling_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-emerald-600/70 rounded-lg py-1.5 px-2 text-emerald-300 font-mono text-xs font-bold outline-hidden focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1 text-[11px]">MRP (Actual)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={adjustData.mrp}
                      onChange={(e) => setAdjustData({ ...adjustData, mrp: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-white font-mono text-xs outline-hidden focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Shelf Location</label>
                  <input
                    type="text"
                    value={adjustData.shelf_location}
                    onChange={(e) => setAdjustData({ ...adjustData, shelf_location: e.target.value })}
                    placeholder="e.g. Aisle 2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={adjustData.batch_number}
                    onChange={(e) => setAdjustData({ ...adjustData, batch_number: e.target.value })}
                    placeholder="e.g. B-101"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={adjustData.expiry_date}
                    onChange={(e) => setAdjustData({ ...adjustData, expiry_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-amber-400"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={adjustData.is_new_batch}
                      onChange={(e) => setAdjustData({ ...adjustData, is_new_batch: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-300 font-medium">Add as New Batch</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition shadow-lg shadow-amber-950/40 cursor-pointer"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Items from Catalog Modal */}
      {isAddCatalogModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Add Items from Master Catalog</h2>
                  <p className="text-[11px] text-slate-400">Search any item from your catalog to stock it in your store.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAddCatalogModalOpen(false);
                  setChosenCatalogProduct(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!chosenCatalogProduct ? (
              <div className="mt-4 flex-1 flex flex-col min-h-0 space-y-3">
                <div className="relative shrink-0">
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => handleCatalogSearch(e.target.value)}
                    placeholder="Type barcode, SKU, brand, or product name to search master catalog..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-hidden focus:border-amber-400 font-medium"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl divide-y divide-slate-800">
                  {catalogSearching ? (
                    <div className="py-8 text-center text-xs text-slate-500">Searching master catalog...</div>
                  ) : catalogResults.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      {catalogSearch.trim() ? 'No matching products found in catalog.' : 'Search for products to stock into your store.'}
                    </div>
                  ) : (
                    catalogResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectCatalogItem(item)}
                        className="p-3 hover:bg-slate-850/80 transition flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-100">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Barcode: {item.barcode} {item.brand && `• ${item.brand}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-emerald-400 font-mono">
                            {currency} {Number(item.selling_price).toFixed(2)}
                          </div>
                          <span className="text-[10px] text-amber-400 font-semibold hover:underline">Select & Stock →</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmAddFromCatalog} className="mt-4 space-y-4 text-xs overflow-y-auto flex-1">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white text-sm">{chosenCatalogProduct.name}</span>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">Barcode: {chosenCatalogProduct.barcode}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChosenCatalogProduct(null)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Change Item
                  </button>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Physical Stock Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={catalogStockForm.stock_quantity}
                    onChange={(e) => setCatalogStockForm({ ...catalogStockForm, stock_quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono text-sm outline-hidden focus:border-amber-400"
                  />
                </div>

                {/* Prices: Cost Price, Selling Price, MRP (Actual) */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Pricing for this stock</span>
                    <span className="text-amber-400/90 font-normal">Cost, Selling & MRP</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Cost Price</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={catalogStockForm.cost_price}
                        onChange={(e) => setCatalogStockForm({ ...catalogStockForm, cost_price: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-white font-mono text-xs outline-hidden focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-emerald-300 font-semibold mb-1 text-[11px]">Selling Price *</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={catalogStockForm.selling_price}
                        onChange={(e) => setCatalogStockForm({ ...catalogStockForm, selling_price: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-emerald-600/70 rounded-lg py-1.5 px-2 text-emerald-300 font-mono text-xs font-bold outline-hidden focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px]">MRP (Actual)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={catalogStockForm.mrp}
                        onChange={(e) => setCatalogStockForm({ ...catalogStockForm, mrp: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 px-2 text-white font-mono text-xs outline-hidden focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Min Stock Alert Level</label>
                    <input
                      type="number"
                      min="0"
                      value={catalogStockForm.min_stock_level}
                      onChange={(e) => setCatalogStockForm({ ...catalogStockForm, min_stock_level: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Shelf / Aisle Location</label>
                    <input
                      type="text"
                      value={catalogStockForm.shelf_location}
                      onChange={(e) => setCatalogStockForm({ ...catalogStockForm, shelf_location: e.target.value })}
                      placeholder="e.g. Aisle 3, Bin 12"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Batch Number</label>
                    <input
                      type="text"
                      value={catalogStockForm.batch_number}
                      onChange={(e) => setCatalogStockForm({ ...catalogStockForm, batch_number: e.target.value })}
                      placeholder="e.g. B-202"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono outline-hidden focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={catalogStockForm.expiry_date}
                      onChange={(e) => setCatalogStockForm({ ...catalogStockForm, expiry_date: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white outline-hidden focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="flex items-center pt-1 pb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={catalogStockForm.is_new_batch}
                      onChange={(e) => setCatalogStockForm({ ...catalogStockForm, is_new_batch: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-300 font-medium">Add as New Batch / Price Variant</span>
                  </label>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setChosenCatalogProduct(null)}
                    className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition shadow-lg shadow-amber-950/40 cursor-pointer"
                  >
                    Add to Store Inventory
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Store Stock Modal (Admin only) */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Reset Store Stock to Catalog Only</span>
              </h2>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetToCatalog} className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 leading-relaxed">
                This will set <strong>all store stock quantities to 0</strong> and convert them to <strong>Catalog Only</strong> items. Your master barcodes and product prices will NOT be deleted.
              </div>

              {resetError && (
                <div className="p-2.5 rounded-xl bg-rose-950 border border-rose-800 text-rose-300 text-center font-semibold">
                  {resetError}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Enter Administrator PIN to Confirm *
                </label>
                <input
                  type="password"
                  required
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="e.g. 1234"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-white font-mono tracking-widest text-center text-sm outline-hidden focus:border-rose-500"
                  autoFocus
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition shadow-lg shadow-rose-950/40 cursor-pointer"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            loadSummary();
          }}
        />
      )}
    </div>
  );
};
