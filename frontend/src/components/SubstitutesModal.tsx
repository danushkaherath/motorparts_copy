import React, { useState, useEffect } from 'react';
import { Sparkles, X, Plus, ArrowRight, Package } from 'lucide-react';
import type { CartItem, Product, AppSettings } from '../types';
import { api } from '../services/api';

interface SubstitutesModalProps {
  isOpen: boolean;
  item: CartItem | null;
  settings: AppSettings | null;
  onClose: () => void;
  onSelectSubstitute: (product: Product, replaceOriginal: boolean) => void;
}

export const SubstitutesModal: React.FC<SubstitutesModalProps> = ({
  isOpen,
  item,
  settings,
  onClose,
  onSelectSubstitute,
}) => {
  const [substitutes, setSubstitutes] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    if (!isOpen || !item) {
      setSubstitutes([]);
      return;
    }

    const loadSubstitutes = async () => {
      setLoading(true);
      try {
        // Fetch candidates by brand or category or search keyword
        const query = item.brand || item.category_name || item.product_name.split(' ')[0] || '';
        const res = await api.getPaginatedProducts({ search: query, limit: 8 });
        // Filter out current item and out-of-stock products
        const filtered = (res.products || []).filter(
          (p) => p.id !== item.product_id && (typeof p.stock_quantity !== 'number' || p.stock_quantity > 0)
        );
        setSubstitutes(filtered);
      } catch (err) {
        console.error('Failed to load substitutes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSubstitutes();
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#0b101b] border border-[#1b283f] rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#162135] bg-[#090e18]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Product Substitutes & Alternatives</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                For: <span className="text-cyan-400 font-bold">{item.product_name}</span>
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

        {/* Content */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Searching alternative products...
            </div>
          ) : substitutes.length === 0 ? (
            <div className="text-center py-10 text-slate-500 space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm text-slate-400">No direct substitutes found in catalog</p>
              <p className="text-xs text-slate-600">Consider searching catalog with barcode or generic name</p>
            </div>
          ) : (
            <div className="space-y-3">
              {substitutes.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-[#0e1626] border border-[#1c2a42] rounded-2xl p-4 flex items-center justify-between hover:border-cyan-500/50 transition group"
                >
                  <div className="flex-1 pr-4">
                    <div className="font-bold text-white text-sm uppercase group-hover:text-cyan-300 transition">
                      {sub.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 font-mono">
                      <span className="text-cyan-400">{sub.barcode}</span>
                      {sub.brand && <span>• {sub.brand}</span>}
                      {sub.category_name && <span>• {sub.category_name}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Stock: <strong className={sub.stock_quantity <= 5 ? 'text-rose-400' : 'text-slate-300'}>{sub.stock_quantity}</strong> {sub.unit || 'pcs'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono">
                      <span className="text-base font-extrabold text-cyan-400 block">
                        {currency}{sub.selling_price.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => {
                          onSelectSubstitute(sub, true);
                          onClose();
                        }}
                        title="Replace original item in cart"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>Replace</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          onSelectSubstitute(sub, false);
                          onClose();
                        }}
                        title="Add as additional item"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
