import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, X, CornerDownLeft } from 'lucide-react';
import type { AppSettings } from '../types';

interface CardPaymentModalProps {
  isOpen: boolean;
  totalDue: number;
  settings: AppSettings | null;
  onClose: () => void;
  onConfirm: (cardRef: string) => void;
  onSwitchToCash?: () => void;
}

export const CardPaymentModal: React.FC<CardPaymentModalProps> = ({
  isOpen,
  totalDue,
  settings,
  onClose,
  onConfirm,
  onSwitchToCash,
}) => {
  const [cardRef, setCardRef] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    if (isOpen) {
      setCardRef('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm(cardRef);
    } else if (e.key === 'Escape') {
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
          <div className="flex items-center gap-2.5 text-blue-400 font-bold text-base sm:text-lg">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <span>Card Payment</span>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToCash && (
              <button
                type="button"
                onClick={onSwitchToCash}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <span>Switch to Cash</span>
                <span className="text-[10px] text-emerald-200 font-mono hidden sm:inline">[F4]</span>
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
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 sm:p-5 text-center">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              CHARGE TO CARD TERMINAL
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
              {currency}{totalDue.toFixed(2)}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-950/30 border border-blue-800/50 p-3.5 rounded-xl text-xs text-blue-300 leading-relaxed">
            Please insert, tap, or swipe customer card on external payment terminal for{' '}
            <strong className="text-white font-bold">{currency}{totalDue.toFixed(2)}</strong>.
          </div>

          {/* Optional Card Reference / Approval Code */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Card Approval / Ref # (Optional)
            </label>
            <input
              ref={inputRef}
              type="text"
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
              placeholder="e.g. AUTH-4921 or Last 4 digits"
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-400 text-slate-100 rounded-xl py-2.5 px-4 outline-hidden text-sm font-mono transition"
            />
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
            onClick={() => onConfirm(cardRef)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-950/50 cursor-pointer"
          >
            <span>Approve & Complete Sale</span>
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
