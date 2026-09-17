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
  Users,
  User,
  Shield,
  ShieldCheck,
  ShoppingBag,
  HeartHandshake,
  BookOpen,
  ClipboardCheck,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { AppSettings, Shift, AppModule } from '../types';
import { api } from '../services/api';
import { localDb } from '../services/offlineDb';

interface SidebarProps {
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

export const Sidebar: React.FC<SidebarProps> = ({
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
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pos_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('pos_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

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
      } catch {
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
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'supervisor') {
      if (Array.isArray(currentUser.permissions) && currentUser.permissions.includes(mod)) return true;
      return ['pos', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'].includes(mod);
    }
    if (Array.isArray(currentUser.permissions)) {
      return currentUser.permissions.includes(mod);
    }
    return mod === 'pos';
  };

  interface NavItem {
    id: AppModule;
    label: string;
    icon: React.ReactNode;
    activeColor: string;
    visible: boolean;
  }

  const navItems: NavItem[] = [
    {
      id: 'pos',
      label: 'POS Cashier',
      icon: <ShoppingCart className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-emerald-600 text-white shadow-sm',
      visible: hasModuleAccess('pos'),
    },
    {
      id: 'catalog',
      label: 'Catalog',
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-blue-600 text-white shadow-sm',
      visible: hasModuleAccess('catalog'),
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: <Package className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-indigo-600 text-white shadow-sm',
      visible: hasModuleAccess('inventory'),
    },
    {
      id: 'grn',
      label: 'GRN Receiving',
      icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-teal-600 text-white shadow-sm',
      visible: hasModuleAccess('grn'),
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: <HeartHandshake className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-pink-600 text-white shadow-sm',
      visible: hasModuleAccess('customers'),
    },
    {
      id: 'shifts',
      label: 'Shifts & Z-Report',
      icon: <Clock className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-purple-600 text-white shadow-sm',
      visible: hasModuleAccess('shifts'),
    },
    {
      id: 'procurement',
      label: 'Procurement',
      icon: <Truck className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-amber-600 text-white shadow-sm',
      visible: isProcurementEnabled && hasModuleAccess('procurement'),
    },
    {
      id: 'reports',
      label: isTaxOrReportsEnabled ? 'Reports & Tax' : 'Reports',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-cyan-600 text-white shadow-sm',
      visible: hasModuleAccess('reports'),
    },
    {
      id: 'staff',
      label: 'Staff & Roles',
      icon: <Users className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-indigo-600 text-white shadow-sm',
      visible: hasModuleAccess('staff'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4 shrink-0" />,
      activeColor: 'bg-slate-700 text-white shadow-sm',
      visible: hasModuleAccess('settings'),
    },
  ];

  return (
    <aside 
      className={`bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col justify-between select-none shadow-xl z-30 transition-all duration-200 shrink-0 h-screen ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Top: Brand and Collapse Toggle */}
      <div className="flex flex-col border-b border-slate-800">
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-2 p-2' : 'justify-between p-3.5 gap-2'}`}>
          <div 
            onClick={() => {
              if (hasModuleAccess('pos')) setActiveTab('pos');
            }}
            title={settings?.store_name || 'FreshMart POS'}
            className="flex items-center gap-2.5 cursor-pointer font-bold text-emerald-400 tracking-tight hover:opacity-90 transition min-w-0"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <ShoppingBag className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <span className="truncate text-base font-extrabold tracking-tight text-white">
                {settings?.store_name || 'FreshMart POS'}
              </span>
            )}
          </div>

          <button
            onClick={toggleCollapsed}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Navigation Modules (Vertical Scrollable List) */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
        {navItems.filter(item => item.visible).map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
                isActive
                  ? item.activeColor
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              {item.icon}
              {!isCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: Active User, Shifts, Terminal Lock & Sync Status */}
      <div className="border-t border-slate-800 p-2.5 space-y-2 bg-slate-950/40">
        {/* Active User Card */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} bg-slate-800/90 border border-slate-700/80 p-2 rounded-xl`}>
          <div className="flex items-center gap-2 min-w-0">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : isSupervisor ? (
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <User className="w-4 h-4 text-blue-400 shrink-0" />
            )}
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate leading-tight">
                  {currentUser?.username || 'cashier1'}
                </p>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wide inline-block mt-0.5 ${
                  isAdmin
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                    : isSupervisor
                    ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                    : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                }`}>
                  {userRole}
                </span>
              </div>
            )}
          </div>

          {!isCollapsed ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onLock}
                title="Switch user or enter PIN (F9)"
                className="px-2 py-1 bg-slate-700 hover:bg-slate-650 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Switch
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Sign out and lock terminal"
                  className="p-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="hidden" />
          )}
        </div>

        {/* Lock Terminal Button */}
        <button
          onClick={onLock}
          title="Lock Register (F9)"
          className={`w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            isCollapsed ? 'px-0' : 'px-3'
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {!isCollapsed && <span>F9 Lock</span>}
        </button>

        {/* Shift Card */}
        {activeShift ? (
          <div className={`flex items-center ${isCollapsed ? 'justify-center p-1.5' : 'justify-between p-2'} bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              {!isCollapsed && (
                <div className="truncate">
                  <span className="text-[10px] text-slate-400 block leading-tight">Shift #{activeShift.id.slice(-4)}</span>
                  <span className="font-semibold text-slate-200 text-xs truncate block">{activeShift.cashier_name}</span>
                </div>
              )}
            </div>
            <button
              onClick={onOpenXReport}
              title="View Mid-Shift X-Report"
              className={`${isCollapsed ? 'text-[9px] px-1 py-0.5' : 'px-2 py-0.5 text-[10px]'} bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-lg font-mono font-bold shrink-0 transition`}
            >
              {isCollapsed ? 'X' : 'X-REPORT'}
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenShiftModal}
            title="Open Cash Drawer / Start Shift"
            className={`w-full py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition flex items-center justify-center gap-2 ${
              isCollapsed ? 'px-0' : 'px-2 text-center'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span className="truncate">Start Shift</span>}
          </button>
        )}

        {/* Network & Offline Sync Indicator */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs`}>
          {isOnline ? (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Wifi className="w-3.5 h-3.5 shrink-0" />
              {!isCollapsed && <span>Online</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400" title={`Offline Mode (${pendingSyncCount} saved)`}>
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              {!isCollapsed && <span className="truncate">Offline ({pendingSyncCount})</span>}
            </div>
          )}

          {pendingSyncCount > 0 && isOnline && (
            <button
              onClick={triggerSync}
              className="flex items-center gap-1 text-amber-300 font-bold hover:underline shrink-0 text-[10px]"
              title="Click to push offline orders now"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {!isCollapsed && <span>Sync ({pendingSyncCount})</span>}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
