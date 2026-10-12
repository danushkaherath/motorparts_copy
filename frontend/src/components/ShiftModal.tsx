import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, X, AlertTriangle, CheckCircle, Printer, RefreshCw } from 'lucide-react';
import type { Shift, AppSettings } from '../types';
import { api } from '../services/api';

interface ShiftModalProps {
  isOpen: boolean;
  mode: 'start' | 'x_report' | 'z_report';
  activeShift: Shift | null;
  settings: AppSettings | null;
  currentUser?: any;
  onClose: () => void;
  onShiftUpdated: (shift: Shift | null) => void;
}

export const ShiftModal: React.FC<ShiftModalProps> = ({
  isOpen,
  mode,
  activeShift,
  settings,
  currentUser,
  onClose,
  onShiftUpdated,
}) => {
  const isLkr = (settings?.currency_symbol || '').toUpperCase().includes('LKR') || (settings?.currency_symbol || '').includes('Rs');
  const [openingFloat, setOpeningFloat] = useState<string>(isLkr ? '5000.00' : '100.00');
  const [cashierName, setCashierName] = useState<string>('Cashier 1');
  const [actualCash, setActualCash] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any | null>(null);

  const currency = settings?.currency_symbol || '$';

  // Calculate live expected cash in drawer
  const expectedCashInDrawer = activeShift 
    ? Math.round((Number(activeShift.opening_float || 0) + Number(activeShift.cash_sales || 0)) * 100) / 100
    : 0;

  // Clean state whenever modal opens or mode changes
  useEffect(() => {
    if (!isOpen) {
      setReportData(null);
      setError(null);
      setActualCash('');
      setClosingNotes('');
      return;
    }

    setError(null);
    setReportData(null);
    setActualCash('');
    setClosingNotes('');

    if (currentUser?.username) {
      setCashierName(currentUser.username);
    } else if (activeShift?.cashier_name) {
      setCashierName(activeShift.cashier_name);
    }

    if (mode === 'x_report' && activeShift) {
      setLoading(true);
      api.getXReport(activeShift.id)
        .then((res) => {
          setReportData(res);
        })
        .catch((err: any) => {
          setError(err.message || 'Failed to load X-Report');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, mode, activeShift?.id]);

  if (!isOpen) return null;

  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const floatNum = parseFloat(openingFloat);
      if (isNaN(floatNum) || floatNum < 0) {
        setError('Opening float must be a valid non-negative number');
        setLoading(false);
        return;
      }

      const cashierId = currentUser?.id || 'usr_owner';
      const cName = cashierName.trim() || currentUser?.username || 'owner';

      const newShift = await api.startShift(cashierId, cName, floatNum);
      onShiftUpdated(newShift);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start shift');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseZReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      setError('No active shift found to close');
      return;
    }

    if (actualCash.trim() === '') {
      setError('Please enter the actual cash counted in the drawer');
      return;
    }

    const countedNum = parseFloat(actualCash);
    if (isNaN(countedNum) || countedNum < 0) {
      setError('Actual cash must be a valid non-negative number');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.closeZReport(activeShift.id, countedNum, closingNotes.trim());
      setReportData(res);
      onShiftUpdated(null); // Shift is now closed in system
    } catch (err: any) {
      setError(err.message || 'Failed to close shift and generate Z-Report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5 text-purple-400 font-bold text-base sm:text-lg">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <span>
              {mode === 'start' && 'Open Cash Drawer / Start Shift'}
              {mode === 'x_report' && 'X-Report (Mid-Shift Audit)'}
              {mode === 'z_report' && !reportData && 'Z-Report (Day-End Settlement)'}
              {mode === 'z_report' && reportData && 'Z-Report Settlement Slip'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* 1. START SHIFT FORM */}
          {mode === 'start' && (
            <form onSubmit={handleStartShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Cashier Name
                </label>
                <input
                  type="text"
                  required
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3.5 text-sm text-slate-100 outline-hidden focus:border-purple-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Opening Cash Float in Drawer ({currency})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-2xl font-bold text-emerald-400 outline-hidden focus:border-purple-400 font-mono text-right transition"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                    {currency}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Amount of petty cash placed into the drawer at shift commencement.
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition shadow-md shadow-purple-950/50"
                >
                  {loading ? 'Starting...' : 'Open Drawer & Start Shift'}
                </button>
              </div>
            </form>
          )}

          {/* 2. X-REPORT (READING) */}
          {mode === 'x_report' && (
            <div className="space-y-4">
              {reportData ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2.5">
                  <div className="text-center font-bold text-sm text-amber-400 border-b border-dashed border-slate-800 pb-2">
                    {reportData.report_type}
                  </div>
                  <div className="flex justify-between">
                    <span>Shift ID:</span>
                    <span className="font-bold">{reportData.shift_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cashier:</span>
                    <span className="font-bold">{reportData.cashier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transactions:</span>
                    <span className="font-bold">{reportData.transaction_count}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span>Opening Float:</span>
                      <span>{currency}{reportData.opening_float?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Cash Sales:</span>
                      <span>{currency}{reportData.cash_sales?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-blue-400">
                      <span>Card Sales:</span>
                      <span>{currency}{reportData.card_sales?.toFixed(2)}</span>
                    </div>
                    {reportData.cheque_sales !== undefined && reportData.cheque_sales > 0 ? (
                      <div className="flex justify-between text-purple-400">
                        <span>Cheque Sales:</span>
                        <span>{currency}{reportData.cheque_sales?.toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between font-bold text-white text-sm border-t border-slate-800 pt-1">
                      <span>TOTAL SALES:</span>
                      <span>{currency}{reportData.total_sales?.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg text-center mt-3">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                      Expected Cash in Drawer Now
                    </span>
                    <span className="text-2xl font-black text-amber-300">
                      {currency}{reportData.expected_cash_in_drawer?.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">Loading X-Report...</div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* 3. Z-REPORT FORM (ENTER PHYSICAL COUNT) */}
          {mode === 'z_report' && !reportData && (
            <form onSubmit={handleCloseZReport} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-300">
                ⚠️ Closing the shift will generate the final <strong>Z-Report</strong> and finalize tender reconciliation. Count the physical cash in the drawer and enter the total below.
              </div>

              {/* Drawer Tender Summary */}
              {activeShift && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Opening Float:</span>
                    <span className="font-bold text-slate-200">{currency}{Number(activeShift.opening_float || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Cash Sales:</span>
                    <span className="font-bold text-emerald-400">+{currency}{Number(activeShift.cash_sales || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Card Sales:</span>
                    <span className="font-bold text-blue-400">{currency}{Number(activeShift.card_sales || 0).toFixed(2)}</span>
                  </div>
                  {Number(activeShift.cheque_sales || 0) > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Cheque Sales:</span>
                      <span className="font-bold text-purple-400">{currency}{Number(activeShift.cheque_sales || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-100 pt-1.5 border-t border-slate-800 font-bold text-sm">
                    <span>Expected Cash in Drawer:</span>
                    <span className="text-amber-300 font-black">{currency}{expectedCashInDrawer.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Actual Physical Cash Counted ({currency})
                  </label>
                  {activeShift && (
                    <button
                      type="button"
                      onClick={() => setActualCash(expectedCashInDrawer.toFixed(2))}
                      className="text-[11px] text-purple-400 hover:text-purple-300 font-bold hover:underline cursor-pointer"
                    >
                      Fill Expected ({currency}{expectedCashInDrawer.toFixed(2)})
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-2xl font-bold text-white outline-hidden focus:border-purple-400 font-mono text-right transition"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                    {currency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Closing Notes / Discrepancy Reason (Optional)
                </label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. Register balanced or reason for discrepancy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-200 outline-hidden focus:border-purple-400 transition"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || actualCash.trim() === ''}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-sm transition shadow-md shadow-rose-950/50 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Reconciling...' : 'Close Shift & Finalize Z-Report'}
                </button>
              </div>
            </form>
          )}

          {/* 4. Z-REPORT SETTLEMENT SLIP RESULT */}
          {mode === 'z_report' && reportData && (
            <div className="space-y-4">
              <div className="bg-white text-black font-mono text-xs p-4 rounded-lg shadow-inner space-y-2 select-all">
                <div className="text-center font-bold text-sm border-b border-dashed border-black pb-2">
                  {reportData.report_type}
                </div>
                <div className="flex justify-between">
                  <span>STORE:</span>
                  <span className="font-bold">{reportData.store_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>SHIFT:</span>
                  <span>{reportData.shift_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>CASHIER:</span>
                  <span>{reportData.cashier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLOSED AT:</span>
                  <span>{reportData.end_time ? new Date(reportData.end_time).toLocaleString() : new Date().toLocaleString()}</span>
                </div>
                <div className="border-t border-dashed border-black pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Opening Float:</span>
                    <span>{currency}{reportData.opening_float?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cash Sales:</span>
                    <span>{currency}{reportData.cash_sales?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Card Sales:</span>
                    <span>{currency}{reportData.card_sales?.toFixed(2)}</span>
                  </div>
                  {reportData.cheque_sales !== undefined && reportData.cheque_sales > 0 && (
                    <div className="flex justify-between">
                      <span>Cheque Sales:</span>
                      <span>{currency}{reportData.cheque_sales?.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1 border-t border-dotted border-gray-400">
                    <span>TOTAL SALES:</span>
                    <span>{currency}{reportData.total_sales?.toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-black pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Expected In Drawer:</span>
                    <span>{currency}{reportData.expected_cash_in_drawer?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Actual Counted:</span>
                    <span>{currency}{reportData.actual_cash_counted?.toFixed(2)}</span>
                  </div>
                  <div className={`flex justify-between font-black text-sm pt-1 border-t border-black ${
                    reportData.cash_variance === 0 ? 'text-black' : reportData.cash_variance > 0 ? 'text-blue-700' : 'text-red-700'
                  }`}>
                    <span>VARIANCE:</span>
                    <span>
                      {reportData.cash_variance >= 0 ? '+' : ''}{currency}{reportData.cash_variance?.toFixed(2)} ({reportData.variance_status})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Slip</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
