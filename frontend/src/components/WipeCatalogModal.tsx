import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X, ShieldAlert, KeyRound, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

interface WipeCatalogModalProps {
  isOpen: boolean;
  productCount: number;
  onClose: () => void;
  onSuccess: (deletedCount: number) => void;
}

export const WipeCatalogModal: React.FC<WipeCatalogModalProps> = ({
  isOpen,
  productCount,
  onClose,
  onSuccess,
}) => {
  const [adminPin, setAdminPin] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAdminPin('');
      setConfirmText('');
      setError(null);
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'WIPE';
  const canSubmit = isConfirmed && adminPin.trim().length >= 4 && !loading;

  const handleWipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.wipeProductCatalog(adminPin.trim());
      onSuccess(res.deleted_count ?? productCount);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to wipe product catalog');
      setAdminPin('');
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-rose-900/60 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-rose-950/50 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-rose-400 font-bold text-base">
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span>Wipe Entire Product Catalog</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Severe Warning Callout */}
        <div className="mt-4 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Danger: Permanent Data Deletion</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            This action will permanently delete <strong className="text-white font-mono font-bold">{productCount}</strong> products from the database, including barcodes, stock counts, cost/selling prices, and quick-picks.
          </p>
          <p className="text-rose-300/90 font-medium">
            ⚠️ This operation is irreversible and strictly restricted to Administrators.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleWipe} className="mt-4 space-y-4">
          {/* Admin PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-rose-400" />
                Administrator PIN
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Default Admin PIN: 1234</span>
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
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-center text-sm font-mono tracking-widest text-white outline-hidden transition"
            />
          </div>

          {/* Safety Confirm Check */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Type <strong className="text-rose-400 font-mono tracking-wider">WIPE</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type WIPE"
              required
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3.5 py-2 text-center text-xs font-bold text-white uppercase outline-hidden transition"
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-950/50 cursor-pointer"
            >
              {loading ? (
                <span>Wiping Catalog...</span>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Wipe All Products</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
