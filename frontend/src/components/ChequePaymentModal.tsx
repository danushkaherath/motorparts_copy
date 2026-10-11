import React, { useState, useEffect, useRef } from 'react';
import { FileCheck, X, Calendar, Hash, Building } from 'lucide-react';
import type { AppSettings } from '../types';

interface ChequePaymentModalProps {
  isOpen: boolean;
  totalDue: number;
  settings: AppSettings | null;
  onClose: () => void;
  onConfirm: (chequeData: { chequeNumber: string; chequeDate: string; bankName?: string }) => void;
  onSwitchToCash?: () => void;
  onSwitchToCard?: () => void;
}

export const ChequePaymentModal: React.FC<ChequePaymentModalProps> = ({
  isOpen,
  totalDue,
  settings,
  onClose,
  onConfirm,
  onSwitchToCash,
  onSwitchToCard,
}) => {
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    if (isOpen) {
      setChequeNumber('');
      setBankName('');
      // Default to today's date in YYYY-MM-DD
      const today = new Date().toISOString().slice(0, 10);
      setChequeDate(today);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chequeNumber.trim()) {
      alert('Please enter a valid Cheque Number');
      return;
    }
    if (!chequeDate.trim()) {
      alert('Please select a payment/cheque date');
      return;
    }

    onConfirm({
      chequeNumber: chequeNumber.trim(),
      chequeDate: chequeDate.trim(),
      bankName: bankName.trim() || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
      <div
        onKeyDown={handleKeyDown}
        className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5 text-purple-400 font-bold text-base sm:text-lg">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <span>Cheque / Check Payment</span>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToCash && (
              <button
                type="button"
                onClick={onSwitchToCash}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition cursor-pointer"
              >
                Cash
              </button>
            )}
            {onSwitchToCard && (
              <button
                type="button"
                onClick={onSwitchToCard}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition cursor-pointer"
              >
                Card
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Total Due Banner */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 text-center">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              TOTAL CHEQUE AMOUNT
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-purple-300 mt-1">
              {currency}{totalDue.toFixed(2)}
            </div>
          </div>

          {/* Cheque Number Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-purple-400" />
              <span>Cheque / Check Number *</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              value={chequeNumber}
              onChange={(e) => setChequeNumber(e.target.value)}
              placeholder="e.g. CHQ-981240"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-base focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition"
            />
          </div>

          {/* Cheque / Payment Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span>Cheque / Payment Date *</span>
            </label>
            <input
              type="date"
              required
              value={chequeDate}
              onChange={(e) => setChequeDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Supports current or post-dated cheque reconciliation.
            </p>
          </div>

          {/* Bank / Branch Name (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>Bank Name & Branch (Optional)</span>
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Commercial Bank / City Branch"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!chequeNumber.trim() || !chequeDate.trim()}
              className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transition cursor-pointer text-sm flex items-center justify-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              <span>Confirm Cheque</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
