import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { setJwtSecret } from '../middleware/auth';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'grocery_pos.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at', DB_PATH);
    // Enable foreign key enforcement (disabled by default in SQLite)
    db.run('PRAGMA foreign_keys = ON', (fkErr) => {
      if (fkErr) console.error('Failed to enable foreign keys:', fkErr.message);
      else console.log('SQLite foreign key enforcement enabled.');
    });
  }
});

// Execute raw SQL (for BEGIN/COMMIT/ROLLBACK transactions)
export function dbExec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Transaction mutex to safely serialize transactions on SQLite's single connection
let txQueue = Promise.resolve();

export async function runInTransaction<T>(action: () => Promise<T>): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => { release = resolve; });
  const prevLock = txQueue;
  txQueue = txQueue.then(() => nextLock, () => nextLock);

  await prevLock;
  try {
    await dbExec('BEGIN TRANSACTION');
    const result = await action();
    await dbExec('COMMIT');
    return result;
  } catch (err) {
    await dbExec('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    release!();
  }
}

// Helper for promise-based queries
export function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export async function initDatabase(): Promise<void> {
  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      icon TEXT DEFAULT 'Package'
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      barcode TEXT UNIQUE NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT,
      cost_price REAL DEFAULT 0,
      selling_price REAL NOT NULL,
      mrp REAL NOT NULL,
      stock_quantity REAL DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      is_quick_pick INTEGER DEFAULT 0,
      batch_number TEXT,
      expiry_date TEXT,
      brand TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  try {
    await dbRun('ALTER TABLE products ADD COLUMN brand TEXT');
  } catch {}

  try {
    await dbRun("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'");
  } catch {}

  try {
    await dbRun('ALTER TABLE products ADD COLUMN is_in_inventory INTEGER DEFAULT 0');
  } catch {}

  try {
    await dbRun('ALTER TABLE products ADD COLUMN min_stock_level REAL DEFAULT 10');
  } catch {}

  try {
    await dbRun('ALTER TABLE products ADD COLUMN shelf_location TEXT');
  } catch {}

  // High performance indexes for fast scanning and filtering
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_quick_pick ON products(is_quick_pick)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_products_is_in_inventory ON products(is_in_inventory)');

  await dbRun(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      cashier_id TEXT NOT NULL,
      cashier_name TEXT NOT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      opening_float REAL DEFAULT 0,
      expected_cash REAL DEFAULT 0,
      actual_cash REAL,
      cash_sales REAL DEFAULT 0,
      card_sales REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      notes TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      shift_id TEXT,
      cashier_id TEXT,
      cashier_name TEXT,
      customer_id TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      points_earned REAL DEFAULT 0,
      points_redeemed REAL DEFAULT 0,
      payment_method TEXT NOT NULL, -- 'CASH' or 'CARD'
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      tender_amount REAL NOT NULL,
      change_amount REAL DEFAULT 0,
      card_reference TEXT,
      cheque_number TEXT,
      cheque_date TEXT,
      status TEXT DEFAULT 'COMPLETED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await dbRun('ALTER TABLE orders ADD COLUMN cheque_number TEXT');
  } catch {}

  try {
    await dbRun('ALTER TABLE orders ADD COLUMN cheque_date TEXT');
  } catch {}

  try {
    await dbRun('ALTER TABLE shifts ADD COLUMN cheque_sales REAL DEFAULT 0');
  } catch {}

  await dbRun(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      barcode TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity REAL NOT NULL,
      subtotal REAL NOT NULL,
      mrp REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  try {
    await dbRun('ALTER TABLE order_items ADD COLUMN batch_number TEXT');
  } catch {}

  try {
    await dbRun('ALTER TABLE order_items ADD COLUMN mrp REAL DEFAULT 0');
  } catch {}

  try {
    await dbRun('ALTER TABLE order_items ADD COLUMN discount_amount REAL DEFAULT 0');
  } catch {}

  try {
    await dbRun('ALTER TABLE order_items ADD COLUMN discount_percent REAL DEFAULT 0');
  } catch {}

  await dbRun(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT UNIQUE NOT NULL,
      supplier_id TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING', -- 'PENDING', 'RECEIVED', 'CANCELLED'
      total_cost REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      received_at DATETIME,
      notes TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      ordered_quantity REAL NOT NULL,
      received_quantity REAL DEFAULT 0,
      cost_price REAL NOT NULL,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    )
  `);

  // Goods Received Notes (GRN / Goods Inward)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      mrp REAL NOT NULL,
      stock_quantity REAL DEFAULT 0,
      expiry_date TEXT,
      shelf_location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(product_id, batch_number)
    )
  `);
  await dbRun('CREATE INDEX IF NOT EXISTS idx_batches_product_id ON product_batches(product_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_batches_batch_num ON product_batches(batch_number)');

  // Deduplicate any existing duplicate batches before creating unique index
  try {
    const duplicates = await dbAll<any>(`
      SELECT product_id, batch_number, COUNT(*) as cnt 
      FROM product_batches 
      GROUP BY product_id, batch_number 
      HAVING cnt > 1
    `);

    for (const dup of duplicates) {
      const rows = await dbAll<any>(
        `SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ? ORDER BY created_at ASC`,
        [dup.product_id, dup.batch_number]
      );
      if (rows.length > 1) {
        const primary = rows[0];
        const others = rows.slice(1);
        const totalStock = rows.reduce((sum: number, r: any) => sum + Number(r.stock_quantity || 0), 0);
        const latestExp = rows.map((r: any) => r.expiry_date).filter(Boolean).pop() || null;
        const latestShelf = rows.map((r: any) => r.shelf_location).filter(Boolean).pop() || null;

        await dbRun(
          `UPDATE product_batches SET 
            stock_quantity = ?, 
            expiry_date = COALESCE(?, expiry_date),
            shelf_location = COALESCE(?, shelf_location),
            updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [totalStock, latestExp, latestShelf, primary.id]
        );

        for (const other of others) {
          await dbRun(`DELETE FROM product_batches WHERE id = ?`, [other.id]);
        }
      }
    }

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_product_batch ON product_batches(product_id, batch_number)');
  } catch (err: any) {
    console.warn('Batch unique index migration notice:', err.message);
  }

  // Performance indexes for orders and related tables
  await dbRun('CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id)');

  await dbRun(`
    CREATE TABLE IF NOT EXISTS goods_received_notes (
      id TEXT PRIMARY KEY,
      grn_number TEXT UNIQUE NOT NULL,
      supplier_id TEXT,
      supplier_name TEXT NOT NULL,
      invoice_number TEXT,
      received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      received_by_id TEXT,
      received_by_name TEXT,
      total_items_count INTEGER NOT NULL DEFAULT 0,
      total_quantity REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'COMPLETED', -- 'COMPLETED', 'CANCELLED'
      payment_method TEXT DEFAULT 'cash', -- 'cash', 'cheque'
      payment_status TEXT DEFAULT 'UNPAID', -- 'UNPAID', 'PARTIAL', 'PAID'
      payment_due_date TEXT,
      paid_amount REAL DEFAULT 0,
      cheque_number TEXT,
      cheque_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  // Safe ALTER migration for existing goods_received_notes tables
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN payment_method TEXT DEFAULT 'cash'"); } catch {}
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN payment_status TEXT DEFAULT 'UNPAID'"); } catch {}
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN payment_due_date TEXT"); } catch {}
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN paid_amount REAL DEFAULT 0"); } catch {}
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN cheque_number TEXT"); } catch {}
  try { await dbRun("ALTER TABLE goods_received_notes ADD COLUMN cheque_date TEXT"); } catch {}

  await dbRun(`
    CREATE TABLE IF NOT EXISTS goods_received_items (
      id TEXT PRIMARY KEY,
      grn_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      barcode TEXT,
      batch_number TEXT,
      expiry_date TEXT,
      shelf_location TEXT,
      quantity_received REAL NOT NULL,
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      mrp REAL NOT NULL,
      subtotal_cost REAL NOT NULL,
      FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // GRN Payment Transactions (tracks upfront and partial payments)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS grn_payments (
      id TEXT PRIMARY KEY,
      grn_id TEXT NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'cash', 'cheque'
      cheque_number TEXT,
      cheque_date TEXT,
      notes TEXT,
      recorded_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id)
    )
  `);

  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_created_at ON goods_received_notes(created_at)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_supplier_id ON goods_received_notes(supplier_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_payment_status ON goods_received_notes(payment_status)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_due_date ON goods_received_notes(payment_due_date)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_items_grn_id ON goods_received_items(grn_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_items_product_id ON goods_received_items(product_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_grn_payments_grn_id ON grn_payments(grn_id)');

  await dbRun(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      address TEXT,
      points REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      visits_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');

  try {
    await dbRun('ALTER TABLE orders ADD COLUMN customer_id TEXT');
  } catch {}
  try {
    await dbRun('ALTER TABLE orders ADD COLUMN customer_name TEXT');
  } catch {}
  try {
    await dbRun('ALTER TABLE orders ADD COLUMN customer_phone TEXT');
  } catch {}
  try {
    await dbRun('ALTER TABLE orders ADD COLUMN points_earned REAL DEFAULT 0');
  } catch {}
  try {
    await dbRun('ALTER TABLE orders ADD COLUMN points_redeemed REAL DEFAULT 0');
  } catch {}
  try {
    await dbRun("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'RETAIL'");
  } catch {}
  try {
    await dbRun('ALTER TABLE orders ADD COLUMN item_discounts_total REAL DEFAULT 0');
  } catch {}

  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)');
  } catch {}

  // Seed default settings if empty
  const defaultSettings: Record<string, string> = {
    feature_loyalty: 'true',      // Customer loyalty & rewards program
    loyalty_spend_per_point: '100', // e.g. 1 point earned per 100 spent
    loyalty_point_value: '1.0',    // 1 point = 1.0 currency discount
    feature_procurement: 'false', // Configurable toggle
    feature_tax: 'false',         // Configurable toggle
    feature_expiry: 'true',       // Batch & expiry tracking
    feature_discounts: 'true',
    tax_rate: '5.0',
    store_name: 'MotorParts & Tuning Studio (LKR)',
    store_address: '420 Speed Avenue, Colombo 05, Sri Lanka',
    store_phone: '+94 11 234 5678',
    store_receipt_footer: 'Thank you for choosing MotorParts & Tuning Studio! Professional installation & track support.',
    receipt_width: '80', // 80mm standard or 58mm
    currency_symbol: 'LKR ',
    subscription_status: 'active',
    subscription_monthly_fee: '5000',
    subscription_due_date: '1st of Every Month',
    subscription_provider_phone: '+94 77 123 4567',
    subscription_vendor_pin: '9999',
    discount_supervisor_threshold: '250',
    subscription_notice: 'Your monthly POS application rental fee is overdue. Please contact the software provider to settle your bill and restore service.',
  };

  for (const [k, v] of Object.entries(defaultSettings)) {
    const existing = await dbGet('SELECT key FROM settings WHERE key = ?', [k]);
    if (!existing) {
      await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }

  // Initialize persistent cryptographically secure JWT Secret (L2 Hardening)
  const existingJwt = await dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['jwt_secret']);
  let activeSecret = existingJwt?.value;
  if (!activeSecret || !activeSecret.trim()) {
    activeSecret = crypto.randomBytes(32).toString('hex');
    await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['jwt_secret', activeSecret]);
  }
  setJwtSecret(activeSecret);

  // Seed default users if empty
  const defaultAdminModules = JSON.stringify(['pos', 'wholesale', 'catalog', 'inventory', 'grn', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings']);
  const defaultCashierModules = JSON.stringify(['pos', 'wholesale']);

  const adminUser = await dbGet('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    await dbRun('INSERT INTO users (id, username, pin, role, permissions) VALUES (?, ?, ?, ?, ?)', [
      'usr_admin',
      'admin',
      '1234',
      'admin',
      defaultAdminModules,
    ]);
  }

  const ownerUser = await dbGet('SELECT id FROM users WHERE username = ?', ['owner']);
  if (!ownerUser) {
    await dbRun('INSERT INTO users (id, username, pin, role, permissions) VALUES (?, ?, ?, ?, ?)', [
      'usr_owner',
      'owner',
      '1234',
      'admin',
      defaultAdminModules,
    ]);
  }

  const cashierUser = await dbGet('SELECT id FROM users WHERE username = ?', ['cashier1']);
  if (!cashierUser) {
    await dbRun('INSERT INTO users (id, username, pin, role, permissions) VALUES (?, ?, ?, ?, ?)', [
      'usr_cashier1',
      'cashier1',
      '0000',
      'cashier',
      defaultCashierModules,
    ]);
  }

  // Ensure all existing users have permissions populated
  await dbRun(`
    UPDATE users 
    SET permissions = CASE 
      WHEN role = 'admin' THEN '["pos","wholesale","catalog","inventory","grn","customers","shifts","procurement","reports","staff","settings"]'
      WHEN role = 'supervisor' THEN '["pos","wholesale","catalog","inventory","grn","customers","shifts","reports"]'
      ELSE '["pos","wholesale"]'
    END
    WHERE permissions IS NULL OR permissions = '' OR permissions = '[]' OR permissions NOT LIKE '%wholesale%'
  `);

  // Seed default categories for Motor Vehicle Modification Shop
  const motorCategories = [
    { id: 'cat_exhaust', name: 'Exhaust & Headers', color: '#ef4444', icon: 'Flame' },
    { id: 'cat_suspension', name: 'Suspension & Coilovers', color: '#3b82f6', icon: 'Activity' },
    { id: 'cat_engine', name: 'Engine & Turbo Kits', color: '#f59e0b', icon: 'Cpu' },
    { id: 'cat_brakes', name: 'Big Brake Kits & Rotors', color: '#dc2626', icon: 'Disc' },
    { id: 'cat_wheels', name: 'Wheels, Rims & Spacers', color: '#10b981', icon: 'Circle' },
    { id: 'cat_intake', name: 'Air Intake & Intercoolers', color: '#06b6d4', icon: 'Wind' },
    { id: 'cat_bodykit', name: 'Aero, Spoilers & Body Kits', color: '#8b5cf6', icon: 'Layers' },
    { id: 'cat_lighting', name: 'LED, HID & Underglow Lights', color: '#eab308', icon: 'Lightbulb' },
    { id: 'cat_interior', name: 'Interior, Gauges & Steering', color: '#ec4899', icon: 'Gauge' },
    { id: 'cat_fluids', name: 'Performance Oils & Fluids', color: '#64748b', icon: 'Droplet' },
  ];

  const categoriesCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (categoriesCount && categoriesCount.count === 0) {
    for (const c of motorCategories) {
      await dbRun('INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)', [
        c.id,
        c.name,
        c.color,
        c.icon,
      ]);
    }
  }

  // Automatic Migration: Upgrade any legacy grocery categories to Motor Vehicle Modification categories
  const legacyGroceryCategory = await dbGet('SELECT id FROM categories WHERE id IN (\'cat_bakery\', \'cat_dairy\', \'cat_beverages\', \'cat_snacks\', \'cat_staples\', \'cat_produce\')');
  if (legacyGroceryCategory) {
    for (const c of motorCategories) {
      const exists = await dbGet('SELECT id FROM categories WHERE id = ?', [c.id]);
      if (!exists) {
        await dbRun('INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)', [
          c.id,
          c.name,
          c.color,
          c.icon,
        ]);
      }
    }
    // Remap any existing products assigned to legacy grocery categories
    await dbRun("UPDATE products SET category_id = 'cat_fluids' WHERE category_id = 'cat_dairy' OR category_id = 'cat_beverages'");
    await dbRun("UPDATE products SET category_id = 'cat_intake' WHERE category_id = 'cat_produce' OR category_id = 'cat_staples'");
    await dbRun("UPDATE products SET category_id = 'cat_exhaust' WHERE category_id = 'cat_bakery' OR category_id = 'cat_snacks'");
    // Clean up empty old categories
    await dbRun("DELETE FROM categories WHERE id IN ('cat_bakery', 'cat_dairy', 'cat_beverages', 'cat_snacks', 'cat_staples', 'cat_produce') AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)");
    console.log('Migrated legacy grocery categories to Motor Vehicle Modification Shop categories.');
  }

  // One-time automatic cleanup migration: purge legacy dummy records, test transactions, and reset statistics
  const dummyCleanupSetting = await dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['dummy_cleanup_v1']);
  if (!dummyCleanupSetting) {
    try {
      console.log('Running automatic dummy data & statistics cleanup migration...');
      await runInTransaction(async () => {
        // Clear all test orders & shifts to reset statistics
        await dbRun('DELETE FROM order_items');
        await dbRun('DELETE FROM orders');
        await dbRun('DELETE FROM shifts');

        // Clear dummy inward/procurement & batches
        await dbRun('DELETE FROM grn_payments');
        await dbRun('DELETE FROM goods_received_items');
        await dbRun('DELETE FROM goods_received_notes');
        await dbRun('DELETE FROM purchase_order_items');
        await dbRun('DELETE FROM purchase_orders');
        await dbRun('DELETE FROM product_batches');

        // Delete seeded dummy products (all sample products)
        await dbRun("DELETE FROM products WHERE id LIKE 'prod_%' OR barcode LIKE 'MOD-%' OR barcode LIKE '890%'");

        // Delete dummy suppliers
        await dbRun("DELETE FROM suppliers WHERE id IN ('sup_1', 'sup_2', 'sup_3')");

        // Delete dummy customers and reset any remaining points/statistics
        await dbRun("DELETE FROM customers WHERE id IN ('cust_1', 'cust_2')");
        await dbRun('UPDATE customers SET points = 0, total_spent = 0, visits_count = 0');

        // Update legacy store branding if still freshmart
        await dbRun("UPDATE settings SET value = 'MotorParts & Tuning Studio (LKR)' WHERE key = 'store_name' AND (value LIKE '%FreshMart%' OR value LIKE '%Grocery%')");
        await dbRun("UPDATE settings SET value = '420 Speed Avenue, Colombo 05, Sri Lanka' WHERE key = 'store_address' AND value LIKE '%Galle Road%'");
        await dbRun("UPDATE settings SET value = 'Thank you for choosing MotorParts & Tuning Studio! Professional installation & track support.' WHERE key = 'store_receipt_footer' AND value LIKE '%FreshMart%'");

        // Mark flags so sample data is never re-seeded
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('sample_products_seeded', 'cleared')");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('suppliers_sample_seeded', 'cleared')");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('customers_sample_seeded', 'cleared')");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('dummy_cleanup_v1', 'completed')");
      });
      console.log('Dummy data & statistics successfully wiped and reset to 0.');
    } catch (cleanErr: any) {
      console.error('Notice: dummy cleanup migration encountered:', cleanErr.message);
    }
  }

  // Seed default vehicle modification products only on brand new installation if not cleared
  const sampleProductsSetting = await dbGet('SELECT value FROM settings WHERE key = ?', ['sample_products_seeded']);
  if (!sampleProductsSetting) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['sample_products_seeded', 'true']);
    const productsCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM products');
    if (productsCount && productsCount.count === 0) {
      const sampleProducts = [
      {
        id: 'prod_1',
        barcode: 'MOD-EXH-001',
        sku: 'HKS-HI-POWER-76',
        name: 'HKS Hi-Power Universal Stainless Exhaust Muffler 76mm',
        category_id: 'cat_exhaust',
        cost_price: 38000.0,
        selling_price: 49500.0,
        mrp: 52000.0,
        stock_quantity: 8,
        unit: 'pcs',
        is_quick_pick: 1,
        batch_number: 'HKS-2026',
        expiry_date: null,
      },
      {
        id: 'prod_2',
        barcode: 'MOD-SUSP-002',
        sku: 'BC-RACING-BR-KIT',
        name: 'BC Racing BR Series 32-Way Adjustable Coilover Kit',
        category_id: 'cat_suspension',
        cost_price: 185000.0,
        selling_price: 225000.0,
        mrp: 235000.0,
        stock_quantity: 4,
        unit: 'set',
        is_quick_pick: 1,
        batch_number: 'BCR-041',
        expiry_date: null,
      },
      {
        id: 'prod_3',
        barcode: 'MOD-BRK-003',
        sku: 'BREMBO-6POT-ROT',
        name: 'Brembo GT 6-Piston Big Brake Caliper & 355mm Drilled Rotor Kit',
        category_id: 'cat_brakes',
        cost_price: 240000.0,
        selling_price: 295000.0,
        mrp: 310000.0,
        stock_quantity: 3,
        unit: 'kit',
        is_quick_pick: 1,
        batch_number: 'BRM-GT6',
        expiry_date: null,
      },
      {
        id: 'prod_4',
        barcode: 'MOD-INTK-004',
        sku: 'KN-COLD-AIR-INT',
        name: 'K&N High-Flow Typhoon Cold Air Intake System 3.0"',
        category_id: 'cat_intake',
        cost_price: 42000.0,
        selling_price: 54000.0,
        mrp: 57000.0,
        stock_quantity: 12,
        unit: 'pcs',
        is_quick_pick: 1,
        batch_number: 'KN-TYPH',
        expiry_date: null,
      },
      {
        id: 'prod_5',
        barcode: 'MOD-TURB-005',
        sku: 'TURBOSMART-BOV-50',
        name: 'Turbosmart RacePort 50mm Dual-Port Blow Off Valve',
        category_id: 'cat_engine',
        cost_price: 36000.0,
        selling_price: 46500.0,
        mrp: 49000.0,
        stock_quantity: 10,
        unit: 'pcs',
        is_quick_pick: 1,
        batch_number: 'TS-BOV',
        expiry_date: null,
      },
      {
        id: 'prod_6',
        barcode: 'MOD-WHL-006',
        sku: 'VOLK-TE37-18-PAIR',
        name: 'Volk Racing TE37 Forged Monoblock Wheel Rim 18x9.5J 5x114.3',
        category_id: 'cat_wheels',
        cost_price: 85000.0,
        selling_price: 110000.0,
        mrp: 115000.0,
        stock_quantity: 8,
        unit: 'pcs',
        is_quick_pick: 1,
        batch_number: 'RAYS-TE37',
        expiry_date: null,
      },
      {
        id: 'prod_7',
        barcode: 'MOD-OIL-007',
        sku: 'MOTUL-300V-15W50-4L',
        name: 'Motul 300V Motorsport Factory Line 15W-50 Racing Oil 4L Can',
        category_id: 'cat_fluids',
        cost_price: 24500.0,
        selling_price: 31000.0,
        mrp: 33000.0,
        stock_quantity: 25,
        unit: 'can',
        is_quick_pick: 1,
        batch_number: 'MOT-300V',
        expiry_date: '2029-12-31',
      },
      {
        id: 'prod_8',
        barcode: 'MOD-AERO-008',
        sku: 'APR-GTC300-WING',
        name: 'APR Performance Carbon Fiber GT-Wing Spoiler 67"',
        category_id: 'cat_bodykit',
        cost_price: 165000.0,
        selling_price: 215000.0,
        mrp: 225000.0,
        stock_quantity: 2,
        unit: 'pcs',
        is_quick_pick: 0,
        batch_number: 'APR-GT300',
        expiry_date: null,
      }
    ];

    for (const p of sampleProducts) {
      await dbRun(
        `INSERT INTO products (
          id, barcode, sku, name, category_id, cost_price, selling_price, mrp, stock_quantity, unit, is_quick_pick, batch_number, expiry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.barcode,
          p.sku,
          p.name,
          p.category_id,
          p.cost_price,
          p.selling_price,
          p.mrp,
          p.stock_quantity,
          p.unit,
          p.is_quick_pick,
          p.batch_number,
          p.expiry_date,
        ]
      );
    }
  }
}

  // Seed sample suppliers once on initial setup
  const suppliersSeeded = await dbGet('SELECT value FROM settings WHERE key = ?', ['suppliers_sample_seeded']);
  if (!suppliersSeeded) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['suppliers_sample_seeded', 'true']);
    const suppliersCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM suppliers');
    if (suppliersCount && suppliersCount.count === 0) {
      const sampleSuppliers = [
        {
          id: 'sup_1',
          name: 'Apex Racing & Performance Distributors',
          contact_name: 'Saman Jayasinghe',
          phone: '+94 11 289 4401',
          email: 'orders@apexmotoring.lk',
          address: '45 High Level Road, Pannipitiya',
        },
        {
          id: 'sup_2',
          name: 'JDM Imports & Tuning Wholesale',
          contact_name: 'Nuwan Bandara',
          phone: '+94 77 345 8899',
          email: 'supply@jdmimportslk.com',
          address: '12 Kandy Road, Kadawatha',
        },
        {
          id: 'sup_3',
          name: 'ProBrake & Suspension Logistics',
          contact_name: 'Dinesh Fernando',
          phone: '+94 11 456 1234',
          email: 'parts@probrake.lk',
          address: '88 Baseline Road, Colombo 09',
        }
      ];

      for (const s of sampleSuppliers) {
        await dbRun(
          `INSERT INTO suppliers (id, name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.contact_name, s.phone, s.email, s.address]
        );
      }
    }
  }

  // Seed sample customers once on initial setup if not cleared
  const customersSampleSeeded = await dbGet('SELECT value FROM settings WHERE key = ?', ['customers_sample_seeded']);
  if (!customersSampleSeeded) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['customers_sample_seeded', 'true']);
    const customersCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM customers');
    if (customersCount && customersCount.count === 0) {
      const sampleCustomers = [
        {
          id: 'cust_1',
          name: 'Kasun Perera',
          phone: '0771234567',
          email: 'kasun.p@gmail.com',
          address: 'Colombo 03',
          points: 45,
          total_spent: 4500,
          visits_count: 4,
        },
        {
          id: 'cust_2',
          name: 'Dilani Silva',
          phone: '0719876543',
          email: 'dilani.s@yahoo.com',
          address: 'Nugegoda',
          points: 120,
          total_spent: 12500,
          visits_count: 9,
        },
      ];

      for (const c of sampleCustomers) {
        await dbRun(
          `INSERT INTO customers (id, name, phone, email, address, points, total_spent, visits_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.phone, c.email, c.address, c.points, c.total_spent, c.visits_count]
        );
      }
    }
  }

  // Security migration: Automatically hash all legacy plaintext user PINs with salted scrypt
  try {
    const rawUsers = await dbAll<{ id: string; pin: string }>('SELECT id, pin FROM users');
    for (const u of rawUsers) {
      if (u.pin && !u.pin.includes(':')) {
        const cleanPin = String(u.pin).trim();
        const salt = crypto.randomBytes(16).toString('hex');
        const derivedKey = crypto.scryptSync(cleanPin, salt, 64).toString('hex');
        const secureHash = `${salt}:${derivedKey}`;
        await dbRun('UPDATE users SET pin = ? WHERE id = ?', [secureHash, u.id]);
        console.log(`Migrated user PIN to salted hash for user id ${u.id}`);
      }
    }
  } catch (err: any) {
    console.error('Failed to migrate user PINs to secure hashes:', err.message);
  }

  // Safe cleanup: Only remove truly orphaned batches whose parent product was deleted
  try {
    const cleanedBatches = await dbRun(`
      DELETE FROM product_batches 
      WHERE product_id NOT IN (SELECT id FROM products)
    `);
    if (cleanedBatches && cleanedBatches.changes > 0) {
      console.log(`Cleaned up ${cleanedBatches.changes} orphaned product batch records.`);
    }

    // Ensure no null stock quantities exist on products
    await dbRun('UPDATE products SET stock_quantity = 0 WHERE stock_quantity IS NULL');
  } catch (err: any) {
    console.error('Failed to run batch safety checks:', err.message);
  }

  // Schema type migration (M1): Ensure products, order_items, and purchase_order_items declare REAL for quantities
  try {
    const prodCols = await dbAll<any>("PRAGMA table_info('products')");
    const stockCol = prodCols.find((c: any) => c.name === 'stock_quantity');
    if (stockCol && stockCol.type.toUpperCase() === 'INTEGER') {
      await dbExec('PRAGMA foreign_keys = OFF');
      await dbRun(`
        CREATE TABLE products_real (
          id TEXT PRIMARY KEY,
          barcode TEXT UNIQUE NOT NULL,
          sku TEXT NOT NULL,
          name TEXT NOT NULL,
          category_id TEXT,
          cost_price REAL DEFAULT 0,
          selling_price REAL NOT NULL,
          mrp REAL NOT NULL,
          stock_quantity REAL DEFAULT 0,
          unit TEXT DEFAULT 'pcs',
          is_quick_pick INTEGER DEFAULT 0,
          batch_number TEXT,
          expiry_date TEXT,
          brand TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_in_inventory INTEGER DEFAULT 0,
          min_stock_level REAL DEFAULT 10,
          shelf_location TEXT,
          FOREIGN KEY (category_id) REFERENCES categories(id)
        )
      `);
      await dbRun(`
        INSERT INTO products_real 
        SELECT id, barcode, sku, name, category_id, cost_price, selling_price, mrp, stock_quantity, unit, is_quick_pick, batch_number, expiry_date, brand, created_at, updated_at, is_in_inventory, min_stock_level, shelf_location 
        FROM products
      `);
      await dbRun('DROP TABLE products');
      await dbRun('ALTER TABLE products_real RENAME TO products');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_quick_pick ON products(is_quick_pick)');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_products_is_in_inventory ON products(is_in_inventory)');
      await dbExec('PRAGMA foreign_keys = ON');
      console.log('Migrated products table schema to REAL stock_quantity.');
    }

    const orderItemCols = await dbAll<any>("PRAGMA table_info('order_items')");
    const qtyCol = orderItemCols.find((c: any) => c.name === 'quantity');
    if (qtyCol && qtyCol.type.toUpperCase() === 'INTEGER') {
      await dbExec('PRAGMA foreign_keys = OFF');
      await dbRun(`
        CREATE TABLE order_items_real (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          barcode TEXT NOT NULL,
          unit_price REAL NOT NULL,
          quantity REAL NOT NULL,
          subtotal REAL NOT NULL,
          mrp REAL DEFAULT 0,
          batch_number TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        )
      `);
      await dbRun(`
        INSERT INTO order_items_real 
        SELECT id, order_id, product_id, product_name, barcode, unit_price, quantity, subtotal, mrp, batch_number 
        FROM order_items
      `);
      await dbRun('DROP TABLE order_items');
      await dbRun('ALTER TABLE order_items_real RENAME TO order_items');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
      await dbExec('PRAGMA foreign_keys = ON');
      console.log('Migrated order_items table schema to REAL quantity.');
    }

    const poItemCols = await dbAll<any>("PRAGMA table_info('purchase_order_items')");
    const poQtyCol = poItemCols.find((c: any) => c.name === 'ordered_quantity');
    if (poQtyCol && poQtyCol.type.toUpperCase() === 'INTEGER') {
      await dbExec('PRAGMA foreign_keys = OFF');
      await dbRun(`
        CREATE TABLE purchase_order_items_real (
          id TEXT PRIMARY KEY,
          po_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          ordered_quantity REAL NOT NULL,
          received_quantity REAL DEFAULT 0,
          cost_price REAL NOT NULL,
          FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
        )
      `);
      await dbRun(`
        INSERT INTO purchase_order_items_real 
        SELECT id, po_id, product_id, product_name, ordered_quantity, received_quantity, cost_price 
        FROM purchase_order_items
      `);
      await dbRun('DROP TABLE purchase_order_items');
      await dbRun('ALTER TABLE purchase_order_items_real RENAME TO purchase_order_items');
      await dbRun('CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id)');
      await dbExec('PRAGMA foreign_keys = ON');
      console.log('Migrated purchase_order_items table schema to REAL ordered_quantity/received_quantity.');
    }
  } catch (err: any) {
    console.error('Schema type migration notice:', err.message);
  }

  console.log('Database initialization & seeding completed successfully.');
}

export default db;
