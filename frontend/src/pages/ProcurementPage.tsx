import React, { useState, useEffect } from 'react';
import { Truck, Plus, PackageCheck, AlertCircle, Building2, Calendar, Check } from 'lucide-react';
import type { Supplier, PurchaseOrder, Product, AppSettings } from '../types';
import { api } from '../services/api';

interface ProcurementProps {
  settings: AppSettings | null;
}

export const ProcurementPage: React.FC<ProcurementProps> = ({ settings }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'suppliers'>('orders');

  // Supplier modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ name: '', contact_name: '', phone: '', email: '', address: '' });

  // PO modal
  const [isPoModalOpen, setIsPoModalOpen] = useState<boolean>(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [poItems, setPoItems] = useState<{ product_id: string; ordered_quantity: number; cost_price: number }[]>([]);

  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sups, pos, prods] = await Promise.all([
        api.getSuppliers(),
        api.getPurchaseOrders(),
        api.getProducts(),
      ]);
      setSuppliers(sups);
      setPurchaseOrders(pos);
      setProducts(prods);
    } catch (err) {
      console.error('Failed to load procurement data:', err);
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSupplier(newSupplier);
      setIsSupplierModalOpen(false);
      setNewSupplier({ name: '', contact_name: '', phone: '', email: '', address: '' });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddPoItem = () => {
    if (products.length === 0) return;
    setPoItems((prev) => [
      ...prev,
      {
        product_id: products[0].id,
        ordered_quantity: 20,
        cost_price: products[0].cost_price || 1.0,
      },
    ]);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || poItems.length === 0) {
      alert('Please select a supplier and add at least one item');
      return;
    }
    try {
      await api.createPurchaseOrder({
        supplier_id: selectedSupplierId,
        items: poItems,
      });
      setIsPoModalOpen(false);
      setPoItems([]);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReceiveStock = async (poId: string, poNum: string) => {
    if (window.confirm(`Receive stock for ${poNum}? This will immediately increase product inventory quantities.`)) {
      try {
        await api.receivePurchaseOrder(poId);
        loadData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 p-3 sm:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-4 sm:space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-400" />
              <span>Procurement & Goods Received (GRN)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage vendor supplier contacts, incoming purchase shipments, and automated inventory receiving.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              + Add Supplier
            </button>
            <button
              onClick={() => {
                if (suppliers.length === 0) {
                  alert('Please add a supplier first before creating a purchase order.');
                  return;
                }
                setSelectedSupplierId(suppliers[0].id);
                handleAddPoItem();
                setIsPoModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-amber-950/40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Purchase Order</span>
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubTab === 'orders' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveSubTab('suppliers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubTab === 'suppliers' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vendor Directory ({suppliers.length})
          </button>
        </div>

        {/* 1. PURCHASE ORDERS TABLE */}
        {activeSubTab === 'orders' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Total Order Cost</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No purchase orders recorded yet. Click "Create Purchase Order" to begin.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-800/40 transition font-mono text-[11px]">
                      <td className="py-3 px-4 font-bold text-white">{po.po_number}</td>
                      <td className="py-3 px-4 font-sans font-medium text-slate-200">{po.supplier_name}</td>
                      <td className="py-3 px-4 text-slate-400 font-sans">{new Date(po.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">{currency}{po.total_cost.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center">
                        {po.status === 'RECEIVED' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold font-sans">
                            ✓ Received in Stock
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold font-sans">
                            Pending Delivery
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        {po.status === 'PENDING' ? (
                          <button
                            onClick={() => handleReceiveStock(po.id, po.po_number)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow"
                          >
                            Receive Stock (GRN)
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500">Received</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* 2. SUPPLIERS DIRECTORY */}
        {activeSubTab === 'suppliers' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suppliers.map((s) => (
              <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-white">{s.name}</h3>
                </div>
                <div className="text-xs text-slate-400 space-y-1 pt-1">
                  {s.contact_name && <div>Contact: <span className="text-slate-200">{s.contact_name}</span></div>}
                  {s.phone && <div>Phone: <span className="text-slate-200">{s.phone}</span></div>}
                  {s.email && <div>Email: <span className="text-slate-200">{s.email}</span></div>}
                  {s.address && <div className="text-slate-500 text-[11px] truncate">{s.address}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Add New Supplier</h2>
            <form onSubmit={handleAddSupplier} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={newSupplier.name || ''}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Contact Person</label>
                <input
                  type="text"
                  value={newSupplier.contact_name || ''}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Phone</label>
                <input
                  type="text"
                  value={newSupplier.phone || ''}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Order Modal */}
      {isPoModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <h2 className="text-base font-bold text-white">Create Purchase Order</h2>
            <form onSubmit={handleCreatePo} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Select Supplier *</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300 uppercase">Order Line Items</span>
                  <button
                    type="button"
                    onClick={handleAddPoItem}
                    className="text-xs text-amber-400 hover:underline"
                  >
                    + Add Product Line
                  </button>
                </div>

                {poItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <select
                      value={item.product_id}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const prod = products.find((p) => p.id === pid);
                        const updated = [...poItems];
                        updated[idx].product_id = pid;
                        if (prod) updated[idx].cost_price = prod.cost_price;
                        setPoItems(updated);
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded py-1 px-2 text-white"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.ordered_quantity}
                      onChange={(e) => {
                        const updated = [...poItems];
                        updated[idx].ordered_quantity = parseInt(e.target.value) || 1;
                        setPoItems(updated);
                      }}
                      className="w-20 bg-slate-900 border border-slate-700 rounded py-1 px-2 text-center text-white font-mono"
                    />

                    <input
                      type="number"
                      step="0.01"
                      placeholder="Cost"
                      value={item.cost_price}
                      onChange={(e) => {
                        const updated = [...poItems];
                        updated[idx].cost_price = parseFloat(e.target.value) || 0;
                        setPoItems(updated);
                      }}
                      className="w-24 bg-slate-900 border border-slate-700 rounded py-1 px-2 text-right text-white font-mono"
                    />

                    <button
                      type="button"
                      onClick={() => setPoItems(poItems.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-rose-400 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPoModalOpen(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"
                >
                  Submit Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
