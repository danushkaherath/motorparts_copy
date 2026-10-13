import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Truck, 
  Receipt, 
  Percent, 
  Calendar, 
  Store, 
  Printer, 
  Check, 
  AlertCircle,
  Trash2,
  Lock,
  ShieldCheck,
  HeartHandshake,
  Star,
  ShieldAlert,
  Key,
  PhoneCall,
  Unlock,
  DollarSign,
  X,
  Sun,
  Moon,
  RotateCcw,
} from 'lucide-react';
import type { AppSettings } from '../types';
import { api } from '../services/api';
import { WipeCatalogModal } from '../components/WipeCatalogModal';
import { ResetDummyDataModal } from '../components/ResetDummyDataModal';
import { SupervisorPinModal } from '../components/SupervisorPinModal';
import { useTheme } from '../context/ThemeContext';

interface ModularSettingsProps {
  settings: AppSettings | null;
  currentUser?: any;
  onSettingsUpdated: (newSettings: AppSettings) => void;
  onElevateToAdmin?: () => void;
}

export const ModularSettings: React.FC<ModularSettingsProps> = ({
  settings,
  currentUser,
  onSettingsUpdated,
  onElevateToAdmin,
}) => {
  const { theme, setTheme, isDark } = useTheme();
  const [formData, setFormData] = useState<Partial<AppSettings>>({});
  const [isWipeModalOpen, setIsWipeModalOpen] = useState<boolean>(false);
  const [isResetDummyModalOpen, setIsResetDummyModalOpen] = useState<boolean>(false);
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState<boolean>(false);
  const [wipeNotice, setWipeNotice] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Vendor Subscription Lock Modal State
  const [isVendorModalOpen, setIsVendorModalOpen] = useState<boolean>(false);
  const [vendorAction, setVendorAction] = useState<'lock' | 'unlock'>('lock');
  const [vendorPinInput, setVendorPinInput] = useState<string>('');
  const [vendorModalError, setVendorModalError] = useState<string | null>(null);
  const [vendorModalLoading, setVendorModalLoading] = useState<boolean>(false);

  // Printer Spooler & Hardware State
  const [installedPrinters, setInstalledPrinters] = useState<{ name: string; isDefault: boolean; isThermal: boolean }[]>([]);
  const [isTestingPrint, setIsTestingPrint] = useState<boolean>(false);
  const [isKickingDrawer, setIsKickingDrawer] = useState<boolean>(false);
  const [printerFeedback, setPrinterFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
    // Fetch installed printers
    api.getPrinters().then(res => {
      if (res && res.printers) {
        setInstalledPrinters(res.printers);
        if (!settings?.printer_name && res.defaultPrinter) {
          setFormData(prev => ({ ...prev, printer_name: res.defaultPrinter }));
        }
      }
    }).catch(() => {});
  }, [settings]);

  const handleTestPrint = async () => {
    try {
      setIsTestingPrint(true);
      setPrinterFeedback('Sending test print to ' + (formData.printer_name || 'Xprinter XP-365B') + '...');
      const res = await api.printTestSlip(formData.printer_name, Number(formData.receipt_width) || 80);
      setPrinterFeedback('Test receipt printed successfully on ' + res.printer);
      setTimeout(() => setPrinterFeedback(null), 4000);
    } catch (err: any) {
      setPrinterFeedback('Print failed: ' + err.message);
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleKickDrawer = async () => {
    try {
      setIsKickingDrawer(true);
      const res = await api.kickDrawer(formData.printer_name);
      setPrinterFeedback('Cash drawer kick pulse sent to ' + res.printer);
      setTimeout(() => setPrinterFeedback(null), 3000);
    } catch (err: any) {
      setPrinterFeedback('Drawer pulse failed: ' + err.message);
    } finally {
      setIsKickingDrawer(false);
    }
  };

  const handleToggle = async (key: keyof AppSettings) => {
    const currentVal = formData[key] === 'true';
    const nextVal = currentVal ? 'false' : 'true';
    const updated = { ...formData, [key]: nextVal };
    setFormData(updated);

    try {
      setLoading(true);
      const res = await api.updateSettings({ [key]: nextVal });
      onSettingsUpdated(res.settings);
      showSuccessNotice();
    } catch (err: any) {
      alert('Failed to update toggle: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStoreInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.updateSettings(formData);
      onSettingsUpdated(res.settings);
      showSuccessNotice();
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSuccessNotice = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleOpenVendorModal = (action: 'lock' | 'unlock') => {
    setVendorAction(action);
    setVendorPinInput('');
    setVendorModalError(null);
    setIsVendorModalOpen(true);
  };

  const handleExecuteVendorAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorPinInput.trim()) {
      setVendorModalError('Please enter the Vendor Master PIN');
      return;
    }

    try {
      setVendorModalLoading(true);
      setVendorModalError(null);
      const res = await api.setSubscriptionLock({
        action: vendorAction,
        vendor_pin: vendorPinInput.trim(),
        monthly_fee: formData.subscription_monthly_fee,
        provider_phone: formData.subscription_provider_phone,
        notice: formData.subscription_notice,
        due_date: formData.subscription_due_date,
      });

      onSettingsUpdated(res.settings);
      setFormData(res.settings);
      setIsVendorModalOpen(false);
      alert(res.message);
    } catch (err: any) {
      setVendorModalError(err.message || 'Action failed. Check Vendor Master PIN.');
    } finally {
      setVendorModalLoading(false);
    }
  };

  const hasSettingsAccess = Array.isArray(currentUser?.permissions)
    ? currentUser.permissions.includes('settings')
    : currentUser?.role === 'admin';

  if (!hasSettingsAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full min-h-0 bg-slate-950 p-3 sm:p-6 select-none">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/40">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Access Restricted</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Store name, currency, tax rates, and modular switchboard features can only be altered by an <strong>Administrator</strong>. Cashiers and non-admin staff cannot view or edit these settings.
            </p>
            <div className="mt-3 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 inline-block font-mono">
              Current User: <strong className="text-slate-200">{currentUser?.username || 'owner'}</strong> ({currentUser?.role?.toUpperCase() || 'ADMIN'})
            </div>
          </div>

          {onElevateToAdmin && (
            <button
              onClick={() => setIsAdminAuthModalOpen(true)}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-lg shadow-emerald-950/40"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Authorize with Admin PIN</span>
            </button>
          )}
        </div>

        <SupervisorPinModal
          isOpen={isAdminAuthModalOpen}
          actionDescription="Unlock Administrator Settings & Switchboard"
          onClose={() => setIsAdminAuthModalOpen(false)}
          onAuthorized={() => {
            setIsAdminAuthModalOpen(false);
            if (onElevateToAdmin) onElevateToAdmin();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 p-3 sm:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full space-y-6 sm:space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-400" />
              <span>System Settings & Modular Switchboard</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enable or disable core application modules on demand and customize store receipt details.
            </p>
          </div>

          {savedSuccess && (
            <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-semibold animate-in fade-in">
              <Check className="w-4 h-4" />
              <span>Settings Saved & Applied</span>
            </div>
          )}
        </div>

        {/* ================= MODULAR FEATURE TOGGLES SWITCHBOARD ================= */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Modular Feature Toggles
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
              Live On/Off
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Toggle 1: Procurement & Suppliers */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Procurement & Supplier Management
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Purchase orders, vendor directory, and goods receiving (GRN) to update stock. When disabled, the module is hidden for simpler cashier-only operation.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('feature_procurement')}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition shrink-0 cursor-pointer ${
                  formData.feature_procurement === 'true'
                    ? 'bg-amber-500 justify-end'
                    : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Toggle 2: Tax & VAT System */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Tax / VAT Calculation & Reports
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Computes percentage sales tax on checkout receipts and generates tax breakdown reports. Disable for clean gross-only billing.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('feature_tax')}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition shrink-0 cursor-pointer ${
                  formData.feature_tax === 'true'
                    ? 'bg-cyan-500 justify-end'
                    : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Toggle 3: Batch & Expiry Tracking */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Batch Numbers & Expiry Date Alerts
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Track batch/lot numbers and receive alerts for perishables expiring within 14–30 days.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('feature_expiry')}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition shrink-0 cursor-pointer ${
                  formData.feature_expiry === 'true'
                    ? 'bg-purple-500 justify-end'
                    : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Toggle 4: Discounts Engine */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Discounts & Price Overrides
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Enables cashiers to apply custom cart discounts or promotional price deductions during checkout.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('feature_discounts')}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition shrink-0 cursor-pointer ${
                  formData.feature_discounts === 'true'
                    ? 'bg-emerald-500 justify-end'
                    : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>

            {/* Toggle 5: Customer Loyalty & Rewards */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400 shrink-0 mt-0.5">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Customer Loyalty & Rewards Program
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Track customer mobile numbers at POS checkout, earn loyalty points per purchase, and allow instant point redemption discounts.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('feature_loyalty')}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition shrink-0 cursor-pointer ${
                  formData.feature_loyalty !== 'false'
                    ? 'bg-pink-500 justify-end'
                    : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
              </button>
            </div>
          </div>
        </div>

        {/* ================= APPEARANCE & COLOR THEME SWITCHER ================= */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              {isDark ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                POS Visual Theme & Display Mode
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Active: <strong className="text-white">{isDark ? 'Dark Midnight Navy' : 'Modern Clean Light'}</strong>
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Switch between dark mode (ideal for low-light auto parts warehouses) and the modern minimalist clean light theme (Apple/Shopify/Square POS style for storefront counters).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Dark Theme Card */}
            <div
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                isDark
                  ? 'bg-slate-950 border-cyan-500 shadow-md shadow-cyan-950/40'
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Midnight Dark (Default)</h4>
                    <span className="text-[10px] text-slate-400">Low glare, high contrast</span>
                  </div>
                </div>
                {isDark && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                    Active
                  </span>
                )}
              </div>
              <div className="h-6 rounded-lg bg-[#070b13] border border-[#1b283f] flex items-center px-2 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <div className="w-12 h-1.5 rounded-full bg-slate-700" />
                <div className="ml-auto w-6 h-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>

            {/* Light Theme Card */}
            <div
              onClick={() => setTheme('light')}
              className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                !isDark
                  ? 'bg-white text-slate-900 border-blue-600 shadow-md'
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${!isDark ? 'text-slate-900' : 'text-white'}`}>
                      Modern Clean Light
                    </h4>
                    <span className={`text-[10px] ${!isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                      Shopify / Square POS style
                    </span>
                  </div>
                </div>
                {!isDark && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                    Active
                  </span>
                )}
              </div>
              <div className="h-6 rounded-lg bg-slate-100 border border-slate-300 flex items-center px-2 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <div className="w-12 h-1.5 rounded-full bg-slate-300" />
                <div className="ml-auto w-6 h-1.5 rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        {/* ================= STORE PROFILE & RECEIPT CONFIGURATION ================= */}
        <form onSubmit={handleSaveStoreInfo} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Store className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Store Profile & Thermal Printer Setup
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Store Name
              </label>
              <input
                type="text"
                required
                value={formData.store_name || ''}
                onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Currency Symbol
              </label>
              <input
                type="text"
                required
                value={formData.currency_symbol || '$'}
                onChange={(e) => setFormData({ ...formData, currency_symbol: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Store Contact Phone
              </label>
              <input
                type="text"
                value={formData.store_phone || ''}
                onChange={(e) => setFormData({ ...formData, store_phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Default Tax Rate (%) (If Tax Module is Enabled)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.tax_rate || '5.0'}
                onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Store Street Address (Printed on Receipt Header)
            </label>
            <input
              type="text"
              value={formData.store_address || ''}
              onChange={(e) => setFormData({ ...formData, store_address: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Thermal Paper Width
              </label>
              <select
                value={formData.receipt_width || '80'}
                onChange={(e) => setFormData({ ...formData, receipt_width: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400"
              >
                <option value="80">80mm Standard POS Printer (Recommended)</option>
                <option value="58">58mm Compact Mobile/Counter Printer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Receipt Footer Message
              </label>
              <input
                type="text"
                value={formData.store_receipt_footer || ''}
                onChange={(e) => setFormData({ ...formData, store_receipt_footer: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-blue-400"
              />
            </div>
          </div>

          {/* Direct Thermal Printer & Spooler Configuration */}
          <div className="pt-3 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Thermal Receipt Printer (Windows Direct Spooler)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Bypasses browser print preview
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Target Windows Printer
                </label>
                <select
                  value={formData.printer_name || 'Xprinter XP-365B'}
                  onChange={(e) => setFormData({ ...formData, printer_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-emerald-400"
                >
                  {installedPrinters.length > 0 ? (
                    installedPrinters.map((p, idx) => (
                      <option key={idx} value={p.name}>
                        {p.name} {p.isDefault ? '(Windows Default)' : ''} {p.isThermal ? '⚡' : ''}
                      </option>
                    ))
                  ) : (
                    <option value="Xprinter XP-365B">Xprinter XP-365B (Auto-detected)</option>
                  )}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Select your thermal receipt printer connected via USB.
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Hardware Automation
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.printer_auto_print !== 'false'}
                    onChange={(e) => setFormData({ ...formData, printer_auto_print: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-400"
                  />
                  <span>Auto-print receipt silently upon checkout completion</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.printer_open_drawer !== 'false'}
                    onChange={(e) => setFormData({ ...formData, printer_open_drawer: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-400"
                  />
                  <span>Kick cash drawer (ESC/POS pulse) on Cash sales</span>
                </label>
              </div>
            </div>

            {/* Test Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestPrint}
                disabled={isTestingPrint}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700/40 hover:bg-emerald-600/50 border border-emerald-600/60 text-emerald-300 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isTestingPrint ? 'Sending to Spooler...' : 'Print Test Receipt Slip'}</span>
              </button>

              <button
                type="button"
                onClick={handleKickDrawer}
                disabled={isKickingDrawer}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                <span>{isKickingDrawer ? 'Sending Pulse...' : 'Test Cash Drawer Kick'}</span>
              </button>

              {printerFeedback && (
                <span className="text-xs text-emerald-400 animate-in fade-in">
                  {printerFeedback}
                </span>
              )}
            </div>
          </div>

          {/* Loyalty Program Rules */}
          <div className="pt-3 border-t border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-3 flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-pink-400 text-pink-400" />
              <span>Loyalty Points Earning & Redemption Rules</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Spend to Earn 1 Point ({formData.currency_symbol || '$'})
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.loyalty_spend_per_point || '100'}
                  onChange={(e) => setFormData({ ...formData, loyalty_spend_per_point: e.target.value })}
                  placeholder="e.g. 100"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Customer earns 1 point for every {formData.currency_symbol || '$'}{formData.loyalty_spend_per_point || '100'} spent.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Redemption Value Per Point ({formData.currency_symbol || '$'})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.loyalty_point_value || '1.0'}
                  onChange={(e) => setFormData({ ...formData, loyalty_point_value: e.target.value })}
                  placeholder="e.g. 1.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Each point redeemed provides {formData.currency_symbol || '$'}{formData.loyalty_point_value || '1.00'} off order total.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-950/40 cursor-pointer"
            >
              Save Store & Hardware Settings
            </button>
          </div>
        </form>

        {/* ================= VENDOR SUBSCRIPTION & MONTHLY RENTAL CONTROL ================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                Software Provider & Monthly Rental Subscription Control
              </span>
            </div>
            {formData.subscription_status === 'locked' ? (
              <span className="px-3 py-1 rounded-full bg-rose-950 border border-rose-700 text-rose-300 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                STATUS: SUSPENDED / LOCKED (BILL OVERDUE)
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                STATUS: ACTIVE (RENTAL IN GOOD STANDING)
              </span>
            )}
          </div>

          <div className="bg-slate-900 border border-purple-900/60 rounded-2xl p-5 space-y-5 shadow-lg">
            <div>
              <p className="text-xs text-slate-300 leading-relaxed">
                As the software provider renting out this POS application to the client, you can manage the client's monthly rental billing terms and lock the application if their monthly payment is past due.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Monthly Rental Fee */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Monthly Rental Fee ({formData.currency_symbol || 'Rs. '})
                </label>
                <input
                  type="text"
                  value={formData.subscription_monthly_fee || '5000'}
                  onChange={(e) => setFormData({ ...formData, subscription_monthly_fee: e.target.value })}
                  placeholder="e.g. 5000"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl py-2 px-3 text-xs font-mono outline-hidden focus:border-purple-500"
                />
              </div>

              {/* Billing Due Date / Cycle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Billing Due Date / Cycle
                </label>
                <input
                  type="text"
                  value={formData.subscription_due_date || '1st of Every Month'}
                  onChange={(e) => setFormData({ ...formData, subscription_due_date: e.target.value })}
                  placeholder="e.g. 1st of Every Month"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl py-2 px-3 text-xs outline-hidden focus:border-purple-500"
                />
              </div>

              {/* Vendor Provider Hotline */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Vendor Hotline (Shown on Lock Screen)
                </label>
                <input
                  type="text"
                  value={formData.subscription_provider_phone || '+94 77 123 4567'}
                  onChange={(e) => setFormData({ ...formData, subscription_provider_phone: e.target.value })}
                  placeholder="e.g. +94 77 123 4567"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl py-2 px-3 text-xs font-mono outline-hidden focus:border-purple-500"
                />
              </div>
            </div>

            {/* Custom Suspension Notice */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Suspension Notice to Store Owner
              </label>
              <textarea
                rows={2}
                value={formData.subscription_notice || 'Your monthly POS application rental fee is overdue. Please contact the software provider to settle your bill and restore service.'}
                onChange={(e) => setFormData({ ...formData, subscription_notice: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl py-2 px-3 text-xs outline-hidden focus:border-purple-500"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-slate-400">
                Default Master Release PIN: <strong className="text-purple-300 font-mono">9999</strong>
              </div>

              <div className="flex items-center gap-2.5">
                {formData.subscription_status === 'locked' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenVendorModal('unlock')}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Reactivate Application</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenVendorModal('lock')}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-rose-950/40 cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Lock Application (Monthly Bill Overdue)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= DANGER ZONE: CATALOG MANAGEMENT ================= */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Danger Zone (Admin Only)
            </span>
          </div>

          {wipeNotice && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{wipeNotice}</span>
              </div>
              <button onClick={() => setWipeNotice(null)} className="text-slate-400 hover:text-white text-xs">
                Dismiss
              </button>
            </div>
          )}

          {/* Clear Dummy Data & Reset Analytics */}
          <div className="bg-amber-950/20 border border-amber-900/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Reset Dummy Data & Clear Sales Statistics</span>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                Permanently wipes all sample/test orders, cashier shift logs, dummy contacts, and resets all sales & revenue analytics to <strong>0</strong>. Preserves store branding, categories, and logins. Requires Administrator PIN verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsResetDummyModalOpen(true)}
              className="px-4 py-2.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-600/40 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer shadow-md shadow-amber-950/40"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Dummy Data</span>
            </button>
          </div>

          <div className="bg-rose-950/20 border border-rose-900/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Wipe Entire Product Catalog</span>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                Permanently deletes all products, barcodes, retail prices, and inventory stock quantities from the database. Requires Administrator PIN verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsWipeModalOpen(true)}
              className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-600/40 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer shadow-md shadow-rose-950/40"
            >
              <Trash2 className="w-4 h-4" />
              <span>Wipe Catalog</span>
            </button>
          </div>
        </div>
      </div>

      {/* Admin Reset Dummy Data & Statistics Modal */}
      <ResetDummyDataModal
        isOpen={isResetDummyModalOpen}
        onClose={() => setIsResetDummyModalOpen(false)}
        onSuccess={(deleted) => {
          setWipeNotice(`Dummy data wiped successfully: ${deleted.orders} orders, ${deleted.shifts} shifts, ${deleted.products} dummy products, ${deleted.suppliers} suppliers, ${deleted.customers} customers cleared. Statistics reset to 0.`);
        }}
      />

      {/* Admin Wipe Entire Catalog Modal */}
      <WipeCatalogModal
        isOpen={isWipeModalOpen}
        productCount={0}
        onClose={() => setIsWipeModalOpen(false)}
        onSuccess={(deletedCount) => {
          setWipeNotice(`Product catalog wiped successfully (${deletedCount} products deleted).`);
        }}
      />

      {/* Vendor Master PIN Authorization Modal */}
      {isVendorModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-purple-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <ShieldAlert className="w-5 h-5" />
                <span>Vendor Master Authorization</span>
              </div>
              <button
                type="button"
                onClick={() => setIsVendorModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                {vendorAction === 'lock' ? (
                  <span>
                    You are about to <strong className="text-rose-400">LOCK the POS application</strong> because the client is unable or has failed to pay their monthly rental invoice.
                  </span>
                ) : (
                  <span>
                    You are about to <strong className="text-emerald-400">REACTIVATE the POS application</strong> for normal client operation.
                  </span>
                )}
              </p>
            </div>

            {vendorModalError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs text-center">
                {vendorModalError}
              </div>
            )}

            <form onSubmit={handleExecuteVendorAction} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Enter Vendor Master PIN
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={vendorPinInput}
                  onChange={(e) => setVendorPinInput(e.target.value)}
                  placeholder="Default: 9999"
                  className="w-full bg-slate-950 border border-slate-700 text-center font-mono text-xl tracking-widest text-purple-300 rounded-xl py-2 px-3 outline-hidden focus:border-purple-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVendorModalOpen(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vendorModalLoading || !vendorPinInput.trim()}
                  className={`px-4 py-2 text-white font-bold rounded-xl text-xs transition shadow-md cursor-pointer ${
                    vendorAction === 'lock'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {vendorModalLoading
                    ? 'Authenticating...'
                    : vendorAction === 'lock'
                    ? 'Confirm & Lock Application'
                    : 'Confirm & Reactivate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
