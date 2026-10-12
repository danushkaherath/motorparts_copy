import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PosTerminal } from './pages/PosTerminal';
import { ProductCatalog } from './pages/ProductCatalog';
import { InventoryManagement } from './pages/InventoryManagement';
import { ShiftsPage } from './pages/ShiftsPage';
import { ProcurementPage } from './pages/ProcurementPage';
import { GrnManagement } from './pages/GrnManagement';
import { ReportsPage } from './pages/ReportsPage';
import { ModularSettings } from './pages/ModularSettings';
import { StaffManagement } from './pages/StaffManagement';
import { CustomerManagement } from './pages/CustomerManagement';
import { ShiftModal } from './components/ShiftModal';
import { LockScreenModal } from './components/LockScreenModal';
import { SubscriptionLockOverlay } from './components/SubscriptionLockOverlay';
import { Menu, ShoppingBag, ShoppingCart, BookOpen, Package, BarChart3, Lock, Sun, Moon } from 'lucide-react';
import type { AppSettings, Shift, AppModule } from './types';
import { api } from './services/api';
import { useTheme } from './context/ThemeContext';

export function App() {
  const { theme, toggleTheme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<AppModule>('pos');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const localSaved = localStorage.getItem('pos_user');
      if (localSaved) {
        const parsed = JSON.parse(localSaved);
        // Never allow admin or supervisor role to persist in localStorage across sessions/reloads
        if (parsed?.role === 'admin' || parsed?.role === 'supervisor') {
          localStorage.removeItem('pos_user');
        } else if (parsed?.role === 'cashier') {
          return parsed;
        }
      }
    } catch {}
    try {
      sessionStorage.removeItem('pos_user');
    } catch {}
    localStorage.setItem('pos_locked', 'true');
    return { id: 'usr_cashier1', username: 'cashier1', role: 'cashier' };
  });

  // Strict POS terminal lock - always start locked on boot or refresh for security
  const [isLocked, setIsLocked] = useState<boolean>(true);

  // Shift Modal state
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
  const [shiftModalMode, setShiftModalMode] = useState<'start' | 'x_report' | 'z_report'>('start');

  useEffect(() => {
    // Only persist standard cashier profile in localStorage. Admin/Supervisor sessions must never persist across browser reloads
    if (currentUser?.role === 'admin' || currentUser?.role === 'supervisor') {
      localStorage.removeItem('pos_user');
      sessionStorage.setItem('pos_user', JSON.stringify(currentUser));
    } else if (currentUser) {
      sessionStorage.removeItem('pos_user');
      localStorage.setItem('pos_user', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  useEffect(() => {
    if (settings?.store_name && settings.store_name.trim()) {
      document.title = `${settings.store_name.trim()} - POS Terminal`;
    } else {
      document.title = 'Grocery POS Terminal';
    }
  }, [settings?.store_name]);

  useEffect(() => {
    loadSettingsAndShift();

    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        setIsLocked((prev) => {
          const next = !prev;
          localStorage.setItem('pos_locked', String(next));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const loadSettingsAndShift = async () => {
    try {
      const [appSettings, shift] = await Promise.all([
        api.getSettings(),
        api.getCurrentShift(currentUser?.id || 'usr_cashier1'),
      ]);
      setSettings(appSettings);
      setActiveShift(shift);
    } catch (err) {
      console.error('Failed to load initial app data:', err);
    }
  };

  const handleOpenShiftModal = () => {
    setShiftModalMode('start');
    setIsShiftModalOpen(true);
  };

  const handleOpenXReport = () => {
    setShiftModalMode('x_report');
    setIsShiftModalOpen(true);
  };

  const handleOpenZReport = () => {
    setShiftModalMode('z_report');
    setIsShiftModalOpen(true);
  };

  const handleLock = () => {
    setIsLocked(true);
    localStorage.setItem('pos_locked', 'true');
  };

  const handleLogout = () => {
    const defaultUser = { id: 'usr_cashier1', username: 'cashier1', role: 'cashier' };
    setCurrentUser(defaultUser);
    try {
      localStorage.removeItem('pos_user');
      sessionStorage.removeItem('pos_user');
      localStorage.setItem('pos_locked', 'true');
    } catch {}
    setIsLocked(true);
    setActiveTab('pos');
  };

  const handleUnlock = (user: any) => {
    setCurrentUser(user);
    if (user.role === 'admin' || user.role === 'supervisor') {
      sessionStorage.setItem('pos_user', JSON.stringify(user));
      localStorage.removeItem('pos_user');
    } else {
      localStorage.setItem('pos_user', JSON.stringify(user));
      sessionStorage.removeItem('pos_user');
    }
    setIsLocked(false);
    localStorage.setItem('pos_locked', 'false');
  };

  const hasModuleAccess = (mod: string) => {
    if (!currentUser) return false;
    // If user has customized permissions array, strictly honor it
    if (Array.isArray(currentUser.permissions) && currentUser.permissions.length > 0) {
      return currentUser.permissions.includes(mod);
    }
    // Fallbacks if permissions array is not set or empty
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'supervisor') {
      return ['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'reports'].includes(mod);
    }
    return mod === 'pos' || mod === 'wholesale';
  };

  // Redirect to permitted tab if current activeTab becomes unauthorized
  useEffect(() => {
    if (!hasModuleAccess(activeTab)) {
      const allTabs: AppModule[] = [
        'pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'
      ];
      const fallbackTab = allTabs.find((t) => hasModuleAccess(t)) || 'pos';
      setActiveTab(fallbackTab);
    }
  }, [currentUser, activeTab]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#070b13] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-emerald-500 selection:text-black">
      {/* Mobile Top Header (Hidden on md and larger) */}
      <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-[#090e18] border-b border-[#162135] shrink-0 z-30 select-none">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-755 text-slate-200 active:scale-95 transition cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-white text-sm tracking-tight truncate max-w-[150px] sm:max-w-[220px]">
              {settings?.store_name || 'MotorParts POS'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 active:scale-95 transition cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>

          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold uppercase">
            {currentUser?.username || 'cashier'}
          </span>
          <button
            type="button"
            onClick={handleLock}
            title="Lock Register (F9)"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-755 text-amber-400 border border-slate-700 active:scale-95 transition cursor-pointer"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Navigation Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (!hasModuleAccess(tab)) return;
          setActiveTab(tab);
        }}
        settings={settings}
        activeShift={activeShift}
        currentUser={currentUser}
        onOpenShiftModal={handleOpenShiftModal}
        onOpenXReport={handleOpenXReport}
        onLock={handleLock}
        onLogout={handleLogout}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Screen Content */}
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {activeTab === 'pos' && hasModuleAccess('pos') && (
          <PosTerminal
            settings={settings}
            activeShift={activeShift}
            currentUser={currentUser}
            onOpenShiftModal={handleOpenShiftModal}
            mode="retail"
          />
        )}

        {activeTab === 'wholesale' && hasModuleAccess('wholesale') && (
          <PosTerminal
            settings={settings}
            activeShift={activeShift}
            currentUser={currentUser}
            onOpenShiftModal={handleOpenShiftModal}
            mode="wholesale"
          />
        )}

        {activeTab === 'catalog' && hasModuleAccess('catalog') && (
          <ProductCatalog
            settings={settings}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'inventory' && hasModuleAccess('inventory') && (
          <InventoryManagement 
            settings={settings} 
            currentUser={currentUser}
          />
        )}

        {activeTab === 'grn' && hasModuleAccess('grn') && (
          <GrnManagement
            settings={settings}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'customers' && hasModuleAccess('customers') && (
          <CustomerManagement 
            settings={settings} 
            currentUser={currentUser}
            onSettingsUpdated={(newSettings) => setSettings(newSettings)}
          />
        )}

        {activeTab === 'shifts' && hasModuleAccess('shifts') && (
          <ShiftsPage
            settings={settings}
            activeShift={activeShift}
            onOpenShiftModal={handleOpenShiftModal}
            onOpenXReport={handleOpenXReport}
            onOpenZReport={handleOpenZReport}
          />
        )}

        {activeTab === 'procurement' && settings?.feature_procurement === 'true' && hasModuleAccess('procurement') && (
          <ProcurementPage settings={settings} />
        )}

        {activeTab === 'reports' && hasModuleAccess('reports') && (
          <ReportsPage 
            settings={settings} 
            currentUser={currentUser}
          />
        )}

        {activeTab === 'staff' && hasModuleAccess('staff') && (
          <StaffManagement 
            currentUser={currentUser}
            onUserUpdated={(u) => setCurrentUser(u)}
            onElevateToAdmin={() => handleUnlock({ id: 'usr_admin', username: 'admin', role: 'admin', permissions: ['pos', 'inventory', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'] })}
          />
        )}

        {activeTab === 'settings' && hasModuleAccess('settings') && (
          <ModularSettings
            settings={settings}
            currentUser={currentUser}
            onSettingsUpdated={(newSettings) => setSettings(newSettings)}
            onElevateToAdmin={() => handleUnlock({ id: 'usr_admin', username: 'admin', role: 'admin', permissions: ['pos', 'inventory', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'] })}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Hidden on md and larger) */}
      <nav className="md:hidden flex items-center justify-around bg-[#090e18] border-t border-[#162135] py-1.5 px-2 shrink-0 z-30 select-none">
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition cursor-pointer ${
            activeTab === 'pos' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">POS</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition cursor-pointer ${
            activeTab === 'catalog' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Catalog</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition cursor-pointer ${
            activeTab === 'inventory' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Stock</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition cursor-pointer ${
            activeTab === 'reports' ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-slate-400 hover:text-slate-200 transition cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* Shared Shift Modal (Start / X-Report / Z-Report) */}
      <ShiftModal
        isOpen={isShiftModalOpen}
        mode={shiftModalMode}
        activeShift={activeShift}
        settings={settings}
        currentUser={currentUser}
        onClose={() => setIsShiftModalOpen(false)}
        onShiftUpdated={(s) => setActiveShift(s)}
      />

      {/* Terminal Lock Screen Modal (Standard Cashier/Register Lock) */}
      <LockScreenModal
        isLocked={isLocked}
        currentUser={currentUser}
        onUnlock={handleUnlock}
      />

      {/* SaaS Vendor Monthly Subscription Lock Overlay */}
      <SubscriptionLockOverlay
        isLocked={settings?.subscription_status === 'locked'}
        settings={settings}
        onUnlocked={(newSettings) => setSettings(newSettings)}
      />
    </div>
  );
}

export default App;
