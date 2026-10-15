import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun, dbExec, runInTransaction } from '../db/database';
import { verifyAdminRequester, extractTokenUser } from '../middleware/auth';

export const salesRouter = Router();

// Checkout endpoint
salesRouter.post('/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      shift_id,
      cashier_id = 'usr_owner',
      cashier_name = 'owner',
      payment_method, // 'CASH', 'CARD', or 'CHEQUE'
      order_type = 'RETAIL', // 'RETAIL' or 'WHOLESALE'
      items, // Array<{ product_id, product_name, barcode, unit_price, quantity, subtotal, discount_amount, discount_percent }>
      discount_amount = 0,
      tender_amount,
      card_reference = null,
      cheque_number = null,
      cheque_date = null,
      customer_id = null,
      customer_name = null,
      customer_phone = null,
      points_redeemed = 0,
    } = req.body;

    if (!payment_method || !['CASH', 'CARD', 'CHEQUE'].includes(payment_method)) {
      res.status(400).json({ error: 'Valid payment method (CASH, CARD, or CHEQUE) is required' });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart cannot be empty' });
      return;
    }

    // Validate each line item has positive, finite quantity, non-negative price, and valid item discount
    let grossSubtotal = 0;
    let itemDiscountsTotal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) {
        res.status(400).json({ error: `Item at row ${i + 1} is missing product ID` });
        return;
      }
      const qty = Number(item.quantity);
      const price = Number(item.unit_price);
      const mrp = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : price;
      const itemDisc = Math.max(0, Number(item.discount_amount) || 0);

      if (isNaN(qty) || !isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: `Item "${item.product_name || item.product_id}" has invalid quantity: ${item.quantity}` });
        return;
      }
      if (isNaN(price) || !isFinite(price) || price < 0) {
        res.status(400).json({ error: `Item "${item.product_name || item.product_id}" has invalid price: ${item.unit_price}` });
        return;
      }
      if (isNaN(mrp) || !isFinite(mrp) || mrp < 0) {
        res.status(400).json({ error: `Item "${item.product_name || item.product_id}" has invalid MRP: ${item.mrp}` });
        return;
      }
      if (isNaN(itemDisc) || !isFinite(itemDisc) || itemDisc < 0) {
        res.status(400).json({ error: `Item "${item.product_name || item.product_id}" has invalid item discount: ${item.discount_amount}` });
        return;
      }

      const lineGross = Math.round(qty * price * 100) / 100;
      if (itemDisc > lineGross) {
        res.status(400).json({
          error: `Item "${item.product_name || item.product_id}" discount (${itemDisc.toFixed(2)}) cannot exceed line total (${lineGross.toFixed(2)})`
        });
        return;
      }

      grossSubtotal += lineGross;
      itemDiscountsTotal += itemDisc;
    }

    grossSubtotal = Math.round(grossSubtotal * 100) / 100;
    itemDiscountsTotal = Math.round(itemDiscountsTotal * 100) / 100;

    if (discount_amount !== undefined && (isNaN(Number(discount_amount)) || !isFinite(Number(discount_amount)) || Number(discount_amount) < 0)) {
      res.status(400).json({ error: 'Discount amount must be a non-negative number' });
      return;
    }

    if (tender_amount !== undefined && tender_amount !== null && (isNaN(Number(tender_amount)) || !isFinite(Number(tender_amount)) || Number(tender_amount) < 0)) {
      res.status(400).json({ error: 'Tender amount cannot be negative' });
      return;
    }

    // Check tax and loyalty settings
    const taxSetting = await dbGet('SELECT value FROM settings WHERE key = ?', ['feature_tax']);
    const taxRateSetting = await dbGet('SELECT value FROM settings WHERE key = ?', ['tax_rate']);
    const isTaxEnabled = taxSetting?.value === 'true';
    const taxRate = isTaxEnabled ? parseFloat(taxRateSetting?.value || '0') : 0;

    const loyaltySetting = await dbGet('SELECT value FROM settings WHERE key = ?', ['feature_loyalty']);
    const isLoyaltyEnabled = loyaltySetting?.value === 'true';
    const spendPerPoint = parseFloat((await dbGet('SELECT value FROM settings WHERE key = ?', ['loyalty_spend_per_point']))?.value || '100') || 100;
    const pointValue = parseFloat((await dbGet('SELECT value FROM settings WHERE key = ?', ['loyalty_point_value']))?.value || '1.0') || 1.0;

    // Subtotal after item-level discounts
    const subtotal = Math.max(0, Math.round((grossSubtotal - itemDiscountsTotal) * 100) / 100);
    
    let attachedCustomer: any = null;
    let effectivePointsRedeemed = Math.max(0, Number(points_redeemed) || 0);
    if (customer_id && isLoyaltyEnabled) {
      attachedCustomer = await dbGet('SELECT * FROM customers WHERE id = ?', [customer_id]);
      if (attachedCustomer) {
        const availablePoints = Math.max(0, Number(attachedCustomer.points) || 0);
        effectivePointsRedeemed = Math.min(availablePoints, effectivePointsRedeemed);
      } else {
        effectivePointsRedeemed = 0;
      }
    } else {
      effectivePointsRedeemed = 0;
    }

    const rawDiscount = Math.max(0, Number(discount_amount) || 0);
    const pointsDiscount = Math.round(effectivePointsRedeemed * pointValue * 100) / 100;
    const effectiveDiscount = Math.min(subtotal, Math.round((rawDiscount + pointsDiscount) * 100) / 100);
    const taxableAmount = Math.max(0, subtotal - effectiveDiscount);
    const taxAmount = isTaxEnabled ? Math.round((taxableAmount * (taxRate / 100)) * 100) / 100 : 0;
    const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

    // Calculate points earned on net total paid
    let pointsEarned = 0;
    let customerPointsBalance = 0;
    if (attachedCustomer && isLoyaltyEnabled) {
      pointsEarned = Math.floor(totalAmount / spendPerPoint);
      customerPointsBalance = Math.max(0, Math.round((attachedCustomer.points - effectivePointsRedeemed + pointsEarned) * 100) / 100);
    }

    const tender = (tender_amount !== undefined && tender_amount !== null && !isNaN(Number(tender_amount))) 
      ? Number(tender_amount) 
      : totalAmount;
    if (payment_method === 'CASH' && tender < totalAmount) {
      res.status(400).json({ error: `Tendered cash (${tender.toFixed(2)}) is less than total due (${totalAmount.toFixed(2)})` });
      return;
    }

    const changeAmount = payment_method === 'CASH' ? Math.max(0, Math.round((tender - totalAmount) * 100) / 100) : 0;

    const orderId = 'ord_' + uuidv4().slice(0, 8);

    // === BEGIN ATOMIC TRANSACTION ===
    let orderNumber = '';
    await runInTransaction(async () => {
      // Generate unique sequential Order Number inside the transaction
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const todayOrders = await dbGet<{ count: number }>(
        `SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')`
      );
      const orderSeq = String((todayOrders?.count || 0) + 1).padStart(4, '0');
      const orderPrefix = order_type === 'WHOLESALE' ? 'WHL' : 'ORD';
      orderNumber = `${orderPrefix}-${dateStr}-${orderSeq}`;
      const existingOrder = await dbGet('SELECT id FROM orders WHERE order_number = ?', [orderNumber]);
      if (existingOrder) {
        orderNumber = `${orderPrefix}-${dateStr}-${orderSeq}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // Save Order
      await dbRun(
        `INSERT INTO orders (
          id, order_number, shift_id, cashier_id, cashier_name, payment_method, 
          subtotal, discount_amount, tax_amount, total_amount, tender_amount, change_amount, card_reference,
          cheque_number, cheque_date,
          customer_id, customer_name, customer_phone, points_earned, points_redeemed,
          order_type, item_discounts_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          orderNumber,
          shift_id || null,
          cashier_id,
          cashier_name,
          payment_method,
          subtotal,
          effectiveDiscount,
          taxAmount,
          totalAmount,
          tender,
          changeAmount,
          card_reference,
          cheque_number || null,
          cheque_date || null,
          customer_id || null,
          attachedCustomer ? attachedCustomer.name : (customer_name || null),
          attachedCustomer ? attachedCustomer.phone : (customer_phone || null),
          pointsEarned,
          effectivePointsRedeemed,
          order_type,
          itemDiscountsTotal,
        ]
      );

      // Update Customer points, total spent, and visit count (using relative math to prevent race conditions)
      if (attachedCustomer) {
        await dbRun(
          `UPDATE customers SET 
            points = MAX(0, points - ? + ?), 
            total_spent = total_spent + ?, 
            visits_count = visits_count + 1,
            updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [effectivePointsRedeemed, pointsEarned, totalAmount, attachedCustomer.id]
        );
        const freshCust = await dbGet<{ points: number }>('SELECT points FROM customers WHERE id = ?', [attachedCustomer.id]);
        if (freshCust) {
          customerPointsBalance = Number(freshCust.points) || 0;
        }
      }

      // Save Order Items and deduct inventory stock
      for (const item of items) {
        const itemId = 'item_' + uuidv4().slice(0, 8);
        const calculatedMrp = Number(item.mrp || item.unit_price || 0);
        const itemDisc = Math.max(0, Number(item.discount_amount) || 0);
        const itemDiscPct = Math.max(0, Number(item.discount_percent) || 0);
        const lineGross = Math.round(Number(item.unit_price) * Number(item.quantity) * 100) / 100;
        const lineSubtotal = Math.max(0, Math.round((lineGross - itemDisc) * 100) / 100);

        await dbRun(
          `INSERT INTO order_items (
            id, order_id, product_id, product_name, barcode, unit_price, quantity, subtotal, mrp, batch_number,
            discount_amount, discount_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            orderId,
            item.product_id,
            item.product_name,
            item.barcode,
            Number(item.unit_price),
            Number(item.quantity),
            lineSubtotal,
            calculatedMrp,
            item.batch_number || null,
            itemDisc,
            itemDiscPct,
          ]
        );

        // Decrement stock in product_batches if batch is tracked
        if (item.batch_id) {
          await dbRun(
            `UPDATE product_batches SET stock_quantity = stock_quantity - ? WHERE id = ?`,
            [Number(item.quantity), item.batch_id]
          );
        } else if (item.batch_number) {
          await dbRun(
            `UPDATE product_batches SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND batch_number = ?`,
            [Number(item.quantity), item.product_id, item.batch_number]
          );
        }

        // Decrement total stock on product (allow negative to preserve void accuracy)
        await dbRun(
          `UPDATE products SET stock_quantity = stock_quantity - ?, is_in_inventory = 1 WHERE id = ?`,
          [Number(item.quantity), item.product_id]
        );
      }

      // Update active shift totals if shift_id provided
      if (shift_id) {
        // Only update open shifts
        const shift = await dbGet<any>('SELECT status FROM shifts WHERE id = ?', [shift_id]);
        if (shift && shift.status === 'open') {
          if (payment_method === 'CASH') {
            await dbRun(
              `UPDATE shifts SET 
                cash_sales = cash_sales + ?, 
                total_sales = total_sales + ?,
                expected_cash = expected_cash + ?
               WHERE id = ?`,
              [totalAmount, totalAmount, totalAmount, shift_id]
            );
          } else if (payment_method === 'CARD') {
            await dbRun(
              `UPDATE shifts SET 
                card_sales = card_sales + ?, 
                total_sales = total_sales + ?
               WHERE id = ?`,
              [totalAmount, totalAmount, shift_id]
            );
          } else if (payment_method === 'CHEQUE') {
            await dbRun(
              `UPDATE shifts SET 
                cheque_sales = COALESCE(cheque_sales, 0) + ?, 
                total_sales = total_sales + ?
               WHERE id = ?`,
              [totalAmount, totalAmount, shift_id]
            );
          }
        }
      }
    });
    // === END ATOMIC TRANSACTION ===

    // Fetch store info for receipt (read-only, outside transaction)
    const storeName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_name']))?.value || 'Grocery POS';
    const subStoreName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['sub_store_name']))?.value || '';
    const storeAddress = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_address']))?.value || '';
    const storePhone = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_phone']))?.value || '';
    const receiptFooter = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_receipt_footer']))?.value || '';
    const receiptWidth = (await dbGet('SELECT value FROM settings WHERE key = ?', ['receipt_width']))?.value || '80';
    const currency = (await dbGet('SELECT value FROM settings WHERE key = ?', ['currency_symbol']))?.value || '$';

    res.status(201).json({
      success: true,
      order: {
        id: orderId,
        order_number: orderNumber,
        created_at: new Date().toISOString(),
        cashier_name,
        payment_method,
        subtotal,
        discount_amount: effectiveDiscount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        tender_amount: tender,
        change_amount: changeAmount,
        card_reference,
        cheque_number: cheque_number || null,
        cheque_date: cheque_date || null,
        customer_id: customer_id || null,
        customer_name: attachedCustomer ? attachedCustomer.name : (customer_name || null),
        customer_phone: attachedCustomer ? attachedCustomer.phone : (customer_phone || null),
        points_earned: pointsEarned,
        points_redeemed: effectivePointsRedeemed,
        customer_points_balance: customerPointsBalance,
        order_type,
        item_discounts_total: itemDiscountsTotal,
        items,
      },
      receipt_config: {
        store_name: storeName,
        sub_store_name: subStoreName,
        store_address: storeAddress,
        store_phone: storePhone,
        receipt_footer: receiptFooter,
        receipt_width: receiptWidth,
        currency,
        is_tax_enabled: isTaxEnabled,
        tax_rate: taxRate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Orders listing with search and items
salesRouter.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search = '', limit = 50 } = req.query;
    let query = `
      SELECT o.*, s.status as shift_status 
      FROM orders o 
      LEFT JOIN shifts s ON o.shift_id = s.id
    `;
    const params: any[] = [];
    if (search) {
      query += ' WHERE o.order_number LIKE ? OR o.cashier_name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY o.created_at DESC LIMIT ?';
    params.push(Number(limit) || 50);

    const orders = await dbAll<any>(query, params);
    
    // Attach line items to each order for rich bill inspection
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
        return { ...order, items };
      })
    );

    res.json(ordersWithItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Recent orders
salesRouter.get('/recent', async (_req: Request, res: Response): Promise<void> => {
  try {
    const orders = await dbAll<any>(
      `SELECT o.*, s.status as shift_status 
       FROM orders o 
       LEFT JOIN shifts s ON o.shift_id = s.id 
       ORDER BY o.created_at DESC LIMIT 30`
    );
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
        return { ...order, items };
      })
    );
    res.json(ordersWithItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Void an existing bill/order (Administrator Only)
salesRouter.post('/:orderId/void', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { reason = 'Voided by Administrator' } = req.body;

    // Cryptographically verify requester via JWT or hashed admin PIN
    const isAuthorized = await verifyAdminRequester(req, 'pos');
    if (!isAuthorized) {
      res.status(403).json({ error: 'Permission Denied: Only administrators or supervisors can void bills.' });
      return;
    }

    const tokenUser = extractTokenUser(req);
    const voidedByUsername = tokenUser?.username || 'admin';

    // Find the order
    const order = await dbGet<any>('SELECT * FROM orders WHERE id = ? OR order_number = ?', [orderId, orderId]);
    if (!order) {
      res.status(404).json({ error: 'Bill / Order not found' });
      return;
    }

    if (order.status === 'VOIDED') {
      res.status(400).json({ error: 'This bill has already been voided.' });
      return;
    }

    // Check if shift is closed - block voiding bills from closed shifts
    if (order.shift_id) {
      const shift = await dbGet<any>('SELECT * FROM shifts WHERE id = ?', [order.shift_id]);
      if (shift && shift.status === 'closed') {
        res.status(400).json({
          error: `Cannot void bill #${order.order_number}: Shift has already been closed and settled via Z-Report. Transactions from closed shifts cannot be voided.`
        });
        return;
      }
    }

    // === BEGIN ATOMIC TRANSACTION ===
    await runInTransaction(async () => {
      // Re-verify order and shift state inside transaction to protect against concurrent operations
      const freshOrder = await dbGet<any>('SELECT * FROM orders WHERE id = ?', [order.id]);
      if (!freshOrder || freshOrder.status === 'VOIDED') {
        const err: any = new Error('This bill has already been voided.');
        err.statusCode = 400;
        throw err;
      }

      if (freshOrder.shift_id) {
        const shift = await dbGet<any>('SELECT status FROM shifts WHERE id = ?', [freshOrder.shift_id]);
        if (shift && shift.status === 'closed') {
          const err: any = new Error(`Cannot void bill #${freshOrder.order_number}: Shift has already been closed and settled via Z-Report. Transactions from closed shifts cannot be voided.`);
          err.statusCode = 400;
          throw err;
        }

        // Deduct from shift totals since shift is verified open
        if (shift && shift.status === 'open') {
          if (freshOrder.payment_method === 'CASH') {
            await dbRun(
              `UPDATE shifts SET 
                cash_sales = MAX(0, cash_sales - ?),
                total_sales = MAX(0, total_sales - ?),
                expected_cash = MAX(0, expected_cash - ?)
               WHERE id = ?`,
              [freshOrder.total_amount, freshOrder.total_amount, freshOrder.total_amount, freshOrder.shift_id]
            );
          } else if (freshOrder.payment_method === 'CARD') {
            await dbRun(
              `UPDATE shifts SET 
                card_sales = MAX(0, card_sales - ?),
                total_sales = MAX(0, total_sales - ?)
               WHERE id = ?`,
              [freshOrder.total_amount, freshOrder.total_amount, freshOrder.shift_id]
            );
          } else if (freshOrder.payment_method === 'CHEQUE') {
            await dbRun(
              `UPDATE shifts SET 
                cheque_sales = MAX(0, COALESCE(cheque_sales, 0) - ?),
                total_sales = MAX(0, total_sales - ?)
               WHERE id = ?`,
              [freshOrder.total_amount, freshOrder.total_amount, freshOrder.shift_id]
            );
          }
        }
      }

      // Mark order as VOIDED in database
      const now = new Date().toISOString();
      await dbRun(
        `UPDATE orders SET status = 'VOIDED', voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?`,
        [now, voidedByUsername, reason, freshOrder.id]
      );

      // Fetch order items to reverse inventory stock
      const items = await dbAll<any>('SELECT * FROM order_items WHERE order_id = ?', [freshOrder.id]);
      for (const item of items) {
        await dbRun(
          `UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`,
          [Number(item.quantity), item.product_id]
        );

        // Also reverse batch stock if tracked
        if (item.batch_number) {
          await dbRun(
            `UPDATE product_batches SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND batch_number = ?`,
            [Number(item.quantity), item.product_id, item.batch_number]
          );
        }
      }

      // Reverse customer loyalty points if applicable
      if (freshOrder.customer_id && (freshOrder.points_earned > 0 || freshOrder.points_redeemed > 0)) {
        await dbRun(
          `UPDATE customers SET 
            points = MAX(0, points - ? + ?),
            total_spent = MAX(0, total_spent - ?),
            visits_count = MAX(0, visits_count - 1),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [freshOrder.points_earned, freshOrder.points_redeemed, freshOrder.total_amount, freshOrder.customer_id]
        );
      }
    });
    // === END ATOMIC TRANSACTION ===

    res.json({
      success: true,
      message: `Bill #${order.order_number} has been voided. All items have been returned to inventory.`,
      order: { ...order, status: 'VOIDED', voided_at: new Date().toISOString(), void_reason: reason },
    });
  } catch (error: any) {
    const status = error.statusCode || (error.message?.includes('already been voided') || error.message?.includes('closed and settled') ? 400 : 500);
    res.status(status).json({ error: error.message });
  }
});

// Get order details for reprinting receipt
salesRouter.get('/:orderId/receipt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const order = await dbGet('SELECT * FROM orders WHERE id = ? OR order_number = ?', [orderId, orderId]);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    const storeName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_name']))?.value || 'Grocery POS';
    const subStoreName = (await dbGet('SELECT value FROM settings WHERE key = ?', ['sub_store_name']))?.value || '';
    const storeAddress = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_address']))?.value || '';
    const storePhone = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_phone']))?.value || '';
    const receiptFooter = (await dbGet('SELECT value FROM settings WHERE key = ?', ['store_receipt_footer']))?.value || '';
    const receiptWidth = (await dbGet('SELECT value FROM settings WHERE key = ?', ['receipt_width']))?.value || '80';
    const currency = (await dbGet('SELECT value FROM settings WHERE key = ?', ['currency_symbol']))?.value || '$';

    res.json({
      order: {
        ...order,
        items,
      },
      receipt_config: {
        store_name: storeName,
        sub_store_name: subStoreName,
        store_address: storeAddress,
        store_phone: storePhone,
        receipt_footer: receiptFooter,
        receipt_width: receiptWidth,
        currency,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
