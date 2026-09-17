import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';

export const reportsRouter = Router();

// Dashboard summary stats
reportsRouter.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const todaySales = await dbGet<{ total: number; cash: number; card: number; count: number }>(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END), 0) as cash,
        COALESCE(SUM(CASE WHEN payment_method = 'CARD' THEN total_amount ELSE 0 END), 0) as card,
        COUNT(*) as count
      FROM orders 
      WHERE date(created_at) = date('now') AND (status IS NULL OR status != 'VOIDED')
    `);

    const lowStockCount = await dbGet<{ count: number }>(`
      SELECT COUNT(*) as count FROM products WHERE stock_quantity <= 10
    `);

    const expiringCount = await dbGet<{ count: number }>(`
      SELECT COUNT(*) as count FROM products 
      WHERE expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+14 days')
    `);

    const totalProducts = await dbGet<{ count: number }>(`
      SELECT COUNT(*) as count FROM products
    `);

    res.json({
      today_sales: todaySales?.total || 0,
      today_cash_sales: todaySales?.cash || 0,
      today_card_sales: todaySales?.card || 0,
      today_transactions: todaySales?.count || 0,
      low_stock_count: lowStockCount?.count || 0,
      expiring_count: expiringCount?.count || 0,
      total_products: totalProducts?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Top selling products
reportsRouter.get('/top-products', async (_req: Request, res: Response): Promise<void> => {
  try {
    const top = await dbAll(`
      SELECT 
        oi.product_name,
        oi.barcode,
        SUM(oi.quantity) as total_qty_sold,
        SUM(oi.subtotal) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE (o.status IS NULL OR o.status != 'VOIDED')
      GROUP BY oi.product_id
      ORDER BY total_qty_sold DESC
      LIMIT 10
    `);
    res.json(top);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tax report (Optional toggle)
reportsRouter.get('/tax', async (req: Request, res: Response): Promise<void> => {
  try {
    const taxSetting = await dbGet('SELECT value FROM settings WHERE key = ?', ['feature_tax']);
    if (taxSetting?.value !== 'true') {
      res.json({ enabled: false, message: 'Tax reporting is currently disabled.' });
      return;
    }

    const { from_date, to_date } = req.query;
    let baseWhere = ` WHERE (status IS NULL OR status != 'VOIDED')`;
    const params: any[] = [];
    if (from_date) {
      baseWhere += ` AND date(created_at) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      baseWhere += ` AND date(created_at) <= date(?)`;
      params.push(to_date);
    }

    const breakdownQuery = `
      SELECT 
        date(created_at) as sale_date,
        COUNT(*) as total_invoices,
        ROUND(SUM(CASE WHEN subtotal - COALESCE(discount_amount, 0) > 0 THEN subtotal - COALESCE(discount_amount, 0) ELSE 0 END), 2) as taxable_sales,
        ROUND(SUM(tax_amount), 2) as tax_collected,
        ROUND(SUM(total_amount), 2) as gross_sales
      FROM orders
      ${baseWhere}
      GROUP BY date(created_at)
      ORDER BY sale_date DESC
      LIMIT 30
    `;

    const totalsQuery = `
      SELECT 
        COUNT(*) as total_invoices,
        ROUND(COALESCE(SUM(CASE WHEN subtotal - COALESCE(discount_amount, 0) > 0 THEN subtotal - COALESCE(discount_amount, 0) ELSE 0 END), 0), 2) as total_taxable,
        ROUND(COALESCE(SUM(tax_amount), 0), 2) as total_tax,
        ROUND(COALESCE(SUM(total_amount), 0), 2) as total_gross
      FROM orders
      ${baseWhere}
    `;

    const [dailyTaxBreakdown, overallTotals] = await Promise.all([
      dbAll(breakdownQuery, params),
      dbGet(totalsQuery, params),
    ]);

    res.json({
      enabled: true,
      totals: overallTotals,
      daily_breakdown: dailyTaxBreakdown,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Near-expiry report
reportsRouter.get('/expiry-alerts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await dbAll(`
      SELECT 
        id, barcode, sku, name, stock_quantity, batch_number, expiry_date,
        CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) as days_remaining
      FROM products
      WHERE expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+30 days')
      ORDER BY date(expiry_date) ASC
    `);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Comprehensive period analytics (Daily, Weekly, Monthly, All-time)
reportsRouter.get('/analytics', async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) || 'daily';
    const { from_date, to_date, date: specificDate } = req.query;

    let ordersWhere = `WHERE (o.status IS NULL OR o.status != 'VOIDED')`;
    const params: any[] = [];

    if (from_date && to_date) {
      ordersWhere += ` AND date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)`;
      params.push(from_date, to_date);
    } else if (period === 'daily') {
      if (specificDate) {
        ordersWhere += ` AND date(o.created_at) = date(?)`;
        params.push(specificDate);
      } else {
        ordersWhere += ` AND date(o.created_at) = date('now', 'localtime')`;
      }
    } else if (period === 'weekly') {
      ordersWhere += ` AND date(o.created_at) >= date('now', 'localtime', '-6 days')`;
    } else if (period === 'monthly') {
      ordersWhere += ` AND date(o.created_at) >= date('now', 'localtime', '-29 days')`;
    }

    // 1. Overall Financial Summary
    const summaryOrders = await dbGet<any>(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as gross_revenue,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts,
        COALESCE(SUM(o.tax_amount), 0) as total_tax,
        COALESCE(SUM(CASE WHEN o.payment_method = 'CASH' THEN o.total_amount ELSE 0 END), 0) as cash_revenue,
        COALESCE(SUM(CASE WHEN o.payment_method = 'CARD' THEN o.total_amount ELSE 0 END), 0) as card_revenue
      FROM orders o
      ${ordersWhere}
    `, params);

    // Cost of goods sold & item-level profit
    const cogsQuery = await dbGet<any>(`
      SELECT 
        COALESCE(SUM(oi.subtotal), 0) as items_revenue,
        COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as total_cogs,
        COALESCE(SUM(oi.quantity), 0) as total_units_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      ${ordersWhere}
    `, params);

    const grossRevenue = Number(summaryOrders?.gross_revenue || 0);
    const totalCogs = Number(cogsQuery?.total_cogs || 0);
    const grossProfit = Math.round((grossRevenue - totalCogs) * 100) / 100;
    const profitMargin = grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 1000) / 10 : 0;
    const totalOrders = Number(summaryOrders?.total_orders || 0);
    const aov = totalOrders > 0 ? Math.round((grossRevenue / totalOrders) * 100) / 100 : 0;

    // 2. Category Distribution (for Pie/Donut Chart)
    const categoryRows = await dbAll<any>(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        COALESCE(c.color, '#3b82f6') as category_color,
        ROUND(COALESCE(SUM(oi.subtotal), 0), 2) as revenue,
        ROUND(COALESCE(SUM(oi.quantity), 0), 2) as units_sold,
        ROUND(COALESCE(SUM(oi.subtotal - (oi.quantity * COALESCE(p.cost_price, 0))), 0), 2) as profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${ordersWhere}
      GROUP BY category_name
      ORDER BY revenue DESC
    `, params);

    const categoryTotalRev = categoryRows.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
    const categories = categoryRows.map(c => ({
      ...c,
      percentage: categoryTotalRev > 0 ? Math.round((Number(c.revenue) / categoryTotalRev) * 1000) / 10 : 0
    }));

    // 3. Most Profitable Products
    const mostProfitable = await dbAll<any>(`
      SELECT 
        oi.product_id,
        oi.product_name,
        oi.barcode,
        COALESCE(c.name, 'General') as category_name,
        ROUND(AVG(oi.unit_price), 2) as avg_selling_price,
        ROUND(COALESCE(p.cost_price, 0), 2) as cost_price,
        ROUND(COALESCE(SUM(oi.quantity), 0), 2) as units_sold,
        ROUND(COALESCE(SUM(oi.subtotal), 0), 2) as total_revenue,
        ROUND(COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0), 2) as total_cost,
        ROUND(COALESCE(SUM(oi.subtotal - (oi.quantity * COALESCE(p.cost_price, 0))), 0), 2) as total_profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${ordersWhere}
      GROUP BY oi.product_id
      ORDER BY total_profit DESC
      LIMIT 15
    `, params);

    const profitableWithMargin = mostProfitable.map(p => {
      const rev = Number(p.total_revenue || 0);
      const prof = Number(p.total_profit || 0);
      return {
        ...p,
        margin_percentage: rev > 0 ? Math.round((prof / rev) * 1000) / 10 : 0
      };
    });

    // 4. Fast-Moving Items (by volume)
    const fastMoving = await dbAll<any>(`
      SELECT 
        oi.product_id,
        oi.product_name,
        oi.barcode,
        COALESCE(c.name, 'General') as category_name,
        ROUND(COALESCE(SUM(oi.quantity), 0), 2) as units_sold,
        ROUND(COALESCE(SUM(oi.subtotal), 0), 2) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${ordersWhere}
      GROUP BY oi.product_id
      ORDER BY units_sold DESC
      LIMIT 10
    `, params);

    // 5. Timeline Sales Trend (Hourly for daily; Daily for weekly/monthly/all)
    let timelineTrend: any[] = [];
    if (period === 'daily') {
      timelineTrend = await dbAll<any>(`
        SELECT 
          strftime('%H:00', o.created_at) as time_label,
          COUNT(DISTINCT o.id) as orders_count,
          ROUND(COALESCE(SUM(o.total_amount), 0), 2) as revenue
        FROM orders o
        ${ordersWhere}
        GROUP BY time_label
        ORDER BY time_label ASC
      `, params);
    } else {
      timelineTrend = await dbAll<any>(`
        SELECT 
          date(o.created_at) as time_label,
          COUNT(DISTINCT o.id) as orders_count,
          ROUND(COALESCE(SUM(o.total_amount), 0), 2) as revenue
        FROM orders o
        ${ordersWhere}
        GROUP BY date(o.created_at)
        ORDER BY time_label ASC
      `, params);
    }

    // 6. Hourly Peak Traffic Distribution (0-23)
    const hourlyTraffic = await dbAll<any>(`
      SELECT 
        CAST(strftime('%H', o.created_at) AS INTEGER) as hour,
        COUNT(DISTINCT o.id) as orders_count,
        ROUND(COALESCE(SUM(o.total_amount), 0), 2) as revenue
      FROM orders o
      ${ordersWhere}
      GROUP BY hour
      ORDER BY hour ASC
    `, params);

    res.json({
      period,
      summary: {
        total_orders: totalOrders,
        gross_revenue: grossRevenue,
        cogs: totalCogs,
        gross_profit: grossProfit,
        profit_margin: profitMargin,
        aov,
        total_units_sold: Number(cogsQuery?.total_units_sold || 0),
        cash_revenue: Number(summaryOrders?.cash_revenue || 0),
        card_revenue: Number(summaryOrders?.card_revenue || 0),
        discounts: Number(summaryOrders?.total_discounts || 0),
        tax: Number(summaryOrders?.total_tax || 0),
      },
      categories,
      most_profitable: profitableWithMargin,
      fast_moving: fastMoving,
      timeline_trend: timelineTrend,
      hourly_traffic: hourlyTraffic,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
