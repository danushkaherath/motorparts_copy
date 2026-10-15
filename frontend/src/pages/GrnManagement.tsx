import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardCheck, 
  Plus, 
  Trash2, 
  Search, 
  Printer, 
  FileText, 
  Download, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  TrendingUp, 
  Eye, 
  X,
  Sparkles,
  Layers,
  Clock,
  ArrowRight,
  Settings,
  Loader2,
  Barcode,
  Check,
  AlertTriangle,
  DollarSign,
  CreditCard,
  Bell,
  Receipt,
  Banknote
} from 'lucide-react';
import type { AppSettings, Supplier, Product, GoodsReceivedNote, GoodsReceivedItem, CreateGrnPayload } from '../types';
import { api } from '../services/api';

interface GrnManagementProps {
  settings: AppSettings | null;
  currentUser?: any;
}

interface GrnDraftItem {
  product_id: string;
  product_name: string;
  barcode: string;
  batch_number: string;
  expiry_date: string;
  shelf_location: string;
  quantity_received: number | string;
  cost_price: number | string;
  selling_price: number | string;
  mrp: number | string;
}

export const GrnManagement: React.FC<GrnManagementProps> = ({ settings, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [grnList, setGrnList] = useState<GoodsReceivedNote[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Header State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [receivedByName, setReceivedByName] = useState<string>(() => currentUser?.username || 'Store Admin');
  const [notes, setNotes] = useState<string>('');

  // Payment Form Header State (Section 1)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'cheque'>('cash');
  const [paymentOption, setPaymentOption] = useState<'credit' | 'full' | 'partial'>('credit');
  const [paymentDueDate, setPaymentDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [upfrontPaidAmount, setUpfrontPaidAmount] = useState<number | string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Payment Recording Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentTargetGrn, setPaymentTargetGrn] = useState<GoodsReceivedNote | null>(null);
  const [grnPaymentHistory, setGrnPaymentHistory] = useState<any[]>([]);
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);
  const [recordPaymentForm, setRecordPaymentForm] = useState<{
    amount: number | string;
    payment_method: 'cash' | 'cheque';
    cheque_number: string;
    cheque_date: string;
    new_payment_due_date: string;
    notes: string;
  }>({
    amount: '',
    payment_method: 'cash',
    cheque_number: '',
    cheque_date: new Date().toISOString().slice(0, 10),
    new_payment_due_date: '',
    notes: '',
  });

  // Due Reminders State (Deliveries due in <= 3 days or overdue)
  const [dueReminders, setDueReminders] = useState<GoodsReceivedNote[]>([]);

  // Draft Line Items
  const [draftItems, setDraftItems] = useState<GrnDraftItem[]>([]);

  // Product Autocomplete & Scanner Search
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const [isSearchingProduct, setIsSearchingProduct] = useState<boolean>(false);
  const [searchFeedback, setSearchFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Quick Product Registration Modal
  const [isQuickProductOpen, setIsQuickProductOpen] = useState<boolean>(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [quickProductForm, setQuickProductForm] = useState<{
    barcode: string;
    sku: string;
    name: string;
    brand: string;
    category_id: string;
    cost_price: string | number;
    selling_price: string | number;
    mrp: string | number;
    unit: string;
  }>({
    barcode: '',
    sku: '',
    name: '',
    brand: '',
    category_id: '',
    cost_price: '',
    selling_price: '',
    mrp: '',
    unit: 'pcs',
  });

  // Quick Supplier Modal
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState<boolean>(false);
  const [supplierModalTab, setSupplierModalTab] = useState<'add' | 'manage'>('add');
  const [newSupplierForm, setNewSupplierForm] = useState({ name: '', contact_name: '', phone: '', address: '' });

  // Inspection / Report Modal
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceivedNote | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportStoreConfig, setReportStoreConfig] = useState<any>(null);

  // History Filters
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFromDate, setHistoryFromDate] = useState<string>('');
  const [historyToDate, setHistoryToDate] = useState<string>('');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<'ALL' | 'DUE_SOON' | 'OVERDUE' | 'UNPAID' | 'PARTIAL' | 'PAID'>('ALL');

  const currency = settings?.currency_symbol || 'Rs.';

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, historySearch, historyFromDate, historyToDate, historyPaymentFilter]);

  // Click outside listener for product search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced live search across the entire 9,500+ product catalog
  useEffect(() => {
    const term = searchInput.trim();
    if (!term) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsSearchingProduct(false);
      return;
    }

    setIsSearchingProduct(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.getPaginatedProducts({ search: term, limit: 12 });
        const list = res.products || [];

        // If barcode-like digits and not already in results, try exact barcode lookup
        if (/^\d{3,}$/.test(term) && !list.some((p) => p.barcode === term || p.sku === term)) {
          try {
            const barcodeProd = await api.getBarcode(term);
            if (barcodeProd && !list.some((p) => p.id === barcodeProd.id)) {
              list.unshift(barcodeProd);
            }
          } catch {
            // ignore barcode fetch error in live search
          }
        }

        setSearchResults(list);
        setShowSearchDropdown(true);
      } catch (err) {
        console.error('Failed to search product catalog:', err);
      } finally {
        setIsSearchingProduct(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [sups, grnStats, cats, reminders] = await Promise.all([
        api.getSuppliers().catch(() => []),
        api.getGRNStats().catch(() => null),
        fetch('/api/products/categories').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        api.getGRNDueReminders().catch(() => []),
      ]);
      const validSups = Array.isArray(sups) ? sups : [];
      setSuppliers(validSups);
      setStats(grnStats);
      const validCats = Array.isArray(cats) ? cats : [];
      setCategories(validCats);
      setDueReminders(Array.isArray(reminders) ? reminders : []);
      if (validSups.length > 0) {
        setSelectedSupplierId(validSups[0].id);
      } else {
        setSelectedSupplierId('custom');
      }
    } catch (err) {
      console.error('Failed to load GRN initial data:', err);
      setSuppliers([]);
      setSelectedSupplierId('custom');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const params: Record<string, string> = {};
      if (historySearch) params.search = historySearch;
      if (historyFromDate) params.from_date = historyFromDate;
      if (historyToDate) params.to_date = historyToDate;

      if (historyPaymentFilter === 'DUE_SOON') {
        params.due_filter = 'due_soon';
      } else if (historyPaymentFilter === 'OVERDUE') {
        params.due_filter = 'overdue';
      } else if (historyPaymentFilter !== 'ALL') {
        params.payment_status = historyPaymentFilter;
      }

      const res = await api.getGRNs(params);
      setGrnList(res.grns || []);
    } catch (err) {
      console.error('Failed to load GRN history:', err);
    }
  };

  // Helper to calculate countdown days and due status
  const getDueCountdown = (dueDateStr?: string, paymentStatus?: string) => {
    if (paymentStatus === 'PAID') {
      return { label: 'Fully Paid', color: 'emerald', days: null, isOverdue: false, isDueSoon: false };
    }
    if (!dueDateStr) {
      return { label: 'No Due Date', color: 'slate', days: null, isOverdue: false, isDueSoon: false };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `🚨 Overdue by ${Math.abs(diffDays)}d (${dueDateStr})`,
        color: 'rose',
        days: diffDays,
        isOverdue: true,
        isDueSoon: true,
      };
    } else if (diffDays === 0) {
      return {
        label: `⚠️ Due Today (${dueDateStr})`,
        color: 'amber',
        days: 0,
        isOverdue: false,
        isDueSoon: true,
      };
    } else if (diffDays <= 3) {
      return {
        label: `⚠️ Due in ${diffDays}d (${dueDateStr})`,
        color: 'orange',
        days: diffDays,
        isOverdue: false,
        isDueSoon: true,
      };
    } else {
      return {
        label: `Due ${dueDateStr} (${diffDays}d)`,
        color: 'slate',
        days: diffDays,
        isOverdue: false,
        isDueSoon: false,
      };
    }
  };

  // Open Payment Modal
  const openPaymentModal = async (grn: GoodsReceivedNote) => {
    setPaymentTargetGrn(grn);
    const total = Number(grn.total_cost) || 0;
    const paid = Number(grn.paid_amount) || 0;
    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

    const defaultNextDue =
      grn.payment_due_date ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();

    setRecordPaymentForm({
      amount: remaining > 0 ? remaining : '',
      payment_method: grn.payment_method || 'cash',
      cheque_number: grn.cheque_number || '',
      cheque_date: grn.cheque_date || new Date().toISOString().slice(0, 10),
      new_payment_due_date: defaultNextDue,
      notes: '',
    });

    setIsPaymentModalOpen(true);

    try {
      const history = await api.getGRNPayments(grn.id);
      setGrnPaymentHistory(history || []);
    } catch {
      setGrnPaymentHistory([]);
    }
  };

  // Submit Payment Record
  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetGrn) return;
    const payAmt = Number(recordPaymentForm.amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      alert('Please enter a valid payment amount greater than 0.');
      return;
    }

    const remaining = Math.max(
      0,
      (Number(paymentTargetGrn.total_cost) || 0) - (Number(paymentTargetGrn.paid_amount) || 0)
    );
    if (payAmt > remaining + 0.01) {
      alert(`Payment amount (${currency}${payAmt}) exceeds outstanding balance (${currency}${remaining.toFixed(2)}).`);
      return;
    }

    const isPartial = payAmt < remaining - 0.01;
    if (isPartial && !recordPaymentForm.new_payment_due_date) {
      alert('For partial payments, please select the next payment due date for the remaining balance.');
      return;
    }

    if (recordPaymentForm.payment_method === 'cheque' && !recordPaymentForm.cheque_number.trim()) {
      alert('Please provide a Cheque Number for cheque payment.');
      return;
    }

    try {
      setIsRecordingPayment(true);
      const res = await api.recordGRNPayment(paymentTargetGrn.id, {
        amount: payAmt,
        payment_method: recordPaymentForm.payment_method,
        cheque_number:
          recordPaymentForm.payment_method === 'cheque' ? recordPaymentForm.cheque_number.trim() : undefined,
        cheque_date:
          recordPaymentForm.payment_method === 'cheque' ? recordPaymentForm.cheque_date : undefined,
        new_payment_due_date: isPartial ? recordPaymentForm.new_payment_due_date : undefined,
        notes: recordPaymentForm.notes.trim() || undefined,
      });

      alert(res.message || 'Payment recorded successfully!');
      setIsPaymentModalOpen(false);
      setPaymentTargetGrn(null);
      loadHistory();
      api.getGRNStats().then(setStats).catch(() => {});
      api.getGRNDueReminders().then(setDueReminders).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Add Product to Draft (or Increment quantity if already present)
  const addProductToDraft = (prod: Product) => {
    const existingIndex = draftItems.findIndex((item) => item.product_id === prod.id);
    if (existingIndex >= 0) {
      // If already in draft, increment quantity received by 1 (supports continuous scanning)
      setDraftItems((prev) => {
        const updated = [...prev];
        const currentQty = Number(updated[existingIndex].quantity_received) || 0;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity_received: currentQty + 1,
        };
        return updated;
      });
      setSearchInput('');
      setSearchResults([]);
      setShowSearchDropdown(false);
      setSearchFeedback({
        type: 'success',
        message: `Quantity incremented for "${prod.name}"`,
      });
      setTimeout(() => setSearchFeedback(null), 3000);
      searchInputRef.current?.focus();
      return;
    }

    // Generate default batch tag: B-YYMMDD-XXX
    const todayTag = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const defaultBatch = `B-${todayTag}-${Math.floor(100 + Math.random() * 900)}`;

    const newItem: GrnDraftItem = {
      product_id: prod.id,
      product_name: prod.name,
      barcode: prod.barcode || '',
      batch_number: prod.batch_number || defaultBatch,
      expiry_date: prod.expiry_date || '',
      shelf_location: prod.shelf_location || '',
      quantity_received: 1, // Default 1 for scanned item
      cost_price: prod.cost_price || 0,
      selling_price: prod.selling_price || 0,
      mrp: prod.mrp || prod.selling_price || 0,
    };

    setDraftItems((prev) => [newItem, ...prev]);
    setSearchInput('');
    setSearchResults([]);
    setShowSearchDropdown(false);
    setSearchFeedback({
      type: 'success',
      message: `Added "${prod.name}" to incoming delivery list`,
    });
    setTimeout(() => setSearchFeedback(null), 3000);
    searchInputRef.current?.focus();
  };

  // Barcode Scanner & Enter Key Handler
  const handleBarcodeScanOrSubmit = async (codeToLookup?: string) => {
    const code = (codeToLookup || searchInput).trim();
    if (!code) return;

    setIsSearchingProduct(true);
    setSearchFeedback(null);

    try {
      // 1. Direct barcode / SKU API lookup
      let product = await api.getBarcode(code).catch(() => null);

      // 2. If not found by direct barcode, query paginated catalog search
      if (!product) {
        const res = await api.getPaginatedProducts({ search: code, limit: 6 });
        if (res.products && res.products.length > 0) {
          product = res.products.find((p) => p.barcode === code || p.sku === code) || res.products[0];
        }
      }

      if (product) {
        addProductToDraft(product);
      } else {
        setShowSearchDropdown(true);
        setSearchFeedback({
          type: 'error',
          message: `Barcode / GTIN "${code}" not found in Product Catalog.`,
        });
      }
    } catch (err: any) {
      setSearchFeedback({
        type: 'error',
        message: err.message || 'Error looking up barcode',
      });
    } finally {
      setIsSearchingProduct(false);
      searchInputRef.current?.focus();
    }
  };

  // Quick Product Registration Handler
  const handleOpenQuickProduct = (initialBarcode: string = '') => {
    const isBarcode = /^\d+$/.test(initialBarcode.trim());
    setQuickProductForm({
      barcode: isBarcode ? initialBarcode.trim() : '',
      sku: isBarcode ? initialBarcode.trim() : '',
      name: isBarcode ? '' : initialBarcode.trim(),
      brand: '',
      category_id: categories[0]?.id || '',
      cost_price: '',
      selling_price: '',
      mrp: '',
      unit: 'pcs',
    });
    setIsQuickProductOpen(true);
  };

  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickProductForm.name.trim()) {
      alert('Product name is required');
      return;
    }
    try {
      const numCost = Number(quickProductForm.cost_price) || 0;
      const numSelling = Number(quickProductForm.selling_price) || 0;
      const numMrp = Number(quickProductForm.mrp) || numSelling || 0;

      const created = await api.saveProduct({
        ...quickProductForm,
        cost_price: numCost,
        selling_price: numSelling,
        mrp: numMrp,
        is_in_inventory: 0,
        stock_quantity: 0,
      });
      setIsQuickProductOpen(false);
      addProductToDraft(created);
      setSearchFeedback({
        type: 'success',
        message: `Registered "${created.name}" and added to delivery list!`,
      });
    } catch (err: any) {
      alert(`Failed to save product: ${err.message}`);
    }
  };

  const updateDraftItem = (index: number, field: keyof GrnDraftItem, value: any) => {
    setDraftItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeDraftItem = (index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  };

  const clearDraft = () => {
    if (draftItems.length === 0) return;
    if (window.confirm('Clear all items from this delivery list?')) {
      setDraftItems([]);
      setInvoiceNumber('');
      setNotes('');
    }
  };

  // Calculations for Draft Table
  const totalUnits = draftItems.reduce((sum, item) => sum + (Number(item.quantity_received) || 0), 0);
  const totalCost = draftItems.reduce(
    (sum, item) => sum + (Number(item.quantity_received) || 0) * (Number(item.cost_price) || 0),
    0
  );
  const totalRetail = draftItems.reduce(
    (sum, item) => sum + (Number(item.quantity_received) || 0) * (Number(item.selling_price) || 0),
    0
  );
  const estMargin = totalCost > 0 ? ((totalRetail - totalCost) / totalCost) * 100 : 0;

  // Process & Submit GRN
  const handleProcessGRN = async (e: React.FormEvent) => {
    e.preventDefault();

    let supplierName = '';
    if (selectedSupplierId === 'custom') {
      supplierName = customSupplierName.trim();
    } else {
      const sup = suppliers.find((s) => s.id === selectedSupplierId);
      supplierName = sup ? sup.name : customSupplierName.trim();
    }

    if (!supplierName) {
      alert('Please select or specify a Supplier Name for this delivery.');
      return;
    }

    if (draftItems.length === 0) {
      alert('Please add at least one incoming item to the GRN list.');
      return;
    }

    // Validate quantities & prices
    for (const it of draftItems) {
      if (!Number(it.quantity_received) || Number(it.quantity_received) <= 0) {
        alert(`Invalid quantity for "${it.product_name}". Quantity must be greater than 0.`);
        return;
      }
      if (Number(it.cost_price) < 0 || Number(it.selling_price) < 0) {
        alert(`Prices cannot be negative for "${it.product_name}".`);
        return;
      }
    }

    if (
      !window.confirm(
        `Process GRN for ${supplierName}?\n• Total Items: ${draftItems.length}\n• Total Quantity: ${totalUnits}\n• Total Inward Cost: ${currency}${totalCost.toFixed(2)}\n\nThis will immediately update store inventory stock and multi-batch pricing.`
      )
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      let initialPaid = 0;
      if (paymentOption === 'full') {
        initialPaid = totalCost;
      } else if (paymentOption === 'partial') {
        initialPaid = Math.min(totalCost, Math.max(0, Number(upfrontPaidAmount) || 0));
      }

      const payload: CreateGrnPayload = {
        supplier_id: selectedSupplierId !== 'custom' ? selectedSupplierId : undefined,
        supplier_name: supplierName,
        invoice_number: invoiceNumber.trim() || undefined,
        received_date: receivedDate,
        received_by_id: currentUser?.id,
        received_by_name: receivedByName.trim() || currentUser?.username || 'Store Receiver',
        notes: notes.trim() || undefined,
        payment_method: paymentMethod,
        payment_due_date: paymentDueDate,
        paid_amount: initialPaid,
        cheque_number: paymentMethod === 'cheque' && chequeNumber.trim() ? chequeNumber.trim() : undefined,
        cheque_date: paymentMethod === 'cheque' && chequeDate.trim() ? chequeDate.trim() : undefined,
        items: draftItems.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          barcode: it.barcode,
          batch_number: it.batch_number.trim() || undefined,
          expiry_date: it.expiry_date.trim() || undefined,
          shelf_location: it.shelf_location.trim() || undefined,
          quantity_received: Number(it.quantity_received),
          cost_price: Number(it.cost_price),
          selling_price: Number(it.selling_price),
          mrp: Number(it.mrp) || Number(it.selling_price),
        })),
      };

      const result = await api.createGRN(payload);
      
      // Clear form
      setDraftItems([]);
      setInvoiceNumber('');
      setNotes('');
      setPaymentOption('credit');
      setUpfrontPaidAmount('');
      setChequeNumber('');

      // Refresh stats and reminders in background
      api.getGRNStats().then(setStats).catch(() => {});
      api.getGRNDueReminders().then(setDueReminders).catch(() => {});

      // Open the generated report modal for printing
      openReportModal(result.grn);

    } catch (err: any) {
      alert(err.message || 'Failed to process Goods Received Note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierForm.name.trim()) return;
    try {
      const created = await api.createSupplier(newSupplierForm);
      setSuppliers((prev) => [...prev, created]);
      setSelectedSupplierId(created.id);
      setIsAddSupplierOpen(false);
      setNewSupplierForm({ name: '', contact_name: '', phone: '', address: '' });
    } catch (err: any) {
      alert(err.message || 'Failed to register supplier');
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove supplier "${name}" from the system?`)) {
      return;
    }
    try {
      await api.deleteSupplier(id);
      const remaining = suppliers.filter((s) => s.id !== id);
      setSuppliers(remaining);
      if (selectedSupplierId === id) {
        setSelectedSupplierId(remaining.length > 0 ? remaining[0].id : 'custom');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to remove supplier');
    }
  };

  const openReportModal = async (grn: GoodsReceivedNote) => {
    try {
      const full = await api.getGRNById(grn.id);
      setSelectedGrn(full.grn);
      setReportStoreConfig(full.store_config);
      setIsReportModalOpen(true);
    } catch {
      setSelectedGrn(grn);
      setIsReportModalOpen(true);
    }
  };

  const exportGrnCsv = (grn: GoodsReceivedNote) => {
    if (!grn.items || grn.items.length === 0) return;
    const headers = ['Line #', 'Product Name', 'Barcode', 'Batch #', 'Expiry Date', 'Qty Received', 'Unit Cost', 'Selling Price', 'MRP', 'Line Total'];
    const rows = grn.items.map((it, idx) => [
      idx + 1,
      `"${(it.product_name || '').replace(/"/g, '""')}"`,
      `"${it.barcode || ''}"`,
      `"${it.batch_number || ''}"`,
      `"${it.expiry_date || ''}"`,
      it.quantity_received,
      it.cost_price,
      it.selling_price,
      it.mrp,
      it.subtotal_cost,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${grn.grn_number}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#070b13] text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <header className="px-3 sm:px-6 py-3 sm:py-4 bg-[#0d1527]/90 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Goods Received Note (GRN)</h1>
              <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-medium bg-teal-950 text-teal-400 border border-teal-800">
                Goods Inward & Inventory Sync
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Receive outside deliveries, sync store stock and multi-batch prices, and print official receiving vouchers.
            </p>
          </div>
        </div>

        {/* Stats Badges */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="bg-[#0b1322] border border-slate-800/80 px-3.5 py-1.5 rounded-xl flex items-center gap-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Today's Inward</div>
              <div className="text-xs font-bold text-white">
                {stats?.today?.count || 0} deliveries ({currency}{Number(stats?.today?.spend || 0).toLocaleString()})
              </div>
            </div>
          </div>
          <div className="bg-[#0b1322] border border-slate-800/80 px-3.5 py-1.5 rounded-xl flex items-center gap-3">
            <Layers className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Month-to-Date</div>
              <div className="text-xs font-bold text-white">
                {currency}{Number(stats?.this_month?.spend || 0).toLocaleString()}
              </div>
            </div>
          </div>
          {stats?.payments && (
            <div className="bg-[#0b1322] border border-slate-800/80 px-3.5 py-1.5 rounded-xl flex items-center gap-3">
              <AlertTriangle
                className={`w-4 h-4 ${
                  (stats.payments.due_soon_count || 0) + (stats.payments.overdue_count || 0) > 0
                    ? 'text-amber-400 animate-pulse'
                    : 'text-slate-500'
                }`}
              />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Due Soon / Overdue</div>
                <div className="text-xs font-bold text-white">
                  {(stats.payments.due_soon_count || 0) + (stats.payments.overdue_count || 0)} bills ({currency}
                  {Number(
                    (stats.payments.due_soon_balance || 0) + (stats.payments.overdue_balance || 0)
                  ).toLocaleString()}
                  )
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Tabs Sub-Navigation */}
      <div className="px-3 sm:px-6 border-b border-slate-800 bg-[#0a101f] flex items-center justify-between shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2.5 rounded-t-xl text-sm font-semibold transition border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'create'
                ? 'border-teal-500 text-teal-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Delivery (Create GRN)</span>
            {draftItems.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-teal-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                {draftItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-t-xl text-sm font-semibold transition border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'history'
                ? 'border-teal-500 text-teal-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>GRN History & Payments</span>
            {dueReminders.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 animate-pulse">
                <Bell className="w-3 h-3" />
                {dueReminders.length} due
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
        {/* System-Triggered Payment Due Notification (Active within 3 days until marked PAID) */}
        {dueReminders.length > 0 && (
          <div className="max-w-7xl mx-auto mb-6 bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 border border-amber-500/30">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>System Payment Due Alert</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500 text-slate-950">
                    {dueReminders.length} {dueReminders.length === 1 ? 'Delivery' : 'Deliveries'} Due Soon (≤ 3 Days) or Overdue
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Supplier deliveries require settlement. Total pending balance:{' '}
                  <strong className="text-amber-400 font-mono text-sm">
                    {currency}
                    {dueReminders
                      .reduce((sum, g) => sum + Math.max(0, (Number(g.total_cost) || 0) - (Number(g.paid_amount) || 0)), 0)
                      .toFixed(2)}
                  </strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setHistoryPaymentFilter('DUE_SOON');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-md cursor-pointer shrink-0"
            >
              <span>Review & Pay Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'create' ? (
          /* TAB 1: CREATE GRN */
          <form onSubmit={handleProcessGRN} className="space-y-6 max-w-7xl mx-auto">
            {/* Delivery Header Card */}
            <div className="bg-[#0b1322] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Building2 className="w-4 h-4 text-teal-400" />
                  <span>1. Delivery & Supplier Information</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierModalTab('manage');
                      setIsAddSupplierOpen(true);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Manage Suppliers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierModalTab('add');
                      setIsAddSupplierOpen(true);
                    }}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Supplier</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Supplier Picker */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Supplier / Vendor <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                    >
                      {(suppliers || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.contact_name ? `(${s.contact_name})` : ''}
                        </option>
                      ))}
                      <option value="custom">+ Other / Direct Van Distributor</option>
                    </select>
                  </div>
                  {selectedSupplierId === 'custom' && (
                    <input
                      type="text"
                      placeholder="Type custom supplier / van name..."
                      value={customSupplierName}
                      onChange={(e) => setCustomSupplierName(e.target.value)}
                      required
                      className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                    />
                  )}
                </div>

                {/* Supplier Invoice / Bill # */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Supplier Bill / Invoice #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-98124"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                  />
                </div>

                {/* Delivery Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Received Date
                  </label>
                  <input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                  />
                </div>

                {/* Received By Staff */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Receiver / Staff Name
                  </label>
                  <input
                    type="text"
                    value={receivedByName}
                    onChange={(e) => setReceivedByName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Optional Delivery Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Delivery Notes / Remarks</label>
                <input
                  type="text"
                  placeholder="Optional delivery notes (e.g. Van driver contact, damaged boxes, discount agreements)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-teal-500 outline-hidden"
                />
              </div>

              {/* Payment Terms & Due Schedule */}
              <div className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-400">
                  <Banknote className="w-4 h-4" />
                  <span>Payment Terms & Due Schedule</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-700">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          paymentMethod === 'cash'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>Cash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cheque')}
                        className={`py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          paymentMethod === 'cheque'
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Cheque</span>
                      </button>
                    </div>
                  </div>

                  {/* Payment Term Option */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Settlement Status
                    </label>
                    <select
                      value={paymentOption}
                      onChange={(e: any) => setPaymentOption(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden"
                    >
                      <option value="credit">Credit Delivery (Pay on Due Date)</option>
                      <option value="full">Paid in Full Upon Delivery</option>
                      <option value="partial">Partial Paid Upon Delivery</option>
                    </select>
                  </div>

                  {/* Payment Due Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {paymentOption === 'full' ? 'Settled Date' : 'Payment Due Date'}
                      {paymentOption !== 'full' && <span className="text-amber-400 ml-1">(Reminder active)</span>}
                    </label>
                    <input
                      type="date"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                      required={paymentOption !== 'full'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden font-mono"
                    />
                  </div>

                  {/* Upfront Amount (if partial) */}
                  {paymentOption === 'partial' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Amount Paid Now ({currency}) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 5000"
                        value={upfrontPaidAmount}
                        onChange={(e) => setUpfrontPaidAmount(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-emerald-400 font-bold focus:border-teal-500 outline-hidden font-mono"
                      />
                    </div>
                  )}

                  {/* Cheque Details (if Cheque selected) */}
                  {paymentMethod === 'cheque' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          Cheque # / Ref
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. CHQ-928104"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          Cheque Date
                        </label>
                        <input
                          type="date"
                          value={chequeDate}
                          onChange={(e) => setChequeDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-teal-500 outline-hidden font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Entry Card */}
            <div className="bg-[#0b1322] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Package className="w-4 h-4 text-teal-400" />
                  <span>2. Add Incoming Delivery Items</span>
                  <span className="text-xs text-slate-400 font-normal">({draftItems.length} items in list)</span>
                </div>

                {/* Item Search & Barcode Scanner */}
                <div ref={searchContainerRef} className="relative w-full md:w-[460px]">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Scan barcode / GTIN or search 9,500+ items in catalog..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBarcodeScanOrSubmit();
                          } else if (e.key === 'Escape') {
                            setShowSearchDropdown(false);
                          }
                        }}
                        onFocus={() => {
                          if (searchResults.length > 0 || searchInput.trim().length > 0) {
                            setShowSearchDropdown(true);
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-16 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-sans"
                      />
                      <div className="absolute right-2.5 top-2 flex items-center gap-1">
                        {isSearchingProduct ? (
                          <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                        ) : searchInput.trim().length > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleBarcodeScanOrSubmit()}
                            className="text-[10px] bg-teal-500/20 text-teal-300 hover:bg-teal-500 hover:text-slate-950 font-bold px-1.5 py-0.5 rounded transition cursor-pointer"
                            title="Lookup Barcode / GTIN (Enter)"
                          >
                            Enter ↵
                          </button>
                        ) : (
                          <Barcode className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenQuickProduct(searchInput)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 border border-slate-700/60 transition cursor-pointer"
                      title="Register product if barcode not found in catalog"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New Product</span>
                    </button>
                  </div>

                  {/* Real-time Status / Feedback Alert */}
                  {searchFeedback && (
                    <div
                      className={`mt-1.5 px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                        searchFeedback.type === 'success'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                          : searchFeedback.type === 'error'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                          : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {searchFeedback.type === 'success' && <Check className="w-3.5 h-3.5 shrink-0" />}
                        {searchFeedback.type === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                        <span>{searchFeedback.message}</span>
                      </div>
                      {searchFeedback.type === 'error' && (
                        <button
                          type="button"
                          onClick={() => handleOpenQuickProduct(searchInput)}
                          className="underline font-bold text-teal-300 hover:text-white cursor-pointer ml-2 shrink-0"
                        >
                          + Quick Add
                        </button>
                      )}
                    </div>
                  )}

                  {/* Dropdown Suggestions */}
                  {showSearchDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
                      {isSearchingProduct && searchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                          <span>Searching catalog database...</span>
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div>
                          <div className="px-3 py-1.5 bg-slate-950/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex justify-between">
                            <span>Catalog Matches ({searchResults.length})</span>
                            <span>Click to add item</span>
                          </div>
                          {searchResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => addProductToDraft(p)}
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition flex items-center justify-between border-b border-slate-800/60 last:border-0 cursor-pointer"
                            >
                              <div className="pr-2">
                                <div className="text-xs font-semibold text-white flex items-center gap-2">
                                  <span>{p.name}</span>
                                  {p.is_in_inventory === 1 ? (
                                    <span className="text-[9px] font-normal px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                                      In Stock: {p.stock_quantity || 0}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-normal px-1.5 py-0.2 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded">
                                      Catalog Only
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                  <span>GTIN/Barcode: <strong className="text-teal-300">{p.barcode || '—'}</strong></span>
                                  {p.sku && p.sku !== p.barcode && <span>• SKU: {p.sku}</span>}
                                  {p.brand && <span>• {p.brand}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-bold text-teal-400 font-mono">
                                  Cost: {currency}{Number(p.cost_price || 0).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Sell: {currency}{Number(p.selling_price || 0).toFixed(2)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        searchInput.trim().length > 0 && !isSearchingProduct && (
                          <div className="p-4 text-center">
                            <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-1.5" />
                            <div className="text-xs font-semibold text-white">
                              No product found for "{searchInput}"
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                              This barcode / GTIN is not registered in the Master Product Catalog yet.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleOpenQuickProduct(searchInput)}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-lg text-xs shadow-md transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Register Product with this Barcode</span>
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              {draftItems.length === 0 ? (
                <div className="py-12 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                  <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No items added to this GRN yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Scan a product barcode or use the search bar above to start building the delivery list.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-[#0f172a] text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-3 w-8">#</th>
                        <th className="py-3 px-3 min-w-[200px]">Product & Barcode</th>
                        <th className="py-3 px-3 min-w-[120px]">Batch #</th>
                        <th className="py-3 px-3 min-w-[120px]">Expiry</th>
                        <th className="py-3 px-3 min-w-[80px]">Location</th>
                        <th className="py-3 px-3 min-w-[90px] text-right">Qty Received</th>
                        <th className="py-3 px-3 min-w-[90px] text-right">Cost Price</th>
                        <th className="py-3 px-3 min-w-[90px] text-right">Selling Price</th>
                        <th className="py-3 px-3 min-w-[90px] text-right">MRP (Actual)</th>
                        <th className="py-3 px-3 min-w-[100px] text-right">Total Cost</th>
                        <th className="py-3 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {draftItems.map((item, idx) => {
                        const rowQty = Number(item.quantity_received) || 0;
                        const rowCost = Number(item.cost_price) || 0;
                        const rowSubtotal = rowQty * rowCost;

                        return (
                          <tr key={idx} className="hover:bg-slate-900/50 transition">
                            <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                            
                            {/* Product Info */}
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{item.product_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{item.barcode}</div>
                            </td>

                            {/* Batch Number */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={item.batch_number}
                                onChange={(e) => updateDraftItem(idx, 'batch_number', e.target.value)}
                                placeholder="Batch #"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                              />
                            </td>

                            {/* Expiry Date */}
                            <td className="py-2.5 px-3">
                              <input
                                type="date"
                                value={item.expiry_date}
                                onChange={(e) => updateDraftItem(idx, 'expiry_date', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                              />
                            </td>

                            {/* Shelf Location */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={item.shelf_location}
                                onChange={(e) => updateDraftItem(idx, 'shelf_location', e.target.value)}
                                placeholder="Rack / Shelf"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-teal-500 outline-hidden"
                              />
                            </td>

                            {/* Quantity Received */}
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                value={item.quantity_received}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateDraftItem(idx, 'quantity_received', e.target.value)}
                                required
                                className="w-20 text-right bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-teal-400 focus:border-teal-500 outline-hidden font-mono"
                              />
                            </td>

                            {/* Unit Cost Price */}
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.cost_price}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateDraftItem(idx, 'cost_price', e.target.value)}
                                required
                                className="w-20 text-right bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white focus:border-teal-500 outline-hidden"
                              />
                            </td>

                            {/* Selling Price */}
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.selling_price}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateDraftItem(idx, 'selling_price', e.target.value)}
                                required
                                className="w-20 text-right bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 focus:border-teal-500 outline-hidden"
                              />
                            </td>

                            {/* MRP */}
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.mrp}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateDraftItem(idx, 'mrp', e.target.value)}
                                className="w-20 text-right bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-amber-300 focus:border-teal-500 outline-hidden"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              {currency}{rowSubtotal.toFixed(2)}
                            </td>

                            {/* Delete Action */}
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => removeDraftItem(idx)}
                                className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                                title="Remove line item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Bottom Summary Bar */}
              {draftItems.length > 0 && (
                <div className="pt-4 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-slate-400">
                    <div>
                      Distinct Items: <strong className="text-white font-mono">{draftItems.length}</strong>
                    </div>
                    <div>
                      Total Units: <strong className="text-teal-400 font-mono">{totalUnits}</strong>
                    </div>
                    <div>
                      Total Inward Spend:{' '}
                      <strong className="text-white text-sm font-mono font-bold">
                        {currency}{totalCost.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      Est. Margin:{' '}
                      <strong className="text-emerald-400 font-mono">
                        +{estMargin.toFixed(1)}%
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Clear List
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-teal-900/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span>Processing & Updating Inventory...</span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Process GRN & Update Inventory</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        ) : (
          /* TAB 2: GRN HISTORY & PAYMENTS */
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Filter Bar & Payment Status Chips */}
            <div className="bg-[#0b1322] border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search GRN #, supplier, invoice..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>From:</span>
                    <input
                      type="date"
                      value={historyFromDate}
                      onChange={(e) => setHistoryFromDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-hidden"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>To:</span>
                    <input
                      type="date"
                      value={historyToDate}
                      onChange={(e) => setHistoryToDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Filter Chips */}
              <div className="flex items-center gap-2 pt-1 overflow-x-auto border-t border-slate-800/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1 shrink-0">Filter by:</span>
                {[
                  { id: 'ALL', label: 'All Bills' },
                  {
                    id: 'DUE_SOON',
                    label: `⚠️ Due in ≤ 3 Days (${stats?.payments?.due_soon_count || 0})`,
                    badge: stats?.payments?.due_soon_count > 0,
                  },
                  {
                    id: 'OVERDUE',
                    label: `🚨 Overdue (${stats?.payments?.overdue_count || 0})`,
                    badge: stats?.payments?.overdue_count > 0,
                  },
                  { id: 'UNPAID', label: 'Unpaid' },
                  { id: 'PARTIAL', label: 'Partial Paid' },
                  { id: 'PAID', label: 'Fully Paid' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHistoryPaymentFilter(f.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                      historyPaymentFilter === f.id
                        ? 'bg-teal-500 text-slate-950 shadow'
                        : f.id === 'DUE_SOON' && stats?.payments?.due_soon_count > 0
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/80 hover:bg-amber-900/60'
                        : f.id === 'OVERDUE' && stats?.payments?.overdue_count > 0
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800/80 hover:bg-rose-900/60'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* GRN List Table */}
            <div className="bg-[#0b1322] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-[#0f172a] text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">GRN Number & Date</th>
                      <th className="py-3 px-4">Supplier & Bill #</th>
                      <th className="py-3 px-4 text-right">Items / Units</th>
                      <th className="py-3 px-4 text-right">Inward Total</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4">Settlement & Balance</th>
                      <th className="py-3 px-4">Due Date & Schedule</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {grnList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No Goods Received Notes match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      grnList.map((grn) => {
                        const totalCost = Number(grn.total_cost) || 0;
                        const paidAmount = Number(grn.paid_amount) || 0;
                        const balance = Math.max(0, Math.round((totalCost - paidAmount) * 100) / 100);
                        const dueInfo = getDueCountdown(grn.payment_due_date, grn.payment_status);

                        return (
                          <tr key={grn.id} className="hover:bg-slate-900/50 transition">
                            {/* GRN Number & Date */}
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-teal-400">{grn.grn_number}</div>
                              <div className="text-[11px] text-slate-400">
                                {new Date(grn.received_date || grn.created_at).toLocaleDateString()}
                              </div>
                            </td>

                            {/* Supplier & Invoice */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{grn.supplier_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Bill: {grn.invoice_number || '—'}
                              </div>
                            </td>

                            {/* Items / Quantity */}
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              <div>{grn.total_items_count} items</div>
                              <div className="text-[10px] text-slate-500">{grn.total_quantity} pcs</div>
                            </td>

                            {/* Total Inward Cost */}
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {currency}{totalCost.toFixed(2)}
                            </td>

                            {/* Payment Method */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-semibold">
                                {grn.payment_method === 'cheque' ? (
                                  <>
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                                      <CreditCard className="w-3 h-3" />
                                      <span>Cheque</span>
                                    </span>
                                    {grn.cheque_number && (
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        #{grn.cheque_number}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                    <Banknote className="w-3 h-3" />
                                    <span>Cash</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Settlement & Balance */}
                            <td className="py-3 px-4">
                              {grn.payment_status === 'PAID' ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    <span>PAID</span>
                                  </span>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    Paid: {currency}{paidAmount.toFixed(2)}
                                  </div>
                                </div>
                              ) : grn.payment_status === 'PARTIAL' ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    PARTIAL
                                  </span>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    Paid: {currency}{paidAmount.toFixed(2)}
                                  </div>
                                  <div className="text-[10px] font-bold text-amber-400 font-mono">
                                    Bal: {currency}{balance.toFixed(2)}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    UNPAID
                                  </span>
                                  <div className="text-[10px] font-bold text-rose-400 font-mono mt-0.5">
                                    Due: {currency}{balance.toFixed(2)}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Due Date & Schedule Alert */}
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border inline-flex items-center gap-1 ${
                                  dueInfo.color === 'rose'
                                    ? 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
                                    : dueInfo.color === 'amber'
                                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                                    : dueInfo.color === 'orange'
                                    ? 'bg-orange-950 text-orange-300 border-orange-800'
                                    : dueInfo.color === 'emerald'
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    : 'bg-slate-900 text-slate-400 border-slate-800'
                                }`}
                              >
                                {dueInfo.isDueSoon && <AlertCircle className="w-3 h-3 shrink-0" />}
                                <span>{dueInfo.label}</span>
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {grn.payment_status !== 'PAID' && (
                                  <button
                                    type="button"
                                    onClick={() => openPaymentModal(grn)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition shadow cursor-pointer"
                                    title="Record payment or partial payment"
                                  >
                                    <DollarSign className="w-3 h-3" />
                                    <span>Pay</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openReportModal(grn)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                  title="View and print receiving voucher"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Voucher</span>
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
            </div>
          </div>
        )}
      </div>

      {/* QUICK SUPPLIER MODAL */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b1322] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSupplierModalTab('add')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    supplierModalTab === 'add'
                      ? 'bg-teal-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  + Add New Supplier
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierModalTab('manage')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    supplierModalTab === 'manage'
                      ? 'bg-teal-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Manage & Delete ({suppliers.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {supplierModalTab === 'add' ? (
              <form onSubmit={handleCreateSupplier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Company / Supplier Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Racing & Performance Distributors"
                    value={newSupplierForm.name}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Saman Jayasinghe"
                    value={newSupplierForm.contact_name}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, contact_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 077 123 4567"
                    value={newSupplierForm.phone}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Address / Warehouse</label>
                  <input
                    type="text"
                    placeholder="e.g. 45 High Level Road, Pannipitiya"
                    value={newSupplierForm.address}
                    onChange={(e) => setNewSupplierForm({ ...newSupplierForm, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Save Supplier
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Click the trash button to delete any sample or unwanted suppliers from your system.
                </p>
                {suppliers.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No suppliers registered in the system.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl">
                    {suppliers.map((s) => (
                      <div key={s.id} className="p-3 flex items-center justify-between hover:bg-slate-900/60 transition">
                        <div>
                          <div className="text-xs font-bold text-white">{s.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {s.contact_name ? `${s.contact_name} • ` : ''}{s.phone || s.address || 'No contact details'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupplier(s.id, s.name)}
                          className="p-2 rounded-lg bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 hover:text-rose-200 transition cursor-pointer"
                          title={`Delete ${s.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddSupplierOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRINTABLE / INSPECTION GRN REPORT MODAL */}
      {isReportModalOpen && selectedGrn && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl p-6 shadow-2xl my-8 space-y-6 text-white max-h-[90vh] flex flex-col">
            {/* Modal Actions Bar (hidden when printing) */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">
                  Goods Received Note Report: <span className="font-mono text-teal-300">{selectedGrn.grn_number}</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportGrnCsv(selectedGrn)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Voucher</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="overflow-y-auto flex-1 p-6 bg-white text-slate-900 rounded-xl font-sans print:p-0 print:m-0 print:border-none print:shadow-none">
              {/* Document Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                    {reportStoreConfig?.store_name || settings?.store_name || 'MotorParts & Tuning Studio'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-sm">
                    {reportStoreConfig?.store_address || settings?.store_address || '420 Speed Avenue, Colombo 05'}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    Tel: {reportStoreConfig?.store_phone || settings?.store_phone || '+94 11 234 5678'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-extrabold px-3 py-1 text-sm uppercase tracking-widest rounded-sm mb-1">
                    GOODS RECEIVED NOTE (GRN)
                  </div>
                  <div className="text-sm font-bold font-mono text-slate-800">
                    {selectedGrn.grn_number}
                  </div>
                  <div className="text-xs text-slate-500">
                    Date: {new Date(selectedGrn.received_date || selectedGrn.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Vendor & Receiver Info Box */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs mb-6">
                <div>
                  <span className="font-bold uppercase text-slate-500 text-[10px] block">Supplier / Vendor:</span>
                  <div className="font-bold text-sm text-slate-900">{selectedGrn.supplier_name}</div>
                  {selectedGrn.invoice_number && (
                    <div className="text-slate-600 font-mono mt-0.5">
                      Invoice / Challan #: <strong>{selectedGrn.invoice_number}</strong>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-bold uppercase text-slate-500 text-[10px] block">Received By:</span>
                  <div className="font-semibold text-slate-900">{selectedGrn.received_by_name || 'Store Receiver'}</div>
                  {selectedGrn.notes && (
                    <div className="text-slate-600 italic mt-0.5">"{selectedGrn.notes}"</div>
                  )}
                </div>
              </div>

              {/* Itemized Table */}
              <table className="w-full text-left text-xs mb-6 border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-800 text-slate-700 text-[10px] uppercase tracking-wider font-bold">
                    <th className="py-2 px-2 w-8">#</th>
                    <th className="py-2 px-2">Item Description</th>
                    <th className="py-2 px-2">Barcode</th>
                    <th className="py-2 px-2">Batch #</th>
                    <th className="py-2 px-2">Expiry</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Unit Cost</th>
                    <th className="py-2 px-2 text-right">Selling</th>
                    <th className="py-2 px-2 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(selectedGrn.items || []).map((it, i) => (
                    <tr key={i} className="text-slate-800">
                      <td className="py-2 px-2 font-mono text-slate-500">{i + 1}</td>
                      <td className="py-2 px-2 font-semibold text-slate-900">{it.product_name}</td>
                      <td className="py-2 px-2 font-mono text-[10px] text-slate-600">{it.barcode || '—'}</td>
                      <td className="py-2 px-2 font-mono text-[10px] text-slate-600">{it.batch_number || '—'}</td>
                      <td className="py-2 px-2 font-mono text-[10px] text-slate-600">{it.expiry_date || '—'}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{it.quantity_received}</td>
                      <td className="py-2 px-2 text-right font-mono">{currency}{Number(it.cost_price).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono">{currency}{Number(it.selling_price).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                        {currency}{Number(it.subtotal_cost).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="flex justify-end mb-12">
                <div className="w-64 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Line Items:</span>
                    <strong className="font-mono">{selectedGrn.total_items_count}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Quantity Received:</span>
                    <strong className="font-mono">{selectedGrn.total_quantity} pcs</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-bold text-slate-900">
                    <span>Total Inward Value:</span>
                    <span className="font-mono">{currency}{Number(selectedGrn.total_cost).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signature Blocks for Official Record */}
              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-slate-300 text-center text-xs text-slate-600">
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <span className="font-semibold">Received By (Staff)</span>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <span className="font-semibold">Verified By (Supervisor)</span>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <span className="font-semibold">Supplier Delivery Agent</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK NEW PRODUCT REGISTRATION MODAL */}
      {isQuickProductOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">Quick Register New Product</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickProductOpen(false)}
                className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Register this item to the Master Catalog. It will immediately be added to your current delivery list.
            </p>

            <form onSubmit={handleSaveQuickProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    GTIN / Barcode <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={quickProductForm.barcode}
                    onChange={(e) =>
                      setQuickProductForm({
                        ...quickProductForm,
                        barcode: e.target.value,
                        sku: quickProductForm.sku || e.target.value,
                      })
                    }
                    placeholder="e.g. 4796000300092"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SKU</label>
                  <input
                    type="text"
                    value={quickProductForm.sku}
                    onChange={(e) => setQuickProductForm({ ...quickProductForm, sku: e.target.value })}
                    placeholder="Auto or SKU"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Product Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quickProductForm.name}
                  onChange={(e) => setQuickProductForm({ ...quickProductForm, name: e.target.value })}
                  placeholder="e.g. Brembo GT 6-Piston Big Brake Caliper Kit"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Brand</label>
                  <input
                    type="text"
                    value={quickProductForm.brand}
                    onChange={(e) => setQuickProductForm({ ...quickProductForm, brand: e.target.value })}
                    placeholder="e.g. Brembo, HKS, Turbosmart"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Category</label>
                  <select
                    value={quickProductForm.category_id}
                    onChange={(e) => setQuickProductForm({ ...quickProductForm, category_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                  >
                    <option value="">-- Select Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cost Price ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickProductForm.cost_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setQuickProductForm({ ...quickProductForm, cost_price: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Selling Price ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickProductForm.selling_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuickProductForm({
                        ...quickProductForm,
                        selling_price: val,
                        mrp: quickProductForm.mrp === '' || quickProductForm.mrp === quickProductForm.selling_price ? val : quickProductForm.mrp,
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">MRP ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickProductForm.mrp}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setQuickProductForm({ ...quickProductForm, mrp: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Unit of Measurement</label>
                <select
                  value={quickProductForm.unit || 'pcs'}
                  onChange={(e) => setQuickProductForm({ ...quickProductForm, unit: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500 outline-hidden"
                >
                  <option value="pcs">Pieces (pcs) - Individual Parts / Hardware</option>
                  <option value="set">Set (set) - Suspension, Bushings or Plugs</option>
                  <option value="kit">Kit (kit) - Turbo, Brake or Intercooler Kits</option>
                  <option value="pair">Pair (pr) - Lights, Spacers or Discs</option>
                  <option value="can">Can (can) - 1L / 4L Engine Oil or Additives</option>
                  <option value="bottle">Bottle (btl) - Brake Fluid, Coolant or Cleaners</option>
                  <option value="roll">Roll (roll) - Heat Wrap, Decals or Vacuum Hoses</option>
                  <option value="meter">Meter (m) - Fuel Lines or Tubing</option>
                  <option value="box">Box (bx) - Fasteners or Gaskets</option>
                  <option value="pack">Pack (pk) - Clip Sets or O-Rings</option>
                  <option value="l">Liters (L) - Bulk Oils / Fluids</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuickProductOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save & Add to GRN</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settle / Record Payment Modal ────────────────────────────────────────── */}
      {isPaymentModalOpen && paymentTargetGrn && (() => {
        const total = Number(paymentTargetGrn.total_cost) || 0;
        const paid = Number(paymentTargetGrn.paid_amount) || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        const inputAmt = Number(recordPaymentForm.amount) || 0;
        const isPartial = inputAmt > 0 && inputAmt < balance - 0.01;
        const newBalanceAfterThisPayment = Math.max(0, Math.round((balance - inputAmt) * 100) / 100);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-700/80 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>Record Payment</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono">
                        {paymentTargetGrn.grn_number}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Supplier: <strong className="text-slate-300">{paymentTargetGrn.supplier_name || 'Generic / Walk-in'}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                {/* Balance & Totals Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Amount</span>
                    <span className="text-base font-bold text-slate-200 mt-1 block">
                      {currency}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                    <span className="text-[11px] font-semibold text-emerald-400/80 uppercase tracking-wider block">Total Paid</span>
                    <span className="text-base font-bold text-emerald-400 mt-1 block">
                      {currency}{paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                    <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider block">Remaining Balance</span>
                    <span className="text-base font-bold text-amber-300 mt-1 block">
                      {currency}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Form */}
                <form id="record-payment-form" onSubmit={handleRecordPaymentSubmit} className="space-y-4">
                  {/* Payment Method Selector */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Payment Method</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRecordPaymentForm({ ...recordPaymentForm, payment_method: 'cash' })}
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-bold transition cursor-pointer ${
                          recordPaymentForm.payment_method === 'cash'
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Cash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecordPaymentForm({ ...recordPaymentForm, payment_method: 'cheque' })}
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-bold transition cursor-pointer ${
                          recordPaymentForm.payment_method === 'cheque'
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Cheque</span>
                      </button>
                    </div>
                  </div>

                  {/* Cheque Specific Details */}
                  {recordPaymentForm.payment_method === 'cheque' && (
                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-blue-950/20 border border-blue-900/40 rounded-xl">
                      <div>
                        <label className="text-[11px] font-semibold text-blue-300 mb-1 block">Cheque Number *</label>
                        <input
                          type="text"
                          required
                          value={recordPaymentForm.cheque_number}
                          onChange={(e) => setRecordPaymentForm({ ...recordPaymentForm, cheque_number: e.target.value })}
                          placeholder="e.g. CHQ-889021"
                          className="w-full bg-slate-900 border border-blue-900/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-400 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-blue-300 mb-1 block">Cheque Date *</label>
                        <input
                          type="date"
                          required
                          value={recordPaymentForm.cheque_date}
                          onChange={(e) => setRecordPaymentForm({ ...recordPaymentForm, cheque_date: e.target.value })}
                          className="w-full bg-slate-900 border border-blue-900/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Payment Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">Payment Amount ({currency})</label>
                      <button
                        type="button"
                        onClick={() => setRecordPaymentForm({ ...recordPaymentForm, amount: balance })}
                        className="text-[11px] text-teal-400 hover:text-teal-300 underline font-semibold cursor-pointer"
                      >
                        Pay Full Balance ({currency}{balance.toFixed(2)})
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                        {currency}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={balance}
                        required
                        value={recordPaymentForm.amount}
                        onChange={(e) => setRecordPaymentForm({ ...recordPaymentForm, amount: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Partial Payment Notice & New Payment Due Date */}
                  {isPartial && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-300">
                            Partial Payment Detected
                          </p>
                          <p className="text-[11px] text-amber-200/80 mt-0.5">
                            Remaining balance will be <strong className="text-amber-300 font-mono">{currency}{newBalanceAfterThisPayment.toFixed(2)}</strong>. Please adjust the next payment due date for this outstanding balance.
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-200 mb-1 block flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>Adjust Next Payment Due Date *</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={recordPaymentForm.new_payment_due_date}
                          onChange={(e) => setRecordPaymentForm({ ...recordPaymentForm, new_payment_due_date: e.target.value })}
                          className="w-full bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400 font-medium"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          The system will send automated notifications starting 3 days before this date until settled.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Payment Notes */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Payment Reference / Notes</label>
                    <input
                      type="text"
                      value={recordPaymentForm.notes}
                      onChange={(e) => setRecordPaymentForm({ ...recordPaymentForm, notes: e.target.value })}
                      placeholder="e.g. Paid at delivery counter / Cheque handed over"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </form>

                {/* Audit History of Previous Payments on this GRN */}
                <div className="pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>Payment History Audit Log ({grnPaymentHistory.length})</span>
                  </h4>

                  {grnPaymentHistory.length === 0 ? (
                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60 text-center text-xs text-slate-500 italic">
                      No payments recorded yet for this GRN.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Method</th>
                            <th className="py-2 px-3">Cheque #</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                            <th className="py-2 px-3">Recorded By</th>
                            <th className="py-2 px-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {grnPaymentHistory.map((p, idx) => (
                            <tr key={p.id || idx} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                                {new Date(p.payment_date).toLocaleDateString()} {new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  p.payment_method === 'cheque'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  {p.payment_method}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-300">
                                {p.cheque_number || '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-400 font-mono">
                                {currency}{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {p.recorded_by_name || 'System'}
                              </td>
                              <td className="py-2 px-3 text-slate-400 max-w-[150px] truncate" title={p.notes}>
                                {p.notes || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  form="record-payment-form"
                  disabled={isRecordingPayment || balance <= 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 transition cursor-pointer flex items-center gap-2"
                >
                  {isRecordingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        Record Payment of {currency}
                        {(Number(recordPaymentForm.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
