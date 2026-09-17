import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  X, 
  Search, 
  Printer, 
  Ban, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  CreditCard,
  RotateCcw,
  ShieldAlert,
  Lock
} from 'lucide-react';
import type { AppSettings, OrderReceipt } from '../types';
import { api } from '../services/api';
import { SupervisorPinModal } from './SupervisorPinModal';
import { ThermalReceipt } from './ThermalReceipt';

interface RecentBillsModalProps {
  isOpen: boolean;
  settings: AppSettings | null;
  currentUser?: any;
  onClose: () => void;
  onReprintReceipt?: (receipt: OrderReceipt) => void;
}

export const RecentBillsModal: React.FC<RecentBillsModalProps> = ({
  isOpen,
  settings,
  currentUser,
  onClose,
  onReprintReceipt,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<OrderReceipt | null>(null);
  const [loadingSlipId, setLoadingSlipId] = useState<string | null>(null);

  // Void confirmation modal state
  const [orderToVoid, setOrderToVoid] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState<string>('Customer Cancellation / Return');
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [voidSuccessMsg, setVoidSuccessMsg] = useState<string | null>(null);
  const [voidErrorMsg, setVoidErrorMsg] = useState<string | null>(null);

  const currency = settings?.currency_symbol || '$';
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen]);

  const loadOrders = async () => {
    setLoading(true);
    setVoidErrorMsg(null);
    try {
      const data = await api.getOrders({ search: searchTerm, limit: 40 });
      setOrders(data);
    } catch (err: any) {
      setVoidErrorMsg(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  const handleReprint = async (orderId: string) => {
    try {
      setLoadingSlipId(orderId);
      const res = await api.getOrderReceipt(orderId);
      if (res?.order) {
        setPreviewReceipt(res.order);
        if (onReprintReceipt) {
          onReprintReceipt(res.order);
        }
      }
    } catch (err: any) {
      alert('Failed to fetch receipt data: ' + err.message);
    } finally {
      setLoadingSlipId(null);
    }
  };

  const handleRequestVoid = (order: any) => {
    if (order.shift_status === 'closed') {
      setVoidErrorMsg(`Cannot void bill #${order.order_number}: The shift has already been closed and settled via Z-Report. Settled transactions cannot be voided.`);
      return;
    }

    setOrderToVoid(order);
    setVoidReason('Customer Cancellation / Return');
    setVoidErrorMsg(null);

    // If current user is not admin, ask for Admin PIN
    if (!isAdmin) {
      setIsPinModalOpen(true);
    }
  };

  const executeVoid = async (adminPin?: string) => {
    if (!orderToVoid) return;
    try {
      setLoading(true);
      setVoidErrorMsg(null);
      const res = await api.voidOrder(orderToVoid.id, voidReason, adminPin);
      setVoidSuccessMsg(res.message);
      setTimeout(() => setVoidSuccessMsg(null), 4000);
      setOrderToVoid(null);
      await loadOrders();
    } catch (err: any) {
      setVoidErrorMsg(err.message || 'Failed to void bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#0b101b] border border-[#1b283f] rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#162135] bg-[#090e18] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Recent Bills & Invoice Void Manager</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-800 text-rose-300 uppercase font-black">
                  Admin Control
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect customer invoices, reprint thermal slips, or void bills with automated stock restoration.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notices */}
        {voidSuccessMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{voidSuccessMsg}</span>
          </div>
        )}

        {voidErrorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{voidErrorMsg}</span>
            </div>
            <button onClick={() => setVoidErrorMsg(null)} className="text-rose-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Search Bar & Stats */}
        <div className="p-6 pb-3 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Bill # (e.g. ORD-2026...) or Cashier..."
              className="w-full bg-[#0d1424] border border-[#1b283f] focus:border-cyan-500 text-xs text-white rounded-xl py-2.5 pl-9 pr-20 outline-hidden transition placeholder:text-slate-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer"
            >
              Filter
            </button>
          </form>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Bills Loaded: <strong className="text-white">{orders.length}</strong></span>
            <button
              onClick={loadOrders}
              className="p-1.5 bg-[#0d1424] hover:bg-[#131d33] border border-[#1b283f] rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
              title="Refresh order list"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {orders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 py-12">
              <Receipt className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">No Orders Found</p>
              <p className="text-xs text-slate-600">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="bg-[#090e18] border border-[#162135] rounded-2xl overflow-hidden shadow-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0e1626] border-b border-[#162135] text-slate-400 text-[11px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">BILL NUMBER</th>
                    <th className="py-3 px-4">DATE & TIME</th>
                    <th className="py-3 px-4">CASHIER</th>
                    <th className="py-3 px-4 text-center">PAY METHOD</th>
                    <th className="py-3 px-4 text-right">TOTAL AMOUNT</th>
                    <th className="py-3 px-4 text-center">STATUS</th>
                    <th className="py-3 px-4 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#152033] text-xs font-mono">
                  {orders.map((ord) => {
                    const isVoided = ord.status === 'VOIDED';
                    const isShiftClosed = ord.shift_status === 'closed';
                    return (
                      <tr 
                        key={ord.id} 
                        className={`transition group ${isVoided ? 'bg-rose-950/10 opacity-75' : 'hover:bg-[#111928]/60'}`}
                      >
                        {/* Bill Number */}
                        <td className="py-3.5 px-4">
                          <span className={`font-bold text-sm block ${isVoided ? 'line-through text-slate-400' : 'text-white'}`}>
                            {ord.order_number}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans">
                            {ord.items?.length || 1} line item{(ord.items?.length || 1) === 1 ? '' : 's'}
                          </span>
                        </td>

                        {/* Date & Time */}
                        <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                          <div>{new Date(ord.created_at).toLocaleDateString()}</div>
                          <div className="text-slate-500 text-[10px]">{new Date(ord.created_at).toLocaleTimeString()}</div>
                        </td>

                        {/* Cashier */}
                        <td className="py-3.5 px-4 text-slate-200">
                          {ord.cashier_name || 'Cashier'}
                        </td>

                        {/* Payment Method */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] inline-flex items-center gap-1 ${
                            ord.payment_method === 'CASH'
                              ? 'bg-emerald-950/70 border border-emerald-800/80 text-emerald-300'
                              : 'bg-blue-950/70 border border-blue-800/80 text-blue-300'
                          }`}>
                            {ord.payment_method === 'CASH' ? <DollarSign className="w-2.5 h-2.5" /> : <CreditCard className="w-2.5 h-2.5" />}
                            <span>{ord.payment_method}</span>
                          </span>
                        </td>

                        {/* Total Amount */}
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-black text-sm block ${isVoided ? 'line-through text-rose-400/80' : 'text-cyan-400'}`}>
                            {currency}{Number(ord.total_amount).toFixed(2)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          {isVoided ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-rose-300 font-black text-[9px] uppercase tracking-wider">
                                VOIDED
                              </span>
                              {ord.void_reason && (
                                <span className="text-[9px] text-rose-400/80 font-sans max-w-[120px] truncate" title={ord.void_reason}>
                                  {ord.void_reason}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                              isShiftClosed
                                ? 'bg-slate-900/80 border border-slate-700/80 text-slate-400'
                                : 'bg-emerald-950/60 border border-emerald-800/70 text-emerald-400'
                            }`}>
                              {isShiftClosed ? 'SETTLED' : 'COMPLETED'}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2 font-sans">
                            <button
                              onClick={() => handleReprint(ord.id)}
                              disabled={loadingSlipId === ord.id}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Reprint Customer Thermal Slip"
                            >
                              {loadingSlipId === ord.id ? (
                                <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin inline-block" />
                              ) : (
                                <Printer className="w-3 h-3 text-cyan-400" />
                              )}
                              <span>Slip</span>
                            </button>

                            {!isVoided && (
                              isShiftClosed ? (
                                <span
                                  className="px-2 py-1 bg-slate-900/80 border border-slate-800 text-slate-500 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed select-none"
                                  title="Shift closed with Z-Report. Settled transactions cannot be voided."
                                >
                                  <Lock className="w-3 h-3 text-slate-600" />
                                  <span>Settled</span>
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleRequestVoid(ord)}
                                  className="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900 border border-rose-900 text-rose-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  title="Void Bill and Restore Stock (Admin Authorization Required)"
                                >
                                  <Ban className="w-3 h-3 text-rose-400" />
                                  <span>Void</span>
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Void Confirmation Dialog */}
        {orderToVoid && isAdmin && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-60 p-4">
            <div className="bg-[#0f172a] border border-rose-900/80 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Void Bill #{orderToVoid.order_number}?</h3>
                  <p className="text-xs text-rose-300">Total: {currency}{Number(orderToVoid.total_amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="text-xs text-slate-300 space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <p>
                  <strong>Warning:</strong> Voiding this bill will:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  <li>Mark the bill as <span className="text-rose-400 font-bold">VOIDED</span> in store records.</li>
                  <li><strong>Automatically return all {orderToVoid.items?.length || ''} item quantities</strong> back to inventory stock.</li>
                  <li>Deduct {currency}{Number(orderToVoid.total_amount).toFixed(2)} from active drawer and sales revenue.</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Reason for Void
                </label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer return, wrong items scanned, duplicate bill..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs outline-hidden focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderToVoid(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeVoid()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs transition cursor-pointer shadow-lg shadow-rose-950/50"
                >
                  Confirm Void & Restock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supervisor / Admin PIN Authorization Modal */}
        <SupervisorPinModal
          isOpen={isPinModalOpen}
          actionDescription={orderToVoid ? `Authorize Voiding Bill #${orderToVoid.order_number}` : 'Admin Authorization'}
          onClose={() => {
            setIsPinModalOpen(false);
            setOrderToVoid(null);
          }}
          onAuthorized={(pin) => {
            setIsPinModalOpen(false);
            executeVoid(pin || '1234');
          }}
        />

        {/* Thermal Receipt Slip Preview Modal */}
        {previewReceipt && (
          <ThermalReceipt
            receipt={previewReceipt}
            settings={settings}
            onClose={() => setPreviewReceipt(null)}
          />
        )}

      </div>
    </div>
  );
};
