import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun, dbExec, runInTransaction } from '../db/database';

export const grnRouter = Router();

// List all suppliers for Goods Inward (always available)
grnRouter.get('/suppliers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await dbAll('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(suppliers || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add supplier for Goods Inward
grnRouter.post('/suppliers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, contact_name, phone, email, address } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Supplier name is required' });
      return;
    }
    const id = 'sup_' + uuidv4().slice(0, 8);
    await dbRun(
      'INSERT INTO suppliers (id, name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
      [id, String(name).trim(), contact_name || null, phone || null, email || null, address || null]
    );
    const created = await dbGet('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete supplier
grnRouter.delete('/suppliers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Check if any GRN references this supplier
    const hasGrn = await dbGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM goods_received_notes WHERE supplier_id = ?',
      [id]
    );
    if (hasGrn && hasGrn.count > 0) {
      res.status(400).json({ error: 'Cannot delete supplier because existing Goods Received Notes reference this supplier.' });
      return;
    }

    await dbRun('DELETE FROM suppliers WHERE id = ?', [id]);
    res.json({ success: true, message: 'Supplier removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create and process a Goods Received Note (GRN)
grnRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      supplier_id,
      supplier_name,
      invoice_number,
      received_date,
      received_by_id,
      received_by_name,
      notes,
      items,
      payment_method = 'cash',
      payment_due_date,
      paid_amount = 0,
      cheque_number,
      cheque_date,
    } = req.body;

    if (!supplier_name || !String(supplier_name).trim()) {
      res.status(400).json({ error: 'Supplier name is required' });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'GRN must contain at least one received item' });
      return;
    }

    // Validate item fields
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_id) {
        res.status(400).json({ error: `Item at row ${i + 1} is missing product ID` });
        return;
      }
      const qty = Number(it.quantity_received);
      if (isNaN(qty) || qty <= 0) {
        res.status(400).json({ error: `Item "${it.product_name || i + 1}" has invalid quantity: ${it.quantity_received}` });
        return;
      }
      const cost = Number(it.cost_price);
      if (isNaN(cost) || cost < 0) {
        res.status(400).json({ error: `Item "${it.product_name || i + 1}" has invalid cost price: ${it.cost_price}` });
        return;
      }
      const selling = Number(it.selling_price);
      if (isNaN(selling) || selling < 0) {
        res.status(400).json({ error: `Item "${it.product_name || i + 1}" has invalid selling price: ${it.selling_price}` });
        return;
      }
    }

    const grnId = 'grn_' + uuidv4().slice(0, 8);

    const totalItemsCount = items.length;
    let totalQuantity = 0;
    let totalCost = 0;

    for (const it of items) {
      const q = Number(it.quantity_received);
      const c = Number(it.cost_price);
      totalQuantity += q;
      totalCost += q * c;
    }
    totalCost = Math.round(totalCost * 100) / 100;

    const receiptDate = received_date ? String(received_date) : new Date().toISOString();
    const receiverId = received_by_id || (req.headers['x-user-id'] as string) || 'usr_staff';
    const receiverName = received_by_name || 'Store Receiver';

    // Payment fields & status calculation
    const method = payment_method === 'cheque' ? 'cheque' : 'cash';
    const dueDate = payment_due_date ? String(payment_due_date).trim() : null;
    let initialPaid = Math.max(0, Number(paid_amount) || 0);
    if (initialPaid > totalCost) initialPaid = totalCost;
    initialPaid = Math.round(initialPaid * 100) / 100;

    let paymentStatus = 'UNPAID';
    if (initialPaid >= totalCost && totalCost > 0) {
      paymentStatus = 'PAID';
    } else if (initialPaid > 0) {
      paymentStatus = 'PARTIAL';
    }

    // === BEGIN ATOMIC TRANSACTION (Serialized via mutex) ===
    let grnNumber = '';
    await runInTransaction(async () => {
      // Generate unique sequential GRN Number inside the serialized transaction
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = await dbGet<{ count: number }>(
        `SELECT COUNT(*) as count FROM goods_received_notes WHERE date(created_at) = date('now')`
      );
      let seqNum = (countToday?.count || 0) + 1;
      let seq = String(seqNum).padStart(4, '0');
      grnNumber = `GRN-${dateStr}-${seq}`;

      // Guarantee collision-free GRN numbers under concurrent requests or manual entries
      while (await dbGet('SELECT id FROM goods_received_notes WHERE grn_number = ?', [grnNumber])) {
        seqNum++;
        seq = String(seqNum).padStart(4, '0');
        grnNumber = `GRN-${dateStr}-${seq}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 1. Insert GRN Header
      await dbRun(
        `INSERT INTO goods_received_notes (
          id, grn_number, supplier_id, supplier_name, invoice_number, 
          received_date, received_by_id, received_by_name, total_items_count,
          total_quantity, total_cost, notes, status,
          payment_method, payment_status, payment_due_date, paid_amount,
          cheque_number, cheque_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
        [
          grnId,
          grnNumber,
          supplier_id || null,
          String(supplier_name).trim(),
          invoice_number ? String(invoice_number).trim() : null,
          receiptDate,
          receiverId,
          receiverName,
          totalItemsCount,
          totalQuantity,
          totalCost,
          notes ? String(notes).trim() : null,
          method,
          paymentStatus,
          dueDate,
          initialPaid,
          cheque_number ? String(cheque_number).trim() : null,
          cheque_date ? String(cheque_date).trim() : null,
        ]
      );

      // If initial payment was made upon delivery, record into grn_payments
      if (initialPaid > 0) {
        const paymentId = 'pay_' + uuidv4().slice(0, 8);
        await dbRun(
          `INSERT INTO grn_payments (
            id, grn_id, payment_date, amount, payment_method,
            cheque_number, cheque_date, notes, recorded_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentId,
            grnId,
            receiptDate,
            initialPaid,
            method,
            cheque_number ? String(cheque_number).trim() : null,
            cheque_date ? String(cheque_date).trim() : null,
            'Initial delivery payment',
            receiverName,
          ]
        );
      }

      // 2. Insert Items and Update Stock & Batches
      for (const it of items) {
        const itemId = 'gri_' + uuidv4().slice(0, 8);
        const qty = Number(it.quantity_received);
        const costPrice = Number(it.cost_price);
        const sellingPrice = Number(it.selling_price);
        const mrp = it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : sellingPrice;
        const lineTotal = Math.round(qty * costPrice * 100) / 100;
        const batchNum = it.batch_number ? String(it.batch_number).trim() : '';
        const expiry = it.expiry_date ? String(it.expiry_date).trim() : null;
        const shelf = it.shelf_location ? String(it.shelf_location).trim() : null;

        // Insert line item
        await dbRun(
          `INSERT INTO goods_received_items (
            id, grn_id, product_id, product_name, barcode, batch_number,
            expiry_date, shelf_location, quantity_received, cost_price,
            selling_price, mrp, subtotal_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            grnId,
            it.product_id,
            it.product_name,
            it.barcode || null,
            batchNum || null,
            expiry,
            shelf,
            qty,
            costPrice,
            sellingPrice,
            mrp,
            lineTotal,
          ]
        );

        // Fetch existing product
        const existingProd = await dbGet<any>('SELECT * FROM products WHERE id = ?', [it.product_id]);
        if (!existingProd) {
          throw new Error(`Product not found: ${it.product_id}`);
        }

        let newTotalStock = (Number(existingProd.stock_quantity) || 0) + qty;

        // Batch management
        if (batchNum) {
          const existingBatch = await dbGet<any>(
            'SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ?',
            [it.product_id, batchNum]
          );

          if (existingBatch) {
            await dbRun(
              `UPDATE product_batches SET 
                stock_quantity = stock_quantity + ?,
                cost_price = ?,
                selling_price = ?,
                mrp = ?,
                expiry_date = COALESCE(?, expiry_date),
                shelf_location = COALESCE(?, shelf_location),
                updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [qty, costPrice, sellingPrice, mrp, expiry, shelf, existingBatch.id]
            );
          } else {
            const batchId = 'batch_' + uuidv4().slice(0, 8);
            await dbRun(
              `INSERT INTO product_batches (
                id, product_id, batch_number, cost_price, selling_price,
                mrp, stock_quantity, expiry_date, shelf_location
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(product_id, batch_number) DO UPDATE SET 
                stock_quantity = product_batches.stock_quantity + excluded.stock_quantity,
                cost_price = excluded.cost_price,
                selling_price = excluded.selling_price,
                mrp = excluded.mrp,
                expiry_date = COALESCE(excluded.expiry_date, product_batches.expiry_date),
                shelf_location = COALESCE(excluded.shelf_location, product_batches.shelf_location),
                updated_at = CURRENT_TIMESTAMP`,
              [batchId, it.product_id, batchNum, costPrice, sellingPrice, mrp, qty, expiry, shelf]
            );
          }
        }

        // Update product master record
        await dbRun(
          `UPDATE products SET 
            is_in_inventory = 1,
            stock_quantity = ?,
            cost_price = ?,
            selling_price = ?,
            mrp = ?,
            batch_number = COALESCE(?, batch_number),
            expiry_date = COALESCE(?, expiry_date),
            shelf_location = COALESCE(?, shelf_location),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newTotalStock, costPrice, sellingPrice, mrp, batchNum || null, expiry, shelf, it.product_id]
        );
      }
    });
    // === END ATOMIC TRANSACTION ===

    // Return the newly created GRN
    const createdGrn = await dbGet('SELECT * FROM goods_received_notes WHERE id = ?', [grnId]);
    const createdItems = await dbAll('SELECT * FROM goods_received_items WHERE grn_id = ?', [grnId]);

    res.status(201).json({
      success: true,
      message: `Goods Received Note #${grnNumber} generated and inventory updated successfully.`,
      grn: {
        ...createdGrn,
        items: createdItems,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process GRN' });
  }
});

// List all GRNs with search, date filters, and payment status filters
grnRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search = '',
      from_date,
      to_date,
      payment_status,
      due_filter,
      limit = 50,
      offset = 0,
    } = req.query;

    let query = 'SELECT * FROM goods_received_notes WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND (grn_number LIKE ? OR supplier_name LIKE ? OR invoice_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (from_date) {
      query += ' AND date(received_date) >= date(?)';
      params.push(String(from_date));
    }

    if (to_date) {
      query += ' AND date(received_date) <= date(?)';
      params.push(String(to_date));
    }

    if (payment_status && payment_status !== 'ALL') {
      query += ' AND payment_status = ?';
      params.push(String(payment_status));
    }

    if (due_filter === 'due_soon') {
      // Due within next 3 days and unpaid
      query += ` AND payment_status != 'PAID' AND payment_due_date IS NOT NULL AND date(payment_due_date) >= date('now') AND date(payment_due_date) <= date('now', '+3 days')`;
    } else if (due_filter === 'overdue') {
      // Due date passed and unpaid
      query += ` AND payment_status != 'PAID' AND payment_due_date IS NOT NULL AND date(payment_due_date) < date('now')`;
    } else if (due_filter === 'all_due') {
      // Either due soon or overdue
      query += ` AND payment_status != 'PAID' AND payment_due_date IS NOT NULL AND date(payment_due_date) <= date('now', '+3 days')`;
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit) || 50, Number(offset) || 0);

    const grns = await dbAll<any>(query, params);

    const countRow = await dbGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM goods_received_notes'
    );

    res.json({
      grns,
      total: countRow?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// System Triggered Reminders: Unpaid / Partial deliveries due within 3 days or overdue
grnRouter.get('/due-reminders', async (_req: Request, res: Response): Promise<void> => {
  try {
    const reminders = await dbAll<any>(
      `SELECT * FROM goods_received_notes 
       WHERE payment_status != 'PAID' 
         AND payment_due_date IS NOT NULL 
         AND date(payment_due_date) <= date('now', '+3 days')
       ORDER BY date(payment_due_date) ASC`
    );

    res.json(reminders || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get GRN Summary Stats & Payment Due KPI Breakdown
grnRouter.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const totalGrns = await dbGet<{ count: number; total_spend: number }>(
      'SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_spend FROM goods_received_notes'
    );
    const todayGrns = await dbGet<{ count: number; total_spend: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_spend FROM goods_received_notes WHERE date(created_at) = date('now')`
    );
    const monthGrns = await dbGet<{ count: number; total_spend: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_spend FROM goods_received_notes WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    );

    // Payment due metrics
    const dueSoon = await dbGet<{ count: number; total_balance: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cost - paid_amount), 0) as total_balance 
       FROM goods_received_notes 
       WHERE payment_status != 'PAID' 
         AND payment_due_date IS NOT NULL 
         AND date(payment_due_date) >= date('now') 
         AND date(payment_due_date) <= date('now', '+3 days')`
    );

    const overdue = await dbGet<{ count: number; total_balance: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cost - paid_amount), 0) as total_balance 
       FROM goods_received_notes 
       WHERE payment_status != 'PAID' 
         AND payment_due_date IS NOT NULL 
         AND date(payment_due_date) < date('now')`
    );

    const unpaidTotal = await dbGet<{ count: number; total_balance: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cost - paid_amount), 0) as total_balance 
       FROM goods_received_notes 
       WHERE payment_status != 'PAID'`
    );

    res.json({
      all_time: {
        count: totalGrns?.count || 0,
        spend: totalGrns?.total_spend || 0,
      },
      today: {
        count: todayGrns?.count || 0,
        spend: todayGrns?.total_spend || 0,
      },
      this_month: {
        count: monthGrns?.count || 0,
        spend: monthGrns?.total_spend || 0,
      },
      payments: {
        due_soon_count: dueSoon?.count || 0,
        due_soon_balance: dueSoon?.total_balance || 0,
        overdue_count: overdue?.count || 0,
        overdue_balance: overdue?.total_balance || 0,
        total_unpaid_count: unpaidTotal?.count || 0,
        total_unpaid_balance: unpaidTotal?.total_balance || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Record Payment on a GRN (Full or Partial, with optional Due Date adjustment)
grnRouter.post('/:id/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      amount,
      payment_method = 'cash',
      cheque_number,
      cheque_date,
      new_payment_due_date,
      notes,
    } = req.body;

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than 0' });
      return;
    }

    const grn = await dbGet<any>(
      'SELECT * FROM goods_received_notes WHERE id = ? OR grn_number = ?',
      [id, id]
    );

    if (!grn) {
      res.status(404).json({ error: 'Goods Received Note not found' });
      return;
    }

    const totalCost = Number(grn.total_cost) || 0;
    const currentPaid = Number(grn.paid_amount) || 0;
    const remainingBalance = Math.max(0, Math.round((totalCost - currentPaid) * 100) / 100);

    if (payAmount > remainingBalance + 0.01) {
      res.status(400).json({
        error: `Payment amount (${payAmount}) exceeds remaining balance (${remainingBalance})`,
      });
      return;
    }

    const receiverName =
      (req.headers['x-user-name'] as string) ||
      (req.headers['x-user-id'] as string) ||
      'Store Admin';
    const paymentId = 'pay_' + uuidv4().slice(0, 8);
    const method = payment_method === 'cheque' ? 'cheque' : 'cash';

    let updatedGrn: any = null;
    let payments: any[] = [];
    let newStatus = 'PARTIAL';

    await runInTransaction(async () => {
      // 1. Insert Payment Record
      await dbRun(
        `INSERT INTO grn_payments (
          id, grn_id, payment_date, amount, payment_method,
          cheque_number, cheque_date, notes, recorded_by_name
        ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          grn.id,
          payAmount,
          method,
          cheque_number ? String(cheque_number).trim() : null,
          cheque_date ? String(cheque_date).trim() : null,
          notes ? String(notes).trim() : null,
          receiverName,
        ]
      );

      // 2. Recalculate total paid
      const sumRow = await dbGet<{ total: number }>(
        'SELECT SUM(amount) as total FROM grn_payments WHERE grn_id = ?',
        [grn.id]
      );
      const newPaid = Math.round((sumRow?.total || currentPaid + payAmount) * 100) / 100;

      if (newPaid >= totalCost) {
        newStatus = 'PAID';
      } else if (newPaid <= 0) {
        newStatus = 'UNPAID';
      }

      // Update Due Date if adjusted on partial payment
      let updatedDueDate = grn.payment_due_date;
      if (new_payment_due_date && String(new_payment_due_date).trim()) {
        updatedDueDate = String(new_payment_due_date).trim();
      }

      await dbRun(
        `UPDATE goods_received_notes SET 
          paid_amount = ?,
          payment_status = ?,
          payment_due_date = ?,
          payment_method = ?,
          cheque_number = COALESCE(?, cheque_number),
          cheque_date = COALESCE(?, cheque_date)
         WHERE id = ?`,
        [
          newPaid,
          newStatus,
          updatedDueDate,
          method,
          cheque_number ? String(cheque_number).trim() : null,
          cheque_date ? String(cheque_date).trim() : null,
          grn.id,
        ]
      );

      updatedGrn = await dbGet('SELECT * FROM goods_received_notes WHERE id = ?', [grn.id]);
      payments = await dbAll(
        'SELECT * FROM grn_payments WHERE grn_id = ? ORDER BY payment_date ASC',
        [grn.id]
      );
    });

    res.json({
      success: true,
      message: `Payment of ${payAmount} recorded successfully. Status: ${newStatus}`,
      grn: updatedGrn,
      payments,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Payment History for a GRN
grnRouter.get('/:id/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const grn = await dbGet<any>(
      'SELECT id FROM goods_received_notes WHERE id = ? OR grn_number = ?',
      [id, id]
    );
    if (!grn) {
      res.status(404).json({ error: 'Goods Received Note not found' });
      return;
    }

    const payments = await dbAll(
      'SELECT * FROM grn_payments WHERE grn_id = ? ORDER BY payment_date ASC',
      [grn.id]
    );
    res.json(payments || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single GRN by ID with full item details & payment history for report rendering
grnRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const grn = await dbGet<any>(
      'SELECT * FROM goods_received_notes WHERE id = ? OR grn_number = ?',
      [id, id]
    );

    if (!grn) {
      res.status(404).json({ error: 'Goods Received Note not found' });
      return;
    }

    const items = await dbAll<any>(
      'SELECT * FROM goods_received_items WHERE grn_id = ? ORDER BY id ASC',
      [grn.id]
    );

    const payments = await dbAll<any>(
      'SELECT * FROM grn_payments WHERE grn_id = ? ORDER BY payment_date ASC',
      [grn.id]
    );

    // Fetch store configuration for printable report
    const storeName =
      (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_name']))?.value ||
      'MotorParts & Tuning Studio';
    const storeAddress =
      (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_address']))?.value || '';
    const storePhone =
      (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_phone']))?.value || '';
    const currency =
      (await dbGet('SELECT value FROM settings WHERE key = ?', ['currency_symbol']))?.value ||
      'Rs.';

    res.json({
      grn: {
        ...grn,
        items,
        payments: payments || [],
      },
      store_config: {
        store_name: storeName,
        store_address: storeAddress,
        store_phone: storePhone,
        currency,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
