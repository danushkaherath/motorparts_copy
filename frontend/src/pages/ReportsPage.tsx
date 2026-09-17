import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  ShoppingBag, 
  AlertTriangle, 
  Calendar, 
  Percent, 
  Receipt,
  Download,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Layers,
  PieChart as PieIcon,
  Tag,
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import type { AppSettings, OrderReceipt } from '../types';
import { api } from '../services/api';
import { RecentBillsModal } from '../components/RecentBillsModal';
import { ThermalReceipt } from '../components/ThermalReceipt';
import { CategoryPieChart } from '../components/CategoryPieChart';

interface ReportsPageProps {
  settings: AppSettings | null;
  currentUser?: any;
}

type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'all';
type ProductTableTab = 'profitable' | 'volume' | 'low_margin';

export const ReportsPage: React.FC<ReportsPageProps> = ({ settings, currentUser }) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [analytics, setAnalytics] = useState<any>(null);
  const [productTab, setProductTab] = useState<ProductTableTab>('profitable');
  const [taxData, setTaxData] = useState<any>(null);
  const [expiryAlerts, setExpiryAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBillsModalOpen, setIsBillsModalOpen] = useState<boolean>(false);
  const [reprintReceipt, setReprintReceipt] = useState<OrderReceipt | null>(null);

  const currency = settings?.currency_symbol || '$';
  const isTaxEnabled = settings?.feature_tax === 'true';
  const isExpiryEnabled = settings?.feature_expiry === 'true';

  useEffect(() => {
    loadReports();
  }, [period, selectedDate, settings]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const [analyticsData, tax, exp] = await Promise.all([
        api.getAnalytics(period, period === 'daily' ? selectedDate : undefined),
        isTaxEnabled ? api.getTaxReport() : Promise.resolve(null),
        isExpiryEnabled ? api.getExpiryAlerts() : Promise.resolve([]),
      ]);
      setAnalytics(analyticsData);
      setTaxData(tax);
      setExpiryAlerts(exp);
    } catch (err) {
      console.error('Failed to load analytics reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportPeriodCsv = () => {
    if (!analytics) {
      alert('No analytics data available to export');
      return;
    }

    const s = analytics.summary || {};
    let csv = `STORE PERFORMANCE REPORT - ${period.toUpperCase()}\n`;
    csv += `Generated On,${new Date().toLocaleString()}\n`;
    csv += `Currency,${currency}\n\n`;

    csv += `FINANCIAL SUMMARY\n`;
    csv += `Gross Revenue,${s.gross_revenue}\n`;
    csv += `Estimated COGS,${s.cogs}\n`;
    csv += `Gross Profit,${s.gross_profit}\n`;
    csv += `Profit Margin %,${s.profit_margin}%\n`;
    csv += `Total Orders,${s.total_orders}\n`;
    csv += `Average Order Value,${s.aov}\n`;
    csv += `Cash Revenue,${s.cash_revenue}\n`;
    csv += `Card Revenue,${s.card_revenue}\n`;
    csv += `Discounts Given,${s.discounts}\n\n`;

    csv += `CATEGORY BREAKDOWN\n`;
    csv += `Category,Revenue,Units Sold,Profit,Share %\n`;
    (analytics.categories || []).forEach((c: any) => {
      csv += `"${c.category_name}",${c.revenue},${c.units_sold},${c.profit || 0},${c.percentage}%\n`;
    });
    csv += `\n`;

    csv += `MOST PROFITABLE PRODUCTS\n`;
    csv += `Product Name,Barcode,Category,Units Sold,Avg Selling Price,Cost Price,Revenue,Gross Profit,Margin %\n`;
    (analytics.most_profitable || []).forEach((p: any) => {
      csv += `"${p.product_name}",${p.barcode},"${p.category_name}",${p.units_sold},${p.avg_selling_price},${p.cost_price},${p.total_revenue},${p.total_profit},${p.margin_percentage}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportTaxCsv = () => {
    if (!taxData?.daily_breakdown?.length) {
      alert('No tax breakdown data to export');
      return;
    }
    const headers = 'Date,Invoices,Taxable Net,Tax Collected,Gross Total\n';
    const rows = taxData.daily_breakdown
      .map((d: any) => `${d.sale_date},${d.total_invoices},${d.taxable_sales},${d.tax_collected},${d.gross_sales}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const summary = analytics?.summary || {};
  const categories = analytics?.categories || [];
  const mostProfitable = analytics?.most_profitable || [];
  const fastMoving = analytics?.fast_moving || [];
  const timelineTrend = analytics?.timeline_trend || [];
  const hourlyTraffic = analytics?.hourly_traffic || [];

  // Low margin items: margin < 10% or selling_price <= cost_price
  const lowMarginItems = mostProfitable.filter(
    (p: any) => Number(p.margin_percentage) <= 10 || Number(p.cost_price) >= Number(p.avg_selling_price)
  );

  // Calculate max values for timeline trend bar heights
  const maxTrendRevenue = Math.max(1, ...timelineTrend.map((t: any) => Number(t.revenue || 0)));
  const maxHourlyOrders = Math.max(1, ...hourlyTraffic.map((h: any) => Number(h.orders_count || 0)));

  // Cash vs Card ratio
  const totalTender = (Number(summary.cash_revenue || 0) + Number(summary.card_revenue || 0)) || 1;
  const cashPercent = Math.round((Number(summary.cash_revenue || 0) / totalTender) * 100);
  const cardPercent = 100 - cashPercent;
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full space-y-6 pb-16">
        {/* Top Header & Export Actions */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <span>Sales & Store Performance Analytics</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Financial turnover, profit margins, department category distribution, and inventory velocity.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsBillsModalOpen(true)}
              className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Inspect past orders, reprint receipts, and void bills"
            >
              <Receipt className="w-3.5 h-3.5 text-cyan-400" />
              <span>Invoices & Void Bills</span>
            </button>
            <button
              onClick={exportPeriodCsv}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Analytics CSV</span>
            </button>
            {isTaxEnabled && (
              <button
                onClick={exportTaxCsv}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Export Tax CSV
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Print Slip
            </button>
          </div>
        </div>

        {/* Period Selector & Date Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
          {/* Period Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80 w-full md:w-auto">
            <button
              onClick={() => setPeriod('daily')}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                period === 'daily'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Daily (Today)
            </button>
            <button
              onClick={() => setPeriod('weekly')}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                period === 'weekly'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Weekly (7 Days)
            </button>
            <button
              onClick={() => setPeriod('monthly')}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                period === 'monthly'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Monthly (30 Days)
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                period === 'all'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Date Picker (for Daily) or Current Status Info */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            {period === 'daily' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Date:</span>
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border border-slate-750 text-slate-200 text-xs px-2.5 py-1.5 rounded-xl font-mono outline-hidden focus:border-cyan-400 transition"
                />
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                  className="text-[10px] bg-slate-800 hover:bg-slate-750 text-slate-300 px-2 py-1.5 rounded-lg font-bold transition cursor-pointer"
                >
                  Today
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400 font-mono">
                {period === 'weekly' && 'Last 7 Days Rolling Window'}
                {period === 'monthly' && 'Last 30 Days Rolling Window'}
                {period === 'all' && 'All Historical Recorded Transactions'}
              </span>
            )}

            <button
              onClick={loadReports}
              disabled={loading}
              title="Refresh Analytics Data"
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-750 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* PROMINENT FINANCIAL KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Gross Revenue */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Gross Revenue</span>
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shadow-inner">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-white mt-2.5 font-mono tracking-tight">
              {currency}{Number(summary.gross_revenue || 0).toFixed(2)}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
              <span className="font-bold text-slate-300">{summary.total_orders || 0}</span>
              <span>orders completed</span>
              <span>•</span>
              <span className="font-bold text-slate-300">{summary.total_units_sold || 0}</span>
              <span>items sold</span>
            </div>
          </div>

          {/* Card 2: Net Profit (Prominently Highlighted) */}
          <div className="bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 border-2 border-emerald-500/50 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-emerald-400 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gross Profit</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black font-mono">
                {summary.profit_margin || 0}% MARGIN
              </span>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-emerald-400 mt-2.5 font-mono tracking-tight">
              {currency}{Number(summary.gross_profit || 0).toFixed(2)}
            </div>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Net profit after deducting wholesale product cost
            </span>
          </div>

          {/* Card 3: Cost of Goods Sold (COGS) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Inventory Cost (COGS)</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
                <Tag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-amber-300 mt-2.5 font-mono tracking-tight">
              {currency}{Number(summary.cogs || 0).toFixed(2)}
            </div>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Wholesale replacement cost of items sold
            </span>
          </div>

          {/* Card 4: Average Basket Size (AOV) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-purple-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Average Basket (AOV)</span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shadow-inner">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black text-purple-300 mt-2.5 font-mono tracking-tight">
              {currency}{Number(summary.aov || 0).toFixed(2)}
            </div>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Average customer transaction spend
            </span>
          </div>
        </div>

        {/* Tender Split & Discounts Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 w-full md:w-auto">
            {/* Cash */}
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cash Tendered</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {currency}{Number(summary.cash_revenue || 0).toFixed(2)} ({cashPercent}%)
                </span>
              </div>
            </div>

            {/* Card */}
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-blue-400" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Card Terminal</span>
                <span className="font-mono font-bold text-blue-400 text-sm">
                  {currency}{Number(summary.card_revenue || 0).toFixed(2)} ({cardPercent}%)
                </span>
              </div>
            </div>

            {/* Discounts */}
            {Number(summary.discounts || 0) > 0 && (
              <div className="hidden sm:block">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Discounts Given</span>
                <span className="font-mono font-bold text-pink-400 text-sm">
                  -{currency}{Number(summary.discounts || 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Visual Progress Bar for Tender */}
          <div className="w-full md:w-64 bg-slate-950 rounded-full h-3 flex overflow-hidden border border-slate-800 p-0.5">
            <div 
              style={{ width: `${cashPercent}%` }} 
              className="bg-emerald-500 rounded-l-full transition-all duration-500" 
              title={`Cash: ${cashPercent}%`}
            />
            <div 
              style={{ width: `${cardPercent}%` }} 
              className="bg-blue-500 rounded-r-full transition-all duration-500" 
              title={`Card: ${cardPercent}%`}
            />
          </div>
        </div>

        {/* VISUAL CHARTS GRID: CATEGORY PIE CHART & REVENUE TREND */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Interactive Category Donut / Pie Chart */}
          <div className="lg:col-span-6">
            <CategoryPieChart
              categories={categories}
              currency={currency}
              title={`Category Sales Breakdown (${period.toUpperCase()})`}
            />
          </div>

          {/* Right: Revenue Progression Timeline Chart */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between min-h-[380px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    {period === 'daily' ? 'Hourly Revenue Progression' : 'Sales Turnover Trend'}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {period === 'daily' ? 'Performance by hour today' : 'Daily sales volume across period'}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                {timelineTrend.length} data points
              </span>
            </div>

            {/* Bar Visualizer */}
            {timelineTrend.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">No progression records available for this timeframe</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-end pt-6 pb-2">
                <div className="h-44 flex items-end gap-2 px-2 border-b border-slate-800">
                  {timelineTrend.map((point: any, idx: number) => {
                    const rev = Number(point.revenue || 0);
                    const heightPercent = Math.max(8, Math.round((rev / maxTrendRevenue) * 100));
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative"
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute -top-12 bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-[10px] font-mono shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-20 whitespace-nowrap">
                          <span className="font-bold text-cyan-300 block">{point.time_label}</span>
                          <span>{currency}{rev.toFixed(2)} ({point.orders_count} orders)</span>
                        </div>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[36px] bg-gradient-to-t from-cyan-600 to-cyan-400 hover:from-emerald-500 hover:to-emerald-300 rounded-t-md transition-all duration-200 cursor-pointer shadow-sm"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels */}
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono pt-2 px-1">
                  <span>{timelineTrend[0]?.time_label}</span>
                  {timelineTrend.length > 2 && (
                    <span>{timelineTrend[Math.floor(timelineTrend.length / 2)]?.time_label}</span>
                  )}
                  <span>{timelineTrend[timelineTrend.length - 1]?.time_label}</span>
                </div>
              </div>
            )}

            {/* Trend Summary Note */}
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-xs flex items-center justify-between text-slate-400 mt-2">
              <span>Peak Day/Hour:</span>
              <span className="font-mono font-bold text-slate-200">
                {timelineTrend.reduce((max: any, cur: any) => Number(cur.revenue || 0) > Number(max.revenue || 0) ? cur : max, timelineTrend[0] || {})?.time_label || '—'}
                {' • '}
                {currency}{Number(maxTrendRevenue).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* PEAK SHOPPING HOURS HEATMAP / HOURLY TRAFFIC */}
        {hourlyTraffic.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Peak Store Shopping Hours</h3>
                  <span className="text-[11px] text-slate-400">Identify rush hours to optimize cashier staffing and checkout lanes</span>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Busiest hours highlighted
              </span>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-24 gap-1.5 pt-4">
              {Array.from({ length: 24 }).map((_, h) => {
                const hourData = hourlyTraffic.find((item: any) => Number(item.hour) === h);
                const orders = hourData ? Number(hourData.orders_count) : 0;
                const rev = hourData ? Number(hourData.revenue) : 0;
                const intensity = orders > 0 ? Math.min(100, Math.round((orders / maxHourlyOrders) * 100)) : 0;

                return (
                  <div
                    key={h}
                    title={`${h}:00 - ${orders} orders (${currency}${rev.toFixed(2)})`}
                    className={`rounded-lg p-2 text-center transition flex flex-col items-center justify-between min-h-[64px] border ${
                      orders === 0
                        ? 'bg-slate-950/40 border-slate-800/40 text-slate-600'
                        : intensity > 60
                        ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-200 shadow-sm'
                        : 'bg-indigo-950/60 border-indigo-700/60 text-indigo-200'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold block">{h}h</span>
                    <span className="text-xs font-black font-mono block my-0.5">
                      {orders > 0 ? orders : '—'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono truncate block max-w-full">
                      {orders > 0 ? `${Math.round(rev)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PRODUCT PERFORMANCE INTELLIGENCE TABS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Tabs Bar */}
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-850">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProductTab('profitable')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  productTab === 'profitable'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>💎 Most Profitable Items</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-700">
                  {mostProfitable.length}
                </span>
              </button>

              <button
                onClick={() => setProductTab('volume')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  productTab === 'volume'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>🔥 Fast-Moving (Volume)</span>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 text-[10px] font-mono border border-blue-700">
                  {fastMoving.length}
                </span>
              </button>

              <button
                onClick={() => setProductTab('low_margin')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  productTab === 'low_margin'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>⚠️ Low Margin Warnings</span>
                {lowMarginItems.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 text-[10px] font-mono border border-rose-700">
                    {lowMarginItems.length}
                  </span>
                )}
              </button>
            </div>

            <span className="text-[11px] text-slate-400 font-mono">
              Period: <strong className="text-slate-200 uppercase">{period}</strong>
            </span>
          </div>

          {/* Tab 1: Most Profitable Items Table */}
          {productTab === 'profitable' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-right">Avg Selling</th>
                    <th className="py-3 px-4 text-right">Cost Price</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-right text-emerald-400">Total Profit</th>
                    <th className="py-3 px-4 text-center">Profit Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {mostProfitable.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-medium">
                        No sales recorded for this period yet.
                      </td>
                    </tr>
                  ) : (
                    mostProfitable.map((p: any, idx: number) => {
                      const profit = Number(p.total_profit || 0);
                      const margin = Number(p.margin_percentage || 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition font-mono text-[11px]">
                          <td className="py-3 px-4 font-sans font-semibold text-slate-100">
                            <div>{p.product_name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{p.barcode}</span>
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-300">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px]">
                              {p.category_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-white">{p.units_sold}</td>
                          <td className="py-3 px-4 text-right text-slate-300">{currency}{Number(p.avg_selling_price || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-slate-400">{currency}{Number(p.cost_price || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-200">{currency}{Number(p.total_revenue || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400 text-xs">
                            +{currency}{profit.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              margin >= 30
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : margin >= 15
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}>
                              {margin}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Fast-Moving by Volume Table */}
          {productTab === 'volume' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Barcode</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {fastMoving.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                        No sales recorded for this period yet.
                      </td>
                    </tr>
                  ) : (
                    fastMoving.map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition font-mono text-[11px]">
                        <td className="py-3 px-4 font-sans font-semibold text-slate-100">{p.product_name}</td>
                        <td className="py-3 px-4 text-slate-400">{p.barcode}</td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px]">
                            {p.category_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-white text-sm">{p.units_sold}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{currency}{Number(p.total_revenue || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: Low Margin Warnings Table */}
          {productTab === 'low_margin' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Cost Price</th>
                    <th className="py-3 px-4 text-right">Profit / Unit</th>
                    <th className="py-3 px-4 text-center">Margin %</th>
                    <th className="py-3 px-4">Warning Advisory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {lowMarginItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-emerald-400 font-medium">
                        ✅ Excellent! No low margin or loss-making products detected for this period.
                      </td>
                    </tr>
                  ) : (
                    lowMarginItems.map((p: any, idx: number) => {
                      const cost = Number(p.cost_price || 0);
                      const sell = Number(p.avg_selling_price || 0);
                      const unitProfit = Math.round((sell - cost) * 100) / 100;
                      const margin = Number(p.margin_percentage || 0);
                      const isCostZero = cost === 0;
                      const isLoss = cost >= sell;

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition font-mono text-[11px]">
                          <td className="py-3 px-4 font-sans font-semibold text-slate-100">
                            <div>{p.product_name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{p.barcode}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-white">{p.units_sold}</td>
                          <td className="py-3 px-4 text-right text-slate-200">{currency}{sell.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-amber-300">{currency}{cost.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-200">{currency}{unitProfit.toFixed(2)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isLoss 
                                ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}>
                              {margin}%
                            </span>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {isCostZero ? (
                              <span className="text-amber-400 text-[10px] font-medium">
                                Missing cost price — please update in Product Catalog
                              </span>
                            ) : isLoss ? (
                              <span className="text-rose-400 font-bold text-[10px]">
                                Selling below or at cost price (Loss-making)
                              </span>
                            ) : (
                              <span className="text-amber-300 text-[10px]">
                                Thin profit margin below 10%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section: Tax Breakdown (if enabled) */}
        {isTaxEnabled && taxData?.enabled && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
            <div className="px-5 py-3 border-b border-slate-800 font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-cyan-400" />
                <span>Sales Tax / VAT Summary Ledger</span>
              </div>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">
                Tax Rate: {settings?.tax_rate}%
              </span>
            </div>

            <div className="p-4 bg-slate-950/60 grid grid-cols-3 gap-4 border-b border-slate-800 text-center font-mono">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Taxable Sales</span>
                <span className="text-base font-bold text-slate-200">
                  {currency}{taxData.totals?.total_taxable?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tax Collected</span>
                <span className="text-base font-bold text-cyan-400">
                  {currency}{taxData.totals?.total_tax?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Gross Sales</span>
                <span className="text-base font-bold text-white">
                  {currency}{taxData.totals?.total_gross?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-center">Invoices</th>
                  <th className="py-2.5 px-4 text-right">Taxable Net</th>
                  <th className="py-2.5 px-4 text-right">Tax Collected</th>
                  <th className="py-2.5 px-4 text-right">Gross Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {taxData.daily_breakdown?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                      No tax records for this period.
                    </td>
                  </tr>
                ) : (
                  taxData.daily_breakdown?.map((d: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-bold text-white">{d.sale_date}</td>
                      <td className="py-2.5 px-4 text-center">{d.total_invoices}</td>
                      <td className="py-2.5 px-4 text-right text-slate-300">{currency}{d.taxable_sales.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-cyan-400 font-bold">{currency}{d.tax_collected.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-white font-bold">{currency}{d.gross_sales.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Section: Near Expiry Alerts (if enabled) */}
        {isExpiryEnabled && expiryAlerts.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
            <div className="px-5 py-3 border-b border-slate-800 font-bold text-xs text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Goods Expiring in 30 Days (Urgent Clearance)</span>
            </div>
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Item Name</th>
                  <th className="py-2.5 px-4">Barcode</th>
                  <th className="py-2.5 px-4">Batch #</th>
                  <th className="py-2.5 px-4">Expiry Date</th>
                  <th className="py-2.5 px-4 text-center">Remaining Stock</th>
                  <th className="py-2.5 px-4 text-right">Days Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans text-[11px]">
                {expiryAlerts.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-semibold text-slate-100">{item.name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{item.barcode}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">#{item.batch_number || '—'}</td>
                    <td className="py-2.5 px-4 font-mono text-amber-300">{item.expiry_date}</td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-white">{item.stock_quantity}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-400">
                      {item.days_remaining <= 0 ? 'EXPIRED' : `${item.days_remaining} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Bills & Void Modal */}
      <RecentBillsModal
        isOpen={isBillsModalOpen}
        settings={settings}
        currentUser={currentUser}
        onClose={() => {
          setIsBillsModalOpen(false);
          loadReports();
        }}
        onReprintReceipt={(receipt) => {
          setReprintReceipt(receipt);
        }}
      />

      {/* Thermal Receipt Print Preview */}
      <ThermalReceipt
        receipt={reprintReceipt}
        settings={settings}
        onClose={() => setReprintReceipt(null)}
      />
    </div>
  );
};
