import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun } from '../db/database';

export const purchasesRouter = Router();

// Middleware: Check if Procurement module is enabled
async function checkProcurementEnabled(_req: Request, res: Response, next: () => void) {
  const setting = await dbGet('SELECT value FROM settings WHERE key = ?', ['feature_procurement']);
  if (setting?.value !== 'true') {
    res.status(403).json({ error: 'Procurement module is currently disabled in store settings.' });
    return;
  }
  next();
}

purchasesRouter.use(checkProcurementEnabled);

// List all suppliers
purchasesRouter.get('/suppliers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await dbAll('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(suppliers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add supplier
purchasesRouter.post('/suppliers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, contact_name, phone, email, address } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Supplier name is required' });
      return;
    }
    const id = 'sup_' + uuidv4().slice(0, 8);
    await dbRun(
      'INSERT INTO suppliers (id, name, contact_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, contact_name || null, phone || null, email || null, address || null]
    );
    const created = await dbGet('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Purchase Orders
purchasesRouter.get('/orders', async (_req: Request, res: Response): Promise<void> => {
  try {
    const orders = await dbAll('SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT 50');
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Purchase Order
purchasesRouter.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { supplier_id, items, notes } = req.body; // items: [{ product_id, ordered_quantity, cost_price }]
    if (!supplier_id || !items || items.length === 0) {
      res.status(400).json({ error: 'Supplier and order items are required' });
      return;
    }

    const supplier = await dbGet('SELECT name FROM suppliers WHERE id = ?', [supplier_id]);
    if (!supplier) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    // Validate purchase order items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) {
        res.status(400).json({ error: `Item at row ${i + 1} is missing product ID` });
        return;
      }
      const qty = Number(item.ordered_quantity);
      const cost = Number(item.cost_price);
      if (isNaN(qty) || !isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: `Item at row ${i + 1} has invalid quantity: ${item.ordered_quantity}` });
        return;
      }
      if (isNaN(cost) || !isFinite(cost) || cost < 0) {
        res.status(400).json({ error: `Item at row ${i + 1} has invalid cost price: ${item.cost_price}` });
        return;
      }
    }

    const poId = 'po_' + uuidv4().slice(0, 8);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const poNumber = `PO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    let totalCost = 0;
    for (const item of items) {
      totalCost += Number(item.ordered_quantity) * Number(item.cost_price);
    }

    await dbRun(
      `INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, status, total_cost, notes)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
      [poId, poNumber, supplier_id, supplier.name, totalCost, notes || null]
    );

    for (const item of items) {
      const prod = await dbGet('SELECT name FROM products WHERE id = ?', [item.product_id]);
      const itemId = 'poi_' + uuidv4().slice(0, 8);
      await dbRun(
        `INSERT INTO purchase_order_items (id, po_id, product_id, product_name, ordered_quantity, cost_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          poId,
          item.product_id,
          prod?.name || 'Item',
          Number(item.ordered_quantity),
          Number(item.cost_price),
        ]
      );
    }

    res.status(201).json({ success: true, po_id: poId, po_number: poNumber });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Receive Stock against Purchase Order (GRN)
purchasesRouter.post('/orders/:id/receive', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const po = await dbGet('SELECT * FROM purchase_orders WHERE id = ?', [id]);
    if (!po) {
      res.status(404).json({ error: 'Purchase Order not found' });
      return;
    }

    if (po.status === 'RECEIVED') {
      res.status(400).json({ error: 'Purchase Order has already been received' });
      return;
    }

    const items = await dbAll('SELECT * FROM purchase_order_items WHERE po_id = ?', [id]);

    // Increase stock for each item
    for (const item of items) {
      await dbRun(
        `UPDATE products SET 
          stock_quantity = stock_quantity + ?,
          cost_price = ?
         WHERE id = ?`,
        [item.ordered_quantity, item.cost_price, item.product_id]
      );

      await dbRun('UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?', [
        item.ordered_quantity,
        item.id,
      ]);
    }

    const now = new Date().toISOString();
    await dbRun(`UPDATE purchase_orders SET status = 'RECEIVED', received_at = ? WHERE id = ?`, [now, id]);

    res.json({ success: true, message: 'Stock received and inventory updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
