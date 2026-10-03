import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, X, ArrowRight, CornerDownLeft } from 'lucide-react';
import type { AppSettings } from '../types';

interface CashPaymentModalProps {
  isOpen: boolean;
  totalDue: number;
  settings: AppSettings | null;
  onClose: () => void;
  onConfirm: (tenderAmount: number) => void;
  onSwitchToCard?: () => void;
}

export const CashPaymentModal: React.FC<CashPaymentModalProps> = ({
  isOpen,
  totalDue,
  settings,
  onClose,
  onConfirm,
  onSwitchToCard,
}) => {
  const [tenderInput, setTenderInput] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    if (isOpen) {
      setTenderInput(totalDue.toFixed(2));
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, totalDue]);

  if (!isOpen) return null;

  const tenderNum = parseFloat(tenderInput) || 0;
  const changeDue = Math.max(0, Math.round((tenderNum - totalDue) * 100) / 100);
  const isSufficient = tenderNum >= totalDue;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isSufficient) {
        onConfirm(tenderNum);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handlePreset = (amount: number) => {
    setTenderInput(amount.toFixed(2));
  };

  // Preset button calculations (tailored for LKR and high-denomination currencies)
  const isLkrOrHigh = (settings?.currency_symbol || '').toUpperCase().includes('LKR') || 
                      (settings?.currency_symbol || '').includes('Rs') || 
                      totalDue > 150;

  const presets = isLkrOrHigh
    ? Array.from(
        new Set([
          totalDue,
          Math.ceil(totalDue / 50) * 50,
          Math.ceil(totalDue / 100) * 100,
          Math.ceil(totalDue / 500) * 500,
          Math.ceil(totalDue / 1000) * 1000,
          Math.ceil(totalDue / 5000) * 5000,
        ])
      )
        .filter((v) => v >= totalDue)
        .slice(0, 5)
    : Array.from(
        new Set([
          totalDue,
          Math.ceil(totalDue / 5) * 5,
          Math.ceil(totalDue / 10) * 10,
          Math.ceil(totalDue / 20) * 20,
          Math.ceil(totalDue / 50) * 50,
          Math.ceil(totalDue / 100) * 100,
        ])
      )
        .filter((v) => v >= totalDue)
        .slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
      <div 
        onKeyDown={handleKeyDown}
        className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base sm:text-lg">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <span>Cash Tender Payment</span>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToCard && (
              <button
                type="button"
                onClick={onSwitchToCard}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <span>Switch to Card</span>
                <span className="text-[10px] text-blue-200 font-mono hidden sm:inline">[F5]</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
          {/* Total Due Banner */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 text-center">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              TOTAL AMOUNT DUE
            </span>
            <div className="text-4xl font-extrabold text-white mt-1">
              {currency}{totalDue.toFixed(2)}
            </div>
          </div>

          {/* Tender Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Cash Tendered ({currency})
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="number"
                step="0.01"
                value={tenderInput}
                onChange={(e) => setTenderInput(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border-2 border-emerald-500/70 focus:border-emerald-400 text-3xl font-extrabold text-emerald-400 rounded-xl py-3 px-4 outline-hidden text-right font-mono transition"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-500">
                {currency}
              </span>
            </div>
          </div>

          {/* Quick Denomination Presets */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Quick Cash Presets
            </span>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handlePreset(amt)}
                  className={`py-2 px-3 rounded-lg text-sm font-bold border transition ${
                    Math.abs(tenderNum - amt) < 0.001
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                  }`}
                >
                  {amt === totalDue ? 'Exact ' : ''}
                  {currency}{amt.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {/* Change Due Box */}
          <div
            className={`p-4 rounded-xl border text-center transition ${
              isSufficient
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            <span className="text-xs uppercase tracking-widest font-semibold block">
              {isSufficient ? 'CHANGE DUE TO CUSTOMER' : 'INSUFFICIENT TENDER'}
            </span>
            <div className="text-3xl font-black mt-1 font-mono">
              {isSufficient ? `${currency}${changeDue.toFixed(2)}` : `Need ${currency}${(totalDue - tenderNum).toFixed(2)} more`}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-800 bg-slate-850 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-slate-400 hover:text-white text-sm font-medium transition cursor-pointer text-center"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            disabled={!isSufficient}
            onClick={() => onConfirm(tenderNum)}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-lg ${
              isSufficient
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>Complete Sale</span>
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
