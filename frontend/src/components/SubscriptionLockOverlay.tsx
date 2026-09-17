import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldAlert, 
  Key, 
  PhoneCall, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  Store, 
  DollarSign, 
  Calendar, 
  Eye, 
  EyeOff 
} from 'lucide-react';
import type { AppSettings } from '../types';
import { api } from '../services/api';

interface SubscriptionLockOverlayProps {
  isLocked: boolean;
  settings: AppSettings | null;
  onUnlocked: (newSettings: AppSettings) => void;
}

export const SubscriptionLockOverlay: React.FC<SubscriptionLockOverlayProps> = ({
  isLocked,
  settings,
  onUnlocked,
}) => {
  const [vendorPin, setVendorPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLocked) {
      setVendorPin('');
      setError(null);
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const pin = vendorPin.trim();
    if (!pin) {
      setError('Please enter the Vendor Master Unlock PIN');
      pinInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.setSubscriptionLock({
        action: 'unlock',
        vendor_pin: pin,
      });

      onUnlocked(res.settings);
    } catch (err: any) {
      setError(err.message || 'Invalid Vendor PIN. Contact the software provider for your unlock code.');
      setVendorPin('');
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (vendorPin.length < 10) {
      setVendorPin((prev) => prev + digit);
    }
    pinInputRef.current?.focus();
  };

  const clearPin = () => {
    setVendorPin('');
    pinInputRef.current?.focus();
  };

  const currency = settings?.currency_symbol || 'Rs. ';
  const monthlyFee = settings?.subscription_monthly_fee || '5,000.00';
  const providerPhone = settings?.subscription_provider_phone || '+94 77 123 4567';
  const dueDate = settings?.subscription_due_date || '1st of Every Month';
  const notice = settings?.subscription_notice || 
    'Your monthly POS software rental fee is overdue. Please contact the software provider to settle your bill and restore service.';

  return (
    <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-rose-600/80 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl shadow-rose-950/60 flex flex-col items-center animate-in zoom-in-95">
        
        {/* Glowing Alert Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border-2 border-rose-500/50 flex items-center justify-center text-rose-400 mb-4 shadow-xl shadow-rose-950/80 animate-pulse">
          <ShieldAlert className="w-9 h-9" />
        </div>

        {/* Title & Explanation */}
        <h2 className="text-xl sm:text-2xl font-black text-white text-center tracking-tight">
          POS Application Suspended
        </h2>
        <div className="mt-1 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-300 font-extrabold text-[11px] uppercase tracking-wider">
          Monthly Software Rental Overdue
        </div>

        <p className="text-xs text-slate-300 mt-3 text-center leading-relaxed">
          {notice}
        </p>

        {/* Billing & Contact Card */}
        <div className="w-full my-5 bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-slate-500" />
              Client Store:
            </span>
            <strong className="text-white font-semibold">{settings?.store_name || 'FreshMart POS'}</strong>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              Monthly Rental Fee:
            </span>
            <span className="text-rose-400 font-mono font-black text-sm">{currency}{monthlyFee}</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Billing Cycle / Due:
            </span>
            <span className="text-slate-200 font-medium">{dueDate}</span>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-300 font-bold">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              Provider Support Hotline:
            </span>
            <a 
              href={`tel:${providerPhone}`}
              className="text-emerald-400 hover:text-emerald-300 font-mono font-black text-sm tracking-wide hover:underline cursor-pointer"
            >
              {providerPhone}
            </a>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs text-center flex items-center justify-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Vendor Master PIN Unlock Form */}
        <form onSubmit={handleUnlock} className="w-full space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Vendor Master Unlock PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                ref={pinInputRef}
                type={showPassword ? 'text' : 'password'}
                required
                value={vendorPin}
                onChange={(e) => setVendorPin(e.target.value)}
                placeholder="Enter 4-digit Vendor PIN (Default: 9999)"
                className="w-full bg-slate-950 border-2 border-rose-700/70 focus:border-emerald-500 text-white text-center rounded-xl py-2.5 px-10 text-base font-mono tracking-widest outline-hidden transition placeholder:text-slate-500 placeholder:text-xs placeholder:tracking-normal"
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Touch Virtual Keypad */}
          <div className="pt-1">
            <div className="grid grid-cols-3 gap-2 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendDigit(digit)}
                  className="h-10 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-white font-bold rounded-xl text-base font-mono transition border border-slate-700/60 cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={clearPin}
                className="h-10 bg-slate-800/60 hover:bg-slate-750 text-slate-400 font-bold rounded-xl text-[11px] uppercase tracking-wider transition border border-slate-700/60 cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => appendDigit('0')}
                className="h-10 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-white font-bold rounded-xl text-base font-mono transition border border-slate-700/60 cursor-pointer"
              >
                0
              </button>
              <button
                type="submit"
                disabled={loading || !vendorPin.trim()}
                className="h-10 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center shadow-lg cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading || !vendorPin.trim()}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/50 cursor-pointer mt-3"
          >
            <Unlock className="w-4 h-4" />
            <span>{loading ? 'Verifying Vendor Authorization...' : 'Reactivate & Restore POS (↵)'}</span>
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-800/80 w-full text-center">
          <p className="text-[10px] text-slate-500 font-mono">
            Vendor Master Control • Default Release PIN: <strong>9999</strong>
          </p>
        </div>
      </div>
    </div>
  );
};
