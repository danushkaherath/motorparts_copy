# 🛒 Modern Grocery Store POS (VPS-Hosted)

A high-speed, modern, offline-resilient **Point of Sale (POS) and Store Management System** tailored for grocery stores, supermarkets, and convenience stores.

Designed for rapid checkout with barcode scanning, Cash/Card payments, 58mm/80mm ESC/POS thermal printing, daily register shift reconciliation (X-Report and Z-Report), and a **Modular Feature Switchboard** allowing you to enable or disable modules (like Procurement or Tax) on the fly.

---

## 🚀 Key Features & Modules

### 1. Cashier POS Fast Checkout Terminal
- **Barcode Scan-First:** Permanently auto-focused scanner bar for rapid USB handheld barcode scanning.
- **Quick-Pick Visual Grid:** Touch-friendly tiles for high-frequency or non-barcoded items (bakery, bags, water).
- **Cart Management:** Instant quantity increments/decrements, line item deletions, and cart park/hold (`[F1]`) & recall (`[F2]`).
- **Payment Tender:**
  - 💵 **Cash:** Giant total due, denomination preset buttons ($5, $10, $20, $50, $100), live Change Due calculation, and cash drawer kick trigger.
  - 💳 **Card:** Quick card terminal reference recording and instant approval.
- **Thermal Receipt Printing:** 58mm / 80mm ESC/POS layout with customizable store name, address, tax breakdown, barcode, and footer note.

### 2. Cash Register Shifts (X-Report & Z-Report)
- **Opening Cash Float:** Record cash placed in the register at the start of each cashier shift.
- **X-Report (Mid-Shift):** View current live totals (Cash, Card, Total Sales, Expected Cash in Drawer) without closing the register.
- **Z-Report (Day-End Settlement):** Cashier enters physical cash counted; automatically reconciles variance (Balanced, Overage, or Shortage) and generates the settlement audit slip.

### 3. Inventory & Grocery Catalog
- Barcode assignment, SKU, Category, Cost Price, Selling Price, and Stock Levels.
- Real-time stock decrements upon checkout completion.
- Low-stock warning filters (≤ 10 items) and 1-click Export to CSV.

### 4. Staff & Access Control Management (RBAC)
- **User Creation:** Add cashiers, supervisors, and store administrators with 4-digit PINs.
- **Role Permissions Matrix:**
  - **Cashier:** Point of sale billing, barcode scanning, cash/card tender, cart hold & recall.
  - **Supervisor:** Cashier privileges + authorize custom discounts (> $5.00), void transactions, and conduct mid-shift X-Report audits.
  - **Admin / Store Manager:** Unrestricted access, user creation, inventory master, procurement, modular switchboard, and day-end Z-Report settlement.
- **PIN Lock Screen (`F9`):** Lock terminal on demand when stepping away from the register.

### 5. Modular Feature Switchboard (Enable / Disable Modules)
Configure what your store needs directly from **Settings ➔ Modular Switchboard**:
| Module / Feature | Description | Default |
|---|---|---|
| **Procurement & Vendors** | Purchase orders, supplier directory, and 1-click Goods Received (GRN) stock intake. | *Configurable (Off by default)* |
| **Tax & VAT Calculations** | Computes sales tax percentage on receipts and tax breakdown ledgers. Disable for clean gross-only billing. | *Configurable (Off by default)* |
| **Batch & Expiry Tracking** | Track batch numbers and receive alerts for perishables expiring within 14–30 days. | *Enabled* |
| **Discounts Engine** | Item-level and cart-level promotional discount overrides. | *Enabled* |

### 5. Offline Resilience
- Products and prices are cached locally in the browser via **IndexedDB (Dexie.js)**.
- If internet connection to the VPS flickers, cashiers can continue scanning items and completing sales uninterrupted.
- Queued offline orders automatically synchronize to the VPS when connectivity is restored.

---

## ⌨️ Cashier Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` (in Scan Bar) | Scan Barcode / Add to Cart |
| `Space` or `F4` | Pay with **CASH** (Opens Change Calculator) |
| `F5` | Pay with **CARD** |
| `F1` | **Hold Cart** (Park current customer cart) |
| `F2` | **Recall Cart** (Retrieve parked customer cart) |
| `F3` | **Clear Cart** |
| `Esc` | Close active payment modal or receipt |

---

## 💻 Local Development Setup

### Prerequisites
- Node.js (v18+) & npm

### Running Backend (Port 4000)
```bash
cd backend
npm install
npm run dev
```

### Running Frontend (Port 3000)
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🌐 Deploying to a Linux VPS (Ubuntu / Debian)

### 1-Click Provisioning Script
On a fresh VPS (Hetzner, DigitalOcean, Linode, AWS Lightsail, etc.):

1. Clone or copy this repository to your VPS:
   ```bash
   git clone <your-repo-url> /opt/grocerystore
   cd /opt/grocerystore
   ```

2. Run the automated VPS setup script:
   ```bash
   chmod +x scripts/*.sh
   bash scripts/setup-vps.sh
   ```
   This script will:
   - Install Docker and Docker Compose
   - Configure UFW firewall (allow SSH 22, HTTP 80, HTTPS 443)
   - Build and launch the containerized backend and frontend services

3. Access your POS application at `http://<YOUR_VPS_IP>`.

### Setting up SSL (Let's Encrypt)
If you have a domain pointed to your VPS (e.g. `pos.yourgrocerystore.com`):
```bash
sudo certbot --nginx -d pos.yourgrocerystore.com
```

### Automated Database Backups
Set up a daily cron job to backup the database:
```bash
# Add to crontab (runs every midnight):
0 0 * * * /opt/grocerystore/scripts/backup-db.sh >> /var/log/pos-backup.log 2>&1
```
