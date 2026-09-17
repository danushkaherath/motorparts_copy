import React, { useState, useEffect } from 'react';
import { Layers, X, Trash2, Calendar, MapPin, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Product, ProductBatch, AppSettings } from '../types';
import { api } from '../services/api';

interface ProductBatchesModalProps {
  product: Product;
  isOpen: boolean;
  settings?: AppSettings | null;
  currentUser?: any;
  onClose: () => void;
  onBatchesUpdated?: () => void;
}

export const ProductBatchesModal: React.FC<ProductBatchesModalProps> = ({
  product,
  isOpen,
  settings,
  currentUser,
  onClose,
  onBatchesUpdated,
}) => {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = settings?.currency_symbol || 'Rs.';
  const isAdmin = currentUser?.role === 'admin';
  const isSupervisor = currentUser?.role === 'supervisor';
  const canDeleteBatch = isAdmin || isSupervisor;

  const fetchBatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProductBatches(product.id);
      setBatches(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchBatches();
    }
  }, [isOpen, product?.id]);

  if (!isOpen) return null;

  const handleDelete = async (batch: ProductBatch) => {
    const batchLabel = batch.batch_number || 'Standard';
    const confirmMsg = 'Are you sure you want to delete Batch "' + batchLabel + '" (Selling: ' + currency + ' ' + Number(batch.selling_price).toFixed(2) + ', Stock: ' + batch.stock_quantity + ')?\n\nThis will remove this price revision and adjust total store stock.';
    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(batch.id);
      setError(null);
      await api.deleteBatch(batch.id);
      await fetchBatches();
      if (onBatchesUpdated) {
        onBatchesUpdated();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Manage Batches & Price Details</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
                </span>
              </div>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-slate-200">{product.name}</span>
                {product.barcode && (
                  <span className="ml-2 text-xs font-mono text-slate-500">[{product.barcode}]</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Banner */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Deleting stale or erroneous batches removes duplicate price options from cashier POS popups and automatically recalculates total item stock.
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <span>Loading batches and prices...</span>
            </div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-60" />
              <p className="font-medium text-slate-300">No individual batches found</p>
              <p className="text-xs text-slate-500 mt-1">
                Standard pricing is currently defined in the master product profile.
              </p>
            </div>
          ) : (
            batches.map((batch, index) => {
              const isFirst = index === 0;
              const isOutOfStock = typeof batch.stock_quantity === 'number' && batch.stock_quantity <= 0;
              return (
                <div
                  key={batch.id}
                  className={`p-4 rounded-xl border flex items-center justify-between transition ${
                    isOutOfStock
                      ? 'border-slate-800 bg-slate-950/40 opacity-70'
                      : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        Batch: {batch.batch_number || 'Standard'}
                      </span>
                      {isFirst && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          Latest
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          0 Stock
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                      <span>
                        Stock: <strong className={isOutOfStock ? 'text-rose-400' : 'text-slate-200'}>{batch.stock_quantity}</strong> {product.unit || 'pcs'}
                      </span>
                      {batch.expiry_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          Exp: {batch.expiry_date}
                        </span>
                      )}
                      {batch.shelf_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {batch.shelf_location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-400 font-mono">
                        {currency} {Number(batch.selling_price || 0).toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        MRP: <span className="line-through text-slate-500">{currency} {Number(batch.mrp || batch.selling_price || 0).toFixed(2)}</span>
                      </div>
                      {Number(batch.cost_price) > 0 && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          Cost: {currency} {Number(batch.cost_price).toFixed(2)}
                        </div>
                      )}
                    </div>

                    {canDeleteBatch && (
                      <button
                        onClick={() => handleDelete(batch)}
                        disabled={deletingId === batch.id}
                        title="Delete this batch and price revision"
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/60 rounded-xl transition cursor-pointer disabled:opacity-40"
                      >
                        {deletingId === batch.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {canDeleteBatch ? 'Click the trash icon to remove any unwanted price or batch entry.' : 'Admin or supervisor role required to delete batches.'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
