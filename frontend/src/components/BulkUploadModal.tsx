import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Check, AlertCircle, X, Sparkles, Layers, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [resultStats, setResultStats] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Quote-aware CSV parser that preserves multi-word names and handles quotes
  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    // Header split
    const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const items: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Split on comma only when outside quotes
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((val) => val.trim().replace(/^["']|["']$/g, ''));

      if (row.length === 0 || !row[0]) continue;

      const item: any = {};
      headers.forEach((h, colIdx) => {
        item[h] = row[colIdx] || '';
      });

      // Map standard columns
      const name = item['Product Name'] || item['name'] || row[0] || '';
      const category = item['Category'] || item['category'] || row[1] || 'General';
      const brand = item['Brand'] || item['brand'] || row[2] || '';
      const productCode = item['Product Code'] || item['product_code'] || item['Barcode'] || item['barcode'] || row[3] || '';

      if (name && productCode) {
        const sellingPrice = parseFloat(item['Selling Price'] || item['selling_price'] || item['Price'] || item['price']) || 135.0;
        const costPrice = parseFloat(item['Cost Price'] || item['cost_price'] || item['Cost'] || item['cost']) || undefined;
        const actualPrice = parseFloat(item['Actual Price'] || item['actual_price'] || item['MRP'] || item['mrp']) || undefined;

        items.push({
          name,
          category,
          brand,
          product_code: productCode,
          selling_price: sellingPrice,
          cost_price: costPrice,
          mrp: actualPrice,
        });
      }
    }
    return items;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResultStats(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
      const items = parseCsv(content);
      setParsedItems(items);
    };
    reader.readAsText(file);
  };

  const handleUploadToBackend = async () => {
    if (parsedItems.length === 0) {
      setError('Please select or paste a valid CSV file with products first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResultStats(null);

      const CHUNK_SIZE = 500;
      const totalItems = parsedItems.length;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;

      for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
        const chunk = parsedItems.slice(i, i + CHUNK_SIZE);
        const processedCount = Math.min(i + CHUNK_SIZE, totalItems);
        setUploadProgress({
          current: processedCount,
          total: totalItems,
          percent: Math.round((processedCount / totalItems) * 100),
        });

        const res = await api.bulkUploadProducts(chunk);
        if (res.stats) {
          totalInserted += res.stats.inserted || 0;
          totalUpdated += res.stats.updated || 0;
          totalSkipped += res.stats.skipped || 0;
        }
      }

      setResultStats({
        total: totalItems,
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to upload products');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  // Load sample dataset provided by user
  const handleLoadSampleDataset = () => {
    fetch('/api/products/sample-csv')
      .then((r) => r.text())
      .then((text) => {
        setFileName('sample_grocery_products.csv');
        setCsvText(text);
        const items = parseCsv(text);
        setParsedItems(items);
      })
      .catch(() => {
        setError('Sample file not found on server. You can upload any CSV directly using Browse File.');
      });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-3xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
            <UploadCloud className="w-5 h-5" />
            <span>Bulk Product Import via CSV</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resultStats && (
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-sm">
                <Check className="w-4 h-4" />
                <span>Bulk Import Completed Successfully!</span>
              </div>
              <p className="text-slate-300">
                Total Processed: <strong>{resultStats.total}</strong> | Added: <strong>{resultStats.inserted}</strong> | Updated: <strong>{resultStats.updated}</strong> | Skipped: <strong>{resultStats.skipped}</strong>
              </p>
            </div>
          )}

          {uploadProgress && (
            <div className="p-4 rounded-xl bg-indigo-950/60 border border-indigo-800/80 text-indigo-200 text-xs space-y-2">
              <div className="flex justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  Uploading products in batches...
                </span>
                <span>{uploadProgress.current} / {uploadProgress.total} ({uploadProgress.percent}%)</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/60 transition group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <FileText className="w-10 h-10 text-slate-500 group-hover:text-indigo-400 mx-auto mb-2 transition" />
            <p className="text-sm font-semibold text-slate-200">
              {fileName ? fileName : 'Click to Browse or Drag & Drop Product CSV'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports columns: <code>Product Name</code>, <code>Category</code>, <code>Brand</code>, <code>Product Code</code> (GTIN / Barcode).
            </p>
          </div>

          {/* Quick Load Sample Dataset Button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium">Want to test with the Sri Lankan retail catalog?</span>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleDataset}
              className="w-full sm:w-auto text-center px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Load Sample Attached Dataset (1000+ Products)
            </button>
          </div>

          {/* Parsed Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Preview ({parsedItems.length} Products Found)
                </span>
                <span className="text-[11px] text-slate-400">Showing first 5 rows</span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950">
                <table className="w-full min-w-[500px] text-left text-[11px] text-slate-300">
                  <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 font-semibold uppercase">
                    <tr>
                      <th className="py-2 px-3">Product Name</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Brand</th>
                      <th className="py-2 px-3 font-mono">Barcode / Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {parsedItems.slice(0, 5).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 font-medium text-white truncate max-w-xs">{item.name}</td>
                        <td className="py-2 px-3 text-slate-400">{item.category}</td>
                        <td className="py-2 px-3 text-slate-400">{item.brand || '—'}</td>
                        <td className="py-2 px-3 font-mono text-emerald-400">{item.product_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-xs font-medium"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading || parsedItems.length === 0}
            onClick={handleUploadToBackend}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-950/40 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            <span>{loading ? 'Importing Products...' : `Import ${parsedItems.length} Products`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
