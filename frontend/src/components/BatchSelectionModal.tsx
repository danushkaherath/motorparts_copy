import React, { useState, useEffect } from 'react';
import { Layers, X, Calendar, MapPin, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import type { Product, ProductBatch } from '../types';
import { api } from '../services/api';

interface BatchSelectionModalProps {
  product: Product;
  batches: ProductBatch[];
  isOpen: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onSelectBatch: (batch: ProductBatch) => void;
  onBatchDeleted?: (deletedBatchId: string) => void;
}

export const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({
  product,
  batches: initialBatches,
  isOpen,
  canDelete = false,
  onClose,
  onSelectBatch,
  onBatchDeleted,
}) => {
  const [batches, setBatches] = useState<ProductBatch[]>(initialBatches);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setBatches(initialBatches);
  }, [initialBatches]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Check numeric keys 1-9 for quick batch selection
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= batches.length) {
        e.preventDefault();
        const targetBatch = batches[num - 1];
        if (typeof targetBatch.stock_quantity === 'number' && targetBatch.stock_quantity <= 0) {
          return;
        }
        onSelectBatch(targetBatch);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, batches, onClose, onSelectBatch]);

  if (!isOpen) return null;

  const handleDeleteBatch = async (e: React.MouseEvent, batch: ProductBatch) => {
    e.stopPropagation();
    const batchLabel = batch.batch_number || 'Standard';
    const confirmMsg = 'Delete Batch "' + batchLabel + '" (Rs. ' + Number(batch.selling_price).toFixed(2) + ')?\n\nThis will remove this price option and adjust store stock.';
    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(batch.id);
      await api.deleteBatch(batch.id);
      const updated = batches.filter((b) => b.id !== batch.id);
      setBatches(updated);
      if (onBatchDeleted) {
        onBatchDeleted(batch.id);
      }
      if (updated.length === 1) {
        onSelectBatch(updated[0]);
      } else if (updated.length === 0) {
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Select Batch & Price</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {batches.length} Batches Available
                </span>
              </div>
              <p className="text-sm text-slate-400">
                <span className="font-semibold text-slate-200">{product.name}</span>
                {product.barcode && <span className="ml-2 text-xs font-mono text-slate-500">[{product.barcode}]</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guidance Prompt */}
        <div className="px-5 py-3 bg-amber-950/30 border-b border-amber-900/30 flex items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Different selling prices or batches are recorded. Select the price printed on the customer item. Press <strong>[1-{batches.length}]</strong> or click a card.</span>
        </div>

        {/* Batches List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {batches.map((batch, index) => {
            const isLatest = index === 0;
            const isOutOfStock = typeof batch.stock_quantity === 'number' && batch.stock_quantity <= 0;
            return (
              <div
                key={batch.id || index}
                onClick={() => {
                  if (isOutOfStock) return;
                  onSelectBatch(batch);
                }}
                className={`group relative p-4 rounded-xl border transition-all duration-150 flex items-center justify-between shadow-sm ${
                  isOutOfStock
                    ? 'opacity-40 border-rose-900/30 bg-slate-950/40 cursor-not-allowed'
                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800/80 hover:border-amber-500/50 cursor-pointer hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Shortcut key badge */}
                  <div className={`w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center transition-colors ${
                    isOutOfStock
                      ? 'bg-slate-800/50 text-slate-500'
                      : 'bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-300'
                  }`}>
                    {index + 1}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold transition-colors ${isOutOfStock ? 'text-slate-400' : 'text-white group-hover:text-amber-300'}`}>
                        Batch: {batch.batch_number || 'Standard'}
                      </span>
                      {isOutOfStock ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Out of Stock
                        </span>
                      ) : isLatest ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          Latest
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400 font-mono">
                      <span>
                        Stock: <strong className={isOutOfStock ? 'text-rose-400 font-bold' : 'text-slate-200'}>{isOutOfStock ? '0 (Out of stock)' : batch.stock_quantity}</strong> {!isOutOfStock && (product.unit || 'pcs')}
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
                </div>

                {/* Pricing Badges & Delete */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-xl font-bold font-mono transition-transform ${isOutOfStock ? 'text-slate-500' : 'text-emerald-400 group-hover:scale-105'}`}>
                      Rs. {Number(batch.selling_price || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      MRP: <span className="line-through text-slate-500">Rs. {Number(batch.mrp || batch.selling_price || 0).toFixed(2)}</span>
                    </div>
                    {Number(batch.cost_price) > 0 && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        Cost: Rs. {Number(batch.cost_price).toFixed(2)}
                      </div>
                    )}
                  </div>

                  {canDelete && (
                    <button
                      onClick={(e) => handleDeleteBatch(e, batch)}
                      disabled={deletingId === batch.id}
                      title="Delete this batch / old price revision"
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 rounded-xl transition cursor-pointer"
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
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">Esc</kbd> to cancel
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
