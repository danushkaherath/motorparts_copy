import { localDb } from './offlineDb';
import type { Product, AppSettings, Shift, OrderReceipt, Customer, GoodsReceivedNote, CreateGrnPayload, Expense, ExpenseSummary } from '../types';

const API_BASE = '/api';

function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  try {
    const userStr = sessionStorage.getItem('pos_user') || localStorage.getItem('pos_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.id) headers['x-user-id'] = user.id;
      if (user.role) headers['x-user-role'] = user.role;
      if (user.token) headers['Authorization'] = `Bearer ${user.token}`;
    }
  } catch {}
  return headers;
}

export const api = {
  // Settings
  async getSettings(): Promise<AppSettings> {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      localStorage.setItem('cached_settings', JSON.stringify(data));
      return data;
    } catch (err) {
      const cached = localStorage.getItem('cached_settings');
      if (cached) return JSON.parse(cached);
      throw err;
    }
  },

  async updateSettings(updates: Partial<AppSettings>, adminPin?: string): Promise<any> {
    const headers = getAuthHeaders(adminPin ? { 'x-admin-pin': adminPin } : {});
    const res = await fetch(`${API_BASE}/settings/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update settings');
    }
    return data;
  },

  async setSubscriptionLock(payload: {
    action: 'lock' | 'unlock';
    vendor_pin: string;
    monthly_fee?: string;
    provider_phone?: string;
    notice?: string;
    due_date?: string;
  }): Promise<{ success: boolean; subscription_status: string; message: string; settings: AppSettings }> {
    const res = await fetch(`${API_BASE}/settings/subscription-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update subscription lock');
    }
    if (data.settings) {
      localStorage.setItem('cached_settings', JSON.stringify(data.settings));
    }
    return data;
  },

  // Products
  async getPaginatedProducts(params: Record<string, any> = {}): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/products?paginated=true&${qs}`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },

  async getProducts(params: Record<string, string> = {}): Promise<Product[]> {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_BASE}/products?${qs}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      const products: Product[] = await res.json();
      return products;
    } catch (err) {
      // Fallback to IndexedDB
      console.warn('Network unavailable, falling back to local IndexedDB for products');
      let localProducts = await localDb.products.toArray();
      if (params.search) {
        const q = params.search.toLowerCase();
        localProducts = localProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q)
        );
      }
      return localProducts;
    }
  },

  async getBarcode(code: string): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products/barcode/${encodeURIComponent(code)}`);
      if (res.ok) {
        const prod = await res.json();
        await localDb.products.put(prod);
        return prod;
      }
      if (res.status === 404) return null;
      throw new Error('Network error');
    } catch (err) {
      // Offline search in IndexedDB
      const local = await localDb.products
        .where('barcode')
        .equals(code)
        .or('sku')
        .equals(code)
        .first();
      return local || null;
    }
  },

  async getCategories(hasProducts: boolean = false): Promise<any[]> {
    try {
      const qs = hasProducts ? '?has_products=true' : '';
      const res = await fetch(`${API_BASE}/products/categories${qs}`);
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    } catch (err) {
      console.warn('Network error fetching categories, fallback empty array');
      return [];
    }
  },

  async createCategory(category: { name: string; color?: string; icon?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/products/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create category' }));
      throw new Error(err.error || 'Failed to create category');
    }
    return res.json();
  },

  async deleteCategory(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/products/categories/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete category' }));
      throw new Error(err.error || 'Failed to delete category');
    }
  },

  async getQuickPicks(): Promise<Product[]> {
    try {
      const res = await fetch(`${API_BASE}/products/quick-picks`);
      if (!res.ok) throw new Error('Failed to fetch quick picks');
      return res.json();
    } catch (err) {
      return localDb.products.where('is_quick_pick').equals(1).toArray();
    }
  },

  async saveProduct(product: Partial<Product>): Promise<Product> {
    const isEdit = !!product.id;
    const url = isEdit ? `${API_BASE}/products/${product.id}` : `${API_BASE}/products`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save product');
    }
    return res.json();
  },

  async deleteProduct(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete product' }));
      throw new Error(err.error || 'Failed to delete product');
    }
  },

  async getNextBarcode(): Promise<string> {
    try {
      const res = await fetch(`${API_BASE}/products/next-barcode`);
      if (res.ok) {
        const data = await res.json();
        if (data.next_barcode) return String(data.next_barcode);
      }
    } catch {}

    // Fallback: Calculate from local Dexie offline DB
    try {
      const products = await localDb.products.toArray();
      const existing = new Set(products.map((p) => p.barcode?.trim()));
      let candidate = 1000030;
      while (existing.has(String(candidate))) {
        candidate++;
      }
      return String(candidate);
    } catch {
      return '1000030';
    }
  },

  async bulkUploadProducts(items: any[], target: 'catalog' | 'inventory' = 'catalog'): Promise<any> {
    const res = await fetch(`${API_BASE}/products/bulk-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, target }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Bulk upload failed');
    }
    return res.json();
  },

  // Store Inventory Management APIs
  async getInventorySummary(): Promise<{
    total_items: number;
    total_units: number;
    cost_valuation: number;
    retail_valuation: number;
    low_stock_count: number;
    expiring_count: number;
  }> {
    const res = await fetch(`${API_BASE}/products/inventory/summary`);
    if (!res.ok) throw new Error('Failed to fetch inventory summary');
    return res.json();
  },

  async addToInventory(productId: string, payload: {
    stock_quantity: number;
    min_stock_level?: number;
    batch_number?: string;
    expiry_date?: string;
    shelf_location?: string;
    cost_price?: number;
    selling_price?: number;
    mrp?: number;
    is_new_batch?: boolean;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/products/${productId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add item to inventory');
    }
    return res.json();
  },

  async removeFromInventory(productId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/products/${productId}/stock`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to remove item from inventory');
    }
    return res.json();
  },

  async getProductBatches(productId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/products/${productId}/batches`);
    if (!res.ok) throw new Error('Failed to fetch batches');
    return res.json();
  },

  async deleteBatch(batchId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/products/batches/${batchId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete batch');
    }
    return res.json();
  },

  async adjustStock(payload: {
    product_id: string;
    type: 'RESTOCK' | 'DAMAGE' | 'AUDIT_COUNT' | 'SET';
    amount: number;
    notes?: string;
    batch_number?: string;
    expiry_date?: string;
    shelf_location?: string;
    cost_price?: number;
    selling_price?: number;
    mrp?: number;
    is_new_batch?: boolean;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/products/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to adjust stock');
    }
    return res.json();
  },

  async resetAllStockToCatalog(adminPin: string): Promise<any> {
    const res = await fetch(`${API_BASE}/products/inventory/reset-to-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_pin: adminPin }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reset inventory');
    }
    return res.json();
  },

  async bulkStocktake(items: any[], mode: 'SET' | 'ADD' = 'SET'): Promise<any> {
    const res = await fetch(`${API_BASE}/products/inventory/bulk-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, mode }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to import stocktake');
    }
    return res.json();
  },

  async wipeProductCatalog(adminPin: string, cascadeHistory: boolean = false): Promise<{ success: boolean; message: string; deleted_count: number }> {
    const res = await fetch(`${API_BASE}/products/wipe-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_pin: adminPin, cascade_history: cascadeHistory }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to wipe product catalog');
    }
    // Clear offline IndexedDB products cache as well
    try {
      await localDb.products.clear();
    } catch {}
    return data;
  },

  async resetDummyData(payload: {
    adminPin: string;
    wipeAllProducts?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    deleted: {
      orders: number;
      order_items: number;
      shifts: number;
      grn: number;
      po: number;
      batches: number;
      products: number;
      suppliers: number;
      customers: number;
    };
    cleared_by: string;
  }> {
    const res = await fetch(`${API_BASE}/settings/reset-dummy-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_pin: payload.adminPin,
        wipe_all_products: payload.wipeAllProducts || false,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset dummy data');
    }
    try {
      await localDb.products.clear();
    } catch {}
    return data;
  },

  // Shifts
  async getCurrentShift(cashierId?: string): Promise<Shift | null> {
    try {
      const url = cashierId ? `${API_BASE}/shifts/current?cashier_id=${cashierId}` : `${API_BASE}/shifts/current`;
      const res = await fetch(url);
      return res.json();
    } catch {
      return null;
    }
  },

  async startShift(cashierId: string, cashierName: string, openingFloat: number): Promise<Shift> {
    const res = await fetch(`${API_BASE}/shifts/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cashier_id: cashierId,
        cashier_name: cashierName,
        opening_float: openingFloat,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to start shift');
    }
    return data.shift;
  },

  async getXReport(shiftId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/shifts/${shiftId}/x-report`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch X-Report');
    }
    return data;
  },

  async closeZReport(shiftId: string, actualCash: number, notes?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/shifts/${shiftId}/z-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash: actualCash, notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to close shift and generate Z-Report');
    }
    return data;
  },

  async getShiftHistory(): Promise<Shift[]> {
    const res = await fetch(`${API_BASE}/shifts/history`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to load shift history');
    }
    return data;
  },

  // Sales & Checkout with Offline Fallback
  async checkout(payload: any, options?: { settings?: AppSettings | null }): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Checkout failed');
      }
      return res.json();
    } catch (err: any) {
      // If network failed, save to offline sync queue in IndexedDB
      console.warn('Checkout network failure, enqueuing order locally in IndexedDB...');
      await localDb.offlineOrders.add({
        payload,
        created_at: new Date().toISOString(),
        synced: 0,
      });

      // Load active or cached store settings
      let activeSettings: any = options?.settings;
      if (!activeSettings) {
        try {
          const cached = localStorage.getItem('cached_settings');
          if (cached) activeSettings = JSON.parse(cached);
        } catch {}
      }
      activeSettings = activeSettings || {};

      // Tax configuration parity with backend
      const isTaxEnabled = activeSettings.feature_tax === 'true';
      const taxRate = isTaxEnabled ? parseFloat(activeSettings.tax_rate || '0') || 0 : 0;

      // Loyalty configuration parity with backend
      const isLoyaltyEnabled = activeSettings.feature_loyalty !== 'false';
      const spendPerPoint = parseFloat(activeSettings.loyalty_spend_per_point || '100') || 100;
      const pointValue = parseFloat(activeSettings.loyalty_point_value || '1.0') || 1.0;

      // Calculate verified gross and item discounts from line items
      let grossSubtotal = 0;
      let itemDiscountsTotal = 0;
      (payload.items || []).forEach((item: any) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        const lineGross = Math.round(qty * price * 100) / 100;
        const lineDisc = Math.max(0, Number(item.discount_amount) || 0);
        grossSubtotal += lineGross;
        itemDiscountsTotal += lineDisc;
      });
      grossSubtotal = Math.round(grossSubtotal * 100) / 100;
      itemDiscountsTotal = Math.round(itemDiscountsTotal * 100) / 100;

      // Subtotal after item-level discounts
      const subtotal = Math.max(0, Math.round((grossSubtotal - itemDiscountsTotal) * 100) / 100);

      // Loyalty points redeemed & discount clamping (matches sales.ts logic)
      const rawDiscount = Math.max(0, Number(payload.discount_amount) || 0);
      const pointsRedeemed = isLoyaltyEnabled ? Math.max(0, Number(payload.points_redeemed) || 0) : 0;
      const pointsDiscount = Math.round(pointsRedeemed * pointValue * 100) / 100;
      const effectiveDiscount = Math.min(subtotal, Math.round((rawDiscount + pointsDiscount) * 100) / 100);

      // Taxable amount & tax calculation
      const taxableAmount = Math.max(0, subtotal - effectiveDiscount);
      const taxAmount = isTaxEnabled ? Math.round((taxableAmount * (taxRate / 100)) * 100) / 100 : 0;
      const totalDue = Math.round((taxableAmount + taxAmount) * 100) / 100;

      const tenderAmount = (payload.tender_amount !== undefined && payload.tender_amount !== null && !isNaN(Number(payload.tender_amount)))
        ? Number(payload.tender_amount)
        : totalDue;
      const changeAmount = payload.payment_method === 'CASH' ? Math.max(0, Math.round((tenderAmount - totalDue) * 100) / 100) : 0;

      // Loyalty points earned
      const pointsEarned = isLoyaltyEnabled ? Math.floor(totalDue / spendPerPoint) : 0;

      // Store settings for receipt
      const storeName = activeSettings.store_name || 'THUSHAN';
      const subStoreName = activeSettings.sub_store_name || '';
      const storeAddress = activeSettings.store_address || '';
      const storePhone = activeSettings.store_phone || '';
      const receiptFooter = activeSettings.store_receipt_footer || 'Thank you for shopping with us! (Offline Receipt)';
      const receiptWidth = activeSettings.receipt_width || '80';
      const currency = activeSettings.currency_symbol || 'LKR ';

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderPrefix = payload.order_type === 'WHOLESALE' ? 'WHL-OFFLINE' : 'ORD-OFFLINE';
      const orderNumber = `${orderPrefix}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      return {
        success: true,
        is_offline: true,
        order: {
          id: 'offline_' + Date.now(),
          order_number: orderNumber,
          created_at: new Date().toISOString(),
          cashier_name: payload.cashier_name,
          payment_method: payload.payment_method,
          order_type: payload.order_type || 'RETAIL',
          subtotal: subtotal,
          discount_amount: effectiveDiscount,
          item_discounts_total: itemDiscountsTotal,
          tax_amount: taxAmount,
          total_amount: totalDue,
          tender_amount: tenderAmount,
          change_amount: changeAmount,
          card_reference: payload.card_reference,
          cheque_number: payload.cheque_number || null,
          cheque_date: payload.cheque_date || null,
          customer_id: payload.customer_id || null,
          customer_name: payload.customer_name || null,
          customer_phone: payload.customer_phone || null,
          points_earned: pointsEarned,
          points_redeemed: pointsRedeemed,
          items: payload.items,
        },
        receipt_config: {
          store_name: storeName,
          sub_store_name: subStoreName,
          store_address: storeAddress,
          store_phone: storePhone,
          receipt_footer: receiptFooter,
          receipt_width: receiptWidth,
          currency: currency,
          is_tax_enabled: isTaxEnabled,
          tax_rate: taxRate,
        },
      };
    }
  },

  // Background sync worker for pending offline orders
  async syncOfflineOrders(): Promise<number> {
    const pending = await localDb.offlineOrders.where('synced').equals(0).toArray();
    if (pending.length === 0) return 0;

    let syncedCount = 0;
    for (const order of pending) {
      try {
        const res = await fetch(`${API_BASE}/sales/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order.payload),
        });
        if (res.ok && order.id) {
          await localDb.offlineOrders.update(order.id, { synced: 1 });
          syncedCount++;
        }
      } catch {
        // Still offline
        break;
      }
    }
    return syncedCount;
  },

  async getOrders(params?: { search?: string; limit?: number }): Promise<any[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/sales/orders?${q.toString()}`, { headers: getAuthHeaders() });
    return res.json();
  },

  async getRecentOrders(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sales/recent`, { headers: getAuthHeaders() });
    return res.json();
  },

  async voidOrder(orderId: string, reason: string = 'Voided by Administrator', adminPin?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/sales/${orderId}/void`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ reason, admin_pin: adminPin }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to void bill');
    }
    return data;
  },

  async getOrderReceipt(orderId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/sales/${orderId}/receipt`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch receipt');
    return data;
  },

  // Reports
  async getDashboardSummary(): Promise<any> {
    const res = await fetch(`${API_BASE}/reports/summary`);
    return res.json();
  },

  async getAnalytics(period: 'daily' | 'weekly' | 'monthly' | 'all' = 'daily', customDate?: string, fromDate?: string, toDate?: string): Promise<any> {
    const q = new URLSearchParams({ period });
    if (customDate) q.set('date', customDate);
    if (fromDate) q.set('from_date', fromDate);
    if (toDate) q.set('to_date', toDate);
    const res = await fetch(`${API_BASE}/reports/analytics?${q.toString()}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch analytics');
    return data;
  },

  async getTopProducts(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/reports/top-products`);
    return res.json();
  },

  async getTaxReport(): Promise<any> {
    const res = await fetch(`${API_BASE}/reports/tax`);
    return res.json();
  },

  async getExpiryAlerts(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/reports/expiry-alerts`);
    return res.json();
  },

  // Operating Expenses
  async getExpenses(params: Record<string, any> = {}): Promise<{
    expenses: Expense[];
    total: number;
    total_amount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/expenses?${qs}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch expenses');
    return res.json();
  },

  async getExpensesSummary(params: Record<string, any> = {}): Promise<ExpenseSummary> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/expenses/summary?${qs}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch expenses summary');
    return res.json();
  },

  async getExpenseCategories(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/expenses/categories`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch expense categories');
    return res.json();
  },

  async createExpense(data: Partial<Expense>): Promise<Expense> {
    const res = await fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create expense');
    return result;
  },

  async updateExpense(id: string, data: Partial<Expense>): Promise<Expense> {
    const res = await fetch(`${API_BASE}/expenses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to update expense');
    return result;
  },

  async deleteExpense(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to delete expense');
    return result;
  },

  // Suppliers (Procurement & GRN Inward)
  async getSuppliers(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE}/grn/suppliers`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  async createSupplier(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/grn/suppliers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to create supplier');
    }
    return result;
  },

  async deleteSupplier(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/grn/suppliers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to delete supplier');
    }
    return result;
  },

  async getPurchaseOrders(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/purchases/orders`);
    return res.json();
  },

  async createPurchaseOrder(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/purchases/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async receivePurchaseOrder(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/purchases/orders/${id}/receive`, {
      method: 'POST',
    });
    return res.json();
  },

  // User & Staff Management (RBAC)
  async getUsers(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/auth/users`);
    return res.json();
  },

  async getMe(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async createUser(data: { username: string; pin: string; role: string; permissions?: string[] }): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create user');
    }
    return res.json();
  },

  async updateUser(id: string, data: { username?: string; pin?: string; role?: string; permissions?: string[] }): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update user');
    }
    return res.json();
  },

  async deleteUser(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete user');
    }
    return res.json();
  },

  // Customer & Loyalty Program
  async getCustomers(params: { search?: string; page?: number; limit?: number } = {}): Promise<{ customers: Customer[]; total: number; page: number; totalPages: number }> {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    const res = await fetch(`${API_BASE}/customers?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch customers');
    return res.json();
  },

  async lookupCustomerByPhone(phone: string): Promise<Customer | null> {
    try {
      const res = await fetch(`${API_BASE}/customers/lookup/${encodeURIComponent(phone.trim())}`);
      if (res.ok) return res.json();
      return null;
    } catch {
      return null;
    }
  },

  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to register customer');
    }
    return res.json();
  },

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update customer');
    }
    return res.json();
  },

  async deleteCustomer(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/customers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete customer');
    }
    return res.json();
  },

  async getCustomerOrders(id: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/customers/${id}/orders`);
    if (!res.ok) throw new Error('Failed to fetch customer orders');
    return res.json();
  },

  // Goods Received Notes (GRN / Goods Inward)
  async createGRN(data: CreateGrnPayload): Promise<{ success: boolean; message: string; grn: GoodsReceivedNote }> {
    const res = await fetch(`${API_BASE}/grn`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to process Goods Received Note');
    }
    return result;
  },

  async getGRNs(params: Record<string, string> = {}): Promise<{ grns: GoodsReceivedNote[]; total: number }> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/grn?${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch Goods Received Notes');
    return res.json();
  },

  async getGRNById(id: string): Promise<{ grn: GoodsReceivedNote; store_config: any }> {
    const res = await fetch(`${API_BASE}/grn/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch GRN details');
    }
    return res.json();
  },

  async getGRNStats(): Promise<any> {
    const res = await fetch(`${API_BASE}/grn/stats`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch GRN statistics');
    return res.json();
  },

  async recordGRNPayment(
    grnId: string,
    payload: {
      amount: number;
      payment_method: 'cash' | 'cheque';
      cheque_number?: string;
      cheque_date?: string;
      new_payment_due_date?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; message: string; grn: GoodsReceivedNote; payments: any[] }> {
    const res = await fetch(`${API_BASE}/grn/${encodeURIComponent(grnId)}/payments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to record GRN payment');
    }
    return result;
  },

  async getGRNPayments(grnId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/grn/${encodeURIComponent(grnId)}/payments`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch GRN payments history');
    return res.json();
  },

  async getGRNDueReminders(): Promise<GoodsReceivedNote[]> {
    const res = await fetch(`${API_BASE}/grn/due-reminders`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch due reminders');
    return res.json();
  },

  // Thermal Printing (Windows Spooler Direct)
  async getPrinters(): Promise<{ defaultPrinter: string; printers: { name: string; isDefault: boolean; isThermal: boolean }[] }> {
    const res = await fetch(`${API_BASE}/print/printers`);
    if (!res.ok) throw new Error('Failed to get printers');
    return res.json();
  },

  async printReceipt(
    receipt: any,
    settings?: any,
    options?: { open_drawer?: boolean; printer_name?: string; receipt_width?: number; image_base64?: string }
  ): Promise<{ success: boolean; printer: string; message: string }> {
    const res = await fetch(`${API_BASE}/print/receipt`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        receipt,
        settings,
        ...options,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to print receipt');
    return data;
  },

  async kickDrawer(printerName?: string): Promise<{ success: boolean; printer: string; message: string }> {
    const res = await fetch(`${API_BASE}/print/drawer`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ printer_name: printerName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to trigger cash drawer');
    return data;
  },

  async printTestSlip(printerName?: string, receiptWidth?: number): Promise<{ success: boolean; printer: string; message: string }> {
    const res = await fetch(`${API_BASE}/print/test`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ printer_name: printerName, receipt_width: receiptWidth }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to print test slip');
    return data;
  },

  async printBarcodeLabels(payload: {
    printer_name?: string;
    label_width_mm: number;
    label_height_mm: number;
    copies: number;
    products: any[];
    image_base64?: string;
  }): Promise<{ success: boolean; printer: string; message: string }> {
    const res = await fetch(`${API_BASE}/print/labels`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to spool barcode labels');
    return data;
  },
};
