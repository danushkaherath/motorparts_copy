import React, { useState, useEffect, useRef } from 'react';
import { Printer, X, Check, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { OrderReceipt, AppSettings } from '../types';
import { api } from '../services/api';

interface ThermalReceiptProps {
  receipt: OrderReceipt | null;
  settings: AppSettings | null;
  onClose: () => void;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  receipt,
  settings,
  onClose,
}) => {
  if (!receipt) return null;

  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const hasAutoPrintedRef = useRef<boolean>(false);

  const widthMm = settings?.receipt_width === '58' ? '58mm' : '80mm';
  const is58mm = settings?.receipt_width === '58';
  const currency = settings?.currency_symbol || '$';
  const isTaxEnabled = settings?.feature_tax === 'true';

  // Calculate customer savings from MRP discounts + bill-level discount
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const itemsSavings = items.reduce((acc, item) => {
    const mrp = Number(item.mrp || 0);
    const unitPrice = Number(item.unit_price || 0);
    const qty = Number(item.quantity || 0);
    if (mrp > unitPrice) {
      return acc + ((mrp - unitPrice) * qty);
    }
    return acc;
  }, 0);
  const totalSavings = Math.round((itemsSavings + (receipt.discount_amount || 0)) * 100) / 100;
  const isVoided = (receipt as any).status === 'VOIDED';

  const handlePrint = async () => {
    if (isPrinting) return;
    try {
      setIsPrinting(true);
      const targetPrinter = settings?.printer_name || 'Xprinter XP-365B';
      setPrintFeedback(`Printing to ${targetPrinter}...`);

      // Capture exact screen visual as crisp 203 DPI thermal bitmap
      let imageBase64: string | undefined;
      const targetNode = receiptRef.current || document.getElementById('thermal-receipt');
      if (targetNode) {
        try {
          // Inject temporary thermal-print overrides: force ALL text to pure black & heavier weight
          // (gray/light text disappears on 203 DPI thermal printers)
          const thermalStyle = document.createElement('style');
          thermalStyle.id = 'thermal-print-overrides';
          thermalStyle.textContent = `
            #thermal-receipt, #thermal-receipt * {
              color: #000000 !important;
              -webkit-text-stroke: 0.3px #000000;
            }
            #thermal-receipt .font-light { font-weight: 500 !important; }
            #thermal-receipt .text-gray-400, #thermal-receipt .text-gray-500,
            #thermal-receipt .text-gray-600, #thermal-receipt .text-gray-700 {
              color: #000000 !important;
            }
          `;
          document.head.appendChild(thermalStyle);

          // Small delay to let styles apply before capture
          await new Promise(r => setTimeout(r, 50));

          imageBase64 = await toPng(targetNode, {
            pixelRatio: 3,
            skipFonts: true,
            backgroundColor: '#ffffff',
            style: {
              boxShadow: 'none',
              borderRadius: '0px',
            },
          });

          // Remove temporary overrides so on-screen preview stays elegant
          thermalStyle.remove();
          console.log('DOM capture success, image base64 length:', imageBase64?.length);
        } catch (captureErr) {
          // Clean up style overrides even on failure
          document.getElementById('thermal-print-overrides')?.remove();
          console.error('DOM capture error, falling back to text spooler:', captureErr);
        }
      }
      const res = await api.printReceipt(receipt, settings, {
        image_base64: imageBase64,
        receipt_width: is58mm ? 58 : 80,
      });

      setPrintFeedback(`Printed successfully on ${res.printer}!`);
      setTimeout(() => setPrintFeedback(null), 3500);
    } catch (err: any) {
      console.warn('Direct spooler print failed:', err);
      setPrintFeedback('Spooler error: ' + err.message);
      setTimeout(() => setPrintFeedback(null), 4000);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  // Auto-print once on mount if enabled
  useEffect(() => {
    if (settings?.printer_auto_print !== 'false' && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [receipt, settings, isPrinting]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-850">
          <div className={`flex items-center gap-2 font-semibold ${isVoided ? 'text-rose-400' : 'text-emerald-400'}`}>
            <Check className="w-5 h-5" />
            <span>{isVoided ? 'Customer Bill [VOIDED]' : 'Customer Receipt Slip'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Receipt Body (Paper Simulation) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center">
          <div
            id="thermal-receipt"
            ref={receiptRef}
            style={{ 
              width: is58mm ? '230px' : '300px',
              fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Sinhala', sans-serif"
            }}
            className="bg-white text-gray-900 text-xs p-4 shadow-lg rounded-xs leading-normal select-all font-normal"
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-900">
                {settings?.store_name || 'GROCERY STORE POS'}
              </h2>
              {settings?.store_address && (
                <p className="text-[10px] font-light text-gray-600 mt-0.5">{settings.store_address}</p>
              )}
              {settings?.store_phone && (
                <p className="text-[10px] font-light text-gray-600">Tel: {settings.store_phone}</p>
              )}
            </div>

            {/* Meta */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[10.5px] font-light space-y-0.5 text-gray-700">
              <div className="flex justify-between">
                <span>ORDER:</span>
                <span className="font-normal text-gray-900">{receipt.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span>DATE:</span>
                <span>{new Date(receipt.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>CASHIER:</span>
                <span>{receipt.cashier_name}</span>
              </div>
              {receipt.customer_name && (
                <div className="flex justify-between pt-0.5 border-t border-dotted border-gray-300">
                  <span>CUSTOMER:</span>
                  <span className="font-normal text-gray-900">{receipt.customer_name} {receipt.customer_phone ? `(${receipt.customer_phone})` : ''}</span>
                </div>
              )}
            </div>

            {/* VOIDED Banner */}
            {isVoided && (
              <div className="my-2 p-2 border-2 border-dashed border-red-600 bg-red-50 text-center">
                <div className="text-red-700 font-black text-xs tracking-widest uppercase">
                  *** VOIDED BILL ***
                </div>
                {(receipt as any).void_reason && (
                  <div className="text-[9.5px] text-red-600 font-sans mt-0.5">
                    Reason: {(receipt as any).void_reason}
                  </div>
                )}
              </div>
            )}

            {/* Line Items Table */}
            <div className="py-2 border-b border-dashed border-gray-400">
              <div className="flex justify-between text-[9.5px] font-medium text-gray-500 pb-1 uppercase tracking-wider border-b border-dotted border-gray-300">
                <span>ITEM DESCRIPTION</span>
                <span>TOTAL</span>
              </div>
              {items.map((item, idx) => {
                const mrp = Number(item.mrp || 0);
                const hasDiscount = mrp > item.unit_price;
                const itemSavings = hasDiscount ? (mrp - item.unit_price) * Number(item.quantity) : 0;
                return (
                  <div key={idx} className="py-1.5 border-b border-dotted border-gray-200 last:border-0">
                    {/* Complete Item Name (Uncut, wraps to 2 lines if needed, thin letters) */}
                    <div className="text-[11px] font-normal text-gray-900 leading-snug break-words tracking-tight">
                      {item.product_name}
                    </div>

                    {/* Qty x Price and Line Subtotal */}
                    <div className="flex justify-between items-center text-[10.5px] pt-0.5 text-gray-600 font-light">
                      <span>
                        {item.quantity} {item.unit || ''} × {currency}{item.unit_price.toFixed(2)}
                      </span>
                      <span className="font-normal text-gray-900 text-[11px]">
                        {currency}{item.subtotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Discount/MRP breakdown if applicable */}
                    {hasDiscount && (
                      <div className="flex justify-between items-center text-[9.5px] text-gray-600 font-light pt-0.5">
                        <span>MRP: {currency}{mrp.toFixed(2)}</span>
                        <span className="text-gray-900 font-normal">
                          ලාභය: {currency}{itemSavings.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1 font-light text-gray-700">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span className="font-normal text-gray-900">{currency}{receipt.subtotal.toFixed(2)}</span>
              </div>
              {receipt.discount_amount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>DISCOUNT:</span>
                  <span>-{currency}{receipt.discount_amount.toFixed(2)}</span>
                </div>
              )}
              {isTaxEnabled && receipt.tax_amount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>TAX:</span>
                  <span>{currency}{receipt.tax_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-1.5 border-t border-dotted border-gray-400 text-gray-900 font-medium">
                <span>TOTAL DUE:</span>
                <span className="font-semibold text-base">{currency}{receipt.total_amount.toFixed(2)}</span>
              </div>
            </div>

            {/* PROMINENT CUSTOMER SAVINGS BANNER (SINHALA: ඔබ ලැබූ ලාභය) */}
            {totalSavings > 0 && (
              <div className="my-2.5 p-2 border border-dashed border-gray-700 text-center bg-gray-50 print:bg-white">
                <div className="font-semibold text-xs tracking-wide text-gray-900 leading-tight">
                  *** ඔබ ලැබූ ලාභය ***
                </div>
                <div className="text-[9.5px] uppercase font-light tracking-wider text-gray-600">
                  YOUR TOTAL SAVINGS
                </div>
                <div className="text-sm font-semibold mt-0.5 text-gray-900">
                  {currency}{totalSavings.toFixed(2)}
                </div>
              </div>
            )}

            {/* Payment Details */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[10.5px] space-y-1 font-light text-gray-700">
              <div className="flex justify-between">
                <span>TENDER [{receipt.payment_method}]:</span>
                <span className="font-normal text-gray-900">{currency}{receipt.tender_amount.toFixed(2)}</span>
              </div>
              {receipt.payment_method === 'CASH' && (
                <div className="flex justify-between">
                  <span>CHANGE DUE:</span>
                  <span className="font-normal text-gray-900">{currency}{receipt.change_amount.toFixed(2)}</span>
                </div>
              )}
              {receipt.payment_method === 'CARD' && receipt.card_reference && (
                <div className="flex justify-between text-[9.5px] text-gray-500">
                  <span>CARD REF:</span>
                  <span>{receipt.card_reference}</span>
                </div>
              )}
            </div>

            {/* Customer Loyalty Points Section */}
            {(receipt.customer_name || (receipt.points_earned !== undefined && receipt.points_earned > 0)) && (
              <div className="py-2 border-b border-dashed border-gray-400 text-[10px] font-light space-y-0.5 text-gray-700">
                <div className="flex justify-between font-medium text-gray-900">
                  <span>LOYALTY REWARDS:</span>
                  <span className="text-[9px] uppercase tracking-wider text-emerald-800 font-bold">Reward Points</span>
                </div>
                {receipt.points_earned !== undefined && receipt.points_earned > 0 && (
                  <div className="flex justify-between text-emerald-800 font-medium">
                    <span>Points Earned:</span>
                    <span>+{receipt.points_earned} pts</span>
                  </div>
                )}
                {receipt.points_redeemed !== undefined && receipt.points_redeemed > 0 && (
                  <div className="flex justify-between text-rose-700 font-medium">
                    <span>Points Redeemed:</span>
                    <span>-{receipt.points_redeemed} pts</span>
                  </div>
                )}
                {receipt.customer_points_balance !== undefined && (
                  <div className="flex justify-between font-normal text-gray-900 pt-0.5 border-t border-dotted border-gray-300">
                    <span>Active Points Balance:</span>
                    <span className="font-semibold">{receipt.customer_points_balance} pts</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="pt-3 text-center">
              <p className="text-[9.5px] text-gray-500 italic leading-snug font-light">
                {settings?.store_receipt_footer || 'Thank you for shopping with us!'}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-850 space-y-2">
          {printFeedback && (
            <div className="text-center text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 py-1.5 px-3 rounded-lg animate-in fade-in">
              {printFeedback}
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-sm transition cursor-pointer"
            >
              New Sale (Esc)
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBrowserPrint}
                className="text-xs text-slate-500 hover:text-slate-300 underline transition cursor-pointer"
                title="Open traditional browser print preview window"
              >
                Browser Preview
              </button>

              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition shadow-md shadow-emerald-950/40 cursor-pointer"
              >
                {isPrinting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                <span>{isPrinting ? 'Spooling...' : 'Print Receipt (Enter)'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
