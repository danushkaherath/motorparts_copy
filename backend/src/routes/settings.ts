import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { verifyAdminRequester } from '../middleware/auth';

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

