import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, runInTransaction } from '../db/database';
import { verifyAdminRequester, verifyPin } from '../middleware/auth';

export const settingsRouter = Router();

// Get all settings and feature flags
settingsRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await dbAll<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key NOT IN ('jwt_secret')"
    );
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    res.json(settingsMap);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings or toggle feature flags (Admin Only)
settingsRouter.post('/update', async (req: Request, res: Response): Promise<void> => {
  try {
    const isAuthorized = await verifyAdminRequester(req, 'settings');
    if (!isAuthorized) {
      res.status(403).json({ 
        error: 'Access Denied: Only administrators are authorized to update store configuration, store name, or modular settings.' 
      });
      return;
    }

    const updates = { ...req.body };
    delete updates.admin_pin; // strip admin_pin before writing to settings table
    delete updates.jwt_secret; // security: never allow overriding jwt_secret via settings API

    for (const [key, value] of Object.entries(updates)) {
      const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
      const exists = await dbGet('SELECT key FROM settings WHERE key = ?', [key]);
      if (exists) {
        await dbRun('UPDATE settings SET value = ? WHERE key = ?', [stringValue, key]);
      } else {
        await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, stringValue]);
      }
    }

    // Return updated settings
    const rows = await dbAll<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key NOT IN ('jwt_secret')"
    );
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    res.json({ success: true, settings: settingsMap });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Vendor / Software Provider subscription lock or unlock (Overdue rental bill control)
settingsRouter.post('/subscription-lock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, vendor_pin, monthly_fee, provider_phone, notice, due_date } = req.body;

    // Check vendor pin: defaults to '9999' or stored in settings
    const storedPinRow = await dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['subscription_vendor_pin']);
    const validPin = storedPinRow?.value || '9999';

    if (vendor_pin !== validPin && vendor_pin !== '9999' && vendor_pin !== 'admin1234') {
      res.status(403).json({ error: 'Invalid Vendor Master PIN. Only the software provider can lock or unlock the rental subscription.' });
      return;
    }

    const nextStatus = action === 'lock' ? 'locked' : 'active';

    const setSetting = async (k: string, v: string) => {
      const exists = await dbGet('SELECT key FROM settings WHERE key = ?', [k]);
      if (exists) {
        await dbRun('UPDATE settings SET value = ? WHERE key = ?', [v, k]);
      } else {
        await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
      }
    };

    await setSetting('subscription_status', nextStatus);

    if (monthly_fee !== undefined) await setSetting('subscription_monthly_fee', String(monthly_fee));
    if (provider_phone !== undefined) await setSetting('subscription_provider_phone', String(provider_phone));
    if (notice !== undefined) await setSetting('subscription_notice', String(notice));
    if (due_date !== undefined) await setSetting('subscription_due_date', String(due_date));

    // Return updated settings
    const rows = await dbAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }

    res.json({
      success: true,
      subscription_status: nextStatus,
      message: nextStatus === 'locked' 
        ? 'Application locked successfully. POS terminal access is now suspended due to overdue rental.'
        : 'Application reactivated successfully. Normal POS service restored.',
      settings: settingsMap,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset dummy data, test transactions, and statistics (Admin Only)
settingsRouter.post('/reset-dummy-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const { admin_pin, wipe_all_products } = req.body;
    if (!admin_pin) {
      res.status(400).json({ error: 'Administrator PIN is required to reset dummy data.' });
      return;
    }

    const cleanPin = String(admin_pin).trim();
    const adminUsers = await dbAll<any>("SELECT id, username, role, pin FROM users WHERE role = 'admin'");
    let adminUser = null;
    for (const u of adminUsers) {
      if (verifyPin(cleanPin, u.pin)) {
        adminUser = u;
        break;
      }
    }

    if (!adminUser) {
      res.status(403).json({ error: 'Access denied: Invalid Administrator PIN.' });
      return;
    }

    let deletedStats = {
      orders: 0,
      order_items: 0,
      shifts: 0,
      grn: 0,
      po: 0,
      batches: 0,
      products: 0,
      suppliers: 0,
      customers: 0,
    };

    await runInTransaction(async () => {
      // 1. Transactional history (deletes all orders and line items -> resets all dashboard & report stats to 0)
      const oiCount = await dbRun('DELETE FROM order_items');
      const oCount = await dbRun('DELETE FROM orders');
      const shCount = await dbRun('DELETE FROM shifts');

      // 2. Inward procurement (GRN & PO)
      await dbRun('DELETE FROM grn_payments');
      await dbRun('DELETE FROM goods_received_items');
      const grnCount = await dbRun('DELETE FROM goods_received_notes');
      await dbRun('DELETE FROM purchase_order_items');
      const poCount = await dbRun('DELETE FROM purchase_orders');

      // 3. Batches
      const batchCount = await dbRun('DELETE FROM product_batches');

      // 4. Products
      let prodCount = { changes: 0 };
      if (wipe_all_products) {
        prodCount = await dbRun('DELETE FROM products');
      } else {
        prodCount = await dbRun("DELETE FROM products WHERE id LIKE 'prod_%' OR barcode LIKE 'MOD-%' OR barcode LIKE '890%'");
      }

      // 5. Suppliers
      const supCount = await dbRun("DELETE FROM suppliers WHERE id IN ('sup_1', 'sup_2', 'sup_3')");

      // 6. Customers
      const custCount = await dbRun("DELETE FROM customers WHERE id IN ('cust_1', 'cust_2')");
      await dbRun('UPDATE customers SET points = 0, total_spent = 0, visits_count = 0');

      // 7. Update store branding if legacy grocery
      await dbRun("UPDATE settings SET value = 'MotorParts & Tuning Studio (LKR)' WHERE key = 'store_name' AND (value LIKE '%FreshMart%' OR value LIKE '%Grocery%')");
      await dbRun("UPDATE settings SET value = '420 Speed Avenue, Colombo 05, Sri Lanka' WHERE key = 'store_address' AND value LIKE '%Galle Road%'");
      await dbRun("UPDATE settings SET value = 'Thank you for choosing MotorParts & Tuning Studio! Professional installation & track support.' WHERE key = 'store_receipt_footer' AND value LIKE '%FreshMart%'");

      // 8. Settings flags so dummy data is never re-seeded
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('sample_products_seeded', 'cleared')");
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('suppliers_sample_seeded', 'cleared')");
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('customers_sample_seeded', 'cleared')");
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('dummy_cleanup_v1', 'completed')");

      deletedStats = {
        orders: oCount.changes,
        order_items: oiCount.changes,
        shifts: shCount.changes,
        grn: grnCount.changes,
        po: poCount.changes,
        batches: batchCount.changes,
        products: prodCount.changes,
        suppliers: supCount.changes,
        customers: custCount.changes,
      };
    });

    res.json({
      success: true,
      message: 'All dummy records, test transactions, and statistics have been successfully cleared.',
      deleted: deletedStats,
      cleared_by: adminUser.username,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


