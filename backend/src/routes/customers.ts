import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun, runInTransaction } from '../db/database';

export const customersRouter = Router();

// List & search customers
customersRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    let whereClause = ' WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const pageLimit = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const offset = (pageNum - 1) * pageLimit;

    const countRow = await dbGet<{ count: number }>(`SELECT COUNT(*) as count FROM customers ${whereClause}`, params);
    const total = countRow ? countRow.count : 0;

    const customers = await dbAll(
      `SELECT * FROM customers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageLimit, offset]
    );

    res.json({
      customers,
      total,
      page: pageNum,
      limit: pageLimit,
      totalPages: Math.ceil(total / pageLimit) || 1,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fast lookup by phone for POS Cashier counter
customersRouter.get('/lookup/:phone', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanPhone = String(req.params.phone || '').trim();
    if (!cleanPhone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    // Direct match or partial match
    let customer = await dbGet('SELECT * FROM customers WHERE phone = ?', [cleanPhone]);

    // If no exact match, try stripping leading 0 or adding leading 0
    if (!customer) {
      const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : '0' + cleanPhone;
      customer = await dbGet('SELECT * FROM customers WHERE phone = ?', [altPhone]);
    }

    // Try last 9 digits match
    if (!customer && cleanPhone.length >= 7) {
      customer = await dbGet('SELECT * FROM customers WHERE phone LIKE ? LIMIT 1', [`%${cleanPhone.slice(-7)}`]);
    }

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    res.json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register / Create new customer
customersRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, email = '', address = '', notes = '', initial_points = 0 } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Customer name is required' });
      return;
    }

    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone) {
      res.status(400).json({ error: 'Phone number is required for loyalty identification' });
      return;
    }

    // Check if phone already registered
    const existing = await dbGet('SELECT id, name FROM customers WHERE phone = ?', [cleanPhone]);
    if (existing) {
      res.status(400).json({ error: `Phone number is already registered to "${existing.name}"` });
      return;
    }

    const id = 'cust_' + uuidv4().slice(0, 8);
    await dbRun(
      `INSERT INTO customers (id, name, phone, email, address, notes, points, total_spent, visits_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [id, name.trim(), cleanPhone, email.trim(), address.trim(), notes.trim(), Number(initial_points) || 0]
    );

    const created = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update customer details or adjust points
customersRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, notes, points } = req.body;

    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    if (phone && phone.trim() !== existing.phone) {
      const dup = await dbGet('SELECT id FROM customers WHERE phone = ? AND id != ?', [phone.trim(), id]);
      if (dup) {
        res.status(400).json({ error: 'Another customer is already registered with this phone number' });
        return;
      }
    }

    await dbRun(
      `UPDATE customers SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        notes = COALESCE(?, notes),
        points = COALESCE(?, points),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name ? name.trim() : undefined,
        phone ? phone.trim() : undefined,
        email !== undefined ? email.trim() : undefined,
        address !== undefined ? address.trim() : undefined,
        notes !== undefined ? notes.trim() : undefined,
        points !== undefined ? Number(points) : undefined,
        id,
      ]
    );

    const updated = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// View customer purchase history
customersRouter.get('/:id/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const orders = await dbAll(
      `SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`,
      [id]
    );
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete customer
customersRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customer = await dbGet<any>('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    // Check if customer has linked orders to prevent orphaning transaction history
    const orderRow = await dbGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM orders WHERE customer_id = ?',
      [id]
    );
    const orderCount = orderRow?.count || 0;

    if (orderCount > 0) {
      res.status(400).json({
        error: `Cannot delete customer "${customer.name}": Customer has ${orderCount} linked sales transaction(s). Deleting this customer would orphan past sales and loyalty audit trails.`,
        has_orders: true,
        order_count: orderCount,
      });
      return;
    }

    await runInTransaction(async () => {
      await dbRun('DELETE FROM customers WHERE id = ?', [id]);
    });

    res.json({ success: true, message: `Customer "${customer.name}" deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
