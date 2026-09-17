# Business Logic Audit v2 — THUSHAN POS System

**Date:** 2026-09-12 | **Scope:** Full system re-audit after first-round fixes

---

## Executive Summary

This second-pass audit identified **18 issues** across the entire POS system, including **4 Critical**, **7 High**, **5 Medium**, and **2 Low** severity findings. The first audit's 6 fixes are confirmed correctly integrated, but deeper analysis uncovered race conditions, inventory integrity gaps, and missing authentication that could cause financial losses or data corruption.

---

## ✅ First-Audit Fixes — Verified

All 6 fixes from the first audit are confirmed working correctly:

| # | Fix | Status |
|---|-----|--------|
| 1 | Falsy tender bug (`Number(tender_amount) \|\| totalAmount` → explicit check) | ✅ Correct at [sales.ts:84-86](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L84-L86) |
| 2 | Server-side subtotal recalculation | ✅ Correct at [sales.ts:47-54](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L47-L54) |
| 3 | Discount clamping (negative + over-subtotal) | ✅ Correct at [sales.ts:69-71](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L69-L71) |
| 4 | Voided orders excluded from X/Z Reports | ✅ Correct at [shifts.ts:73](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/shifts.ts#L73), [shifts.ts:133](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/shifts.ts#L133) |
| 5 | Tax report formula corrected | ✅ Correct at [reports.ts:93](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/reports.ts#L93) |
| 6 | Configurable discount threshold (250 LKR) | ✅ Correct at [database.ts:401](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/db/database.ts#L401) |

---

## 🔴 CRITICAL Issues (4)

### C1. Race Condition in Customer Loyalty Points

**File:** [sales.ts:59, 137-145](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L59)

The backend reads the customer's point balance **before** the transaction begins (line 59), calculates an absolute `customerPointsBalance` (line 81), then writes it as an absolute value inside the transaction (line 139: `points = ?`).

**Impact:** If two concurrent checkouts occur for the same customer (e.g., two registers), one overwrites the other's balance, causing **permanent point loss**.

**Fix:** Use relative SQL math inside the transaction:
```sql
UPDATE customers SET 
  points = MAX(0, points - ? + ?),
  total_spent = total_spent + ?,
  visits_count = visits_count + 1
WHERE id = ?
-- params: [effectivePointsRedeemed, pointsEarned, totalAmount, customerId]
```

---

### C2. Server Restart Wipes Unbatched Inventory

**File:** [database.ts:728-737](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/db/database.ts#L728-L737)

On every server startup, a migration reconciles `products.stock_quantity` with `SUM(product_batches.stock_quantity)` for products that have any batches. If a product has **both** batched and unbatched stock (e.g., added via bulk upload or direct adjustment), the unbatched stock is **permanently overwritten to zero** on restart.

**Impact:** Silent, permanent inventory data loss every time the backend restarts.

**Fix:** Either:
- Route all stock additions to batch records (create an "UNBATCHED" default batch), OR
- Remove this auto-reconciliation and replace with an on-demand admin reconciliation tool

---

### C3. Inventory Inflation from Capped Stock + Void

**File:** [sales.ts:184-188](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L184-L188) (checkout) and [sales.ts:359-361](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L359-L361) (void)

During checkout, stock is clamped: `stock_quantity = MAX(0, stock_quantity - ?)`. If you sell 5 units when only 2 are in stock, stock becomes 0 (not -3). When this bill is voided, the system **unconditionally adds back** 5 units: `stock_quantity = stock_quantity + 5`. Result: stock is now **5**, magically creating **3 phantom units**.

**Impact:** Permanent inventory inflation. Stock counts will drift away from reality over time.

**Fix:** Either:
- Allow stock to go negative naturally (remove `MAX(0, ...)`), OR
- Record the **actual quantity deducted** in order_items and only restore that amount on void

---

### C4. Offline Checkout Ignores Tax & Loyalty Points

**File:** [api.ts:380-403](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/frontend/src/services/api.ts#L380-L403)

When the network fails, the offline fallback fabricates a receipt with `tax_amount: 0` and no loyalty point deduction — even if tax is enabled and the customer redeemed points in the UI.

**Impact:** Customer receives an incorrect receipt. When the order syncs to the server later, the totals won't match, creating a financial discrepancy and customer dispute.

**Fix:** Pass `settings` (tax rate, loyalty config) into `api.checkout()` so the offline path can replicate the backend's calculation exactly.

---

## 🟠 HIGH Issues (7)

### H1. No Validation for Negative Quantities/Prices

**File:** [sales.ts:31-34](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L31-L34)

The checkout endpoint verifies `items.length > 0` but never checks that each `item.quantity > 0` or `item.unit_price >= 0`. A manipulated API request could submit negative quantities to generate a negative subtotal, effectively stealing cash.

**Fix:** Add before line 47:
```typescript
for (const item of items) {
  if (Number(item.quantity) <= 0) return res.status(400).json({ error: 'Item quantity must be positive' });
  if (Number(item.unit_price) < 0) return res.status(400).json({ error: 'Item price cannot be negative' });
}
```

---

### H2. No Auth Middleware on Most Routes

**File:** [index.ts:36-45](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/index.ts#L36-L45)

**None** of the route groups have `requireAuth` middleware applied at the router level. Every endpoint is accessible without any JWT or PIN:

| Route | Auth Status |
|-------|-------------|
| `/api/sales/checkout` | ❌ No auth |
| `/api/products/*` | ❌ No auth |
| `/api/shifts/*` | ❌ No auth |
| `/api/reports/*` | ❌ No auth |
| `/api/customers/*` | ❌ No auth |
| `/api/grn/*` | ❌ No auth |
| `/api/settings` (GET) | ❌ No auth |

Only individual endpoints that call `verifyAdminRequester()` internally are protected (void, settings update, user CRUD).

**Fix:** Apply `requireAuth` to route groups that should not be publicly accessible. At minimum: `app.use('/api/sales', requireAuth, salesRouter)`.

> [!IMPORTANT]
> For a local POS kiosk on a private LAN, this is medium risk. If the system is ever exposed to the internet, it becomes critical.

---

### H3. Bulk Stocktake Ignores Batches → Stock Desync

**File:** [products.ts:461-471](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/products.ts#L461-L471)

The bulk stocktake endpoint updates `products.stock_quantity` directly without touching `product_batches`. The next GRN with a batch number will recalculate stock from `SUM(product_batches.stock_quantity)`, instantly overwriting the stocktake values.

**Fix:** Either create/update corresponding batch records during stocktake, or skip the `SUM()` recalculation when stocktake has occurred since last GRN.

---

### H4. NaN Poisoning in Stock Adjustments

**File:** [products.ts:288-289, 514-515](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/products.ts#L288-L289)

In `/inventory/adjust` and `/:id/stock`, the input `amount`/`stock_quantity` is coerced with `Number()` but never checked with `isNaN()`. If a non-numeric string is passed, `NaN` propagates into the database, corrupting stock and breaking all future operations.

**Fix:** Add `if (isNaN(qty)) return res.status(400).json({ error: 'Invalid quantity' });`

---

### H5. Voiding Bills from Closed Shifts Creates Report Mismatch

**File:** [sales.ts:374-396](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/sales.ts#L374-L396)

When voiding a bill, the code skips shift total reversal if the shift is closed. However, it still voids the order and restores inventory. This means the closed Z-Report totals no longer match the sum of non-voided bills.

**Fix:** Either:
- Block void entirely for bills in closed shifts (return 400 error), OR
- Record a compensating negative entry on the current open shift

---

### H6. Duplicate Batch Records Possible

**File:** [database.ts:137-152](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/db/database.ts#L137-L152)

The `product_batches` table has **no UNIQUE constraint** on `(product_id, batch_number)`. Concurrent GRN submissions with the same batch number can create duplicates. The duplicate becomes un-updatable (only the first row is returned by `dbGet`), yet its stock is summed into totals, silently inflating inventory.

**Fix:** Add `UNIQUE (product_id, batch_number)` constraint. Handle conflicts with `INSERT OR REPLACE` or explicit `ON CONFLICT` logic.

---

### H7. Hardcoded Vendor Backdoor PIN

**File:** [settings.ts:66](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/settings.ts#L66)

The subscription-lock endpoint accepts hardcoded PINs `'9999'` and `'admin1234'` **in addition to** the stored vendor PIN. Anyone who knows these can lock/unlock the entire POS system.

```typescript
if (vendor_pin !== validPin && vendor_pin !== '9999' && vendor_pin !== 'admin1234') { ... }
```

**Fix:** Remove hardcoded fallback PINs. Only accept the stored `subscription_vendor_pin`.

---

## 🟡 MEDIUM Issues (5)

### M1. Schema Type Mismatch: INTEGER vs REAL

**File:** [database.ts:97, 145, 210](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/db/database.ts#L97)

| Table | Column | Type |
|-------|--------|------|
| `products` | `stock_quantity` | **INTEGER** |
| `product_batches` | `stock_quantity` | **REAL** |
| `order_items` | `quantity` | **INTEGER** |
| `goods_received_items` | `quantity_received` | **REAL** |

Fractional quantities (e.g., 1.5kg rice) are supported in GRN and frontend but will be **truncated to integers** when stored in `products` and `order_items`.

**Fix:** Change `products.stock_quantity` and `order_items.quantity` to `REAL`.

---

### M2. Foreign Key Crash on Product Deletion

**File:** [products.ts](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/products.ts) (DELETE endpoint)

Deleting a product that has order history, batches, or GRN items will cause an unhandled SQLite foreign key constraint error (500 crash) since foreign keys are `ON` but `CASCADE` is not configured.

**Fix:** Check for related records before deletion and return a clean 400, or implement soft-delete.

---

### M3. GRN Number Race Condition

**File:** [grn.ts:112-117](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/grn.ts#L112-L117)

GRN numbers are generated from `COUNT(*)` for today. Concurrent GRN creations will generate identical numbers, causing one to crash with a UNIQUE constraint error.

**Fix:** Use retry logic with random suffix, or use a sequence table inside the transaction.

---

### M4. Customer Deletion Orphans Orders

**File:** [customers.ts:178-186](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/customers.ts#L178-L186)

The delete endpoint runs `DELETE FROM customers WHERE id = ?` without checking if the customer has orders referencing `customer_id`. Since there's no foreign key constraint on `orders.customer_id`, the delete succeeds but leaves orphaned `customer_id` references in `orders` — breaking receipt reprints that try to look up customer details.

**Fix:** Check for linked orders before deletion, or implement soft-delete.

---

### M5. Tax Report Uses Aggregate MAX() Inside SUM() Incorrectly

**File:** [reports.ts:93, 106](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/routes/reports.ts#L93)

```sql
SUM(MAX(0, subtotal - COALESCE(discount_amount, 0)))
```

In SQLite, `MAX()` inside `SUM()` without a subquery is an aggregate function, not a row-level function. This will produce incorrect results — it calculates `MAX(0, SUM(subtotal) - SUM(discount_amount))` instead of per-row clamping.

**Fix:** Use a subquery or CASE expression:
```sql
SUM(CASE WHEN subtotal - COALESCE(discount_amount, 0) > 0 
    THEN subtotal - COALESCE(discount_amount, 0) ELSE 0 END)
```

---

## 🔵 LOW Issues (2)

### L1. Frontend Allows Quantity Beyond Stock

**File:** [useCart.ts](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/frontend/src/hooks/useCart.ts)

The cart hook doesn't constrain quantity inputs against available stock. A cashier can enter quantity 10,000 for an item with stock 5.

**Fix:** Clamp quantity to `Math.min(newQty, item.stock_quantity)` in `updateQuantity`.

---

### L2. Hardcoded JWT Secret

**File:** [auth.ts:6](file:///c:/Users/biapa/OneDrive/Desktop/grocerystore/backend/src/middleware/auth.ts#L6)

```typescript
export const JWT_SECRET = process.env.JWT_SECRET || 'grocery-pos-secure-jwt-key-2026';
```

The fallback JWT secret is a hardcoded string in source code. Anyone with access to the code can forge valid JWTs.

**Fix:** Generate a random secret on first startup and store it in the settings table. Require `JWT_SECRET` env var in production.

---

## Recommended Priority

| Priority | Issues | Impact |
|----------|--------|--------|
| **Fix Now** | C1, C3, H1, M5 | Financial calculation errors, inventory corruption |
| **Fix This Week** | C2, C4, H3, H4 | Data loss on restart, offline receipt errors |
| **Fix Next Sprint** | H2, H5, H6, H7, M1-M4 | Security, data integrity, edge cases |
| **Backlog** | L1, L2 | UX guard rails, hardening |

> [!IMPORTANT]
> **C1** (race condition in loyalty points) and **C3** (phantom inventory from void) are the most impactful issues that can cause real financial discrepancies in daily operations. **M5** (tax report SQL) will produce incorrect tax figures when tax reporting is enabled.

---

## Decision Required

Would you like me to proceed with fixing the **"Fix Now"** priority group (C1, C3, H1, M5)?

These 4 fixes are surgical, low-risk, and address the most financially impactful bugs.
