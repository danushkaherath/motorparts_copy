import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { dbAll, dbGet, dbRun, dbExec, runInTransaction } from '../db/database';
import { verifyAdminRequester, extractTokenUser, verifyPin } from '../middleware/auth';

export const productsRouter = Router();

// Download sample CSV dataset
productsRouter.get('/sample-csv', (_req: Request, res: Response): void => {
  const filePath = path.join(__dirname, '..', '..', 'data', 'sample_products.csv');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Sample file not found');
  }
});

// Fast barcode and product lookup for cashier terminal
productsRouter.get('/barcode/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanCode = String(req.params.code || '').trim();
    if (!cleanCode) {
      res.status(400).json({ error: 'Code or name is required' });
      return;
    }

    // 1. Exact barcode or SKU match
    let product = await dbGet(
      `SELECT p.*, c.name as category_name, c.color as category_color 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.barcode = ? OR p.sku = ?`,
      [cleanCode, cleanCode]
    );

    // 2. Trim leading zero / add leading zero for standard GTIN/UPC variants
    if (!product && /^\d+$/.test(cleanCode)) {
      const altCode = cleanCode.startsWith('0') ? cleanCode.slice(1) : '0' + cleanCode;
      product = await dbGet(
        `SELECT p.*, c.name as category_name, c.color as category_color 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.barcode = ? OR p.sku = ?`,
        [altCode, altCode]
      );
    }

    // 3. Exact name match (case-insensitive)
    if (!product) {
      product = await dbGet(
        `SELECT p.*, c.name as category_name, c.color as category_color 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.name = ? COLLATE NOCASE`,
        [cleanCode]
      );
    }

    // 4. Closest partial name match
    if (!product && cleanCode.length >= 2) {
      product = await dbGet(
        `SELECT p.*, c.name as category_name, c.color as category_color 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.name LIKE ? 
         ORDER BY (p.name LIKE ?) DESC, p.name ASC 
         LIMIT 1`,
        [`%${cleanCode}%`, `${cleanCode}%`]
      );
    }

    if (!product) {
      res.status(404).json({ error: 'Product not found for: ' + cleanCode });
      return;
    }

    // Attach active batches for this product if any
    const batches = await dbAll(
      `SELECT * FROM product_batches WHERE product_id = ? AND stock_quantity > 0 ORDER BY created_at ASC`,
      [product.id]
    );
    product.batches = batches || [];

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Quick-pick items for fast touch grid
productsRouter.get('/quick-picks', async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await dbAll<any>(
      `SELECT p.*, c.name as category_name, c.color as category_color 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.is_quick_pick = 1 
       ORDER BY p.name ASC`
    );

    for (const p of products) {
      const batches = await dbAll(
        `SELECT * FROM product_batches WHERE product_id = ? AND stock_quantity > 0 ORDER BY created_at ASC`,
        [p.id]
      );
      p.batches = batches || [];
    }

    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Categories list (supports has_products filter to exclude empty categories)
productsRouter.get('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const { has_products } = req.query;
    let query = 'SELECT * FROM categories ORDER BY name ASC';
    if (has_products === 'true') {
      query = `
        SELECT c.* 
        FROM categories c 
        INNER JOIN products p ON c.id = p.category_id 
        GROUP BY c.id 
        ORDER BY c.name ASC
      `;
    }
    const categories = await dbAll(query);
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Search & list products (with server-side pagination and indexing)
productsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, category_id, low_stock, expiring_soon, page, limit, all, in_inventory } = req.query;
    let whereClause = ' WHERE 1=1';
    const params: any[] = [];

    if (in_inventory === 'true') {
      whereClause += ` AND (p.is_in_inventory = 1 OR p.stock_quantity > 0)`;
    } else if (in_inventory === 'false') {
      whereClause += ` AND (p.is_in_inventory = 0 AND (p.stock_quantity IS NULL OR p.stock_quantity = 0))`;
    }

    if (search) {
      whereClause += ` AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (category_id) {
      whereClause += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (low_stock === 'true') {
      whereClause += ` AND (p.is_in_inventory = 1 OR p.stock_quantity > 0) AND p.stock_quantity <= COALESCE(p.min_stock_level, 10)`;
    }

    if (expiring_soon === 'true') {
      // items expiring in next 14 days
      whereClause += ` AND (p.is_in_inventory = 1 OR p.stock_quantity > 0) AND p.expiry_date IS NOT NULL AND date(p.expiry_date) <= date('now', '+14 days')`;
    }

    const isPaginated = page !== undefined || limit !== undefined || req.query.paginated === 'true';

    // Paginated response mode
    if (isPaginated && all !== 'true') {
      const pageNum = Math.max(1, parseInt(String(page || '1'), 10));
      const pageLimit = Math.min(200, Math.max(1, parseInt(String(limit || '50'), 10)));
      const offset = (pageNum - 1) * pageLimit;

      // Fast count query
      const countSql = `SELECT COUNT(*) as count FROM products p ${whereClause}`;
      const countRow = await dbGet<{ count: number }>(countSql, params);
      const total = countRow ? countRow.count : 0;

      const query = `
        SELECT p.*, c.name as category_name, c.color as category_color 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        ${whereClause}
        ORDER BY p.name ASC
        LIMIT ? OFFSET ?
      `;
      const products = await dbAll(query, [...params, pageLimit, offset]);

      res.json({
        products,
        total,
        page: pageNum,
        limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit) || 1,
      });
      return;
    }

    // Non-paginated or export mode
    let query = `
      SELECT p.*, c.name as category_name, c.color as category_color 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ${whereClause}
      ORDER BY p.name ASC
    `;
    
    // If not explicitly requesting all, apply safety limit of 50 to prevent DOM freeze
    if (all !== 'true') {
      query += ` LIMIT 50`;
    }

    const products = await dbAll(query, params);
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Inventory Summary / KPIs (Only for in-store inventory)
productsRouter.get('/inventory/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await dbGet<{
      total_items: number;
      total_units: number;
      cost_valuation: number;
      retail_valuation: number;
      low_stock_count: number;
      expiring_count: number;
    }>(`
      SELECT 
        COUNT(CASE WHEN is_in_inventory = 1 OR stock_quantity > 0 THEN 1 END) as total_items,
        COALESCE(SUM(CASE WHEN is_in_inventory = 1 OR stock_quantity > 0 THEN stock_quantity ELSE 0 END), 0) as total_units,
        COALESCE(SUM(CASE WHEN is_in_inventory = 1 OR stock_quantity > 0 THEN cost_price * stock_quantity ELSE 0 END), 0) as cost_valuation,
        COALESCE(SUM(CASE WHEN is_in_inventory = 1 OR stock_quantity > 0 THEN selling_price * stock_quantity ELSE 0 END), 0) as retail_valuation,
        COUNT(CASE WHEN (is_in_inventory = 1 OR stock_quantity > 0) AND stock_quantity <= COALESCE(min_stock_level, 10) THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN (is_in_inventory = 1 OR stock_quantity > 0) AND expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+14 days') THEN 1 END) as expiring_count
      FROM products
    `);

    res.json(stats || {
      total_items: 0,
      total_units: 0,
      cost_valuation: 0,
      retail_valuation: 0,
      low_stock_count: 0,
      expiring_count: 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Adjust stock quantity (+ / - / set) and update prices/batches
productsRouter.post('/inventory/adjust', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      product_id, 
      type, 
      amount, 
      notes, 
      batch_number, 
      expiry_date, 
      shelf_location,
      cost_price,
      selling_price,
      mrp,
      is_new_batch,
    } = req.body;

    if (!product_id || amount === undefined || amount === null || (typeof amount === 'string' && amount.trim() === '')) {
      res.status(400).json({ error: 'Product ID and valid adjustment amount are required' });
      return;
    }

    const product = await dbGet<any>('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const qty = Number(amount);
    if (isNaN(qty) || !isFinite(qty) || qty < 0 || (qty === 0 && type !== 'AUDIT_COUNT' && type !== 'SET')) {
      res.status(400).json({ error: 'Adjustment amount must be a valid positive number' });
      return;
    }

    if (cost_price !== undefined && (isNaN(Number(cost_price)) || !isFinite(Number(cost_price)) || Number(cost_price) < 0)) {
      res.status(400).json({ error: 'Cost price must be a non-negative number' });
      return;
    }
    if (selling_price !== undefined && (isNaN(Number(selling_price)) || !isFinite(Number(selling_price)) || Number(selling_price) < 0)) {
      res.status(400).json({ error: 'Selling price must be a non-negative number' });
      return;
    }
    if (mrp !== undefined && (isNaN(Number(mrp)) || !isFinite(Number(mrp)) || Number(mrp) < 0)) {
      res.status(400).json({ error: 'MRP must be a non-negative number' });
      return;
    }

    let newStock = Number(product.stock_quantity || 0);
    const newCost = cost_price !== undefined ? Number(cost_price) : product.cost_price;
    const newSelling = selling_price !== undefined ? Number(selling_price) : product.selling_price;
    const newMrp = mrp !== undefined ? Number(mrp) : product.mrp;
    const batchNum = batch_number ? String(batch_number).trim() : '';

    await runInTransaction(async () => {
      if (type === 'AUDIT_COUNT' || type === 'SET') {
        newStock = Math.max(0, qty);
      } else if (type === 'DAMAGE' || type === 'SPOILAGE') {
        newStock = Math.max(0, newStock - qty);
      } else {
        // RESTOCK or ADD
        newStock = newStock + qty;
      }

      if (batchNum) {
        const existingBatch = await dbGet<any>(
          'SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ?',
          [product_id, batchNum]
        );

        if (existingBatch && !is_new_batch) {
          const oldBatchStock = Number(existingBatch.stock_quantity || 0);
          let batchStock = oldBatchStock;
          if (type === 'AUDIT_COUNT' || type === 'SET') {
            batchStock = Math.max(0, qty);
          } else if (type === 'DAMAGE' || type === 'SPOILAGE') {
            batchStock = Math.max(0, batchStock - qty);
          } else {
            batchStock = batchStock + qty;
          }
          const delta = batchStock - oldBatchStock;
          newStock = Math.max(0, Number(product.stock_quantity || 0) + delta);

          await dbRun(`
            UPDATE product_batches SET 
              stock_quantity = ?,
              cost_price = ?,
              selling_price = ?,
              mrp = ?,
              expiry_date = COALESCE(?, expiry_date),
              shelf_location = COALESCE(?, shelf_location),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [batchStock, newCost, newSelling, newMrp, expiry_date || null, shelf_location || null, existingBatch.id]);
        } else if (existingBatch && is_new_batch) {
          const oldBatchStock = Number(existingBatch.stock_quantity || 0);
          const batchStock = oldBatchStock + qty;
          newStock = Number(product.stock_quantity || 0) + qty;
          await dbRun(`
            UPDATE product_batches SET 
              stock_quantity = ?,
              cost_price = ?,
              selling_price = ?,
              mrp = ?,
              expiry_date = COALESCE(?, expiry_date),
              shelf_location = COALESCE(?, shelf_location),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [batchStock, newCost, newSelling, newMrp, expiry_date || null, shelf_location || null, existingBatch.id]);
        } else {
          const batchId = 'batch_' + uuidv4().slice(0, 8);
          await dbRun(`
            INSERT INTO product_batches (
              id, product_id, batch_number, cost_price, selling_price, mrp, stock_quantity, expiry_date, shelf_location
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(product_id, batch_number) DO UPDATE SET 
              stock_quantity = product_batches.stock_quantity + excluded.stock_quantity,
              cost_price = excluded.cost_price,
              selling_price = excluded.selling_price,
              mrp = excluded.mrp,
              expiry_date = COALESCE(excluded.expiry_date, product_batches.expiry_date),
              shelf_location = COALESCE(excluded.shelf_location, product_batches.shelf_location),
              updated_at = CURRENT_TIMESTAMP
          `, [batchId, product_id, batchNum, newCost, newSelling, newMrp, qty, expiry_date || null, shelf_location || null]);
          newStock = Number(product.stock_quantity || 0) + qty;
        }
      }

      await dbRun(`
        UPDATE products SET 
          stock_quantity = ?, 
          is_in_inventory = 1,
          cost_price = ?,
          selling_price = ?,
          mrp = ?,
          batch_number = COALESCE(?, batch_number),
          expiry_date = COALESCE(?, expiry_date),
          shelf_location = COALESCE(?, shelf_location),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newStock, newCost, newSelling, newMrp, batchNum || null, expiry_date || null, shelf_location || null, product_id]);
    });

    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    res.json({
      success: true,
      message: `Stock updated to ${newStock} for "${product.name}"`,
      product: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset entire store inventory stock to Catalog Only (sets all to is_in_inventory = 0, stock_quantity = 0 and clears batches)
productsRouter.post('/inventory/reset-to-catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const isAuthorized = await verifyAdminRequester(req, 'settings');
    if (!isAuthorized) {
      res.status(403).json({ error: 'Access denied: Valid Administrator authorization required.' });
      return;
    }

    const tokenUser = extractTokenUser(req);
    const resetBy = tokenUser?.username || 'admin';

    const countRow = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE is_in_inventory = 1 OR stock_quantity > 0');
    const affectedCount = countRow ? countRow.count : 0;

    await runInTransaction(async () => {
      // 1. Reset all product inventory flags and stock
      await dbRun(`
        UPDATE products SET 
          is_in_inventory = 0, 
          stock_quantity = 0,
          updated_at = CURRENT_TIMESTAMP
      `);

      // 2. Remove all active batch stock records to prevent orphaned batch inventory
      await dbRun('DELETE FROM product_batches');
    });

    res.json({
      success: true,
      message: `Successfully reset store inventory. ${affectedCount} products converted to Catalog Only with 0 stock, and all inventory batches cleared.`,
      affected_count: affectedCount,
      reset_by: resetBy,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Stock update from physical count CSV (array of { barcode, stock_quantity, batch_number, expiry_date, shelf_location })
productsRouter.post('/inventory/bulk-stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, mode = 'SET' } = req.body; // mode: 'SET' (stocktake) or 'ADD' (receiving)
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Array of stock items is required' });
      return;
    }

    let updated = 0;
    let notFound = 0;

    await runInTransaction(async () => {
      for (const item of items) {
        const rawBarcode = String(item.barcode || item.Barcode || item['Product Code'] || '').trim();
        if (!rawBarcode) continue;

        let barcode = rawBarcode;
        if (rawBarcode.includes('E+') || rawBarcode.includes('e+')) {
          const num = Number(rawBarcode);
          if (!isNaN(num)) barcode = BigInt(Math.round(num)).toString();
        }

        const rawStock = Number(item.stock_quantity ?? item.stock ?? item.Quantity ?? item.qty ?? 0);
        const stockQty = (isNaN(rawStock) || !isFinite(rawStock) || rawStock < 0) ? 0 : rawStock;
        const batchNum = item.batch_number ? String(item.batch_number).trim() : (item.batch ? String(item.batch).trim() : null);
        const expDate = item.expiry_date || item.expiry || null;
        const shelf = item.shelf_location || item.shelf || null;
        const rawMinStock = item.min_stock_level !== undefined && item.min_stock_level !== null ? Number(item.min_stock_level) : null;
        const minStock = (rawMinStock !== null && !isNaN(rawMinStock) && isFinite(rawMinStock) && rawMinStock >= 0) ? rawMinStock : null;

        const existing = await dbGet<any>('SELECT * FROM products WHERE barcode = ?', [barcode]);
        if (!existing) {
          notFound++;
          continue;
        }

        const targetStock = mode === 'ADD' ? (Number(existing.stock_quantity || 0) + stockQty) : stockQty;

        // Synchronize batch records if batch number is provided
        if (batchNum) {
          const existingBatch = await dbGet<any>(
            'SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ?',
            [existing.id, batchNum]
          );

          if (existingBatch) {
            const batchTarget = mode === 'ADD' ? (Number(existingBatch.stock_quantity || 0) + stockQty) : stockQty;
            await dbRun(`
              UPDATE product_batches SET 
                stock_quantity = ?,
                expiry_date = COALESCE(?, expiry_date),
                shelf_location = COALESCE(?, shelf_location),
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [batchTarget, expDate, shelf, existingBatch.id]);
          } else {
            const batchId = 'batch_' + uuidv4().slice(0, 8);
            await dbRun(`
              INSERT INTO product_batches (
                id, product_id, batch_number, cost_price, selling_price, mrp, stock_quantity, expiry_date, shelf_location
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(product_id, batch_number) DO UPDATE SET 
                stock_quantity = excluded.stock_quantity,
                expiry_date = COALESCE(excluded.expiry_date, product_batches.expiry_date),
                shelf_location = COALESCE(excluded.shelf_location, product_batches.shelf_location),
                updated_at = CURRENT_TIMESTAMP
            `, [
              batchId,
              existing.id,
              batchNum,
              Number(existing.cost_price || 0),
              Number(existing.selling_price || 0),
              Number(existing.mrp || existing.selling_price || 0),
              stockQty,
              expDate,
              shelf,
            ]);
          }
        } else {
          // If no batch number specified in stocktake row:
          // 1. If physical count is set to 0, zero out any active batches
          if (mode === 'SET' && targetStock === 0) {
            await dbRun('UPDATE product_batches SET stock_quantity = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?', [existing.id]);
          } else if (mode === 'SET') {
            // If product has exactly 1 active batch, update that batch count to targetStock
            const activeBatches = await dbAll<any>(
              'SELECT * FROM product_batches WHERE product_id = ? ORDER BY created_at DESC',
              [existing.id]
            );
            if (activeBatches.length === 1) {
              await dbRun(
                'UPDATE product_batches SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [targetStock, activeBatches[0].id]
              );
            }
          } else if (mode === 'ADD' && existing.batch_number) {
            // If mode is ADD and product has a tracked batch_number, increment it
            await dbRun(
              'UPDATE product_batches SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND batch_number = ?',
              [stockQty, existing.id, existing.batch_number]
            );
          }
        }

        await dbRun(`
          UPDATE products SET 
            is_in_inventory = 1,
            stock_quantity = ?,
            batch_number = COALESCE(?, batch_number),
            expiry_date = COALESCE(?, expiry_date),
            shelf_location = COALESCE(?, shelf_location),
            min_stock_level = COALESCE(?, min_stock_level),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [targetStock, batchNum, expDate, shelf, minStock, existing.id]);

        updated++;
      }
    });

    res.json({
      success: true,
      message: `Stock updated for ${updated} items in store inventory. (${notFound} barcodes not found in catalog)`,
      updated,
      not_found: notFound,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add or update an item in Store Inventory
productsRouter.post('/:id/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      stock_quantity = 0, 
      min_stock_level = 10, 
      batch_number, 
      expiry_date, 
      shelf_location,
      cost_price,
      selling_price,
      mrp,
      is_new_batch,
    } = req.body;

    const product = await dbGet<any>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    if (stock_quantity === null || stock_quantity === undefined || (typeof stock_quantity === 'string' && stock_quantity.trim() === '')) {
      res.status(400).json({ error: 'Stock quantity is required' });
      return;
    }
    const qty = Number(stock_quantity);
    if (isNaN(qty) || !isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: 'Stock quantity to add must be a positive number' });
      return;
    }
    const parsedMinStock = min_stock_level !== undefined ? Number(min_stock_level) : 10;
    if (isNaN(parsedMinStock) || !isFinite(parsedMinStock) || parsedMinStock < 0) {
      res.status(400).json({ error: 'Min stock level must be a non-negative number' });
      return;
    }
    if (cost_price !== undefined && (isNaN(Number(cost_price)) || !isFinite(Number(cost_price)) || Number(cost_price) < 0)) {
      res.status(400).json({ error: 'Cost price must be a non-negative number' });
      return;
    }
    if (selling_price !== undefined && (isNaN(Number(selling_price)) || !isFinite(Number(selling_price)) || Number(selling_price) < 0)) {
      res.status(400).json({ error: 'Selling price must be a non-negative number' });
      return;
    }
    if (mrp !== undefined && (isNaN(Number(mrp)) || !isFinite(Number(mrp)) || Number(mrp) < 0)) {
      res.status(400).json({ error: 'MRP must be a non-negative number' });
      return;
    }

    const newCost = cost_price !== undefined ? Number(cost_price) : product.cost_price;
    const newSelling = selling_price !== undefined ? Number(selling_price) : product.selling_price;
    const newMrp = mrp !== undefined ? Number(mrp) : product.mrp;
    const batchNum = batch_number ? String(batch_number).trim() : '';

    await runInTransaction(async () => {
      let newTotalStock = (Number(product.stock_quantity || 0) + qty);

      if (batchNum) {
        const existingBatch = await dbGet<any>(
          'SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ?',
          [id, batchNum]
        );

        if (existingBatch && !is_new_batch) {
          const updatedBatchStock = (existingBatch.stock_quantity || 0) + qty;
          await dbRun(`
            UPDATE product_batches SET 
              stock_quantity = ?,
              cost_price = ?,
              selling_price = ?,
              mrp = ?,
              expiry_date = COALESCE(?, expiry_date),
              shelf_location = COALESCE(?, shelf_location),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [updatedBatchStock, newCost, newSelling, newMrp, expiry_date || null, shelf_location || null, existingBatch.id]);
        } else if (existingBatch && is_new_batch) {
          const updatedBatchStock = (existingBatch.stock_quantity || 0) + qty;
          await dbRun(`
            UPDATE product_batches SET 
              stock_quantity = ?,
              cost_price = ?,
              selling_price = ?,
              mrp = ?,
              expiry_date = COALESCE(?, expiry_date),
              shelf_location = COALESCE(?, shelf_location),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [updatedBatchStock, newCost, newSelling, newMrp, expiry_date || null, shelf_location || null, existingBatch.id]);
        } else {
          const batchId = 'batch_' + uuidv4().slice(0, 8);
          await dbRun(`
            INSERT INTO product_batches (
              id, product_id, batch_number, cost_price, selling_price, mrp, stock_quantity, expiry_date, shelf_location
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(product_id, batch_number) DO UPDATE SET 
              stock_quantity = product_batches.stock_quantity + excluded.stock_quantity,
              cost_price = excluded.cost_price,
              selling_price = excluded.selling_price,
              mrp = excluded.mrp,
              expiry_date = COALESCE(excluded.expiry_date, product_batches.expiry_date),
              shelf_location = COALESCE(excluded.shelf_location, product_batches.shelf_location),
              updated_at = CURRENT_TIMESTAMP
          `, [batchId, id, batchNum, newCost, newSelling, newMrp, qty, expiry_date || null, shelf_location || null]);
        }
      }

      await dbRun(`
        UPDATE products SET 
          is_in_inventory = 1,
          stock_quantity = ?,
          min_stock_level = ?,
          cost_price = ?,
          selling_price = ?,
          mrp = ?,
          batch_number = COALESCE(?, batch_number),
          expiry_date = COALESCE(?, expiry_date),
          shelf_location = COALESCE(?, shelf_location),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newTotalStock, parsedMinStock, newCost, newSelling, newMrp, batchNum || null, expiry_date || null, shelf_location || null, id]);
    });

    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ success: true, message: 'Item added to store inventory', product: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get batches for a product
productsRouter.get('/:id/batches', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const batches = await dbAll(
      'SELECT * FROM product_batches WHERE product_id = ? ORDER BY created_at DESC',
      [id]
    );
    res.json(batches || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific batch
productsRouter.delete('/batches/:batch_id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch_id } = req.params;
    const batch = await dbGet<any>('SELECT * FROM product_batches WHERE id = ?', [batch_id]);
    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }
    let newStock = 0;
    await runInTransaction(async () => {
      await dbRun('DELETE FROM product_batches WHERE id = ?', [batch_id]);
      
      // Recompute total stock from remaining batches
      const batchSum = await dbGet<{ sum: number }>(
        'SELECT SUM(stock_quantity) as sum FROM product_batches WHERE product_id = ?',
        [batch.product_id]
      );
      const rawSum = Number(batchSum?.sum);
      newStock = (!isNaN(rawSum) && isFinite(rawSum) && rawSum >= 0) ? rawSum : 0;

      // Also get the latest remaining batch (if any) to keep products primary selling/cost/mrp synced
      const latestBatch = await dbGet<any>(
        'SELECT * FROM product_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1',
        [batch.product_id]
      );

      if (latestBatch) {
        await dbRun(
          `UPDATE products SET 
            stock_quantity = ?, 
            batch_number = ?, 
            selling_price = ?, 
            cost_price = ?, 
            mrp = ?, 
            expiry_date = ?, 
            shelf_location = ?, 
            updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [
            newStock,
            latestBatch.batch_number,
            latestBatch.selling_price,
            latestBatch.cost_price,
            latestBatch.mrp,
            latestBatch.expiry_date,
            latestBatch.shelf_location,
            batch.product_id,
          ]
        );
      } else {
        await dbRun(
          'UPDATE products SET stock_quantity = ?, batch_number = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newStock, batch.product_id]
        );
      }
    });

    res.json({ success: true, message: 'Batch removed', remaining_stock: newStock });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove an item from Store Inventory (Delists from store stock, keeps in master catalog)
productsRouter.delete('/:id/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    await runInTransaction(async () => {
      await dbRun(`
        UPDATE products SET 
          is_in_inventory = 0, 
          stock_quantity = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [id]);

      await dbRun(`
        UPDATE product_batches SET
          stock_quantity = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `, [id]);
    });

    res.json({ success: true, message: `"${product.name}" removed from store inventory. It remains available in the Product Catalog.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add new product
productsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      barcode,
      sku,
      name,
      category_id,
      brand,
      cost_price = 0,
      selling_price = 0,
      mrp,
      stock_quantity = 0,
      unit = 'pcs',
      is_quick_pick = 0,
      batch_number,
      expiry_date,
    } = req.body;

    if (!barcode || !name) {
      res.status(400).json({ error: 'Barcode and Name are required' });
      return;
    }

    const calculatedSelling = Number(selling_price);
    const calculatedCost = cost_price !== undefined ? Number(cost_price) : 0;
    const calculatedMrp = mrp !== undefined && mrp !== null ? Number(mrp) : calculatedSelling;
    const calculatedStock = stock_quantity !== undefined ? Number(stock_quantity) : 0;

    if (isNaN(calculatedSelling) || !isFinite(calculatedSelling) || calculatedSelling < 0) {
      res.status(400).json({ error: 'Selling price must be a valid non-negative number' });
      return;
    }
    if (isNaN(calculatedCost) || !isFinite(calculatedCost) || calculatedCost < 0) {
      res.status(400).json({ error: 'Cost price must be a valid non-negative number' });
      return;
    }
    if (isNaN(calculatedMrp) || !isFinite(calculatedMrp) || calculatedMrp < 0) {
      res.status(400).json({ error: 'MRP must be a valid non-negative number' });
      return;
    }
    if (isNaN(calculatedStock) || !isFinite(calculatedStock) || calculatedStock < 0) {
      res.status(400).json({ error: 'Stock quantity must be a valid non-negative number' });
      return;
    }

    const id = 'prod_' + uuidv4().slice(0, 8);
    const calculatedSku = sku || barcode;

    await dbRun(
      `INSERT INTO products (
        id, barcode, sku, name, brand, category_id, cost_price, selling_price, mrp, stock_quantity, unit, is_quick_pick, batch_number, expiry_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        barcode,
        calculatedSku,
        name,
        brand || null,
        category_id || null,
        Number(cost_price) || 0,
        calculatedSelling,
        calculatedMrp,
        Number(stock_quantity) || 0,
        unit || 'pcs',
        is_quick_pick ? 1 : 0,
        batch_number || null,
        expiry_date || null,
      ]
    );

    const created = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed: products.barcode')) {
      res.status(400).json({ error: 'Barcode already exists on another product' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Update product
productsRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      barcode,
      sku,
      name,
      brand,
      category_id,
      cost_price,
      selling_price,
      mrp,
      stock_quantity,
      unit,
      is_quick_pick,
      batch_number,
      expiry_date,
    } = req.body;

    if (cost_price !== undefined && (isNaN(Number(cost_price)) || !isFinite(Number(cost_price)) || Number(cost_price) < 0)) {
      res.status(400).json({ error: 'Cost price must be a non-negative number' });
      return;
    }
    if (selling_price !== undefined && (isNaN(Number(selling_price)) || !isFinite(Number(selling_price)) || Number(selling_price) < 0)) {
      res.status(400).json({ error: 'Selling price must be a non-negative number' });
      return;
    }
    if (mrp !== undefined && (isNaN(Number(mrp)) || !isFinite(Number(mrp)) || Number(mrp) < 0)) {
      res.status(400).json({ error: 'MRP must be a non-negative number' });
      return;
    }
    if (stock_quantity !== undefined && (isNaN(Number(stock_quantity)) || !isFinite(Number(stock_quantity)) || Number(stock_quantity) < 0)) {
      res.status(400).json({ error: 'Stock quantity must be a non-negative number' });
      return;
    }

    const parsedCost = cost_price !== undefined ? Number(cost_price) : undefined;
    const parsedSelling = selling_price !== undefined ? Number(selling_price) : undefined;
    const parsedMrp = mrp !== undefined ? Number(mrp) : undefined;
    const parsedStock = stock_quantity !== undefined ? Number(stock_quantity) : undefined;

    await dbRun(
      `UPDATE products SET 
        barcode = COALESCE(?, barcode),
        sku = COALESCE(?, sku),
        name = COALESCE(?, name),
        brand = COALESCE(?, brand),
        category_id = ?,
        cost_price = COALESCE(?, cost_price),
        selling_price = COALESCE(?, selling_price),
        mrp = COALESCE(?, mrp),
        stock_quantity = COALESCE(?, stock_quantity),
        unit = COALESCE(?, unit),
        is_quick_pick = COALESCE(?, is_quick_pick),
        batch_number = ?,
        expiry_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        barcode,
        sku,
        name,
        brand !== undefined ? (brand ? String(brand).trim() : null) : undefined,
        category_id || null,
        parsedCost,
        parsedSelling,
        parsedMrp,
        parsedStock,
        unit,
        is_quick_pick !== undefined ? (is_quick_pick ? 1 : 0) : undefined,
        batch_number || null,
        expiry_date || null,
        id,
      ]
    );

    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
productsRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await dbGet<any>('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Check for existing historical records
    const [orderItemCount, batchCount, grnCount, poItemCount] = await Promise.all([
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?', [id]),
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM product_batches WHERE product_id = ?', [id]),
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM goods_received_items WHERE product_id = ?', [id]),
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM purchase_order_items WHERE product_id = ?', [id]),
    ]);

    const salesCount = orderItemCount?.count || 0;
    const batches = batchCount?.count || 0;
    const grns = grnCount?.count || 0;
    const pos = poItemCount?.count || 0;

    if (salesCount > 0 || batches > 0 || grns > 0 || pos > 0) {
      const reasons: string[] = [];
      if (salesCount > 0) reasons.push(`${salesCount} sales order line(s)`);
      if (grns > 0) reasons.push(`${grns} GRN inward item(s)`);
      if (batches > 0) reasons.push(`${batches} batch record(s)`);
      if (pos > 0) reasons.push(`${pos} purchase order item(s)`);

      res.status(400).json({
        error: `Cannot delete product "${product.name}": It has linked transaction history (${reasons.join(', ')}). Deleting it would corrupt past receipts and reports. To prevent future sales, delist it from Store Inventory instead.`,
        has_history: true,
        history: { sales: salesCount, grn: grns, batches, po: pos }
      });
      return;
    }

    await runInTransaction(async () => {
      await dbRun('DELETE FROM products WHERE id = ?', [id]);
    });

    res.json({ success: true, message: `Product "${product.name}" deleted successfully.` });
  } catch (error: any) {
    if (error?.message && (error.message.includes('FOREIGN KEY constraint failed') || error.message.includes('constraint failed'))) {
      res.status(400).json({ error: 'Cannot delete product: It is referenced by linked transaction records.' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Bulk product upload from CSV or array
productsRouter.post('/bulk-upload', async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, target = 'catalog' } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Array of product items is required' });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Cache existing categories
    const existingCats = await dbAll<{ id: string; name: string }>('SELECT id, name FROM categories');
    const catMap: Record<string, string> = {};
    for (const c of existingCats) {
      catMap[c.name.trim().toUpperCase()] = c.id;
    }

    const catColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

    await runInTransaction(async () => {
      for (const item of items) {
        let name = (item.name || item['Product Name'] || item.product_name || '').trim();
        let categoryName = (item.category || item['Category'] || 'General').trim();
        let brand = (item.brand || item['Brand'] || '').trim();
        let rawCode = String(item.product_code || item['Product Code'] || item.barcode || '').trim();

        if (!name || !rawCode) {
          skipped++;
          continue;
        }

        // Expand scientific notation if present (e.g. 4.79101E+12 -> 4791010000000)
        let barcode = rawCode;
        if (rawCode.includes('E+') || rawCode.includes('e+')) {
          const num = Number(rawCode);
          if (!isNaN(num)) {
            barcode = BigInt(Math.round(num)).toString();
          }
        }

        // Auto-create category if missing
        const upperCat = categoryName.toUpperCase();
        let categoryId = catMap[upperCat];
        if (!categoryId) {
          categoryId = 'cat_' + uuidv4().slice(0, 8);
          const randomColor = catColors[Math.floor(Math.random() * catColors.length)];
          await dbRun(
            'INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
            [categoryId, categoryName, randomColor, 'Package']
          );
          catMap[upperCat] = categoryId;
        }

        const rawSelling = Number(item.selling_price || item.price || 135.0);
        const sellingPrice = (isNaN(rawSelling) || !isFinite(rawSelling) || rawSelling < 0) ? 135.0 : rawSelling;
        const rawCost = Number(item.cost_price || item.cost || (sellingPrice * 0.8));
        const costPrice = (isNaN(rawCost) || !isFinite(rawCost) || rawCost < 0) ? Math.round(sellingPrice * 0.8 * 100) / 100 : rawCost;
        const rawMrp = Number(item.mrp || item.actual_price || item['Actual Price'] || item['MRP'] || sellingPrice);
        const mrp = (isNaN(rawMrp) || !isFinite(rawMrp) || rawMrp < 0) ? sellingPrice : rawMrp;
        
        let stock = 0;
        let inInventory = 0;
        if (target === 'inventory') {
          const rawStock = Number(item.stock_quantity ?? item.stock ?? 10);
          stock = (isNaN(rawStock) || !isFinite(rawStock) || rawStock < 0) ? 10 : rawStock;
          inInventory = 1;
        } else {
          const rawStock = item.stock_quantity !== undefined ? Number(item.stock_quantity) : 0;
          stock = (isNaN(rawStock) || !isFinite(rawStock) || rawStock < 0) ? 0 : rawStock;
          inInventory = stock > 0 ? 1 : 0;
        }
        
        const unit = item.unit || 'pcs';

        // Check if product with this barcode already exists
        const existingProduct = await dbGet('SELECT id, is_in_inventory, stock_quantity FROM products WHERE barcode = ?', [barcode]);

        if (existingProduct) {
          if (target === 'inventory') {
            await dbRun(
              `UPDATE products SET 
                name = ?, 
                category_id = ?, 
                brand = ?, 
                cost_price = ?,
                selling_price = ?,
                mrp = ?,
                stock_quantity = ?,
                is_in_inventory = 1,
                updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [name, categoryId, brand, costPrice, sellingPrice, mrp, stock, existingProduct.id]
            );
          } else {
            await dbRun(
              `UPDATE products SET 
                name = ?, 
                category_id = ?, 
                brand = ?, 
                cost_price = ?,
                selling_price = ?,
                mrp = ?,
                updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [name, categoryId, brand, costPrice, sellingPrice, mrp, existingProduct.id]
            );
          }
          updated++;
        } else {
          const id = 'prod_' + uuidv4().slice(0, 8);
          await dbRun(
            `INSERT INTO products (
              id, barcode, sku, name, category_id, brand, cost_price, selling_price, mrp, stock_quantity, unit, is_quick_pick, is_in_inventory
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
              id,
              barcode,
              barcode, // SKU default to barcode
              name,
              categoryId,
              brand,
              costPrice,
              sellingPrice,
              mrp,
              stock,
              unit,
              inInventory,
            ]
          );
          inserted++;
        }
      }
    });

    res.json({
      success: true,
      message: `Processed ${items.length} products: ${inserted} added, ${updated} updated, ${skipped} skipped.`,
      stats: { total: items.length, inserted, updated, skipped },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Wipe entire product catalog (Restricted to Administrator only)
productsRouter.post('/wipe-catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const { admin_pin } = req.body;
    if (!admin_pin) {
      res.status(400).json({ error: 'Administrator PIN is required to wipe the catalog.' });
      return;
    }

    // Verify Admin role strictly
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
      res.status(403).json({ error: 'Access denied: Invalid Administrator PIN. Only Administrators can wipe the product catalog.' });
      return;
    }

    // Count products before wiping
    const countRow = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM products');
    const count = countRow ? countRow.count : 0;

    // Check if there is active transactional history referencing products
    const [orderItemCount, grnCount, poCount] = await Promise.all([
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM order_items'),
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM goods_received_items'),
      dbGet<{ count: number }>('SELECT COUNT(*) as count FROM purchase_order_items'),
    ]);

    const salesTotal = orderItemCount?.count || 0;
    const grnTotal = grnCount?.count || 0;
    const poTotal = poCount?.count || 0;

    if (salesTotal > 0 || grnTotal > 0 || poTotal > 0) {
      res.status(400).json({
        error: `Cannot wipe product catalog: Active transaction history exists (${salesTotal} sales line(s), ${grnTotal} GRN inward item(s), ${poTotal} PO item(s)). Wiping products would corrupt historical records and audit trails.`,
        has_history: true,
        history: { sales: salesTotal, grn: grnTotal, po: poTotal }
      });
      return;
    }

    await runInTransaction(async () => {
      // Safely delete child batch records first to satisfy foreign keys
      await dbRun('DELETE FROM product_batches');
      await dbRun('DELETE FROM products');
    });

    res.json({
      success: true,
      message: `Product catalog wiped successfully. Removed ${count} products.`,
      deleted_count: count,
      wiped_by: adminUser.username,
    });
  } catch (error: any) {
    if (error?.message && (error.message.includes('FOREIGN KEY constraint failed') || error.message.includes('constraint failed'))) {
      res.status(400).json({ error: 'Cannot wipe catalog: Referenced by linked transaction records.' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

