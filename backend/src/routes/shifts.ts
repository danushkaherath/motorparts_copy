import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun, runInTransaction } from '../db/database';

export const shiftsRouter = Router();

// Start a new shift
shiftsRouter.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { cashier_id, cashier_name, opening_float = 0 } = req.body;
    if (!cashier_id || !cashier_name) {
      res.status(400).json({ error: 'Cashier ID and Cashier Name are required' });
      return;
    }

    if (opening_float !== undefined && (isNaN(Number(opening_float)) || !isFinite(Number(opening_float)) || Number(opening_float) < 0)) {
      res.status(400).json({ error: 'Opening float must be a valid non-negative number' });
      return;
    }

    // Check if there is already an open shift on this terminal
    const activeShift = await dbGet(
      `SELECT * FROM shifts WHERE status = 'open' ORDER BY start_time DESC LIMIT 1`
    );

    if (activeShift) {
      res.status(409).json({ 
        error: `A shift is already open on this terminal (Shift #${activeShift.id.slice(-4)} by ${activeShift.cashier_name}). Please close it with a Z-Report before opening a new shift.`,
        shift: activeShift 
      });
      return;
    }

    const shiftId = 'shf_' + uuidv4().slice(0, 8);
    const floatNum = Number(opening_float) || 0;

    await dbRun(
      `INSERT INTO shifts (
        id, cashier_id, cashier_name, opening_float, expected_cash, cash_sales, card_sales, total_sales, status
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'open')`,
      [shiftId, cashier_id, cashier_name, floatNum, floatNum]
    );

    const created = await dbGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    res.status(201).json({ success: true, shift: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current open shift
shiftsRouter.get('/current', async (req: Request, res: Response): Promise<void> => {
  try {
    const { cashier_id } = req.query;
    let shift;
    if (cashier_id) {
      shift = await dbGet(`SELECT * FROM shifts WHERE cashier_id = ? AND status = 'open'`, [cashier_id]);
      if (!shift) {
        // Fallback: If no shift specifically for this cashier, check if there is an active open shift on the terminal
        shift = await dbGet(`SELECT * FROM shifts WHERE status = 'open' ORDER BY start_time DESC LIMIT 1`);
      }
    } else {
      shift = await dbGet(`SELECT * FROM shifts WHERE status = 'open' ORDER BY start_time DESC LIMIT 1`);
    }

    res.json(shift || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// X-Report (Mid-Shift reading without closing)
shiftsRouter.get('/:id/x-report', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const shift = await dbGet('SELECT * FROM shifts WHERE id = ?', [id]);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    // Get non-voided order counts for this shift
    const orderStats = await dbGet<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders WHERE shift_id = ? AND (status IS NULL OR status != 'VOIDED')`,
      [id]
    );

    const storeName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_name']))?.value || 'Grocery POS';

    res.json({
      report_type: 'X-REPORT (MID-SHIFT AUDIT)',
      generated_at: new Date().toISOString(),
      store_name: storeName,
      shift_id: shift.id,
      cashier_name: shift.cashier_name,
      start_time: shift.start_time,
      status: shift.status,
      opening_float: shift.opening_float,
      cash_sales: shift.cash_sales,
      card_sales: shift.card_sales,
      cheque_sales: shift.cheque_sales || 0,
      total_sales: shift.total_sales,
      expected_cash_in_drawer: shift.opening_float + shift.cash_sales,
      transaction_count: orderStats?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Z-Report (Day-End / Shift-End Settlement & Closing)
shiftsRouter.post('/:id/z-report', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actual_cash, notes = '' } = req.body;

    if (actual_cash !== undefined && actual_cash !== null && actual_cash !== '') {
      if (isNaN(Number(actual_cash)) || !isFinite(Number(actual_cash)) || Number(actual_cash) < 0) {
        res.status(400).json({ error: 'Actual cash counted must be a valid non-negative number' });
        return;
      }
    }

    const shift = await dbGet<any>('SELECT * FROM shifts WHERE id = ?', [id]);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    if (shift.status === 'closed') {
      res.status(400).json({ error: 'Shift is already closed' });
      return;
    }

    const countedCash = (actual_cash !== undefined && actual_cash !== null && actual_cash !== '')
      ? Number(actual_cash)
      : (Number(shift.opening_float || 0) + Number(shift.cash_sales || 0));
    const now = new Date().toISOString();
    let expectedCashInDrawer = 0;
    let variance = 0;
    let orderStats: any = null;
    let freshShift: any = null;

    await runInTransaction(async () => {
      freshShift = await dbGet<any>('SELECT * FROM shifts WHERE id = ?', [id]);
      if (!freshShift || freshShift.status === 'closed') {
        const err: any = new Error('Shift is already closed');
        err.statusCode = 400;
        throw err;
      }

      expectedCashInDrawer = Math.round((Number(freshShift.opening_float || 0) + Number(freshShift.cash_sales || 0)) * 100) / 100;
      variance = Math.round((countedCash - expectedCashInDrawer) * 100) / 100;

      await dbRun(
        `UPDATE shifts SET 
          status = 'closed',
          end_time = ?,
          actual_cash = ?,
          expected_cash = ?,
          notes = ?
         WHERE id = ?`,
        [now, countedCash, expectedCashInDrawer, notes, id]
      );

      orderStats = await dbGet<{ count: number }>(
        `SELECT COUNT(*) as count FROM orders WHERE shift_id = ? AND (status IS NULL OR status != 'VOIDED')`,
        [id]
      );
    });

    const storeName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_name']))?.value || 'Grocery POS';

    res.json({
      success: true,
      report_type: 'Z-REPORT (DAY-END SETTLEMENT)',
      generated_at: now,
      store_name: storeName,
      shift_id: freshShift.id,
      cashier_name: freshShift.cashier_name,
      start_time: freshShift.start_time,
      end_time: now,
      opening_float: freshShift.opening_float,
      cash_sales: freshShift.cash_sales,
      card_sales: freshShift.card_sales,
      cheque_sales: freshShift.cheque_sales || 0,
      total_sales: freshShift.total_sales,
      expected_cash_in_drawer: expectedCashInDrawer,
      actual_cash_counted: countedCash,
      cash_variance: variance, // positive = overage, negative = shortage
      variance_status: variance === 0 ? 'BALANCED' : variance > 0 ? 'CASH OVERAGE' : 'CASH SHORTAGE',
      transaction_count: orderStats?.count || 0,
      notes,
    });
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// Shift history
shiftsRouter.get('/history', async (_req: Request, res: Response): Promise<void> => {
  try {
    const shifts = await dbAll('SELECT * FROM shifts ORDER BY start_time DESC LIMIT 50');
    res.json(shifts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
