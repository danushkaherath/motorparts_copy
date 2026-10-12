import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  PauseCircle, 
  PlayCircle, 
  CreditCard, 
  DollarSign, 
  AlertCircle,
  ShoppingBag,
  X,
  ChevronDown,
  Sparkles,
  Tag,
  Zap,
  Receipt,
  UserPlus,
  UserCheck,
  Star,
  User,
  Building2,
  FileCheck,
} from 'lucide-react';
import type { Product, CartItem, AppSettings, Shift, OrderReceipt, Customer, ProductBatch } from '../types';
import { api } from '../services/api';
import { CashPaymentModal } from '../components/CashPaymentModal';
import { CardPaymentModal } from '../components/CardPaymentModal';
import { ChequePaymentModal } from '../components/ChequePaymentModal';
import { ThermalReceipt } from '../components/ThermalReceipt';
import { SupervisorPinModal } from '../components/SupervisorPinModal';
import { SubstitutesModal } from '../components/SubstitutesModal';
import { RecentBillsModal } from '../components/RecentBillsModal';
import { QuickCustomerModal } from '../components/QuickCustomerModal';
import { BatchSelectionModal } from '../components/BatchSelectionModal';
import { useCart } from '../hooks/useCart';

interface PosTerminalProps {
  settings: AppSettings | null;
  activeShift: Shift | null;
  currentUser?: any;
  onOpenShiftModal: () => void;
  mode?: 'retail' | 'wholesale';
}

