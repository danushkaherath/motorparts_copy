import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X, ShieldAlert, KeyRound, CheckCircle2, RotateCcw } from 'lucide-react';
import { api } from '../services/api';

interface ResetDummyDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deleted: {
    orders: number;
    order_items: number;
    shifts: number;
    products: number;
    suppliers: number;
    customers: number;
  }) => void;
}

export const ResetDummyDataModal: React.FC<ResetDummyDataModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [adminPin, setAdminPin] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');
  const [wipeAllProducts, setWipeAllProducts] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAdminPin('');
      setConfirmText('');
      setWipeAllProducts(false);
      setError(null);
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'RESET';
  const canSubmit = isConfirmed && adminPin.trim().length >= 4 && !loading;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.resetDummyData({
        adminPin: adminPin.trim(),
        wipeAllProducts,
      });
      onSuccess(res.deleted);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reset dummy data');
      setAdminPin('');
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-amber-600/60 rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl shadow-amber-950/40 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-700/80 text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <span>Reset Dummy Data & Statistics</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Callout */}
        <div className="mt-4 p-4 rounded-xl bg-amber-950/30 border border-amber-700/50 text-xs space-y-2.5">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Clean Slate: Reset Dummy Data & Analytics</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            This utility clears all test sales orders, shift logs, dummy contacts, and resets all Dashboard & Reports sales statistics directly to <strong>0</strong>:
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 pl-1">
            <li>Wipes all test/dummy orders and order line items.</li>
            <li>Wipes all cashier shift logs and expected cash balances.</li>
            <li>Wipes sample suppliers and sample customers, resetting customer points to 0.</li>
            <li>Wipes dummy inventory batches and procurement records.</li>
            <li>Resets today's sales, transaction counts, and top-selling product statistics to 0.</li>
            <li><strong>Preserves</strong>: Store branding, categories, and administrator/owner logins.</li>
          </ul>
        </div>

        {/* Checkbox: Wipe All Products Option */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
          <input
            id="wipe-all-products-checkbox"
            type="checkbox"
            checked={wipeAllProducts}
            onChange={(e) => setWipeAllProducts(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-amber-500 border-slate-700 bg-slate-900 cursor-pointer"
          />
          <label htmlFor="wipe-all-products-checkbox" className="text-xs text-slate-300 cursor-pointer select-none">
            <strong className="text-white block font-medium">Also clear all products in catalog</strong>
            <span>If checked, all items in your catalog will be deleted. If unchecked, only seeded sample dummy products will be removed.</span>
          </label>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleReset} className="mt-4 space-y-4">
          {/* Admin PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Administrator PIN
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Default PIN: 1234</span>
            </label>
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="Enter Admin PIN"
              required
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-center text-sm font-mono tracking-widest text-white outline-hidden transition"
            />
          </div>

          {/* Safety Confirm Check */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Type <strong className="text-amber-400 font-mono tracking-wider">RESET</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESET"
              required
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-center text-xs font-bold text-white uppercase outline-hidden transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition shadow-lg shadow-amber-950/50 cursor-pointer"
            >
              {loading ? (
                <span>Resetting Dummy Data...</span>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Dummy Data & Stats</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
