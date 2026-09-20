import React, { useEffect, useState } from 'react';
import { 
  ShoppingCart, 
  Package, 
  Clock, 
  Truck, 
  BarChart3, 
  Settings, 
  Wifi, 
  WifiOff, 
  Lock,
  RefreshCw,
  Store,
  Users,
  User,
  Shield,
  ShieldCheck,
  ShoppingBag,
  HeartHandshake,
  BookOpen,
  ClipboardCheck,
  LogOut
} from 'lucide-react';
import type { AppSettings, Shift, AppModule } from '../types';
import { api } from '../services/api';
import { localDb } from '../services/offlineDb';

interface NavbarProps {
  activeTab: AppModule;
  setActiveTab: (tab: AppModule) => void;
  settings: AppSettings | null;
  activeShift: Shift | null;
  currentUser?: any;
  onOpenShiftModal: () => void;
  onOpenXReport: () => void;
  onLock: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  settings,
  activeShift,
  currentUser,
  onOpenShiftModal,
  onOpenXReport,
  onLock,
  onLogout,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check for unsynced offline orders
    const interval = setInterval(async () => {
      try {
        const count = await localDb.offlineOrders.where('synced').equals(0).count();
        setPendingSyncCount(count);
        if (count > 0 && navigator.onLine) {
          triggerSync();
        }
      } catch (err) {
        // ignore
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const triggerSync = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const synced = await api.syncOfflineOrders();
      if (synced > 0) {
        const count = await localDb.offlineOrders.where('synced').equals(0).count();
        setPendingSyncCount(count);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const isProcurementEnabled = settings?.feature_procurement === 'true';
  const isTaxOrReportsEnabled = settings?.feature_tax === 'true';

  const userRole = currentUser?.role || 'cashier';
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';

  const hasModuleAccess = (mod: string) => {
    if (!currentUser) return false;
    // If user has customized permissions array, strictly honor it
    if (Array.isArray(currentUser.permissions) && currentUser.permissions.length > 0) {
      return currentUser.permissions.includes(mod);
    }
    // Fallbacks if permissions array is not set or empty
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'supervisor') {
      return ['pos', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'].includes(mod);
    }
    return mod === 'pos';
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex items-center justify-between select-none shadow-md sticky top-0 z-30">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center gap-6">
        <div 
          onClick={() => {
            if (hasModuleAccess('pos')) setActiveTab('pos');
          }}
          className="flex items-center gap-2.5 cursor-pointer font-bold text-lg text-emerald-400 tracking-tight hover:opacity-90 transition"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <span>{settings?.store_name || 'FreshMart POS'}</span>
        </div>

        <nav className="flex items-center gap-1">
          {hasModuleAccess('pos') && (
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'pos'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>POS Cashier</span>
            </button>
          )}

          {hasModuleAccess('catalog') && (
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Catalog</span>
            </button>
          )}

          {hasModuleAccess('inventory') && (
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Inventory</span>
            </button>
          )}

          {hasModuleAccess('grn') && (
            <button
              onClick={() => setActiveTab('grn')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'grn'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>GRN Inward</span>
            </button>
          )}

          {hasModuleAccess('customers') && (
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-pink-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <HeartHandshake className="w-4 h-4" />
              <span>Customers</span>
            </button>
          )}

          {hasModuleAccess('shifts') && (
            <button
              onClick={() => setActiveTab('shifts')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'shifts'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Shifts & Z-Report</span>
            </button>
          )}

          {/* Conditional Module: Procurement */}
          {isProcurementEnabled && hasModuleAccess('procurement') && (
            <button
              onClick={() => setActiveTab('procurement')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'procurement'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Procurement</span>
            </button>
          )}

          {/* Conditional Module: Reports & Tax */}
          {hasModuleAccess('reports') && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reports {isTaxOrReportsEnabled ? '& Tax' : ''}</span>
            </button>
          )}

          {/* Staff & Roles */}
          {hasModuleAccess('staff') && (
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Staff & Roles</span>
            </button>
          )}

          {/* Settings Switchboard */}
          {hasModuleAccess('settings') && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}
        </nav>
      </div>

      {/* Right: Active User Badge, Shift indicator, Sync Status, Cashier Info */}
      <div className="flex items-center gap-3">
        {/* Active User Badge & Switcher */}
        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1 rounded-full text-xs">
          <div className="flex items-center gap-1.5">
            {isAdmin ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : isSupervisor ? (
              <Shield className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <User className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="font-bold text-slate-200">{currentUser?.username || 'cashier1'}</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wide ${
              isAdmin
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                : isSupervisor
                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                : 'bg-blue-950 text-blue-300 border border-blue-800/60'
            }`}>
              {userRole}
            </span>
          </div>
          <button
            onClick={onLock}
            title="Switch user or enter PIN (F9)"
            className="ml-1 px-2 py-0.5 bg-slate-750 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            Switch
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              title="Sign out and lock terminal"
              className="ml-1 px-2 py-0.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white rounded-md text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-2.5 h-2.5" />
              <span>Logout</span>
            </button>
          )}
        </div>

        {/* Lock Terminal Button */}
        <button
          onClick={onLock}
          title="Lock Register (F9)"
          className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>F9 Lock</span>
        </button>
        {activeShift ? (
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-3 py-1 rounded-full text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-400">Shift #{activeShift.id.slice(-4)}:</span>
            <span className="font-semibold text-slate-200">{activeShift.cashier_name}</span>
            <button
              onClick={onOpenXReport}
              title="View Mid-Shift X-Report"
              className="ml-1 px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded font-mono text-[10px] font-bold"
            >
              X-REPORT
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenShiftModal}
            className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Open Cash Drawer / Start Shift</span>
          </button>
        )}

        {/* Sync Status Badge */}
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 text-xs">
              <Wifi className="w-3.5 h-3.5" />
              <span>Online</span>
              {pendingSyncCount > 0 && (
                <button
                  onClick={triggerSync}
                  className="flex items-center gap-1 ml-1 text-amber-300 font-bold hover:underline"
                  title="Click to push offline orders now"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>({pendingSyncCount} cached)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-800/80 text-amber-400 text-xs">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode ({pendingSyncCount} saved)</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
