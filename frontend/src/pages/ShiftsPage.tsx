import React, { useState, useEffect } from 'react';
import { Clock, Plus, AlertCircle, CheckCircle, Printer, RefreshCw } from 'lucide-react';
import type { Shift, AppSettings } from '../types';
import { api } from '../services/api';

interface ShiftsPageProps {
  settings: AppSettings | null;
  activeShift: Shift | null;
  onOpenShiftModal: () => void;
  onOpenXReport: () => void;
  onOpenZReport: () => void;
}

export const ShiftsPage: React.FC<ShiftsPageProps> = ({
  settings,
  activeShift,
  onOpenShiftModal,
  onOpenXReport,
  onOpenZReport,
}) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const currency = settings?.currency_symbol || '$';

  useEffect(() => {
    loadShifts();
  }, [activeShift]);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await api.getShiftHistory();
      setShifts(data);
    } catch (err) {
      console.error('Failed to load shift history:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <span>Cash Register Shifts & Z-Report Settlement</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Track opening cash floats, daily tender reconciliation, and cash drawer discrepancies.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadShifts}
              disabled={loading}
              title="Refresh Shift History"
              className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs transition border border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {activeShift ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenXReport}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs transition border border-slate-700 cursor-pointer"
                >
                  View X-Report
                </button>
                <button
                  onClick={onOpenZReport}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-rose-950/40 cursor-pointer"
                >
                  End Shift & Generate Z-Report
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenShiftModal}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-purple-950/40 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Open New Shift / Cash Drawer</span>
              </button>
            )}
          </div>
        </div>

        {/* Current Active Shift Card */}
        {activeShift && (
          <div className="bg-slate-900 border-2 border-purple-500/40 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Active Shift #{activeShift.id.slice(-4)} — {activeShift.cashier_name}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Opened at {new Date(activeShift.start_time).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full text-xs">
                OPEN / IN PROGRESS
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-4 text-center">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Opening Float</span>
                <span className="text-lg font-bold text-slate-200 font-mono">
                  {currency}{activeShift.opening_float.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cash Sales</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {currency}{activeShift.cash_sales.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Card Sales</span>
                <span className="text-lg font-bold text-blue-400 font-mono">
                  {currency}{activeShift.card_sales.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-purple-500/30">
                <span className="text-[10px] text-purple-300 uppercase font-semibold block">Expected Cash in Drawer</span>
                <span className="text-lg font-bold text-amber-300 font-mono">
                  {currency}{(activeShift.opening_float + activeShift.cash_sales).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Shift History Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
          <div className="px-5 py-3 border-b border-slate-800 font-bold text-xs text-slate-300 uppercase tracking-wider">
            Settlement Audit Log (Past Z-Reports)
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Shift ID</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4">Opened / Closed</th>
                  <th className="py-3 px-4 text-right">Opening Float</th>
                  <th className="py-3 px-4 text-right">Cash Sales</th>
                  <th className="py-3 px-4 text-right">Card Sales</th>
                  <th className="py-3 px-4 text-right">Total Sales</th>
                  <th className="py-3 px-4 text-right">Expected Cash</th>
                  <th className="py-3 px-4 text-right">Actual Count</th>
                  <th className="py-3 px-4 text-center">Variance (Discrepancy)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      No past shift records found.
                    </td>
                  </tr>
                ) : (
                  shifts.map((s) => {
                    const variance =
                      s.actual_cash !== null && s.actual_cash !== undefined
                        ? Math.round((s.actual_cash - s.expected_cash) * 100) / 100
                        : null;

                    return (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition font-mono text-[11px]">
                        <td className="py-3 px-4 font-bold text-slate-200">
                          #{s.id.slice(-6)}
                        </td>
                        <td className="py-3 px-4 font-sans font-medium text-slate-100">
                          {s.cashier_name}
                        </td>
                        <td className="py-3 px-4 text-[10px] text-slate-400 font-sans">
                          <div>{new Date(s.start_time).toLocaleDateString()} {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          {s.end_time && (
                            <div className="text-slate-500">
                              to {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">{currency}{s.opening_float.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-emerald-400">{currency}{s.cash_sales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-blue-400">{currency}{s.card_sales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold text-white">{currency}{s.total_sales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">{currency}{s.expected_cash.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold">
                          {s.actual_cash !== null && s.actual_cash !== undefined ? `${currency}${s.actual_cash.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.status === 'open' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold font-sans">
                              Active
                            </span>
                          ) : variance === 0 ? (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold font-sans">
                              Balanced (0.00)
                            </span>
                          ) : variance !== null && variance > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-bold font-sans">
                              +{currency}{variance.toFixed(2)} Overage
                            </span>
                          ) : variance !== null && variance < 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold font-sans">
                              {currency}{variance.toFixed(2)} Shortage
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
