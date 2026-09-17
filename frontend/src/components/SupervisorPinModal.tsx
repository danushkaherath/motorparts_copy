import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';

interface SupervisorPinModalProps {
  isOpen: boolean;
  actionDescription: string;
  onClose: () => void;
  onAuthorized: (pin?: string) => void;
}

export const SupervisorPinModal: React.FC<SupervisorPinModalProps> = ({
  isOpen,
  actionDescription,
  onClose,
  onAuthorized,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || (data.user?.role !== 'admin' && data.user?.role !== 'supervisor')) {
        throw new Error('Supervisor authorization failed. Requires Admin/Supervisor PIN.');
      }
      onAuthorized(pin);
    } catch (err: any) {
      setError(err.message || 'Invalid Supervisor PIN. (Default: 1234)');
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>Supervisor Approval Required</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 mt-3 mb-4">
          Action: <strong className="text-white">{actionDescription}</strong>
        </p>

        {error && (
          <div className="mb-4 p-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Enter Supervisor / Admin PIN
            </label>
            <input
              ref={inputRef}
              type="password"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="e.g. 1234"
              className="w-full bg-slate-950 border border-slate-700 text-center font-mono text-xl tracking-widest text-emerald-400 rounded-xl py-2 px-3 outline-hidden focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-400 hover:text-white text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow"
            >
              Authorize Action
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
