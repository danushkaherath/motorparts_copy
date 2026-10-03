import React, { useState, useEffect } from 'react';
import { UserPlus, X, Phone, User, Check, AlertCircle } from 'lucide-react';
import type { Customer } from '../types';
import { api } from '../services/api';

interface QuickCustomerModalProps {
  isOpen: boolean;
  initialPhone?: string;
  onClose: () => void;
  onCustomerRegistered: (customer: Customer) => void;
}

export const QuickCustomerModal: React.FC<QuickCustomerModalProps> = ({
  isOpen,
  initialPhone = '',
  onClose,
  onCustomerRegistered,
}) => {
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(initialPhone || '');
      setName('');
      setEmail('');
      setError(null);
    }
  }, [isOpen, initialPhone]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the customer name');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter a valid mobile number');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newCustomer = await api.createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      onCustomerRegistered(newCustomer);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-60 p-4">
      <div className="bg-[#0e1626] border border-cyan-500/40 rounded-2xl max-w-sm w-full max-h-[92vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#090f1a] border-b border-[#1b283f] flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400">
            <UserPlus className="w-5 h-5" />
            <span className="font-bold text-sm text-white">Register Loyalty Customer</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Mobile Number *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                autoFocus
                placeholder="e.g. 0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#070b13] border border-[#1b283f] focus:border-cyan-500 rounded-xl py-2 pl-9 pr-3 text-xs text-white font-mono outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Customer Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="e.g. Kasun Perera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#070b13] border border-[#1b283f] focus:border-cyan-500 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Email (Optional)
            </label>
            <input
              type="email"
              placeholder="e.g. customer@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#070b13] border border-[#1b283f] focus:border-cyan-500 rounded-xl py-2 px-3 text-xs text-white outline-hidden"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Registering...' : 'Register & Attach'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
