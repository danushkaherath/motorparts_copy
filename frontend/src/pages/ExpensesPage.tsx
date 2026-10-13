import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Calendar,
  Download,
  RefreshCw,
  Trash2,
  Edit,
  TrendingDown,
  DollarSign,
  Wallet,
  Building,
  CreditCard,
  FileText,
  X,
  Check,
  AlertCircle,
  Tag,
  Clock,
  User,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AppSettings, Expense, ExpenseSummary } from '../types';
import { api } from '../services/api';

interface ExpensesPageProps {
  settings: AppSettings | null;
  currentUser?: any;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Rent & Rates': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'Electricity & Water': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Staff Salaries & Wages': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Shop Maintenance & Repairs': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  'Fuel & Transport': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  'Workshop Tools & Equipment': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'Marketing & Advertising': { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  'Internet & Phone': { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  'Food & Refreshments': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  'Miscellaneous / Petty Cash': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
};

function getCategoryColor(category: string) {
  return (
    CATEGORY_COLORS[category] || {
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
    }
  );
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({ settings, currentUser }) => {
  const currency = settings?.currency_symbol || 'Rs.';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [period, setPeriod] = useState<'today' | 'this_week' | 'this_month' | 'all' | 'custom'>('this_month');
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'Rent & Rates',
    customCategory: '',
    amount: '',
    payment_method: 'CASH',
    reference_no: '',
    description: '',
  });

  // Load Categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  // Load Data on filter change
  useEffect(() => {
    loadExpenses();
    loadSummary();
  }, [period, fromDate, toDate, selectedCategory, selectedPaymentMethod, page]);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadExpenses();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadCategories = async () => {
    try {
      const cats = await api.getExpenseCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const buildQueryParams = () => {
    const params: Record<string, any> = {
      page,
      limit: 25,
    };

    if (searchTerm.trim()) {
      params.search = searchTerm.trim();
    }
    if (selectedCategory) {
      params.category = selectedCategory;
    }
    if (selectedPaymentMethod) {
      params.payment_method = selectedPaymentMethod;
    }

    if (period === 'custom') {
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
    } else if (period === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      params.from_date = today;
      params.to_date = today;
    } else if (period === 'this_week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      params.from_date = d.toISOString().slice(0, 10);
      params.to_date = new Date().toISOString().slice(0, 10);
    } else if (period === 'this_month') {
      const d = new Date();
      d.setDate(1);
      params.from_date = d.toISOString().slice(0, 10);
      params.to_date = new Date().toISOString().slice(0, 10);
    }

    return params;
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const params = buildQueryParams();
      const res = await api.getExpenses(params);
      setExpenses(res.expenses || []);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.total || 0);
      setTotalAmount(res.total_amount || 0);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const params: Record<string, any> = {};
      if (period === 'custom') {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
      } else {
        params.period = period;
      }
      const data = await api.getExpensesSummary(params);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  };

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      expense_date: new Date().toISOString().slice(0, 10),
      category: categories[0] || 'Rent & Rates',
      customCategory: '',
      amount: '',
      payment_method: 'CASH',
      reference_no: '',
      description: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    const isCustomCat = !categories.includes(expense.category);
    setFormData({
      expense_date: expense.expense_date,
      category: isCustomCat ? '__CUSTOM__' : expense.category,
      customCategory: isCustomCat ? expense.category : '',
      amount: String(expense.amount),
      payment_method: expense.payment_method || 'CASH',
      reference_no: expense.reference_no || '',
      description: expense.description || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid expense amount greater than 0');
      return;
    }

    let finalCategory = formData.category;
    if (finalCategory === '__CUSTOM__') {
      finalCategory = formData.customCategory.trim();
      if (!finalCategory) {
        setFormError('Please enter a custom category name');
        return;
      }
    }

    if (!finalCategory) {
      setFormError('Please select or specify an expense category');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<Expense> = {
        expense_date: formData.expense_date,
        category: finalCategory,
        amount: amountNum,
        payment_method: formData.payment_method,
        reference_no: formData.reference_no.trim() || undefined,
        description: formData.description.trim() || undefined,
        created_by_id: currentUser?.id,
        created_by_name: currentUser?.username || 'Owner',
      };

      if (editingExpense) {
        await api.updateExpense(editingExpense.id, payload);
      } else {
        await api.createExpense(payload);
      }

      setIsModalOpen(false);
      await Promise.all([loadExpenses(), loadSummary(), loadCategories()]);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteConfirmExpense) return;
    setIsSubmitting(true);
    try {
      await api.deleteExpense(deleteConfirmExpense.id);
      setDeleteConfirmExpense(null);
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportCsv = () => {
    if (expenses.length === 0) {
      alert('No expense records to export');
      return;
    }

    let csv = `OPERATING EXPENSES REPORT\n`;
    csv += `Exported On,${new Date().toLocaleString()}\n`;
    csv += `Total Expenses,${totalAmount.toFixed(2)}\n`;
    csv += `Count,${totalCount}\n\n`;
    csv += `Date,Category,Amount,Payment Method,Reference No,Description,Recorded By\n`;

    expenses.forEach((item) => {
      const cleanDesc = (item.description || '').replace(/"/g, '""');
      const cleanRef = (item.reference_no || '').replace(/"/g, '""');
      csv += `"${item.expense_date}","${item.category}",${item.amount.toFixed(2)},"${item.payment_method}","${cleanRef}","${cleanDesc}","${item.created_by_name || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operating-expenses-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d1a] text-slate-100 overflow-y-auto">
      {/* Top Header */}
      <div className="bg-[#0b1222] border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Operating Expenses</h1>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full">
                Profit Deduction
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Track business overheads (rent, electricity, salaries, repairs, petty cash) deducted from store profits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-semibold transition cursor-pointer"
            title="Export filtered expenses as CSV"
          >
            <Download className="w-4 h-4 text-slate-400" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              loadExpenses();
              loadSummary();
            }}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl transition cursor-pointer"
            title="Refresh records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-900/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-6 space-y-6 flex-1">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filtered Total</span>
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-400">
                {currency} {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {totalCount} expense {totalCount === 1 ? 'entry' : 'entries'} in selected view
            </p>
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
          </div>

          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Expenses</span>
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-100">
                {currency} {(summary?.today_expenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Paid out today</p>
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          </div>

          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">This Month</span>
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-100">
                {currency} {(summary?.this_month_expenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Current calendar month overhead</p>
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          </div>

          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top Spend Category</span>
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Tag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              {summary?.by_category && summary.by_category.length > 0 ? (
                <>
                  <div className="text-lg font-bold text-slate-100 truncate">
                    {summary.by_category[0].category}
                  </div>
                  <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                    {currency} {summary.by_category[0].amount.toLocaleString()} ({summary.by_category[0].percentage}%)
                  </p>
                </>
              ) : (
                <div className="text-sm text-slate-500 mt-2">No category data yet</div>
              )}
            </div>
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          </div>
        </div>

        {/* Category Distribution Breakdown (Horizontal bars) */}
        {summary?.by_category && summary.by_category.length > 0 && (
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-rose-400" />
                Category Spending Distribution
              </h3>
              <span className="text-xs text-slate-500">
                {summary.by_category.length} {summary.by_category.length === 1 ? 'category' : 'categories'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.by_category.slice(0, 6).map((cat) => {
                const color = getCategoryColor(cat.category);
                return (
                  <div key={cat.category} className="bg-[#080d1a] border border-slate-800/60 rounded-xl p-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className={`font-semibold truncate max-w-[150px] ${color.text}`}>
                        {cat.category}
                      </span>
                      <span className="font-bold text-slate-200">
                        {currency} {cat.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(3, cat.percentage))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>{cat.count} {cat.count === 1 ? 'entry' : 'entries'}</span>
                      <span>{cat.percentage}% of total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Controls & Search Toolbar */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Period Quick Select */}
            <div className="flex items-center gap-1 bg-[#080d1a] p-1 rounded-xl border border-slate-800/80 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === 'today'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPeriod('this_week')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === 'this_week'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setPeriod('this_month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === 'this_month'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === 'all'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === 'custom'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Custom Date Pickers */}
            {period === 'custom' && (
              <div className="flex items-center gap-2 bg-[#080d1a] px-3 py-1 rounded-xl border border-slate-800/80">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 border-none outline-none focus:ring-0 cursor-pointer"
                />
                <span className="text-xs text-slate-400 font-medium">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 border-none outline-none focus:ring-0 cursor-pointer"
                />
              </div>
            )}

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by description, reference, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#080d1a] border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Dropdowns Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400 font-semibold">Filter:</span>
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="bg-[#080d1a] border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Payment Method Filter */}
            <select
              value={selectedPaymentMethod}
              onChange={(e) => {
                setSelectedPaymentMethod(e.target.value);
                setPage(1);
              }}
              className="bg-[#080d1a] border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="">All Payment Methods</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="PETTY_CASH">Petty Cash</option>
            </select>

            {(selectedCategory || selectedPaymentMethod || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedPaymentMethod('');
                  setSearchTerm('');
                  setPage(1);
                }}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium underline cursor-pointer ml-auto"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Expenses Data Table */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#080d1a] border-b border-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description / Notes</th>
                  <th className="py-3 px-4">Reference No</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4 text-right">Amount ({currency})</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-rose-500 mb-2" />
                      Loading operating expenses...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Receipt className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p className="font-semibold text-slate-300">No expense records found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Try adjusting your filters or click "Record Expense" to add overhead costs
                      </p>
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => {
                    const color = getCategoryColor(expense.category);
                    return (
                      <tr key={expense.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-medium text-slate-300 whitespace-nowrap">
                          {expense.expense_date}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${color.bg} ${color.text} ${color.border}`}
                          >
                            {expense.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-200 max-w-xs truncate" title={expense.description || ''}>
                          {expense.description || <span className="text-slate-500 italic">—</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {expense.reference_no || <span className="text-slate-600 italic">—</span>}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {expense.payment_method === 'CASH' && <Wallet className="w-3 h-3 text-emerald-400" />}
                            {expense.payment_method === 'CARD' && <CreditCard className="w-3 h-3 text-cyan-400" />}
                            {expense.payment_method === 'BANK_TRANSFER' && <Building className="w-3 h-3 text-purple-400" />}
                            {expense.payment_method === 'CHEQUE' && <FileText className="w-3 h-3 text-amber-400" />}
                            {expense.payment_method === 'PETTY_CASH' && <DollarSign className="w-3 h-3 text-rose-400" />}
                            {expense.payment_method}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {expense.created_by_name || 'Owner'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-rose-400 whitespace-nowrap text-sm">
                          {currency} {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(expense)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                              title="Edit expense"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmExpense(expense)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                              title="Delete expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="bg-[#080d1a] border-t border-slate-800/80 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing page <span className="font-bold text-white">{page}</span> of{' '}
                <span className="font-bold text-white">{totalPages}</span> ({totalCount} total entries)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#080d1a] border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingExpense ? 'Edit Expense Record' : 'Record New Operating Expense'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    This expense will be deducted from gross profit in financial reports
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Date & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Amount ({currency}) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                      {currency}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full bg-[#080d1a] border border-slate-800 rounded-xl pl-10 pr-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Expense Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__CUSTOM__">+ Other Custom Category...</option>
                </select>
              </div>

              {formData.category === '__CUSTOM__' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Legal & Audit, Courier, Insurance..."
                    value={formData.customCategory}
                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              {/* Payment Method & Reference No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Payment Method
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="PETTY_CASH">Petty Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bill / Ref No. (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-9041, CEB-4819"
                    value={formData.reference_no}
                    onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                    className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Description / Note
                </label>
                <textarea
                  rows={3}
                  placeholder="Additional details (e.g. Shop electric bill for September, Mechanic lunch allowance, Brake lathe lubrication)"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-[#080d1a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-900/30 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {editingExpense ? 'Save Changes' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Delete Expense Record?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to delete the expense of{' '}
                <strong className="text-rose-400">
                  {currency} {deleteConfirmExpense.amount.toFixed(2)}
                </strong>{' '}
                for <strong className="text-slate-200">{deleteConfirmExpense.category}</strong>?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmExpense(null)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteExpense}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