export const PosTerminal: React.FC<PosTerminalProps> = ({
  settings,
  activeShift,
  currentUser,
  onOpenShiftModal,
  mode = 'retail',
}) => {
  const isWholesale = mode === 'wholesale';
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState<boolean>(false);
  const [pendingSupervisorAction, setPendingSupervisorAction] = useState<{ desc: string; callback: () => void } | null>(null);

  // Search & Barcode
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [quickPickItems, setQuickPickItems] = useState<Product[]>([]);

  // Cart & Hold state managed via custom useCart hook
  const {
    cart,
    setCart,
    heldCarts,
    addToCart,
    updateQuantity: updateCartQuantity,
    updateItemDiscount,
    handleQuantityChange,
    handleQuantityBlur,
    removeLineItem: removeCartItem,
    clearCart,
    holdCart,
    recallCart,
    grossSubtotal,
    itemDiscountsTotal,
  } = useCart();
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Batch Selection Modal state
  const [batchModalProduct, setBatchModalProduct] = useState<Product | null>(null);
  const [batchModalList, setBatchModalList] = useState<ProductBatch[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);

  // Substitutes Modal
  const [substituteItem, setSubstituteItem] = useState<CartItem | null>(null);
  const [isSubstituteModalOpen, setIsSubstituteModalOpen] = useState<boolean>(false);

  // Modals
  const [isRecentBillsOpen, setIsRecentBillsOpen] = useState<boolean>(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState<boolean>(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
  const [isChequeModalOpen, setIsChequeModalOpen] = useState<boolean>(false);
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState<boolean>(false);
  const [completedReceipt, setCompletedReceipt] = useState<OrderReceipt | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLFormElement>(null);
  const currency = settings?.currency_symbol || '$';
  const isTaxEnabled = settings?.feature_tax === 'true';
  const taxRate = isTaxEnabled ? parseFloat(settings?.tax_rate || '0') : 0;
  const isDiscountsEnabled = settings?.feature_discounts === 'true';
  const isLoyaltyEnabled = settings?.feature_loyalty !== 'false';
  const loyaltyPointValue = parseFloat(settings?.loyalty_point_value || '1.0') || 1.0;

  // Customer & Loyalty Program State
  const [attachedCustomer, setAttachedCustomer] = useState<Customer | null>(null);
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');
  const [isCustomerSearching, setIsCustomerSearching] = useState<boolean>(false);
  const [customerSearchNotFound, setCustomerSearchNotFound] = useState<boolean>(false);
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState<boolean>(false);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);

  const handleCustomerLookup = async (phoneToSearch?: string) => {
    const phone = (phoneToSearch !== undefined ? phoneToSearch : customerPhoneInput).trim();
    if (!phone) return;
    try {
      setIsCustomerSearching(true);
      setCustomerSearchNotFound(false);
      const cust = await api.lookupCustomerByPhone(phone);
      if (cust) {
        setAttachedCustomer(cust);
        setCustomerSearchNotFound(false);
        setCustomerPhoneInput('');
        setPointsToRedeem(0);
      } else {
        setCustomerSearchNotFound(true);
      }
    } catch {
      setCustomerSearchNotFound(true);
    } finally {
      setIsCustomerSearching(false);
    }
  };

  // Load quick-pick popular items for empty cart shelf
  useEffect(() => {
    const loadQuickPicks = async () => {
      try {
        const res = await api.getPaginatedProducts({ limit: 8 });
        if (res.products && res.products.length > 0) {
          setQuickPickItems(res.products);
        }
      } catch (err) {
        console.error('Failed to load quick pick items:', err);
      }
    };
    loadQuickPicks();
  }, []);

  // Live auto-suggestions as cashier types in barcode/search box
  useEffect(() => {
    const term = barcodeInput.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.getPaginatedProducts({ search: term, limit: 6 });
        if (res.products && res.products.length > 0) {
          setSuggestions(res.products);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [barcodeInput]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial focus on mount
  useEffect(() => {
    focusBarcode();
  }, []);

  const focusBarcode = () => {
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  // Keyboard shortcut listeners matching the interface badges
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if an active payment or overlay modal is open
      if (isCashModalOpen || isCardModalOpen || isChequeModalOpen || isSubstituteModalOpen || isSupervisorModalOpen || isBatchModalOpen || completedReceipt) {
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        focusBarcode();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldCart();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) setIsCashModalOpen(true);
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (cart.length > 0) setIsCardModalOpen(true);
      } else if (e.key === 'F6' && isWholesale) {
        e.preventDefault();
        if (cart.length > 0) setIsChequeModalOpen(true);
      } else if (e.key === 'F1') {
        e.preventDefault();
        handleRecallCart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isCashModalOpen, isCardModalOpen, isChequeModalOpen, isSubstituteModalOpen, isSupervisorModalOpen, isBatchModalOpen, completedReceipt, heldCarts, isWholesale]);

  // Product batch evaluation: show batch popup if >1 active batch exists
  const handleProductSelected = async (product: Product) => {
    let batches = product.batches;
    if (!batches || batches.length === 0) {
      try {
        const fetched = await api.getProductBatches(product.id);
        batches = (fetched || []).filter((b: any) => Number(b.stock_quantity) > 0);
      } catch {}
    } else {
      batches = batches.filter((b: any) => Number(b.stock_quantity) > 0);
    }

    const hasBatchesWithStock = batches && batches.length > 0;
    const isOutOfStock = (typeof product.stock_quantity === 'number' && product.stock_quantity <= 0) && !hasBatchesWithStock;
    if (isOutOfStock) {
      setErrorMessage(`"${product.name}" is out of stock (0 available).`);
      return;
    }

    if (batches && batches.length > 1) {
      setBatchModalProduct(product);
      setBatchModalList(batches);
      setIsBatchModalOpen(true);
    } else {
      const singleBatch = batches && batches.length === 1 ? batches[0] : undefined;
      const res = addToCart(product, singleBatch);
      if (res && !res.success) {
        if (res.reason === 'OUT_OF_STOCK') {
          setErrorMessage(`"${product.name}" is out of stock (0 available).`);
        } else if (res.reason === 'MAX_STOCK_REACHED') {
          setErrorMessage(`Cannot add more "${product.name}". Maximum available stock reached (${res.maxStock}).`);
        }
      }
    }
  };

  // Handle Barcode Scan / SKU Lookup / Name Search
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setShowSuggestions(false);
    setErrorMessage(null);
    try {
      const product = await api.getBarcode(code);
      if (product) {
        await handleProductSelected(product);
        setBarcodeInput('');
        setSuggestions([]);
        return;
      }

      if (suggestions.length > 0) {
        await handleProductSelected(suggestions[0]);
        setBarcodeInput('');
        setSuggestions([]);
        return;
      }

      setErrorMessage(`Product not found for: "${code}"`);
    } catch (err: any) {
      if (suggestions.length > 0) {
        await handleProductSelected(suggestions[0]);
        setBarcodeInput('');
        setSuggestions([]);
      } else {
        setErrorMessage(err.message || 'Error looking up barcode');
      }
    } finally {
      focusBarcode();
    }
  };

  // Cart actions delegated to useCart hook
  const updateQuantity = (index: number, delta: number) => {
    updateCartQuantity(index, delta);
    focusBarcode();
  };

  const removeLineItem = (index: number) => {
    removeCartItem(index);
    focusBarcode();
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Clear all items from active cart? (Esc)')) {
      clearCart();
      setDiscountAmount(0);
      focusBarcode();
    }
  };

  const handleHoldCart = () => {
    if (holdCart()) {
      setDiscountAmount(0);
      focusBarcode();
    }
  };

  const handleRecallCart = (index: number = 0) => {
    if (recallCart(index)) {
      focusBarcode();
    }
  };

  // Substitutes Handler
  const handleOpenSubstitutes = (item: CartItem) => {
    setSubstituteItem(item);
    setIsSubstituteModalOpen(true);
  };

  const handleSelectSubstitute = (sub: Product, replaceOriginal: boolean) => {
    if (typeof sub.stock_quantity === 'number' && sub.stock_quantity <= 0) {
      setErrorMessage(`Substitute "${sub.name}" is out of stock (0 available).`);
      return;
    }

    if (replaceOriginal && substituteItem) {
      setCart((prev) => {
        return prev.map((it) => {
          if (it.product_id === substituteItem.product_id) {
            return {
              product_id: sub.id,
              product_name: sub.name,
              barcode: sub.barcode,
              unit_price: sub.selling_price,
              quantity: it.quantity,
              subtotal: Math.round(Number(it.quantity) * sub.selling_price * 100) / 100,
              unit: sub.unit || 'pcs',
              category_name: sub.category_name || 'General',
              brand: sub.brand || '',
              mrp: sub.mrp || sub.selling_price,
              batch_number: sub.batch_number || '',
              expiry_date: sub.expiry_date || '',
              stock_quantity: sub.stock_quantity ?? 0,
            };
          }
          return it;
        });
      });
    } else {
      const res = addToCart(sub);
      if (res && !res.success) {
        if (res.reason === 'OUT_OF_STOCK') {
          setErrorMessage(`"${sub.name}" is out of stock (0 available).`);
        } else if (res.reason === 'MAX_STOCK_REACHED') {
          setErrorMessage(`Cannot add more "${sub.name}". Maximum available stock reached (${res.maxStock}).`);
        }
      }
    }
  };

  // Totals calculations
  const subtotal = Math.round(cart.reduce((acc, item) => acc + (parseFloat(item.subtotal as any) || 0), 0) * 100) / 100;
  const pointsDiscount = isLoyaltyEnabled && pointsToRedeem > 0 ? Math.round(pointsToRedeem * loyaltyPointValue * 100) / 100 : 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount - pointsDiscount);
  const taxAmount = isTaxEnabled ? Math.round(taxableAmount * (taxRate / 100) * 100) / 100 : 0;
  const totalDue = Math.round((taxableAmount + taxAmount) * 100) / 100;
  const totalItemCount = Math.round(cart.reduce((acc, item) => acc + (parseFloat(item.quantity as any) || 0), 0) * 1000) / 1000;
  const formattedItemCount = totalItemCount % 1 === 0 ? totalItemCount : totalItemCount.toFixed(3).replace(/\.?0+$/, '');

  // Live Customer Savings calculation
  const cartSavings = Math.round(
    cart.reduce((acc, item) => {
      const mrp = Number(item.mrp || 0);
      const unitPrice = Number(item.unit_price || 0);
      const qty = parseFloat(item.quantity as any) || 0;
      if (mrp > unitPrice) {
        return acc + ((mrp - unitPrice) * qty);
      }
      return acc;
    }, 0) * 100
  ) / 100;
  const totalCustomerSavings = Math.round((cartSavings + itemDiscountsTotal + discountAmount + pointsDiscount) * 100) / 100;

  // Complete Payment (Cash)
  const handleCashConfirm = async (tenderAmount: number) => {
    try {
      setIsCashModalOpen(false);
      const payload = {
        shift_id: activeShift?.id || null,
        cashier_id: activeShift?.cashier_id || 'usr_cashier1',
        cashier_name: activeShift?.cashier_name || 'Cashier 1',
        payment_method: 'CASH',
        order_type: isWholesale ? 'WHOLESALE' : 'RETAIL',
        items: cart,
        discount_amount: discountAmount,
        item_discounts_total: itemDiscountsTotal,
        tender_amount: tenderAmount,
        customer_id: attachedCustomer?.id || null,
        customer_name: attachedCustomer?.name || null,
        customer_phone: attachedCustomer?.phone || null,
        points_redeemed: pointsToRedeem || 0,
      };

      const result = await api.checkout(payload, { settings });
      setCompletedReceipt(result.order);
      setCart([]);
      setDiscountAmount(0);
      setAttachedCustomer(null);
      setCustomerPhoneInput('');
      setPointsToRedeem(0);
      setCustomerSearchNotFound(false);
      setErrorMessage(null);
    } catch (err: any) {
      alert('Checkout error: ' + err.message);
    }
  };

  // Complete Payment (Card)
  const handleCardConfirm = async (cardRef: string) => {
    try {
      setIsCardModalOpen(false);
      const payload = {
        shift_id: activeShift?.id || null,
        cashier_id: activeShift?.cashier_id || 'usr_cashier1',
        cashier_name: activeShift?.cashier_name || 'Cashier 1',
        payment_method: 'CARD',
        order_type: isWholesale ? 'WHOLESALE' : 'RETAIL',
        items: cart,
        discount_amount: discountAmount,
        item_discounts_total: itemDiscountsTotal,
        tender_amount: totalDue,
        card_reference: cardRef || null,
        customer_id: attachedCustomer?.id || null,
        customer_name: attachedCustomer?.name || null,
        customer_phone: attachedCustomer?.phone || null,
        points_redeemed: pointsToRedeem || 0,
      };

      const result = await api.checkout(payload, { settings });
      setCompletedReceipt(result.order);
      setCart([]);
      setDiscountAmount(0);
      setAttachedCustomer(null);
      setCustomerPhoneInput('');
      setPointsToRedeem(0);
      setCustomerSearchNotFound(false);
      setErrorMessage(null);
    } catch (err: any) {
      alert('Checkout error: ' + err.message);
    }
  };

  // Complete Payment (Cheque / Check)
  const handleChequeConfirm = async (chequeData: { chequeNumber: string; chequeDate: string; bankName?: string }) => {
    try {
      setIsChequeModalOpen(false);
      const payload = {
        shift_id: activeShift?.id || null,
        cashier_id: activeShift?.cashier_id || 'usr_cashier1',
        cashier_name: activeShift?.cashier_name || 'Cashier 1',
        payment_method: 'CHEQUE',
        order_type: isWholesale ? 'WHOLESALE' : 'RETAIL',
        items: cart,
        discount_amount: discountAmount,
        item_discounts_total: itemDiscountsTotal,
        tender_amount: totalDue,
        cheque_number: chequeData.bankName 
          ? `${chequeData.chequeNumber} (${chequeData.bankName})`
          : chequeData.chequeNumber,
        cheque_date: chequeData.chequeDate,
        customer_id: attachedCustomer?.id || null,
        customer_name: attachedCustomer?.name || null,
        customer_phone: attachedCustomer?.phone || null,
        points_redeemed: pointsToRedeem || 0,
      };

      const result = await api.checkout(payload, { settings });
      setCompletedReceipt(result.order);
      setCart([]);
      setDiscountAmount(0);
      setAttachedCustomer(null);
      setCustomerPhoneInput('');
      setPointsToRedeem(0);
      setCustomerSearchNotFound(false);
      setErrorMessage(null);
    } catch (err: any) {
      alert('Checkout error: ' + err.message);
    }
  };

  const renderOrderSummaryContent = (isMobileSheet: boolean = false) => (
    <div className="flex flex-col h-full min-h-0 select-none">
      {!isMobileSheet && (
        <h3 className="text-base md:text-lg font-bold text-white tracking-tight mb-4 shrink-0">
          Order Summary
        </h3>
      )}

      {/* Customer & Loyalty Program Card */}
      <div className="mb-4 p-3 rounded-xl bg-[#0a101d] border border-[#16233b] shrink-0">
        {!attachedCustomer ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                Customer Loyalty
              </span>
              <button
                type="button"
                onClick={() => setIsQuickCustomerModalOpen(true)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <UserPlus className="w-3 h-3" />
                + Register
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Customer Phone / Mobile..."
                value={customerPhoneInput}
                onChange={(e) => {
                  setCustomerPhoneInput(e.target.value);
                  if (customerSearchNotFound) setCustomerSearchNotFound(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomerLookup();
                  }
                }}
                className="flex-1 bg-[#0c1322] border border-[#1b283f] text-xs text-white px-2.5 py-1.5 rounded-lg outline-hidden focus:border-cyan-500 placeholder:text-slate-500 font-mono"
              />
              <button
                type="button"
                onClick={() => handleCustomerLookup()}
                disabled={isCustomerSearching || !customerPhoneInput.trim()}
                className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                {isCustomerSearching ? '...' : 'Find'}
              </button>
            </div>

            {customerSearchNotFound && (
              <div className="mt-2 text-[11px] text-rose-400 flex items-center justify-between">
                <span>Not registered</span>
                <button
                  type="button"
                  onClick={() => setIsQuickCustomerModalOpen(true)}
                  className="underline hover:text-rose-300 font-semibold"
                >
                  Create Profile
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white truncate block">
                    {attachedCustomer.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {attachedCustomer.phone}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachedCustomer(null);
                  setPointsToRedeem(0);
                }}
                className="text-slate-500 hover:text-rose-400 text-xs px-1 cursor-pointer"
                title="Detach customer"
              >
                ✕
              </button>
            </div>

            {/* Points status */}
            <div className="pt-2 border-t border-[#16233b] flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-amber-400 font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                {attachedCustomer.points} pts
              </span>
              <span className="text-[11px] text-slate-400">
                Valued: <strong className="text-slate-300 font-mono">{currency}{(attachedCustomer.points * loyaltyPointValue).toFixed(2)}</strong>
              </span>
            </div>

            {/* Points Redemption Control */}
            {attachedCustomer.points > 0 && isLoyaltyEnabled && (
              <div className="pt-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">Redeem Points:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max={attachedCustomer.points}
                    value={pointsToRedeem || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const maxRedeemable = Math.min(
                        attachedCustomer.points,
                        Math.floor(subtotal / loyaltyPointValue)
                      );
                      setPointsToRedeem(Math.max(0, Math.min(val, maxRedeemable)));
                    }}
                    placeholder="0"
                    className="w-16 bg-[#0c1322] border border-[#1b283f] text-right px-2 py-0.5 text-xs text-amber-300 font-mono rounded-lg outline-hidden focus:border-cyan-500"
                  />
                  {pointsToRedeem > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPointsToRedeem(0)}
                      className="text-slate-500 hover:text-rose-400 text-xs px-1 cursor-pointer"
                      title="Clear redemption"
                    >
                      ✕
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const maxRedeemable = Math.min(
                          attachedCustomer.points,
                          Math.floor(subtotal / loyaltyPointValue)
                        );
                        setPointsToRedeem(maxRedeemable);
                      }}
                      className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Breakdown Metrics */}
      <div className="space-y-3.5 text-xs md:text-sm">
        <div className="flex items-center justify-between text-slate-400">
          <span>Total Line Items:</span>
          <span className="font-bold text-white font-mono">{cart.length}</span>
        </div>

        <div className="flex items-center justify-between text-slate-400">
          <span>Total Units / Quantity:</span>
          <span className="font-bold text-white font-mono">{formattedItemCount}</span>
        </div>

        {itemDiscountsTotal > 0 && (
          <div className="flex items-center justify-between text-slate-400">
            <span>Items Gross Total:</span>
            <span className="font-bold text-slate-300 font-mono">
              {currency}{grossSubtotal.toFixed(2)}
            </span>
          </div>
        )}

        {itemDiscountsTotal > 0 && (
          <div className="flex items-center justify-between text-emerald-400 text-xs">
            <span className="flex items-center gap-1 font-semibold">
              <Tag className="w-3.5 h-3.5" />
              Item Discounts Total:
            </span>
            <span className="font-mono font-bold">- {currency}{itemDiscountsTotal.toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-slate-400">
          <span>{itemDiscountsTotal > 0 ? 'Net Items Subtotal:' : 'Subtotal:'}</span>
          <span className="font-bold text-white font-mono text-sm md:text-base">
            {currency}{subtotal.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Tax Mode:</span>
          <span className="text-slate-400 font-mono">
            {isTaxEnabled ? `Standard (${taxRate}%)` : 'Tax-Free / Direct Total'}
          </span>
        </div>

        {isTaxEnabled && (
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Tax Amount:</span>
            <span className="text-slate-300 font-mono">{currency}{taxAmount.toFixed(2)}</span>
          </div>
        )}

        {/* Points Discount row */}
        {pointsDiscount > 0 && (
          <div className="flex items-center justify-between text-xs text-amber-400">
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              Loyalty Discount ({pointsToRedeem} pts):
            </span>
            <span className="font-mono font-bold">- {currency}{pointsDiscount.toFixed(2)}</span>
          </div>
        )}

        {/* Optional Discounts Widget */}
        {isDiscountsEnabled && (
          <div className="pt-2 border-t border-[#162135]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">
                {itemDiscountsTotal > 0 ? 'Order Discount (Overall):' : 'Discount:'}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-slate-500 text-xs font-mono">- {currency}</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={discountAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    const threshold = parseFloat(settings?.discount_supervisor_threshold || '250');
                    if (val > threshold && currentUser?.role !== 'admin' && currentUser?.role !== 'supervisor') {
                      setPendingSupervisorAction({
                        desc: `Approve custom discount of ${currency}${val.toFixed(2)}`,
                        callback: () => setDiscountAmount(val),
                      });
                      setIsSupervisorModalOpen(true);
                    } else {
                      setDiscountAmount(val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-20 bg-[#0c1322] border border-[#1b283f] text-right px-2 py-0.5 text-xs text-amber-300 font-mono rounded-lg outline-hidden focus:border-cyan-500"
                />
                {discountAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiscountAmount(0)}
                    className="text-slate-500 hover:text-rose-400 text-xs px-1 cursor-pointer"
                    title="Clear discount"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Big Total Row */}
      <div className="pt-4 sm:pt-6 pb-3 sm:pb-4 border-t border-[#162135] mt-4 flex items-baseline justify-between shrink-0">
        <span className="text-lg sm:text-xl md:text-2xl font-extrabold text-white">Total:</span>
        <span className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono tracking-tight">
          {currency}{totalDue.toFixed(2)}
        </span>
      </div>

      {/* Live Customer Discount Banner */}
      {totalCustomerSavings > 0 && (
        <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 flex items-center justify-between shadow-lg shrink-0 animate-in fade-in mb-3">
          <div>
            <span className="font-extrabold text-xs text-emerald-300 block font-sans">DISCOUNT</span>
            <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">Total Customer Discount</span>
          </div>
          <span className="text-base font-black text-emerald-300 font-mono">
            {currency}{totalCustomerSavings.toFixed(2)}
          </span>
        </div>
      )}

      {/* Spacer */}
      {!isMobileSheet && <div className="flex-1 min-h-0" />}

      {/* Bottom Actions */}
      <div className="space-y-2.5 sm:space-y-3 pt-3 shrink-0">
        {/* Recall Held Carts (if any exist) */}
        {heldCarts.length > 0 && (
          <button
            type="button"
            onClick={() => {
              handleRecallCart(0);
              if (isMobileSheet) setIsMobileSummaryOpen(false);
            }}
            className="w-full py-2.5 px-4 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Recall Held Cart ({heldCarts.length}) [F1]</span>
          </button>
        )}

        {/* Hold Cart Button (F8) */}
        <button
          type="button"
          onClick={() => {
            handleHoldCart();
            if (isMobileSheet) setIsMobileSummaryOpen(false);
          }}
          disabled={cart.length === 0}
          className="w-full py-3 px-4 bg-[#121a28] hover:bg-[#182337] disabled:opacity-30 disabled:cursor-not-allowed border border-[#1e2a40] text-slate-200 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm transition cursor-pointer"
        >
          <PauseCircle className="w-4 h-4 text-slate-400" />
          <span>Hold Cart</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-400 font-mono text-[10px]">
            F8
          </span>
        </button>

        {/* Payment Buttons */}
        {isWholesale ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Pay Cash (F4) */}
              <button
                type="button"
                onClick={() => {
                  if (cart.length > 0) {
                    if (isMobileSheet) setIsMobileSummaryOpen(false);
                    setIsCashModalOpen(true);
                  }
                }}
                disabled={cart.length === 0}
                className="py-3 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition cursor-pointer active:scale-98"
              >
                <DollarSign className="w-4 h-4" />
                <span>Cash</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-200 font-mono text-[10px]">
                  F4
                </span>
              </button>

              {/* Pay Card (F5) */}
              <button
                type="button"
                onClick={() => {
                  if (cart.length > 0) {
                    if (isMobileSheet) setIsMobileSummaryOpen(false);
                    setIsCardModalOpen(true);
                  }
                }}
                disabled={cart.length === 0}
                className="py-3 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 text-xs sm:text-sm shadow-md shadow-blue-600/20 transition cursor-pointer active:scale-98"
              >
                <CreditCard className="w-4 h-4" />
                <span>Card</span>
                <span className="px-1.5 py-0.2 rounded bg-blue-950/40 text-blue-200 font-mono text-[10px]">
                  F5
                </span>
              </button>
            </div>

            {/* Pay Cheque (F6) */}
            <button
              type="button"
              onClick={() => {
                if (cart.length > 0) {
                  if (isMobileSheet) setIsMobileSummaryOpen(false);
                  setIsChequeModalOpen(true);
                }
              }}
              disabled={cart.length === 0}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-600/20 transition cursor-pointer active:scale-98"
            >
              <FileCheck className="w-4 h-4" />
              <span>Pay with Cheque / Check</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-200 font-mono text-[10px]">
                F6
              </span>
            </button>
          </div>
        ) : (
          /* Retail Mode: Default Proceed to Pay Button (F4) */
          <button
            type="button"
            onClick={() => {
              if (cart.length > 0) {
                if (isMobileSheet) setIsMobileSummaryOpen(false);
                setIsCashModalOpen(true);
              }
            }}
            disabled={cart.length === 0}
            className="w-full py-3.5 px-4 bg-[#00d2df] hover:bg-[#15e1ee] disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black rounded-2xl flex items-center justify-center gap-2 text-base shadow-xl shadow-cyan-500/25 transition cursor-pointer active:scale-98"
          >
            <CreditCard className="w-5 h-5" />
            <span>Proceed to Pay</span>
            <span className="px-2 py-0.5 rounded bg-slate-950/20 text-slate-950 font-mono text-xs font-bold">
              F4
            </span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col lg:flex-row bg-[#070b13] overflow-hidden select-none">
      
      {/* ========================================================================= */}
      {/* LEFT COLUMN: Top Search Bar & Active Checkout Items Table (Flex-1)        */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col p-2.5 sm:p-4 gap-2.5 sm:gap-3.5 h-full overflow-hidden">
        
        {/* Shift Alert Banner (if no shift is open) */}
        {!activeShift && (
          <div className="bg-amber-500/10 border border-amber-500/25 px-3 sm:px-4 py-2 rounded-xl flex items-center justify-between text-amber-300 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Notice:</strong> No cash drawer shift is currently open.
              </span>
            </div>
            <button
              onClick={onOpenShiftModal}
              className="px-3 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg hover:bg-amber-400 transition cursor-pointer shrink-0"
            >
              Open Shift
            </button>
          </div>
        )}

        {/* Wholesale Mode Banner */}
        {isWholesale && (
          <div className="bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900 border border-indigo-500/40 px-3.5 py-2 rounded-2xl flex items-center justify-between text-indigo-200 text-xs shrink-0 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-extrabold text-white text-xs tracking-wide block">
                  WHOLESALE TERMINAL (B2B TRADE)
                </span>
                <span className="text-[10px] text-indigo-300 hidden sm:inline">
                  Item-by-item discounts & overall cart discounts enabled
                </span>
              </div>
            </div>
            <span className="text-[10px] bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
              B2B Mode Active
            </span>
          </div>
        )}

        {/* TOP SEARCH BAR */}
        <div className="w-full shrink-0">
          <form onSubmit={handleBarcodeSubmit} ref={searchContainerRef} className="relative w-full">
            <div className="relative flex items-center bg-[#0d1424] border border-[#1b283f] focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-2xl shadow-lg transition">
              {/* Left Search Icon & Barcode Stripes Icon */}
              <div className="flex items-center gap-1.5 pl-3 sm:pl-4 pointer-events-none">
                <Search className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="hidden sm:flex items-center gap-0.5 text-cyan-400/90 font-mono tracking-tighter text-xs font-bold shrink-0">
                  <span className="w-0.5 h-3.5 bg-cyan-400 inline-block rounded-full"></span>
                  <span className="w-1 h-3.5 bg-cyan-400 inline-block rounded-full"></span>
                  <span className="w-0.5 h-3.5 bg-cyan-400 inline-block rounded-full"></span>
                  <span className="w-1 h-3.5 bg-cyan-400 inline-block rounded-full"></span>
                </div>
              </div>

              {/* Input */}
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Search product, brand, or scan barcode... (F2)"
                className="w-full bg-transparent text-white text-xs md:text-sm font-medium py-2.5 sm:py-3 px-2 sm:px-3 outline-hidden placeholder:text-slate-500"
                autoFocus
              />

              {/* Action Buttons & F2 Shortcut Badge */}
              <div className="flex items-center gap-2 pr-3 shrink-0">
                {barcodeInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeInput('');
                      setSuggestions([]);
                      setShowSuggestions(false);
                      focusBarcode();
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {barcodeInput && (
                  <button
                    type="submit"
                    className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    Add (↵)
                  </button>
                )}

                <span className="px-2 py-0.5 rounded-md bg-[#131d2e] border border-[#1f2e47] text-cyan-400 font-mono text-[11px] font-bold">
                  F2
                </span>
              </div>
            </div>

            {/* Error Message Toast */}
            {errorMessage && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-rose-950/90 border border-rose-800 px-4 py-2.5 rounded-xl text-rose-200 text-xs flex items-center justify-between shadow-2xl z-50 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-2 cursor-pointer">✕</button>
              </div>
            )}

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1424] border border-[#1b283f] rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-[#162135] animate-in fade-in zoom-in-95">
                <div className="px-4 py-2 bg-[#090e18] text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center justify-between">
                  <span>Matching Catalog Products ({suggestions.length})</span>
                  <span className="text-slate-500">Click or press Enter to add</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-[#162135]">
                  {suggestions.map((item) => {
                    const isOutOfStock = typeof item.stock_quantity === 'number' && item.stock_quantity <= 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isOutOfStock) {
                            setErrorMessage(`"${item.name}" is out of stock (0 available).`);
                            return;
                          }
                          handleProductSelected(item);
                          setBarcodeInput('');
                          setSuggestions([]);
                          setShowSuggestions(false);
                          focusBarcode();
                        }}
                        className={`p-3 flex items-center justify-between transition ${
                          isOutOfStock
                            ? 'opacity-40 cursor-not-allowed bg-rose-950/10'
                            : 'hover:bg-[#131c2f] cursor-pointer group'
                        }`}
                      >
                        <div className="flex-1 pr-4">
                          <div className={`font-bold text-xs md:text-sm line-clamp-1 ${isOutOfStock ? 'text-slate-400' : 'text-white group-hover:text-cyan-300 transition'}`}>
                            {item.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                            <span className="text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                              {item.barcode}
                            </span>
                            {item.category_name && <span>{item.category_name}</span>}
                            {item.brand && <span className="text-slate-500">• {item.brand}</span>}
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className={`font-extrabold text-sm block ${isOutOfStock ? 'text-slate-500' : 'text-cyan-400'}`}>
                            {currency}{item.selling_price.toFixed(2)}
                          </span>
                          {item.mrp && item.mrp > item.selling_price ? (
                            <span className="text-[10px] text-slate-500 line-through block" title="Actual Price">
                              {currency}{item.mrp.toFixed(2)}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-slate-400">
                            Stock:{' '}
                            <strong className={isOutOfStock ? 'text-rose-500 font-bold' : item.stock_quantity <= 5 ? 'text-rose-400' : 'text-slate-300'}>
                              {isOutOfStock ? '0 (Out of stock)' : `${item.stock_quantity} ${item.unit || 'pcs'}`}
                            </strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* ACTIVE CHECKOUT ITEMS CARD (Fills remaining height) */}
        <div className="bg-[#0b101b] border border-[#162135] rounded-2xl flex-1 min-h-0 flex flex-col overflow-hidden shadow-2xl">
          
          {/* Card Header */}
          <div className="px-5 py-3 border-b border-[#162135] flex items-center justify-between shrink-0 bg-[#090e18]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h2 className="text-xs sm:text-sm font-bold text-cyan-400 tracking-wide truncate">
                Active Items ({cart.length})
              </h2>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setIsRecentBillsOpen(true)}
                className="px-2 sm:px-2.5 py-1 bg-[#121b2a] hover:bg-[#182438] text-slate-200 border border-[#1e2c44] rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition cursor-pointer"
                title="View Bills, Reprint Slips, and Void Bills"
              >
                <Receipt className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="hidden xs:inline">Recent Bills</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-black uppercase">
                  Void
                </span>
              </button>

              <button
                type="button"
                onClick={handleClearCart}
                disabled={cart.length === 0}
                className="text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1 text-xs font-semibold cursor-pointer px-1.5 py-1"
              >
                <span>✕ Clear</span>
                <span className="hidden sm:inline px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-400 text-[10px] font-mono">
                  Esc
                </span>
              </button>
            </div>
          </div>

          {/* Table or Empty State (Takes all remaining card height) */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {cart.length === 0 ? (
              <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto">
                {/* Empty State Banner */}
                <div className="flex flex-col items-center justify-center py-4 text-center shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-[#0e1626] border border-[#1b283f] flex items-center justify-center shadow-inner mb-3">
                    <ShoppingBag className="w-7 h-7 text-cyan-400 stroke-1" />
                  </div>
                  <p className="text-sm font-bold text-white">Active Cart Empty</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Scan a product barcode or press <kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1f2e48] font-mono text-[11px]">F2</kbd> to search catalog items.
                  </p>
                </div>

                {/* QUICK-TAP FREQUENT ITEMS SHELF (Fills the marked area) */}
                <div className="mt-4 flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Quick-Tap Frequent Items</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">Single-click to add to cart</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-2">
                    {quickPickItems.map((prod) => {
                      const isOutOfStock = typeof prod.stock_quantity === 'number' && prod.stock_quantity <= 0;
                      return (
                        <div
                          key={prod.id}
                          onClick={() => {
                            if (isOutOfStock) {
                              setErrorMessage(`"${prod.name}" is out of stock (0 available).`);
                              return;
                            }
                            handleProductSelected(prod);
                          }}
                          className={`bg-[#0d1424] border rounded-xl p-3 flex flex-col justify-between transition shadow-sm ${
                            isOutOfStock
                              ? 'opacity-40 border-rose-900/30 cursor-not-allowed'
                              : 'hover:bg-[#121d33] border-[#1b283f] hover:border-cyan-500/50 cursor-pointer group active:scale-98'
                          }`}
                        >
                          <div>
                            <div className={`font-bold text-xs uppercase line-clamp-1 ${isOutOfStock ? 'text-slate-400' : 'text-white group-hover:text-cyan-300 transition'}`}>
                              {prod.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                              <span>{prod.barcode}</span>
                              <span className={isOutOfStock ? 'text-rose-400 font-semibold' : 'text-slate-500'}>
                                {isOutOfStock ? 'Out of Stock' : (prod.unit || 'pcs')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-[#162135]">
                            <div>
                              <span className={`text-xs font-extrabold font-mono ${isOutOfStock ? 'text-slate-500' : 'text-cyan-400'}`}>
                                {currency}{prod.selling_price.toFixed(2)}
                              </span>
                              {prod.mrp && prod.mrp > prod.selling_price ? (
                                <span className="text-[10px] text-slate-500 line-through font-mono ml-1.5" title="Actual Price">
                                  {currency}{prod.mrp.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                            {isOutOfStock ? (
                              <span className="text-[9px] bg-rose-950/60 text-rose-400 border border-rose-800/40 px-1.5 py-0.5 rounded font-bold">
                                NO STOCK
                              </span>
                            ) : (
                              <span className="text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold group-hover:bg-cyan-500 group-hover:text-slate-950 transition">
                                + ADD
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="hidden sm:block flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0e1626] border-b border-[#162135] text-slate-400 text-[11px] uppercase font-bold tracking-wider sticky top-0 z-10">
                      <th className="py-3 px-5">ITEM DETAILS</th>
                      <th className="py-3 px-4 text-right">PRICE / ACTUAL</th>
                      <th className="py-3 px-4 text-center">QTY</th>
                      {isWholesale && <th className="py-3 px-4 text-center">ITEM DISCOUNT</th>}
                      <th className="py-3 px-4 text-right">LINE TOTAL</th>
                      <th className="py-3 px-4 text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#152033] text-xs md:text-sm">
                    {cart.map((item, index) => {
                      const unitLabel = (item.unit || 'pcs').toUpperCase();
                      return (
                        <tr key={`${item.product_id}_${item.batch_id || item.batch_number || index}`} className="hover:bg-[#111928]/60 transition group">
                          
                          {/* ITEM DETAILS */}
                          <td className="py-3.5 px-5">
                            <div className="font-extrabold text-white text-xs md:text-sm uppercase tracking-tight group-hover:text-cyan-300 transition line-clamp-1">
                              {item.product_name}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono">
                              <span className="text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                                {item.barcode}
                              </span>
                              {item.batch_number && (
                                <span className="text-amber-300 bg-amber-950/50 border border-amber-600/40 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                  Batch: {item.batch_number}
                                </span>
                              )}
                              {item.category_name && <span className="text-slate-300">{item.category_name}</span>}
                              {item.brand && <span className="text-slate-500">• {item.brand}</span>}
                              <span className="text-cyan-400 font-bold shrink-0">• {unitLabel}</span>
                              {typeof item.stock_quantity === 'number' && item.stock_quantity > 0 && (
                                <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                  Number(item.quantity) >= item.stock_quantity 
                                    ? 'text-rose-300 bg-rose-950/60 border border-rose-700/50' 
                                    : 'text-emerald-300 bg-emerald-950/50 border border-emerald-700/40'
                                }`}>
                                  Stock: {item.stock_quantity}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* UNIT PRICE / ACTUAL PRICE */}
                          <td className="py-3.5 px-4 text-right font-mono">
                            <div className="font-bold text-white text-xs md:text-sm">
                              {currency}{item.unit_price.toFixed(2)}
                            </div>
                            {item.mrp && item.mrp > item.unit_price ? (
                              <div className="text-[10px] text-slate-400 line-through" title="Actual Price">
                                {currency}{item.mrp.toFixed(2)}
                              </div>
                            ) : null}
                          </td>

                          {/* QTY STEPPER WITH TYPEABLE DECIMAL INPUT */}
                          <td className="py-3.5 px-4">
                            <div className="inline-flex items-center justify-center bg-[#070b13] border border-[#1b283f] focus-within:border-cyan-500/80 rounded-xl p-0.5 shadow-inner mx-auto">
                              <button
                                type="button"
                                onClick={() => updateQuantity(index, -1)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                title="Decrease quantity (-1)"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(e) => handleQuantityChange(index, e.target.value)}
                                onBlur={() => handleQuantityBlur(index)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                    focusBarcode();
                                  }
                                }}
                                className="w-14 text-center font-bold text-white text-xs md:text-sm font-mono bg-transparent outline-hidden px-0.5 select-all"
                                title="Type exact quantity or decimals (e.g. 1.25, 0.5, 2.75)"
                              />
                              <button
                                type="button"
                                onClick={() => updateQuantity(index, 1)}
                                disabled={typeof item.stock_quantity === 'number' && (item.stock_quantity <= 0 || Number(item.quantity) >= item.stock_quantity)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-cyan-400 hover:text-cyan-200 hover:bg-slate-800 transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                                title={
                                  typeof item.stock_quantity === 'number' && item.stock_quantity <= 0
                                    ? "Out of stock"
                                    : (typeof item.stock_quantity === 'number' && Number(item.quantity) >= item.stock_quantity
                                      ? `Max available stock reached (${item.stock_quantity})`
                                      : "Increase quantity (+1)")
                                }
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* ITEM DISCOUNT (WHOLESALE MODE) */}
                          {isWholesale && (
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex flex-col items-center gap-1">
                                <div className="inline-flex items-center bg-[#070b13] border border-[#1b283f] focus-within:border-indigo-500 rounded-xl p-0.5 shadow-inner">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={item.discount_value !== undefined && item.discount_value > 0 ? item.discount_value : ''}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      updateItemDiscount(index, item.discount_type || 'percent', val);
                                    }}
                                    className="w-12 text-center font-bold text-white text-xs font-mono bg-transparent outline-hidden px-1"
                                    title="Type discount value"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextType = item.discount_type === 'amount' ? 'percent' : 'amount';
                                      updateItemDiscount(index, nextType, item.discount_value || 0);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      item.discount_type === 'amount'
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                    }`}
                                    title={`Toggle discount type (currently ${item.discount_type === 'amount' ? 'Fixed Currency' : 'Percent %'})`}
                                  >
                                    {item.discount_type === 'amount' ? currency.trim() : '%'}
                                  </button>
                                </div>
                                <div className="flex items-center gap-1 text-[9px]">
                                  {[5, 10, 15, 20].map((pct) => (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => updateItemDiscount(index, 'percent', pct)}
                                      className={`px-1 rounded font-bold transition cursor-pointer ${
                                        item.discount_type === 'percent' && item.discount_value === pct
                                          ? 'bg-indigo-600 text-white shadow-xs'
                                          : 'text-slate-400 bg-slate-800 hover:text-white hover:bg-slate-700'
                                      }`}
                                    >
                                      {pct}%
                                    </button>
                                  ))}
                                  {item.discount_value && item.discount_value > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => updateItemDiscount(index, 'percent', 0)}
                                      className="text-rose-400 hover:text-rose-300 px-0.5 font-bold cursor-pointer"
                                      title="Clear item discount"
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </div>
                                {item.discount_amount && item.discount_amount > 0 ? (
                                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                    -{currency}{item.discount_amount.toFixed(2)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          )}

                          {/* LINE TOTAL */}
                          <td className="py-3.5 px-4 text-right font-mono">
                            {item.discount_amount && item.discount_amount > 0 ? (
                              <div>
                                <div className="text-[10px] text-slate-500 line-through">
                                  {currency}{(Number(item.quantity) * item.unit_price).toFixed(2)}
                                </div>
                                <span className="font-extrabold text-emerald-400 text-xs md:text-base">
                                  {currency}{item.subtotal.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <span className="font-extrabold text-cyan-400 text-xs md:text-base">
                                {currency}{item.subtotal.toFixed(2)}
                              </span>
                            )}
                          </td>

                          {/* ACTION */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="w-7 h-7 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-400 hover:bg-rose-900/50 hover:text-rose-200 inline-flex items-center justify-center transition cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Item Card List (Screens < sm) */}
              <div className="sm:hidden flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                {cart.map((item, index) => {
                  const unitLabel = (item.unit || 'pcs').toUpperCase();
                  return (
                    <div 
                      key={`m_item_${item.product_id}_${item.batch_id || item.batch_number || index}`}
                      className="bg-[#0e1626] border border-[#18253b] rounded-xl p-2.5 flex flex-col gap-2 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-white text-xs uppercase tracking-tight line-clamp-1">
                            {item.product_name}
                          </h4>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono">
                            <span className="text-cyan-400 bg-cyan-950/60 px-1 py-0.2 rounded border border-cyan-800/50">
                              {item.barcode}
                            </span>
                            {item.batch_number && (
                              <span className="text-amber-300 bg-amber-950/50 border border-amber-600/40 px-1 py-0.2 rounded font-bold text-[9px]">
                                B:{item.batch_number}
                              </span>
                            )}
                            <span className="text-cyan-400 font-bold shrink-0">• {unitLabel}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="w-7 h-7 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-400 hover:bg-rose-900/50 hover:text-rose-200 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[#152033]">
                        <div className="inline-flex items-center bg-[#070b13] border border-[#1b283f] rounded-xl p-0.5 shadow-inner">
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, -1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white active:bg-slate-800 transition cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.quantity}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            onBlur={() => handleQuantityBlur(index)}
                            className="w-12 text-center font-bold text-white text-xs font-mono bg-transparent outline-hidden select-all"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, 1)}
                            disabled={typeof item.stock_quantity === 'number' && (item.stock_quantity <= 0 || Number(item.quantity) >= item.stock_quantity)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-cyan-400 hover:text-cyan-200 active:bg-slate-800 transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-right font-mono">
                          {item.discount_amount && item.discount_amount > 0 ? (
                            <>
                              <span className="text-[10px] text-slate-500 line-through block">
                                {currency}{(Number(item.quantity) * item.unit_price).toFixed(2)}
                              </span>
                              <span className="font-extrabold text-emerald-400 text-sm">
                                {currency}{item.subtotal.toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] text-slate-400 block">
                                @{currency}{item.unit_price.toFixed(2)}
                              </span>
                              <span className="font-extrabold text-cyan-400 text-sm">
                                {currency}{item.subtotal.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mobile Item Discount Row (Wholesale Mode) */}
                      {isWholesale && (
                        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-[#152033] text-xs">
                          <span className="text-[10px] text-indigo-300 font-bold shrink-0">Item Disc:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={item.discount_value !== undefined && item.discount_value > 0 ? item.discount_value : ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                updateItemDiscount(index, item.discount_type || 'percent', val);
                              }}
                              className="w-10 bg-[#070b13] border border-[#1b283f] text-center px-1 py-0.5 text-xs text-white font-mono rounded-lg outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nextType = item.discount_type === 'amount' ? 'percent' : 'amount';
                                updateItemDiscount(index, nextType, item.discount_value || 0);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.discount_type === 'amount' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}
                            >
                              {item.discount_type === 'amount' ? currency.trim() : '%'}
                            </button>
                            {[5, 10, 15].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => updateItemDiscount(index, 'percent', pct)}
                                className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                  item.discount_type === 'percent' && item.discount_value === pct ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                          {item.discount_amount && item.discount_amount > 0 ? (
                            <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0">
                              -{currency}{item.discount_amount.toFixed(2)}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
            )}
          </div>

          {/* DOCK BAR AT THE BOTTOM OF THE CARD */}
          <div className="px-3 sm:px-5 py-2 sm:py-2.5 bg-[#090e18] border-t border-[#162135] flex items-center justify-between text-xs text-slate-400 shrink-0 font-mono">
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px] sm:text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Ready
              </span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                Cashier: <strong className="text-slate-200">{currentUser?.username || 'cashier1'}</strong>
              </span>
              <span className="text-slate-600 hidden md:inline">•</span>
              <span className="text-slate-400 hidden md:inline text-[11px] sm:text-xs">
                Register: <strong className="text-slate-200">#01</strong>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 md:gap-3 text-[11px] text-slate-400">
              <span><kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">F2</kbd> Search</span>
              <span><kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">F4</kbd> Cash</span>
              <span><kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">F5</kbd> Card</span>
              {isWholesale && (
                <span><kbd className="bg-[#121c2e] text-purple-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">F6</kbd> Cheque</span>
              )}
              <span><kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">F8</kbd> Hold</span>
              <span><kbd className="bg-[#121c2e] text-cyan-400 px-1.5 py-0.5 rounded border border-[#1d2d46]">Esc</kbd> Clear</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: Desktop Order Summary Sidebar (Fixed on lg and larger)      */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex w-80 lg:w-96 bg-[#070b13] border-l border-[#162135] flex-col p-6 select-none shrink-0 h-full min-h-0">
        {renderOrderSummaryContent(false)}
      </div>

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM CHECKOUT BAR (Shown on screens < lg)                 */}
      {/* ========================================================================= */}
      <div className="lg:hidden shrink-0 bg-[#090e18] border-t border-[#162135] px-3.5 py-2.5 flex items-center justify-between shadow-2xl z-20">
        <div 
          onClick={() => setIsMobileSummaryOpen(true)}
          className="cursor-pointer min-w-0"
        >
          <span className="text-[10px] text-slate-400 block font-medium">
            {cart.length} items ({formattedItemCount} units)
          </span>
          <span className="text-base font-black text-cyan-400 font-mono">
            {currency}{totalDue.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileSummaryOpen(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer"
          >
            Summary
          </button>
          {isWholesale && (
            <button
              type="button"
              onClick={() => {
                if (cart.length > 0) setIsChequeModalOpen(true);
              }}
              disabled={cart.length === 0}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-md shadow-purple-600/20 active:scale-95 transition cursor-pointer"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Cheque</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (cart.length > 0) setIsCashModalOpen(true);
            }}
            disabled={cart.length === 0}
            className="px-4 py-2 bg-[#00d2df] hover:bg-[#15e1ee] disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Pay</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE SUMMARY BOTTOM SHEET MODAL (Slides up when toggled)                */}
      {/* ========================================================================= */}
      {isMobileSummaryOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div 
            className="flex-1"
            onClick={() => setIsMobileSummaryOpen(false)}
          />
          <div className="bg-[#0b101b] border-t border-[#162135] rounded-t-3xl max-h-[85vh] flex flex-col p-4 sm:p-5 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#162135] shrink-0 mb-3">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-cyan-400" />
                <span>Order Summary & Checkout</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsMobileSummaryOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {renderOrderSummaryContent(true)}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS & OVERLAYS                                                         */}
      {/* ========================================================================= */}
      
      {/* Cash Modal */}
      <CashPaymentModal
        isOpen={isCashModalOpen}
        totalDue={totalDue}
        settings={settings}
        onClose={() => {
          setIsCashModalOpen(false);
          focusBarcode();
        }}
        onConfirm={handleCashConfirm}
        onSwitchToCard={() => {
          setIsCashModalOpen(false);
          setIsCardModalOpen(true);
        }}
        onSwitchToCheque={isWholesale ? () => {
          setIsCashModalOpen(false);
          setIsChequeModalOpen(true);
        } : undefined}
      />

      {/* Card Modal */}
      <CardPaymentModal
        isOpen={isCardModalOpen}
        totalDue={totalDue}
        settings={settings}
        onClose={() => {
          setIsCardModalOpen(false);
          focusBarcode();
        }}
        onConfirm={handleCardConfirm}
        onSwitchToCash={() => {
          setIsCardModalOpen(false);
          setIsCashModalOpen(true);
        }}
        onSwitchToCheque={isWholesale ? () => {
          setIsCardModalOpen(false);
          setIsChequeModalOpen(true);
        } : undefined}
      />

      {/* Cheque Modal (Wholesale B2B) */}
      <ChequePaymentModal
        isOpen={isChequeModalOpen}
        totalDue={totalDue}
        settings={settings}
        onClose={() => {
          setIsChequeModalOpen(false);
          focusBarcode();
        }}
        onConfirm={handleChequeConfirm}
        onSwitchToCash={() => {
          setIsChequeModalOpen(false);
          setIsCashModalOpen(true);
        }}
        onSwitchToCard={() => {
          setIsChequeModalOpen(false);
          setIsCardModalOpen(true);
        }}
      />

      {/* Substitutes Modal */}
      <SubstitutesModal
        isOpen={isSubstituteModalOpen}
        item={substituteItem}
        settings={settings}
        onClose={() => {
          setIsSubstituteModalOpen(false);
          setSubstituteItem(null);
          focusBarcode();
        }}
        onSelectSubstitute={handleSelectSubstitute}
      />

      {/* Thermal Receipt Print Preview */}
      <ThermalReceipt
        receipt={completedReceipt}
        settings={settings}
        onClose={() => {
          setCompletedReceipt(null);
          focusBarcode();
        }}
      />

      {/* Supervisor PIN Authorization Modal */}
      <SupervisorPinModal
        isOpen={isSupervisorModalOpen}
        actionDescription={pendingSupervisorAction?.desc || 'Supervisor Override'}
        onClose={() => {
          setIsSupervisorModalOpen(false);
          setPendingSupervisorAction(null);
        }}
        onAuthorized={() => {
          if (pendingSupervisorAction?.callback) {
            pendingSupervisorAction.callback();
          }
          setIsSupervisorModalOpen(false);
          setPendingSupervisorAction(null);
        }}
      />

      {/* Recent Bills & Void Invoices Modal */}
      <RecentBillsModal
        isOpen={isRecentBillsOpen}
        settings={settings}
        currentUser={currentUser}
        onClose={() => {
          setIsRecentBillsOpen(false);
          focusBarcode();
        }}
        onReprintReceipt={(receipt) => {
          setCompletedReceipt(receipt);
        }}
      />

      {/* Quick Customer Registration Modal */}
      <QuickCustomerModal
        isOpen={isQuickCustomerModalOpen}
        initialPhone={customerPhoneInput}
        onClose={() => {
          setIsQuickCustomerModalOpen(false);
          focusBarcode();
        }}
        onCustomerRegistered={(cust) => {
          setAttachedCustomer(cust);
          setCustomerPhoneInput('');
          setCustomerSearchNotFound(false);
          setPointsToRedeem(0);
          focusBarcode();
        }}
      />

      {/* Batch & Price Selection Modal */}
      {batchModalProduct && (
        <BatchSelectionModal
          product={batchModalProduct}
          batches={batchModalList}
          isOpen={isBatchModalOpen}
          canDelete={currentUser?.role === 'admin' || currentUser?.role === 'supervisor'}
          onBatchDeleted={(deletedId) => {
            setBatchModalList((prev) => prev.filter((b) => b.id !== deletedId));
          }}
          onClose={() => {
            setIsBatchModalOpen(false);
            setBatchModalProduct(null);
            focusBarcode();
          }}
          onSelectBatch={(batch) => {
            const res = addToCart(batchModalProduct, batch);
            if (res && !res.success) {
              if (res.reason === 'OUT_OF_STOCK') {
                setErrorMessage(`Batch "${batch.batch_number || 'Standard'}" is out of stock (0 available).`);
              } else if (res.reason === 'MAX_STOCK_REACHED') {
                setErrorMessage(`Cannot add more. Maximum available stock for this batch reached (${res.maxStock}).`);
              }
            }
            setIsBatchModalOpen(false);
            setBatchModalProduct(null);
            focusBarcode();
          }}
        />
      )}
    </div>
  );
};
