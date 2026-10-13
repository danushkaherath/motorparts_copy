import React, { useState, useRef, useEffect } from 'react';
import { 
  Printer, 
  X, 
  Tag, 
  Copy, 
  Check, 
  Sliders, 
  Eye, 
  Sparkles, 
  Layers, 
  Calendar, 
  Building2, 
  DollarSign,
  HelpCircle,
  Scan
} from 'lucide-react';
import { toPng } from 'html-to-image';
import JsBarcode from 'jsbarcode';
import type { Product, AppSettings } from '../types';
import { api } from '../services/api';

interface BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
  className?: string;
}

const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  width = 1.6,
  height = 30,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const clean = String(value || '000000').trim();
    if (!clean) return;

    try {
      // Auto-detect format: if exactly 12 or 13 digits, use EAN13
      let format = 'CODE128';
      if (/^\d{12,13}$/.test(clean)) {
        format = 'EAN13';
      }

      JsBarcode(svgRef.current, clean, {
        format,
        width,
        height,
        displayValue: false,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
        flat: true,
      });
    } catch {
      try {
        JsBarcode(svgRef.current, clean, {
          format: 'CODE128',
          width,
          height,
          displayValue: false,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000',
          flat: true,
        });
      } catch (err) {
        console.error('JsBarcode rendering error:', err);
      }
    }
  }, [value, width, height]);

  return <svg ref={svgRef} className={`shape-crispEdges block max-w-full h-auto ${className}`} />;
};

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: AppSettings | null;
}

export type LabelSizePreset = '50x20' | '50x25' | '50x30' | '40x30' | '40x20' | '38x25' | '60x40' | 'shelf_80x40';

