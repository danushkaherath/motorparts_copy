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
import type { AppSettings, Shift, AppModule } from './types';
import { api } from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState<AppModule>('pos');
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

  // Redirect to permitted tab if current activeTab becomes unauthorized
  useEffect(() => {
    if (!hasModuleAccess(activeTab)) {
      const allTabs: AppModule[] = [
        'pos', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'
      ];
      const fallbackTab = allTabs.find((t) => hasModuleAccess(t)) || 'pos';
      setActiveTab(fallbackTab);
    }
  }, [currentUser, activeTab]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#070b13] text-slate-100 flex flex-row font-sans selection:bg-emerald-500 selection:text-black">
      {/* Left Vertical Sidebar */}
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
      />

      {/* Main Screen Content */}
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {activeTab === 'pos' && hasModuleAccess('pos') && (
          <PosTerminal
            settings={settings}
            activeShift={activeShift}
            currentUser={currentUser}
            onOpenShiftModal={handleOpenShiftModal}
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
