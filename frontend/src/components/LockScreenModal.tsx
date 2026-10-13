import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, AlertTriangle, User, Key, Eye, EyeOff } from 'lucide-react';

interface LockScreenModalProps {
  isLocked: boolean;
  currentUser?: any;
  onUnlock: (user: any) => void;
}

export const LockScreenModal: React.FC<LockScreenModalProps> = ({ isLocked, onUnlock }) => {
  const [username, setUsername] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLocked) {
      setUsername('');
      setPin('');
      setError(null);
      setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 50);
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username');
      usernameInputRef.current?.focus();
      return;
    }
    if (!pin.trim()) {
      setError('Please enter your password or PIN');
      pinInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim(),
          pin: pin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      onUnlock(data.user);
    } catch (err: any) {
      setError(err.message || 'Incorrect username or password/PIN');
      setPin('');
      pinInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (pin.length < 12) {
      setPin((prev) => prev + digit);
    }
    pinInputRef.current?.focus();
  };

  const clearPin = () => {
    setPin('');
    pinInputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-sm w-full max-h-[96vh] overflow-y-auto p-5 sm:p-7 shadow-2xl flex flex-col items-center animate-in fade-in zoom-in-95">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-950/50">
          <Lock className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight">Register Access & Sign In</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5 text-center">
          Enter your username and password or PIN to sign in.
        </p>

        {error && (
          <div className="w-full mb-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="w-full space-y-4">
          {/* Typeable Username Input */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Username
            </label>
            <div className="relative flex items-center">
              <input
                ref={usernameInputRef}
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 text-white rounded-xl py-2.5 pl-10 pr-3 text-xs font-medium outline-hidden transition placeholder:text-slate-500"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Typeable Password / PIN Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Password / PIN
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
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter password or PIN"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 text-white rounded-xl py-2.5 pl-10 pr-10 text-xs font-mono tracking-wider outline-hidden transition placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500"
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Virtual Keypad for Touchscreens */}
          <div className="pt-2">
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
                disabled={loading || !username.trim() || !pin.trim()}
                className="h-10 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading || !username.trim() || !pin.trim()}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer mt-3"
          >
            <Unlock className="w-4 h-4" />
            <span>{loading ? 'Authenticating...' : 'Sign In & Unlock (↵)'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};


