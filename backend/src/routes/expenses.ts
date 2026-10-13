import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun } from '../db/database';
import { extractTokenUser } from '../middleware/auth';

export const expensesRouter = Router();

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent & Rates',
  'Electricity & Water',
  'Staff Salaries & Wages',
  'Shop Maintenance & Repairs',
  'Fuel & Transport',
  'Workshop Tools & Equipment',
  'Marketing & Advertising',
  'Internet & Phone',
  'Food & Refreshments',
  'Miscellaneous / Petty Cash',
];

// 1. List and filter expenses
expensesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search = '',
      category = '',
      payment_method = '',
      from_date = '',
      to_date = '',
      page = 1,
      limit = 50,
    } = req.query;

    let whereClause = ' WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (description LIKE ? OR reference_no LIKE ? OR category LIKE ? OR created_by_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (payment_method) {
      whereClause += ' AND payment_method = ?';
      params.push(payment_method);
    }

    if (from_date) {
      whereClause += ' AND date(expense_date) >= date(?)';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND date(expense_date) <= date(?)';
      params.push(to_date);
    }

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const pageLimit = Math.min(200, Math.max(1, parseInt(String(limit), 10)));
    const offset = (pageNum - 1) * pageLimit;

    // Get total count & aggregate amount for the filtered set
    const aggregateRow = await dbGet<{ count: number; total_amount: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM expenses ${whereClause}`,
      params
    );

    const total = aggregateRow ? aggregateRow.count : 0;
    const totalAmount = aggregateRow ? aggregateRow.total_amount : 0;

    const expenses = await dbAll(
      `SELECT * FROM expenses ${whereClause} ORDER BY expense_date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageLimit, offset]
    );

    res.json({
      expenses,
      total,
      total_amount: Math.round(totalAmount * 100) / 100,
      page: pageNum,
      limit: pageLimit,
      totalPages: Math.ceil(total / pageLimit) || 1,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Summary stats for cards & charts
expensesRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { from_date, to_date, period = 'this_month' } = req.query;

    let periodWhere = ' WHERE 1=1';
    const periodParams: any[] = [];

    if (from_date && to_date) {
      periodWhere += ' AND date(expense_date) >= date(?) AND date(expense_date) <= date(?)';
      periodParams.push(from_date, to_date);
    } else if (period === 'today') {
      periodWhere += " AND date(expense_date) = date('now', 'localtime')";
    } else if (period === 'this_week') {
      periodWhere += " AND date(expense_date) >= date('now', 'localtime', '-6 days')";
    } else if (period === 'this_month') {
      periodWhere += " AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')";
    }

    // Totals for selected period
    const periodTotal = await dbGet<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM expenses ${periodWhere}`,
      periodParams
    );

    // Today's total
    const todayTotal = await dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date('now', 'localtime')"
    );

    // This month's total
    const monthTotal = await dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')"
    );

    // Breakdown by category for selected period
    const categoryRows = await dbAll<{ category: string; amount: number; count: number }>(
      `SELECT category, ROUND(COALESCE(SUM(amount), 0), 2) as amount, COUNT(*) as count 
       FROM expenses ${periodWhere} 
       GROUP BY category 
       ORDER BY amount DESC`,
      periodParams
    );

    const totalPeriodAmt = Number(periodTotal?.total || 0);
    const byCategory = categoryRows.map((c) => ({
      ...c,
      percentage: totalPeriodAmt > 0 ? Math.round((Number(c.amount) / totalPeriodAmt) * 1000) / 10 : 0,
    }));

    // Breakdown by payment method
    const paymentRows = await dbAll<{ payment_method: string; amount: number; count: number }>(
      `SELECT payment_method, ROUND(COALESCE(SUM(amount), 0), 2) as amount, COUNT(*) as count 
       FROM expenses ${periodWhere} 
       GROUP BY payment_method 
       ORDER BY amount DESC`,
      periodParams
    );

    res.json({
      total_expenses: Math.round(totalPeriodAmt * 100) / 100,
      expense_count: Number(periodTotal?.count || 0),
      today_expenses: Math.round(Number(todayTotal?.total || 0) * 100) / 100,
      this_month_expenses: Math.round(Number(monthTotal?.total || 0) * 100) / 100,
      by_category: byCategory,
      by_payment_method: paymentRows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Category list
expensesRouter.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const existing = await dbAll<{ category: string }>(
      'SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL AND category != ""'
    );
    const existingNames = existing.map((e) => e.category);
    const combined = Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...existingNames])).sort();
    res.json(combined);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Create an expense
expensesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      expense_date,
      category,
      amount,
      payment_method = 'CASH',
      reference_no,
      description,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Valid expense amount greater than 0 is required' });
      return;
    }

    if (!category || !String(category).trim()) {
      res.status(400).json({ error: 'Expense category is required' });
      return;
    }

    const dateStr = expense_date && String(expense_date).trim()
      ? String(expense_date).trim().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const tokenUser = extractTokenUser(req);
    const createdById = tokenUser?.id || req.body.created_by_id || null;
    const createdByName = tokenUser?.username || req.body.created_by_name || 'Owner';

    const id = 'exp_' + uuidv4().slice(0, 10);

    await dbRun(
      `INSERT INTO expenses (id, expense_date, category, amount, payment_method, reference_no, description, created_by_id, created_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        id,
        dateStr,
        String(category).trim(),
        Math.round(parsedAmount * 100) / 100,
        payment_method ? String(payment_method).toUpperCase() : 'CASH',
        reference_no ? String(reference_no).trim() : null,
        description ? String(description).trim() : null,
        createdById,
        createdByName,
      ]
    );

    const created = await dbGet('SELECT * FROM expenses WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update an expense
expensesRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM expenses WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Expense record not found' });
      return;
    }

    const {
      expense_date,
      category,
      amount,
      payment_method,
      reference_no,
      description,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Valid expense amount greater than 0 is required' });
      return;
    }

    if (!category || !String(category).trim()) {
      res.status(400).json({ error: 'Expense category is required' });
      return;
    }

    const dateStr = expense_date && String(expense_date).trim()
      ? String(expense_date).trim().split('T')[0]
      : (existing as any).expense_date;

    await dbRun(
      `UPDATE expenses 
       SET expense_date = ?, category = ?, amount = ?, payment_method = ?, reference_no = ?, description = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        dateStr,
        String(category).trim(),
        Math.round(parsedAmount * 100) / 100,
        payment_method ? String(payment_method).toUpperCase() : (existing as any).payment_method,
        reference_no !== undefined ? (reference_no ? String(reference_no).trim() : null) : (existing as any).reference_no,
        description !== undefined ? (description ? String(description).trim() : null) : (existing as any).description,
        id,
      ]
    );

    const updated = await dbGet('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete an expense
expensesRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM expenses WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Expense record not found' });
      return;
    }

    await dbRun('DELETE FROM expenses WHERE id = ?', [id]);
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