interface LabelConfig {
  size: LabelSizePreset;
  copiesPerProduct: number;
  showStoreName: boolean;
  showProductName: boolean;
  showPrice: boolean;
  showMrp: boolean;
  showBarcodeNumber: boolean;
  showExpiry: boolean;
  showBatch: boolean;
  fontSize: 'small' | 'medium' | 'large';
  rotation: 0 | 90 | 180 | 270;
  horizontalOffset: number;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
}) => {
  if (!isOpen || !products || products.length === 0) return null;

  // Dimensions in mm and px (at standard 96 DPI: 1mm ≈ 3.78px)
  const sizeMap: Record<LabelSizePreset, { widthMm: number; heightMm: number; widthPx: number; heightPx: number; name: string }> = {
    '50x20': { widthMm: 50, heightMm: 20, widthPx: 190, heightPx: 76, name: '50mm × 20mm (Compact Roll)' },
    '50x25': { widthMm: 50, heightMm: 25, widthPx: 190, heightPx: 95, name: '50mm × 25mm (Standard 2" × 1" Roll)' },
    '50x30': { widthMm: 50, heightMm: 30, widthPx: 190, heightPx: 114, name: '50mm × 30mm (Sticker Roll)' },
    '40x30': { widthMm: 40, heightMm: 30, widthPx: 152, heightPx: 114, name: '40mm × 30mm (Compact Sticker)' },
    '40x20': { widthMm: 40, heightMm: 20, widthPx: 152, heightPx: 76, name: '40mm × 20mm (Small Sticker)' },
    '38x25': { widthMm: 38, heightMm: 25, widthPx: 144, heightPx: 95, name: '38mm × 25mm (Small Retail Sticker)' },
    '60x40': { widthMm: 60, heightMm: 40, widthPx: 228, heightPx: 152, name: '60mm × 40mm (Large Box Sticker)' },
    'shelf_80x40': { widthMm: 80, heightMm: 40, widthPx: 302, heightPx: 151, name: '80mm × 40mm (Shelf Edge Label)' },
  };

  const [activeProductIndex, setActiveProductIndex] = useState<number>(0);
  const [config, setConfig] = useState<LabelConfig>(() => {
    const savedSize = (typeof window !== 'undefined' && localStorage.getItem('pos_label_size') as LabelSizePreset) || '50x25';
    const initialSize = sizeMap[savedSize] ? savedSize : '50x25';
    const savedRotation = (typeof window !== 'undefined' && localStorage.getItem('pos_label_rotation') !== null)
      ? (parseInt(localStorage.getItem('pos_label_rotation')!, 10) as any)
      : 0;
    const savedOffset = (typeof window !== 'undefined' && parseInt(localStorage.getItem('pos_label_offset') || '0', 10)) || 0;

    return {
      size: initialSize,
      copiesPerProduct: 1,
      showStoreName: true,
      showProductName: true,
      showPrice: false,
      showMrp: true,
      showBarcodeNumber: true,
      showExpiry: false,
      showBatch: false,
      fontSize: 'medium',
      rotation: savedRotation,
      horizontalOffset: savedOffset,
    };
  });

  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isScannerHelpOpen, setIsScannerHelpOpen] = useState<boolean>(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const currency = settings?.currency_symbol || 'Rs.';
  const storeName = settings?.store_name || 'MOTOR PARTS';
  const currentProduct = products[activeProductIndex] || products[0];

  const activeDim = sizeMap[config.size] || sizeMap['50x30'];
  const isTier20 = activeDim.heightMm <= 22;                           // 20mm (50x20, 40x20)
  const isTier25 = activeDim.heightMm > 22 && activeDim.heightMm <= 27; // 25mm (50x25, 38x25)
  const isTier30 = activeDim.heightMm > 27 && activeDim.heightMm <= 34; // 30mm (50x30, 40x30)
  const isTier40 = activeDim.heightMm > 34;                             // 40mm+ (60x40, 80x40)

  // Module width (exact pixels per narrowest bar) and bar height for JsBarcode
  const barcodeBarWidth = isTier20 ? 1.2 : isTier25 ? 1.3 : isTier30 ? 1.4 : 1.7;
  const barcodeHeight = isTier20 ? 16 : isTier25 ? 20 : isTier30 ? 25 : 36;
  const paddingCss = isTier20 ? '1mm 1.5mm' : isTier25 ? '1.5mm 1.5mm' : isTier30 ? '2mm 2mm' : '3mm 2.5mm';

  // Barcode data value
  const barcodeValue = String(currentProduct.barcode || currentProduct.sku || '00000000').trim();

  // Total labels to print
  const totalLabels = products.length * config.copiesPerProduct;

  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleDirectThermalPrint = async () => {
    if (!isLocalhost) {
      handleBrowserPrint();
      return;
    }

    try {
      setIsPrinting(true);
      setFeedback(null);

      // Render the current preview or first label to PNG
      let imageBase64: string | undefined;
      if (previewRef.current) {
        imageBase64 = await toPng(previewRef.current, {
          pixelRatio: 3,
          backgroundColor: '#ffffff',
          style: {
            margin: '0',
            boxShadow: 'none',
          }
        });
      }

      const res = await api.printBarcodeLabels({
        printer_name: settings?.printer_name || 'Xprinter XP-365B',
        label_width_mm: activeDim.widthMm,
        label_height_mm: activeDim.heightMm,
        copies: config.copiesPerProduct,
        products: products.map((p) => ({
          name: p.name,
          barcode: p.barcode,
          selling_price: p.selling_price,
          mrp: p.mrp,
          batch_number: p.batch_number,
          expiry_date: p.expiry_date,
        })),
        image_base64: imageBase64,
      });

      setFeedback({
        message: `Successfully spooled ${totalLabels} sticker(s) to ${res.printer || 'Xprinter XP-365B'}!`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.warn('Direct spooler print notice:', err);
      // Fallback: trigger clean browser print dialog automatically
      setFeedback({
        message: `Spooler: ${err.message || 'Direct print failed'}. Opening Browser Print...`,
        type: 'error',
      });
      setTimeout(() => {
        handleBrowserPrint();
      }, 800);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. PRINT MEDIA STYLESHEET (Applies ONLY during window.print)               */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: ${activeDim.widthMm}mm ${activeDim.heightMm}mm;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            text-align: left !important;
            width: ${activeDim.widthMm}mm !important;
            height: ${activeDim.heightMm}mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #barcode-print-container, #barcode-print-container * {
            visibility: visible !important;
          }
          #barcode-print-container {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${activeDim.widthMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .barcode-sticker-item {
            width: ${activeDim.widthMm}mm !important;
            max-width: ${activeDim.widthMm}mm !important;
            height: ${activeDim.heightMm}mm !important;
            max-height: ${activeDim.heightMm}mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            padding: ${paddingCss} !important;
            overflow: hidden !important;
            margin: 0 !important;
            background: #ffffff !important;
            ${config.horizontalOffset ? `transform: translateX(${config.horizontalOffset}mm) ${config.rotation ? `rotate(${config.rotation}deg)` : ''} !important;` : config.rotation ? `transform: rotate(${config.rotation}deg) !important;` : ''}
            ${config.rotation ? 'transform-origin: center center !important;' : ''}
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* 2. HIDDEN DOM TREE RENDERED FOR DIRECT BROWSER / ROLL PRINTING             */}
      {/* ========================================================================= */}
      <div id="barcode-print-container" ref={printAreaRef} className="hidden print:block">
        {products.map((prod, pIdx) => {
          const pBarcode = String(prod.barcode || prod.sku || '00000000').trim();
          const copies = Array.from({ length: Math.max(1, config.copiesPerProduct) });

          return copies.map((_, cIdx) => (
            <div
              key={`${prod.id}_${pIdx}_${cIdx}`}
              className="barcode-sticker-item text-black bg-white text-center font-sans"
              style={{
                width: `${activeDim.widthMm}mm`,
                height: `${activeDim.heightMm}mm`,
                maxHeight: `${activeDim.heightMm}mm`,
                boxSizing: 'border-box',
                padding: paddingCss,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
            >
              {/* Header Store Name (No horizontal line) */}
              {config.showStoreName && (
                <div className={`font-black uppercase tracking-tight w-full text-center overflow-hidden text-ellipsis whitespace-nowrap shrink-0 ${
                  isTier20 ? 'text-[6.5px] leading-tight' : isTier25 ? 'text-[7.5px] leading-tight' : isTier30 ? 'text-[8px] leading-tight' : 'text-[9.5px] leading-normal'
                }`}>
                  <span className="block truncate">{storeName}</span>
                </div>
              )}

              {/* Product Name */}
              {config.showProductName && (
                <div className={`font-bold w-full text-center px-0.5 shrink-0 ${
                  isTier20
                    ? 'text-[7px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                    : isTier25
                    ? 'text-[7.5px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                    : isTier30
                    ? 'text-[8.5px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                    : 'text-[10px] leading-normal line-clamp-2'
                }`}>
                  <span className="block truncate">{prod.name}</span>
                </div>
              )}

              {/* Barcode Vector Bars - JsBarcode high-contrast renderer */}
              <div className="w-full flex flex-col items-center justify-center shrink-0 my-0.5">
                <BarcodeSvg
                  value={pBarcode}
                  width={barcodeBarWidth}
                  height={barcodeHeight}
                />
                {config.showBarcodeNumber && (
                  <span className={`font-mono tracking-widest text-black font-bold shrink-0 ${
                    isTier20 ? 'text-[6px] leading-none mt-0.5' : isTier25 ? 'text-[7px] leading-none mt-0.5' : isTier30 ? 'text-[7.5px] leading-none mt-0.5' : 'text-[9px] leading-tight mt-1'
                  }`}>
                    {pBarcode}
                  </span>
                )}
              </div>

              {/* Price & Meta Footer (Guaranteed inside label height) */}
              {(config.showMrp || config.showPrice || config.showBatch || config.showExpiry) && (
                <div className="w-full flex items-center justify-center shrink-0 px-0.5">
                  {/* Left: Batch or Expiry only if enabled */}
                  {(config.showBatch || config.showExpiry) && (
                    <div className={`font-mono text-left leading-tight mr-auto ${isTier20 ? 'text-[6px]' : isTier25 ? 'text-[7px]' : 'text-[7.5px]'}`}>
                      {config.showBatch && prod.batch_number && (
                        <div>B:{prod.batch_number}</div>
                      )}
                      {config.showExpiry && prod.expiry_date && (
                        <div>EXP:{prod.expiry_date}</div>
                      )}
                    </div>
                  )}

                  {/* MRP (Prominent and standalone when showPrice is off) */}
                  {config.showMrp && !config.showPrice ? (
                    <div className="text-center font-mono font-black text-black leading-none">
                      <span className={isTier20 ? 'text-[7px] font-bold' : isTier25 ? 'text-[8px] font-bold' : isTier30 ? 'text-[9px] font-bold' : 'text-[10px] font-bold'}>
                        MRP:{' '}
                      </span>
                      <span className={isTier20 ? 'text-[8.5px] font-black' : isTier25 ? 'text-[9.5px] font-black' : isTier30 ? 'text-[11px] font-black' : 'text-[12.5px] font-black'}>
                        {currency} {Number(prod.mrp || prod.selling_price || 0).toFixed(2)}
                      </span>
                    </div>
                  ) : config.showPrice && !config.showMrp ? (
                    <div className="text-center font-mono font-black text-black leading-none">
                      <span className={isTier20 ? 'text-[7px] font-bold' : isTier25 ? 'text-[8px] font-bold' : isTier30 ? 'text-[9px] font-bold' : 'text-[10px] font-bold'}>
                        PRICE:{' '}
                      </span>
                      <span className={isTier20 ? 'text-[8.5px] font-black' : isTier25 ? 'text-[9.5px] font-black' : isTier30 ? 'text-[11px] font-black' : 'text-[12.5px] font-black'}>
                        {currency} {Number(prod.selling_price || 0).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full px-1 font-mono leading-none">
                      {config.showMrp && (
                        <span className={`text-black/70 font-bold ${isTier20 ? 'text-[6.5px]' : isTier25 ? 'text-[7.5px]' : isTier30 ? 'text-[8px]' : 'text-[9px]'}`}>
                          MRP: <span className="line-through">{currency}{Number(prod.mrp || prod.selling_price || 0).toFixed(2)}</span>
                        </span>
                      )}
                      {config.showPrice && (
                        <span className={`font-black text-black ml-auto ${isTier20 ? 'text-[8px]' : isTier25 ? 'text-[9.5px]' : isTier30 ? 'text-[10.5px]' : 'text-[12px]'}`}>
                          {currency}{Number(prod.selling_price || 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ));
        })}
      </div>

      {/* ========================================================================= */}
      {/* 3. INTERACTIVE DESIGNER & LIVE PREVIEW MODAL                               */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none print:hidden">
        <div className="bg-slate-900 border border-slate-750 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                  <span>Product Barcode & Price Sticker Generator</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Xprinter XP-365B
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Generate and print thermal barcode labels for shelf pricing, item packaging, and inventory scanning.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{feedback.message}</span>
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="hover:underline font-bold text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Column: Configurator & Presets (7 cols) */}
            <div className="md:col-span-7 space-y-4">
              {/* Product Selector (if multiple products selected) */}
              {products.length > 1 && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <Layers className="w-4 h-4" />
                      <span>Multiple Items Selected ({products.length} products)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Previewing Item #{activeProductIndex + 1}
                    </span>
                  </div>
                  <select
                    value={activeProductIndex}
                    onChange={(e) => setActiveProductIndex(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-amber-400"
                  >
                    {products.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        {p.name} [{p.barcode}] — {currency}{Number(p.selling_price).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Label Roll Preset */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Label Roll Size (Xprinter XP-365B)
                  </label>
                  <span className="text-[11px] font-mono font-bold text-amber-400">
                    {activeDim.widthMm}mm × {activeDim.heightMm}mm
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(sizeMap) as LabelSizePreset[]).map((sz) => {
                    const isSelected = config.size === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => {
                          setConfig({ ...config, size: sz });
                          localStorage.setItem('pos_label_size', sz);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-white shadow-sm ring-1 ring-amber-400/50'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] font-bold text-slate-200">
                            {sz === '50x20' && '50×20 mm'}
                            {sz === '50x25' && '50×25 mm'}
                            {sz === '50x30' && '50×30 mm'}
                            {sz === '40x30' && '40×30 mm'}
                            {sz === '40x20' && '40×20 mm'}
                            {sz === '38x25' && '38×25 mm'}
                            {sz === '60x40' && '60×40 mm'}
                            {sz === 'shelf_80x40' && '80×40 mm'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-500 mt-1">
                          {sz === '50x25' ? 'Standard 2"×1"' : sizeMap[sz].name.split('(')[1]?.replace(')', '') || `${sizeMap[sz].widthMm}×${sizeMap[sz].heightMm}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chrome Margins Notification / Fix Callout */}
              <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-200">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-snug space-y-1">
                  <span className="font-bold text-white text-sm block">How to print {activeDim.widthMm}mm × {activeDim.heightMm}mm correctly in Chrome:</span>
                  <div className="text-[11.5px] text-amber-200/90 space-y-1">
                    <div>1. In Chrome Print Preview, click <strong className="text-white">"More settings"</strong> on the right.</div>
                    <div>2. Under <strong className="text-white">Paper size</strong>, select <strong className="text-amber-300 font-bold">{activeDim.widthMm}mm × {activeDim.heightMm}mm</strong> (or 2"×1.2" / User Defined).</div>
                    <div>3. Under <strong className="text-white">Margins</strong>, select <strong className="text-amber-300 font-bold">None</strong>.</div>
                    <div>4. Under <strong className="text-white">Scale</strong>, select <strong className="text-white font-bold">100%</strong> (or Default).</div>
                  </div>
                </div>
              </div>

              {/* Scanner Compatibility Tip */}
              <div className="bg-sky-950/40 border border-sky-500/40 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-sky-200">
                <Scan className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="leading-snug space-y-1">
                  <span className="font-bold text-white block">Scanner Hardware Tip (Code 128 vs EAN-13):</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Retail scanners read supermarket products (like the 13-digit chili pack) because scanners have <strong>EAN-13</strong> turned on by default. For custom alphanumeric codes (<code className="text-amber-300 font-mono font-bold">MOD-SUSP-002</code>), standard <strong>Code 128</strong> is used.
                  </p>
                  <p className="text-[11px] text-sky-300 leading-relaxed">
                    &bull; <strong>Test with your phone:</strong> Point Google Lens or camera at this sticker. If your phone scans it immediately, the sticker is 100% valid and your physical barcode gun simply needs <em>Code 128</em> enabled (scan the barcode from its quick manual).<br/>
                    &bull; <strong>Numeric EAN-13:</strong> You can also assign 13-digit numbers (e.g. <code className="text-amber-300 font-mono font-bold">479001000001</code>) to items, which formats as standard EAN-13 accepted by all scanners out of the box.
                  </p>
                </div>
              </div>

              {/* Print Quantity */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-200">
                    Sticker Copies per Product
                  </label>
                  <p className="text-[11px] text-slate-400">
                    How many identical labels to peel and print. Total: <strong className="text-amber-400">{totalLabels} stickers</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {[1, 5, 10, 20].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setConfig({ ...config, copiesPerProduct: qty })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        config.copiesPerProduct === qty
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={config.copiesPerProduct}
                    onChange={(e) => setConfig({ ...config, copiesPerProduct: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Print Orientation */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-200">
                    Print Orientation
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Rotate if your sticker roll feeds vertically or sideways
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {[
                    { label: '0° Normal', value: 0 },
                    { label: '90° Rotate', value: 90 },
                    { label: '180° Invert', value: 180 },
                    { label: '270° CCW', value: 270 },
                  ].map((rot) => (
                    <button
                      key={rot.value}
                      type="button"
                      onClick={() => {
                        const newRot = rot.value as 0 | 90 | 180 | 270;
                        setConfig({ ...config, rotation: newRot });
                        localStorage.setItem('pos_label_rotation', String(newRot));
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        (config.rotation || 0) === rot.value
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-850 border border-slate-750 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {rot.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizontal Position / Alignment Shift */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-200">
                    Horizontal Alignment (Shift Left / Right)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Shift label position to match your printer's roll holder. Offset: <strong className="text-amber-400">{config.horizontalOffset > 0 ? `+${config.horizontalOffset}mm` : `${config.horizontalOffset}mm`}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Left (0mm)', val: 0 },
                    { label: 'Center (+15mm)', val: 15 },
                    { label: '-5mm', val: -5 },
                    { label: '+5mm', val: 5 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        setConfig({ ...config, horizontalOffset: preset.val });
                        localStorage.setItem('pos_label_offset', String(preset.val));
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        config.horizontalOffset === preset.val
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-850 border border-slate-750 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}

                  <div className="flex items-center gap-0.5 ml-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = (config.horizontalOffset || 0) - 2;
                        setConfig({ ...config, horizontalOffset: next });
                        localStorage.setItem('pos_label_offset', String(next));
                      }}
                      className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded font-bold cursor-pointer"
                      title="Nudge 2mm Left"
                    >
                      ◀ -2mm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = (config.horizontalOffset || 0) + 2;
                        setConfig({ ...config, horizontalOffset: next });
                        localStorage.setItem('pos_label_offset', String(next));
                      }}
                      className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded font-bold cursor-pointer"
                      title="Nudge 2mm Right"
                    >
                      +2mm ▶
                    </button>
                  </div>
                </div>
              </div>

              {/* Element Toggles (Customization) */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Label Content Customization
                </span>

                <div className="grid grid-cols-2 gap-2.5 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showStoreName}
                      onChange={(e) => setConfig({ ...config, showStoreName: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Store Header Name</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showProductName}
                      onChange={(e) => setConfig({ ...config, showProductName: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Product Full Name</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showMrp}
                      onChange={(e) => setConfig({ ...config, showMrp: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span className="font-semibold text-amber-300">Show MRP</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showPrice}
                      onChange={(e) => setConfig({ ...config, showPrice: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Show Selling Price</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showBarcodeNumber}
                      onChange={(e) => setConfig({ ...config, showBarcodeNumber: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Barcode Digits (Human Readable)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showExpiry}
                      onChange={(e) => setConfig({ ...config, showExpiry: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Expiry Date (if present)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={config.showBatch}
                      onChange={(e) => setConfig({ ...config, showBatch: e.target.checked })}
                      className="rounded text-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>Batch Number</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Live Sticker Preview (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-950/70 border border-slate-800 rounded-3xl p-6 relative">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-amber-400" />
                <span>Live Sticker Preview ({activeDim.widthMm}×{activeDim.heightMm}mm)</span>
              </div>

              {/* The Physical Sticker Mockup */}
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-inner flex items-center justify-center">
                {(() => {
                  return (
                    <div
                      ref={previewRef}
                      className="bg-white text-black rounded-xs shadow-xl flex flex-col justify-between items-center box-border overflow-hidden transition-all duration-200"
                      style={{
                        width: `${activeDim.widthPx}px`,
                        height: `${activeDim.heightPx}px`,
                        maxHeight: `${activeDim.heightPx}px`,
                        padding: isTier20 ? '4px 6px' : isTier25 ? '6px 6px' : isTier30 ? '8px 8px' : '11px 9px',
                        transform: config.rotation ? `rotate(${config.rotation}deg)` : 'none',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      {/* Top Store Header (No horizontal line) */}
                      {config.showStoreName && (
                        <div className={`w-full text-center font-black uppercase tracking-tight text-black overflow-hidden text-ellipsis whitespace-nowrap shrink-0 ${
                          isTier20 ? 'text-[6.5px] leading-tight' : isTier25 ? 'text-[7.5px] leading-tight' : isTier30 ? 'text-[8px] leading-tight' : 'text-[9.5px]'
                        }`}>
                          <span className="block truncate">{storeName}</span>
                        </div>
                      )}

                      {/* Product Title */}
                      {config.showProductName && (
                        <div className={`w-full text-center font-bold text-black px-0.5 shrink-0 ${
                          isTier20
                            ? 'text-[7px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                            : isTier25
                            ? 'text-[7.5px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                            : isTier30
                            ? 'text-[8.5px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap'
                            : 'text-[10px] line-clamp-2'
                        }`}>
                          <span className="block truncate">{currentProduct.name}</span>
                        </div>
                      )}

                      {/* Barcode Vector Bars - JsBarcode high-contrast renderer */}
                      <div className="w-full flex flex-col items-center justify-center shrink-0 my-0.5">
                        <BarcodeSvg
                          value={barcodeValue}
                          width={barcodeBarWidth}
                          height={barcodeHeight}
                        />
                        {config.showBarcodeNumber && (
                          <span className={`font-mono tracking-widest text-black font-bold shrink-0 ${
                            isTier20 ? 'text-[6px] leading-none mt-0.5' : isTier25 ? 'text-[7px] leading-none mt-0.5' : isTier30 ? 'text-[7.5px] leading-none mt-0.5' : 'text-[9px] mt-0.5'
                          }`}>
                            {barcodeValue}
                          </span>
                        )}
                      </div>

                      {/* Bottom Strip: Price & Expiry (Guaranteed inside label height) */}
                      {(config.showMrp || config.showPrice || config.showBatch || config.showExpiry) && (
                        <div className="w-full flex items-center justify-center shrink-0 px-0.5">
                          {(config.showBatch || config.showExpiry) && (
                            <div className={`font-mono text-left leading-tight text-black mr-auto ${
                              isTier20 ? 'text-[6px]' : isTier25 ? 'text-[7px]' : 'text-[7.5px]'
                            }`}>
                              {config.showBatch && currentProduct.batch_number && (
                                <div>B:{currentProduct.batch_number}</div>
                              )}
                              {config.showExpiry && currentProduct.expiry_date && (
                                <div>EXP:{currentProduct.expiry_date}</div>
                              )}
                            </div>
                          )}

                          {config.showMrp && !config.showPrice ? (
                            <div className="text-center font-mono font-black text-black leading-none">
                              <span className={isTier20 ? 'text-[7px] font-bold' : isTier25 ? 'text-[8px] font-bold' : isTier30 ? 'text-[9px] font-bold' : 'text-[10px] font-bold'}>
                                MRP:{' '}
                              </span>
                              <span className={isTier20 ? 'text-[8.5px] font-black' : isTier25 ? 'text-[9.5px] font-black' : isTier30 ? 'text-[11px] font-black' : 'text-[12.5px] font-black'}>
                                {currency} {Number(currentProduct.mrp || currentProduct.selling_price || 0).toFixed(2)}
                              </span>
                            </div>
                          ) : config.showPrice && !config.showMrp ? (
                            <div className="text-center font-mono font-black text-black leading-none">
                              <span className={isTier20 ? 'text-[7px] font-bold' : isTier25 ? 'text-[8px] font-bold' : isTier30 ? 'text-[9px] font-bold' : 'text-[10px] font-bold'}>
                                PRICE:{' '}
                              </span>
                              <span className={isTier20 ? 'text-[8.5px] font-black' : isTier25 ? 'text-[9.5px] font-black' : isTier30 ? 'text-[11px] font-black' : 'text-[12.5px] font-black'}>
                                {currency} {Number(currentProduct.selling_price || 0).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full px-1 font-mono leading-none">
                              {config.showMrp && (
                                <span className={`text-black/70 font-bold ${isTier20 ? 'text-[6.5px]' : isTier25 ? 'text-[7.5px]' : isTier30 ? 'text-[8px]' : 'text-[9px]'}`}>
                                  MRP: <span className="line-through">{currency}{Number(currentProduct.mrp || currentProduct.selling_price || 0).toFixed(2)}</span>
                                </span>
                              )}
                              {config.showPrice && (
                                <span className={`font-black text-black ml-auto ${isTier20 ? 'text-[8px]' : isTier25 ? 'text-[9.5px]' : isTier30 ? 'text-[10.5px]' : 'text-[12px]'}`}>
                                  {currency}{Number(currentProduct.selling_price || 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Physical size guide info */}
              <p className="text-[11px] text-slate-500 mt-4 text-center max-w-xs">
                Calibrated for thermal label rolls. Code128 standard scanned instantly by all USB & Bluetooth 1D/2D barcode guns.
              </p>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Target Printer: <strong className="text-slate-200">{settings?.printer_name || 'Xprinter XP-365B'}</strong> ({totalLabels} total sticker{totalLabels === 1 ? '' : 's'})
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer text-center"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleBrowserPrint}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4 text-slate-400" />
                <span>Browser Print</span>
              </button>

              <button
                type="button"
                onClick={handleDirectThermalPrint}
                disabled={isPrinting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isPrinting ? 'Printing Labels...' : `Print to XP-365B (${totalLabels})`}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
