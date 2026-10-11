export interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  cost_price: number;
  selling_price: number;
  mrp: number;
  stock_quantity: number;
  expiry_date?: string;
  shelf_location?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  barcode: string;
  sku: string;
  name: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  cost_price: number;
  selling_price: number;
  mrp: number;
  stock_quantity: number;
  unit: string;
  is_quick_pick: number;
  batch_number?: string;
  expiry_date?: string;
  brand?: string;
  is_in_inventory?: number;
  min_stock_level?: number;
  shelf_location?: string;
  batches?: ProductBatch[];
}

export interface CartItem {
  product_id: string;
  product_name: string;
  barcode: string;
  unit_price: number;
  quantity: number | string;
  subtotal: number;
  unit: string;
  category_name?: string;
  brand?: string;
  mrp?: number;
  batch_number?: string;
  batch_id?: string;
  expiry_date?: string;
  stock_quantity?: number;
  discount_type?: 'amount' | 'percent';
  discount_value?: number;
  discount_amount?: number;
  discount_percent?: number;
}

export interface OrderReceipt {
  id: string;
  order_number: string;
  created_at: string;
  cashier_name: string;
  payment_method: 'CASH' | 'CARD' | 'CHEQUE';
  order_type?: 'RETAIL' | 'WHOLESALE';
  subtotal: number;
  discount_amount: number;
  item_discounts_total?: number;
  tax_amount: number;
  total_amount: number;
  tender_amount: number;
  change_amount: number;
  card_reference?: string;
  cheque_number?: string;
  cheque_date?: string;
  items: CartItem[];
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  points_earned?: number;
  points_redeemed?: number;
  customer_points_balance?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  points: number;
  total_spent: number;
  visits_count: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  cashier_id: string;
  cashier_name: string;
  start_time: string;
  end_time?: string;
  opening_float: number;
  expected_cash: number;
  actual_cash?: number;
  cash_sales: number;
  card_sales: number;
  cheque_sales?: number;
  total_sales: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface AppSettings {
  feature_loyalty?: string;
  loyalty_spend_per_point?: string;
  loyalty_point_value?: string;
  feature_procurement: string;
  feature_tax: string;
  feature_expiry: string;
  feature_discounts: string;
  tax_rate: string;
  store_name: string;
  store_address: string;
  store_phone: string;
  store_receipt_footer: string;
  receipt_width: string;
  currency_symbol: string;
  subscription_status?: string;
  subscription_monthly_fee?: string;
  subscription_due_date?: string;
  subscription_provider_phone?: string;
  subscription_vendor_pin?: string;
  subscription_notice?: string;
  printer_name?: string;
  printer_auto_print?: string;
  printer_open_drawer?: string;
  discount_supervisor_threshold?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  total_cost: number;
  created_at: string;
  received_at?: string;
  notes?: string;
}

export interface GoodsReceivedItem {
  id?: string;
  grn_id?: string;
  product_id: string;
  product_name: string;
  barcode?: string;
  batch_number?: string;
  expiry_date?: string;
  shelf_location?: string;
  quantity_received: number;
  cost_price: number;
  selling_price: number;
  mrp: number;
  subtotal_cost?: number;
}

export interface GoodsReceivedNote {
  id: string;
  grn_number: string;
  supplier_id?: string;
  supplier_name: string;
  invoice_number?: string;
  received_date: string;
  received_by_id?: string;
  received_by_name?: string;
  total_items_count: number;
  total_quantity: number;
  total_cost: number;
  notes?: string;
  status: 'COMPLETED' | 'CANCELLED';
  payment_method: 'cash' | 'cheque';
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
  payment_due_date?: string;
  paid_amount: number;
  cheque_number?: string;
  cheque_date?: string;
  created_at: string;
  items?: GoodsReceivedItem[];
  payments?: GrnPayment[];
}

export interface GrnPayment {
  id: string;
  grn_id: string;
  payment_date: string;
  amount: number;
  payment_method: 'cash' | 'cheque';
  cheque_number?: string;
  cheque_date?: string;
  notes?: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface CreateGrnPayload {
  supplier_id?: string;
  supplier_name: string;
  invoice_number?: string;
  received_date?: string;
  received_by_id?: string;
  received_by_name?: string;
  notes?: string;
  payment_method?: 'cash' | 'cheque';
  payment_due_date?: string;
  paid_amount?: number;
  cheque_number?: string;
  cheque_date?: string;
  items: Array<{
    product_id: string;
    product_name: string;
    barcode?: string;
    batch_number?: string;
    expiry_date?: string;
    shelf_location?: string;
    quantity_received: number;
    cost_price: number;
    selling_price: number;
    mrp: number;
  }>;
}

export type AppModule = 'pos' | 'wholesale' | 'catalog' | 'inventory' | 'grn' | 'customers' | 'shifts' | 'procurement' | 'reports' | 'staff' | 'settings';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'supervisor' | 'cashier';
  permissions: AppModule[];
  created_at?: string;
}

export interface ModuleDefinition {
  id: AppModule;
  name: string;
  description: string;
  iconName: string;
  badgeColor: string;
}

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  {
    id: 'pos',
    name: 'POS Cashier',
    description: 'Counter retail billing, barcode scanning, cart management, and payment processing.',
    iconName: 'ShoppingCart',
    badgeColor: 'emerald',
  },
  {
    id: 'wholesale',
    name: 'Wholesale POS',
    description: 'Wholesale & B2B trade billing with item-by-item discounts and overall cart discounts.',
    iconName: 'Building2',
    badgeColor: 'indigo',
  },
  {
    id: 'catalog',
    name: 'Product Catalog',
    description: 'Master directory of all products, barcodes, brands, MRPs, and prices. Search, import CSV, and stock items.',
    iconName: 'BookOpen',
    badgeColor: 'blue',
  },
  {
    id: 'inventory',
    name: 'Store Inventory',
    description: 'Active in-store stock levels, stock adjustments, batch & expiry tracking, low-stock alerts, and store stock export.',
    iconName: 'Package',
    badgeColor: 'amber',
  },
  {
    id: 'grn',
    name: 'GRN Inward',
    description: 'Goods Received Note processing: record incoming deliveries, update batch & inventory stock, and generate receiving reports.',
    iconName: 'ClipboardCheck',
    badgeColor: 'teal',
  },
  {
    id: 'customers',
    name: 'Customer & Loyalty',
    description: 'Customer directory, contact records, loyalty points tracking, and purchase history.',
    iconName: 'Users',
    badgeColor: 'pink',
  },
  {
    id: 'shifts',
    name: 'Shifts & Registers',
    description: 'Cash drawer opening/closing floats, shift reconciliation, X-Reports, and Z-Reports.',
    iconName: 'Clock',
    badgeColor: 'purple',
  },
  {
    id: 'procurement',
    name: 'Procurement & POs',
    description: 'Supplier orders, pending purchase orders, and goods receiving with stock injection.',
    iconName: 'Truck',
    badgeColor: 'amber',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Sales turnover metrics, payment method summaries, tax reporting, and bill void audits.',
    iconName: 'BarChart3',
    badgeColor: 'cyan',
  },
  {
    id: 'staff',
    name: 'Staff & Access Control',
    description: 'Manage staff accounts, PINs, and configure module-level access permissions.',
    iconName: 'Users',
    badgeColor: 'indigo',
  },
  {
    id: 'settings',
    name: 'Store & System Settings',
    description: 'Configure store name, receipt templates, tax rules, and modular feature switches.',
    iconName: 'Settings',
    badgeColor: 'slate',
  },
];

