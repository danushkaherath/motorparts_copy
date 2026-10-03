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
  DollarSign
} from 'lucide-react';
import { toPng } from 'html-to-image';
import type { Product, AppSettings } from '../types';
import { generateCode128Bars } from '../utils/barcode';
import { api } from '../services/api';

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: AppSettings | null;
}

export type LabelSizePreset = '50x20' | '50x30' | '40x30' | '38x25' | 'shelf_80x40';

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

  const [activeProductIndex, setActiveProductIndex] = useState<number>(0);
  const [config, setConfig] = useState<LabelConfig>({
    size: '50x20',
    copiesPerProduct: 1,
    showStoreName: true,
    showProductName: true,
    showPrice: false,
    showMrp: true,
    showBarcodeNumber: true,
    showExpiry: false,
    showBatch: false,
    fontSize: 'medium',
    rotation: (typeof window !== 'undefined' && localStorage.getItem('pos_label_rotation') !== null
      ? (parseInt(localStorage.getItem('pos_label_rotation')!, 10) as any)
      : 180),
    horizontalOffset: (typeof window !== 'undefined' && parseInt(localStorage.getItem('pos_label_offset') || '0', 10)) || 0,
  });

  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const currency = settings?.currency_symbol || 'Rs.';
  const storeName = settings?.store_name || 'GROCERY STORE';
  const currentProduct = products[activeProductIndex] || products[0];

  // Dimensions in mm and px (at standard 96 DPI: 1mm ≈ 3.78px)
  const sizeMap: Record<LabelSizePreset, { widthMm: number; heightMm: number; widthPx: number; heightPx: number; name: string }> = {
    '50x20': { widthMm: 50, heightMm: 20, widthPx: 190, heightPx: 76, name: '50mm × 20mm (Standard Xprinter XP-365B Label)' },
    '50x30': { widthMm: 50, heightMm: 30, widthPx: 190, heightPx: 114, name: '50mm × 30mm (Sticker Roll)' },
    '40x30': { widthMm: 40, heightMm: 30, widthPx: 152, heightPx: 114, name: '40mm × 30mm (Compact Sticker)' },
    '38x25': { widthMm: 38, heightMm: 25, widthPx: 144, heightPx: 95, name: '38mm × 25mm (Small Retail Sticker)' },
    'shelf_80x40': { widthMm: 80, heightMm: 40, widthPx: 302, heightPx: 151, name: '80mm × 40mm (Shelf Edge Label)' },
  };

  const activeDim = sizeMap[config.size];
  const isCompact = activeDim.heightMm <= 20;

  // Smaller, compact barcode width and height
  const barcodeWidth = isCompact ? 120 : Math.min(160, activeDim.widthPx - 40);
  const barcodeHeight = isCompact ? 11 : 22;

  // Barcode data computation
  const barcodeValue = String(currentProduct.barcode || currentProduct.sku || '00000000').trim();
  const bars = generateCode128Bars(barcodeValue, barcodeWidth);

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
            margin: 0mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            text-align: left !important;
          }
          body * {
            visibility: hidden !important;
          }
          #barcode-print-container, #barcode-print-container * {
            visibility: visible !important;
          }
          #barcode-print-container {
            position: absolute !important;
            left: ${config.horizontalOffset || 0}mm !important;
            top: 0 !important;
            width: ${activeDim.widthMm}mm !important;
            max-width: ${activeDim.widthMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .barcode-sticker-item {
            width: ${activeDim.widthMm}mm !important;
            max-width: ${activeDim.widthMm}mm !important;
            height: ${activeDim.heightMm}mm !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            padding: 0.6mm 1.5mm !important;
            overflow: hidden !important;
            margin: 0 !important;
            ${config.rotation ? `transform: rotate(${config.rotation}deg) !important; transform-origin: center center !important;` : ''}
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* 2. HIDDEN DOM TREE RENDERED FOR DIRECT BROWSER / ROLL PRINTING             */}
      {/* ========================================================================= */}
      <div id="barcode-print-container" ref={printAreaRef} className="hidden print:block">
        {products.map((prod, pIdx) => {
          const pBarcode = String(prod.barcode || prod.sku || '00000000').trim();
          const pBars = generateCode128Bars(pBarcode, barcodeWidth);
          const copies = Array.from({ length: Math.max(1, config.copiesPerProduct) });

          return copies.map((_, cIdx) => (
            <div
              key={`${prod.id}_${pIdx}_${cIdx}`}
              className="barcode-sticker-item text-black bg-white text-center font-sans"
              style={{
                width: `${activeDim.widthMm}mm`,
                height: `${activeDim.heightMm}mm`,
                padding: isCompact ? '0.6mm 1.5mm' : '1.5mm',
              }}
            >
              {/* Header Store Name */}
              {config.showStoreName && (
                <div className={`font-black uppercase tracking-wider w-full text-center border-b border-black/40 overflow-visible ${isCompact ? 'text-[8px] leading-normal pb-0.5' : 'text-[10px] pb-0.5 mb-0.5'}`}>
                  <span className="block truncate">{storeName}</span>
                </div>
              )}

              {/* Product Name */}
              {config.showProductName && (
                <div className={`font-bold w-full text-center px-0.5 overflow-visible ${isCompact ? 'text-[8.5px] leading-normal py-0.5' : 'text-[11px] line-clamp-2'}`}>
                  <span className="block truncate">{prod.name}</span>
                </div>
              )}

              {/* Barcode Vector Bars - Compact size (120px / ~32mm wide) */}
              <div className="w-full flex flex-col items-center justify-center my-0.5">
                <svg
                  width={barcodeWidth}
                  height={barcodeHeight}
                  viewBox={`0 0 ${barcodeWidth} ${barcodeHeight}`}
                  className="shape-crispEdges"
                >
                  <rect width="100%" height="100%" fill="#ffffff" />
                  {pBars.map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={0}
                      width={b.width}
                      height={barcodeHeight}
                      fill="#000000"
                    />
                  ))}
                </svg>
                {config.showBarcodeNumber && (
                  <span className={`font-mono tracking-widest text-black font-bold ${isCompact ? 'text-[7px] leading-tight mt-0.5' : 'text-[9px] mt-0.5'}`}>
                    {pBarcode}
                  </span>
                )}
              </div>

              {/* Price & Meta Footer */}
              {(config.showMrp || config.showPrice || config.showBatch || config.showExpiry) && (
                <div className="w-full flex items-center justify-center border-t border-black/30 pt-0.5 px-0.5">
                  {/* Left: Batch or Expiry only if enabled */}
                  {(config.showBatch || config.showExpiry) && (
                    <div className="text-[7px] font-mono text-left leading-tight mr-auto">
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
                    <div className="text-center font-mono font-black text-black leading-tight">
                      <span className={isCompact ? 'text-[8px] font-bold' : 'text-[9.5px] font-bold'}>MRP: </span>
                      <span className={isCompact ? 'text-[9.5px] font-black' : 'text-[11px] font-black'}>{currency} {Number(prod.mrp || prod.selling_price || 0).toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="text-right ml-auto leading-tight">
                      {config.showMrp && Number(prod.mrp) > Number(prod.selling_price) && (
                        <span className="text-[8px] line-through text-black/70 mr-1 font-mono">
                          {currency}{Number(prod.mrp).toFixed(2)}
                        </span>
                      )}
                      {config.showPrice && (
                        <span className="text-[10px] font-black font-mono">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Label Roll Size (Xprinter XP-365B)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(sizeMap) as LabelSizePreset[]).map((sz) => {
                    const isSelected = config.size === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setConfig({ ...config, size: sz })}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-sm'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-slate-200">
                            {sz === '50x20' && '50 × 20 mm'}
                            {sz === '50x30' && '50 × 30 mm'}
                            {sz === '40x30' && '40 × 30 mm'}
                            {sz === '38x25' && '38 × 25 mm'}
                            {sz === 'shelf_80x40' && '80 × 40 mm (Shelf)'}
                          </span>
                          {sz === '50x20' && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/20 px-1.5 py-0.5 rounded-full border border-amber-400/30">
                              Default
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">
                          {sizeMap[sz].widthMm}mm × {sizeMap[sz].heightMm}mm roll
                        </span>
                      </button>
                    );
                  })}
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
                      className="bg-white text-black rounded-xs shadow-xl flex flex-col justify-between items-center box-border p-2 overflow-hidden transition-all duration-200"
                      style={{
                        width: `${activeDim.widthPx}px`,
                        height: `${activeDim.heightPx}px`,
                        transform: config.rotation ? `rotate(${config.rotation}deg)` : 'none',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      {/* Top Store Header */}
                      {config.showStoreName && (
                        <div className={`w-full text-center font-black uppercase tracking-wider border-b border-black/30 text-black ${isCompact ? 'text-[8px] leading-normal pb-0.5' : 'text-[10px] pb-0.5'}`}>
                          <span className="block truncate">{storeName}</span>
                        </div>
                      )}

                      {/* Product Title */}
                      {config.showProductName && (
                        <div className={`w-full text-center font-bold text-black px-0.5 my-0.5 ${isCompact ? 'text-[8.5px] leading-normal py-0.5' : 'text-[11px] line-clamp-2'}`}>
                          <span className="block truncate">{currentProduct.name}</span>
                        </div>
                      )}

                      {/* Barcode Vector Bars - Compact size */}
                      <div className="w-full flex flex-col items-center justify-center my-0.5">
                        <svg
                          width={barcodeWidth}
                          height={barcodeHeight}
                          viewBox={`0 0 ${barcodeWidth} ${barcodeHeight}`}
                          className="shape-crispEdges"
                        >
                          <rect width="100%" height="100%" fill="#ffffff" />
                          {bars.map((b, i) => (
                            <rect
                              key={i}
                              x={b.x}
                              y={0}
                              width={b.width}
                              height={barcodeHeight}
                              fill="#000000"
                            />
                          ))}
                        </svg>
                        {config.showBarcodeNumber && (
                          <span className={`font-mono tracking-widest text-black font-bold mt-0.5 leading-tight ${isCompact ? 'text-[7px]' : 'text-[9px]'}`}>
                            {barcodeValue}
                          </span>
                        )}
                      </div>

                      {/* Bottom Strip: Price & Expiry */}
                      {(config.showMrp || config.showPrice || config.showBatch || config.showExpiry) && (
                        <div className="w-full flex items-center justify-center border-t border-black/30 pt-0.5 px-0.5">
                          {(config.showBatch || config.showExpiry) && (
                            <div className="text-[7.5px] font-mono text-left leading-tight text-black mr-auto">
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
                              <span className={isCompact ? 'text-[8.5px] font-bold' : 'text-[9.5px] font-bold'}>MRP: </span>
                              <span className={isCompact ? 'text-[10.5px] font-black' : 'text-[11px] font-black'}>
                                {currency} {Number(currentProduct.mrp || currentProduct.selling_price || 0).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-right ml-auto">
                              {config.showMrp && Number(currentProduct.mrp) > Number(currentProduct.selling_price) && (
                                <span className="text-[8.5px] line-through text-black/70 mr-1 font-mono">
                                  {currency}{Number(currentProduct.mrp).toFixed(2)}
                                </span>
                              )}
                              {config.showPrice && (
                                <span className="text-[11px] font-black font-mono text-black">
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
