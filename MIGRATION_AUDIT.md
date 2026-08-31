# CAFÉ CUE & BREW — MIGRATION AUDIT (PHASE 0)

---

## A. COMPLETE CURRENT ARCHITECTURE

The existing **Café Cue & Brew** application uses a decoupled client-server architecture running on Node.js:

1. **Frontend**: Next.js 16.2 (App Router) configured with `output: 'export'` for static asset generation.
2. **Backend**: NestJS 10.x running on Node.js / Express framework.
3. **ORM & Database**: Prisma ORM 5.x connecting to MySQL 8.0 / MariaDB.
4. **Authentication**: Staff PIN login authenticated via `bcryptjs`, issuing signed JWT tokens backed by `StaffSession` database records.
5. **Rate Limiting & Static Assets**: `@nestjs/throttler` (300 req/min global quota) and `@nestjs/serve-static` serving user file uploads (`/uploads`).
6. **Deployment Target**: Hostinger Business Shared Hosting (MySQL + single persistent Node.js process for backend, static HTML/CSS/JS files served via Apache/LiteSpeed for frontend).

---

## B. COMPLETE FEATURE INVENTORY

| Feature Area | Key Functionalities |
| :--- | :--- |
| **Authentication & Staff** | Staff PIN login (4/6 digits), failed attempts lock policy (max 5 attempts, 15-min lock), PIN change enforcement (`mustChangePin`), role-based access (`OWNER`, `MANAGER`, `WAITER`, `CASHIER`), staff attendance clock-in/clock-out, staff audit logs. |
| **Point of Sale (POS)** | Table selection / Takeaway / Dine-in order creation, item selection with variants and addons, cart management, manual discounts (with role-based percentage caps), coupon application, night charges, GST calculation (CGST/SGST), bill generation, draft vs finalized bills, cash change calculation, UPI QR generation, split payments, credit payments. |
| **Orders & KDS** | Order status lifecycle (`RECEIVED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED` $\rightarrow$ `COMPLETED` / `CANCELLED` / `VOIDED`), public QR customer order placement, public tracking by token, order status history logging. |
| **Tables & QR Menu** | Restaurant tables management (table number, capacity, status: `AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING`), table QR token generation, waiter call notifications (`PENDING`, `ACKNOWLEDGED`, `RESOLVED`), digital QR menu with search, category filtering, veg/non-veg filter, best seller / recommended badges. |
| **Menu & Addons** | Categories, Menu Items (veg/non-veg, prep time, popularity, price), Menu Variants (sizes/options with custom prices), Addons, Recipe linkage per item/variant/addon. |
| **Inventory & Stock** | Ingredients (SKU, unit, current stock, reorder level, average cost, last cost), Recipes (BOM mapping items/variants/addons to ingredient quantities), Stock Transactions (atomic stock adjustments, purchases, consumption, wastage, reversals), Suppliers, Purchase orders (Draft $\rightarrow$ Finalized), Wastage tracking. |
| **Customers & CRM** | Customer profiles (phone E.164 normalized, name, email, birthday, anniversary), consent management (marketing, WhatsApp, email), customer tags, customer identity conflict resolution (duplicate phone detection), customer purchase history. |
| **Credit Ledger** | Outstanding credit balance tracking per customer, due dates, credit payments (cash/UPI/card), settlement status (`UNPAID`, `PARTIAL`, `PAID`), manual WhatsApp balance reminder trigger. |
| **Loyalty Program** | Points earning based on spend, redemption requests (`PENDING` $\rightarrow$ `APPROVED` / `REJECTED`), point balance ledger, minimum/maximum redemption rules, transaction history. |
| **Coupons & Banners** | Coupons (Flat / Percentage / Birthday / Festival, min order, max discount, per-customer limits, usage counters, ledger), Promotional Banners (linked to coupons, menu items, or categories). |
| **Expenses** | Operating expense entry (Rent, Electricity, Gas, Salary, Raw Material, etc.), expense status (`ACTIVE`, `VOIDED`), payment methods, expense date filtering. |
| **Marketing Engine** | Marketing campaigns (WhatsApp, Email, SMS, Push), templates with variable placeholders, targeting segment rules, queue processing (`PENDING` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED` / `FAILED`), retry logic, stale job recovery, delivery logs. |
| **Analytics & Reports** | Sales trends, order metrics, payment method breakdown, top menu items, GST tax reports, credit due reports, cancellation reports, CSV export generation. |
| **System Settings** | Café branding, tax rates (GST, CGST, SGST, inclusive/exclusive pricing), discount limits per role, night charges, QR ordering parameters, security policies. |

---

## C. COMPLETE API ENDPOINT INVENTORY

### 1. Authentication (`/api/auth`)
- `POST /api/auth/login`: Staff PIN login, returns JWT token & staff details.
- `POST /api/auth/logout`: Invalidates active `StaffSession`.
- `GET /api/auth/me`: Fetches current authenticated staff profile.

### 2. Staff Management (`/api/staff`)
- `GET /api/staff`: List all staff members.
- `POST /api/staff`: Create new staff account.
- `GET /api/staff/:id`: Get staff details.
- `PUT /api/staff/:id`: Update staff details.
- `PATCH /api/staff/:id/pin`: Reset/change staff PIN.
- `PATCH /api/staff/:id/status`: Toggle staff active/inactive status.
- `POST /api/staff/attendance/clock-in`: Clock in staff.
- `POST /api/staff/attendance/clock-out`: Clock out staff.
- `GET /api/staff/attendance/history`: View attendance logs.

### 3. Categories & Menu (`/api/categories`, `/api/menu`, `/api/public`)
- `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/:id`, `DELETE /api/categories/:id`: Manage categories.
- `GET /api/menu`, `POST /api/menu`, `GET /api/menu/:id`, `PUT /api/menu/:id`, `DELETE /api/menu/:id`, `PATCH /api/menu/:id/toggle`: Manage menu items.
- `POST /api/menu/:id/variants`, `DELETE /api/menu/variants/:variantId`: Manage variants.
- `POST /api/menu/:id/addons`, `DELETE /api/menu/addons/:addonId`: Manage addons.
- `GET /api/public/menu`: Public digital QR menu listing.
- `GET /api/public/banners`: Public promotional banners listing.

### 4. Tables & Waiter Calls (`/api/tables`, `/api/public/tables`, `/api/waiter-calls`)
- `GET /api/tables`, `POST /api/tables`, `PUT /api/tables/:id`, `DELETE /api/tables/:id`: Manage tables.
- `POST /api/tables/:id/qr-token`: Generate table QR token.
- `GET /api/public/tables/:qrToken`: Resolve table info from QR token.
- `POST /api/public/tables/:qrToken/waiter-call`: Request waiter assistance.
- `GET /api/waiter-calls`: View active waiter call requests.
- `PATCH /api/waiter-calls/:id/acknowledge`, `PATCH /api/waiter-calls/:id/resolve`: Handle waiter call.

### 5. Orders & Billing (`/api/orders`, `/api/public/orders`, `/api/billing`, `/api/payments`)
- `GET /api/orders`: List staff/POS orders with status filters.
- `POST /api/orders`: Create POS order (staff).
- `GET /api/orders/:id`: Get detailed order info.
- `PATCH /api/orders/:id/status`: Update order status lifecycle.
- `POST /api/orders/:id/cancel`, `POST /api/orders/:id/void`: Cancel or void order.
- `POST /api/public/orders`: Place public QR menu order.
- `GET /api/public/orders/track/:token`: Track order status via public token.
- `GET /api/billing/order/:orderId`: Get or calculate bill for an order.
- `POST /api/billing/finalize`: Finalize bill (assign invoice number, snapshot tax/discounts).
- `POST /api/payments`: Record payment (Cash, UPI, Card, Credit, Split).

### 6. Inventory & Purchases (`/api/inventory`)
- `GET /api/inventory/ingredients`, `POST /api/inventory/ingredients`, `PUT /api/inventory/ingredients/:id`: Ingredients stock management.
- `GET /api/inventory/recipes`, `POST /api/inventory/recipes`, `DELETE /api/inventory/recipes/:id`: Recipe BOM mappings.
- `GET /api/inventory/suppliers`, `POST /api/inventory/suppliers`, `PUT /api/inventory/suppliers/:id`: Supplier profiles.
- `GET /api/inventory/purchases`, `POST /api/inventory/purchases`, `POST /api/inventory/purchases/:id/finalize`: Purchase orders.
- `POST /api/inventory/wastage`: Record stock wastage.
- `POST /api/inventory/adjustments`: Record manual stock adjustments (IN/OUT).
- `GET /api/inventory/transactions`: View complete audit trail of stock transactions.

### 7. Customers, Loyalty & Credits (`/api/customers`, `/api/credits`, `/api/loyalty`)
- `GET /api/customers`, `POST /api/customers`, `GET /api/customers/:id`, `PUT /api/customers/:id`: Customer management.
- `GET /api/customers/conflicts`, `POST /api/customers/conflicts/:id/resolve`: Identity conflict resolution.
- `GET /api/credits/summary`, `GET /api/credits/customer/:customerId`, `POST /api/credits/payment`: Credit ledger management.
- `GET /api/loyalty/customer/:customerId`, `POST /api/loyalty/adjust`, `POST /api/loyalty/redemption-request`, `POST /api/loyalty/approve-redemption`: Loyalty points management.

### 8. Coupons, Banners, Expenses, Marketing (`/api/coupons`, `/api/banners`, `/api/expenses`, `/api/marketing`)
- `GET /api/coupons`, `POST /api/coupons`, `PUT /api/coupons/:id`, `PATCH /api/coupons/:id/toggle`, `POST /api/public/coupons/validate`: Coupon management.
- `GET /api/banners`, `POST /api/banners`, `PUT /api/banners/:id`, `DELETE /api/banners/:id`: Promotional banners.
- `GET /api/expenses`, `POST /api/expenses`, `POST /api/expenses/:id/void`: Expense tracking.
- `GET /api/marketing/campaigns`, `POST /api/marketing/campaigns`, `POST /api/marketing/queue/process`, `GET /api/marketing/analytics`: Marketing engine.

### 9. Analytics & Reports (`/api/analytics`, `/api/reports`)
- `GET /api/analytics/overview`, `GET /api/analytics/sales-trend`, `GET /api/analytics/items`: Executive dashboard metrics.
- `GET /api/reports/daily-sales`, `GET /api/reports/gst`, `GET /api/reports/credit-due`, `GET /api/reports/:reportType/export.csv`: Reporting & CSV exports.

### 10. Settings & File Uploads (`/api/settings`, `/api/uploads`)
- `GET /api/settings`, `PUT /api/settings`: Café settings configuration.
- `POST /api/uploads`: Upload menu images, banners, receipts.

---

## D. DATABASE TABLE / MODEL INVENTORY

The existing MySQL database contains **36 Prisma Models**:

1. `Staff` (`Staff` table)
2. `StaffSession` (`StaffSession` table)
3. `StaffLoginHistory` (`StaffLoginHistory` table)
4. `Attendance` (`Attendance` table)
5. `RestaurantSettings` (`RestaurantSettings` table)
6. `RestaurantTable` (`RestaurantTable` table)
7. `Category` (`Category` table)
8. `MenuItem` (`MenuItem` table)
9. `MenuVariant` (`MenuVariant` table)
10. `Addon` (`Addon` table)
11. `MenuItemAddon` (`MenuItemAddon` table)
12. `Customer` (`Customer` table)
13. `CustomerIdentityConflict` (`CustomerIdentityConflict` table)
14. `CustomerIdentityConflictMember` (`CustomerIdentityConflictMember` table)
15. `CustomerTag` (`CustomerTag` table)
16. `CustomerTagAssignment` (`CustomerTagAssignment` table)
17. `Order` (`Order` table)
18. `OrderItem` (`OrderItem` table)
19. `OrderItemAddon` (`OrderItemAddon` table)
20. `OrderStatusHistory` (`OrderStatusHistory` table)
21. `Bill` (`Bill` table)
22. `Payment` (`Payment` table)
23. `SplitPayment` (`SplitPayment` table)
24. `Coupon` (`Coupon` table)
25. `CouponUsage` (`CouponUsage` table)
26. `Banner` (`Banner` table)
27. `CustomerCouponUsageCounter` (`CustomerCouponUsageCounter` table)
28. `WaiterCall` (`WaiterCall` table)
29. `Ingredient` (`Ingredient` table)
30. `Recipe` (`Recipe` table)
31. `StockTransaction` (`StockTransaction` table)
32. `Expense` (`Expense` table)
33. `Supplier` (`Supplier` table)
34. `Purchase` (`Purchase` table)
35. `PurchaseItem` (`PurchaseItem` table)
36. `WastageEntry` (`WastageEntry` table)
37. `OrderStockConsumption` (`OrderStockConsumption` table)
38. `OrderStockConsumptionReversal` (`OrderStockConsumptionReversal` table)
39. `Notification` (`Notification` table)
40. `AuditLog` (`AuditLog` table)
41. `TableQrToken` (`TableQrToken` table)
42. `InvoiceSequence` (`InvoiceSequence` table)
43. `LoyaltyTransaction` (`LoyaltyTransaction` table)
44. `LoyaltyRedemptionRequest` (`LoyaltyRedemptionRequest` table)
45. `Campaign` (`Campaign` table)
46. `CampaignTemplate` (`CampaignTemplate` table)
47. `MarketingQueueJob` (`MarketingQueueJob` table)
48. `CampaignDeliveryLog` (`CampaignDeliveryLog` table)
49. `TableSession` (`TableSession` table)
50. `CustomerCart` (`CustomerCart` table)
51. `CustomerCartItem` (`CustomerCartItem` table)
52. `CreditLedger` (`CreditLedger` table)
53. `CreditPayment` (`CreditPayment` table)

---

## E. AUTHENTICATION & AUTHORIZATION ARCHITECTURE

- **Staff PIN Login**: 4 or 6-digit PIN hashed using `bcryptjs`.
- **Lockout Policy**: 5 consecutive failed attempts lock the staff account for 15 minutes.
- **JWT & Session Verification**: On login, a JWT is issued containing `sub` (staff ID), `role`, `name`, and `sid` (session ID). Simultaneously, a `StaffSession` record is saved in MySQL storing a SHA-256 hash of the token.
- **Role Hierarchy**:
  - `OWNER`: Full administrative access.
  - `MANAGER`: Operation management (configurable access to financials/CRM via `RestaurantSettings`).
  - `WAITER`: Table order taking, waiter call handling.
  - `CASHIER`: POS checkout, order management, billing.

---

## F. EXTERNAL INTEGRATIONS & FILE STORAGE

1. **WhatsApp Links**: Client-side `wa.me` links pre-filled with formatted text (manual dispatch, zero API tokens/workers).
2. **File Storage**: Static image uploads (`uploads/categories`, `uploads/menu`, `uploads/banners`, `uploads/qr`) saved to local disk. Served via static handler.
3. **Exports**: Dynamic CSV generation for sales, GST tax, credit due, and inventory reports.

---

## G. CRON & BACKGROUND PROCESSING

- Marketing Queue processing (`POST /api/marketing/queue/process`) is triggered periodically via Hostinger Cron `curl` calls. No in-process persistent daemon threads or Redis required.

---

## H. FRONTEND ROUTE / PAGE INVENTORY

24 Next.js App Router static pages:
- `/` (Redirect to login/POS)
- `/login` (Staff PIN login screen)
- `/change-pin` (PIN reset prompt)
- `/dashboard` (Executive KPI overview)
- `/dashboard/pos` (Main cashier/waiter POS terminal)
- `/dashboard/orders` (KDS / Order tracking list)
- `/dashboard/tables` (Table layout & Waiter calls)
- `/dashboard/menu` (Menu items & variants management)
- `/dashboard/categories` (Category management)
- `/dashboard/inventory` (Stock levels, purchases, wastage)
- `/dashboard/customers` (Customer directory & CRM)
- `/dashboard/credits` (Credit ledger & payment entry)
- `/dashboard/coupons` (Coupon management)
- `/dashboard/banners` (Promotional banner setup)
- `/dashboard/campaigns` (Marketing campaign list)
- `/dashboard/campaigns/detail` (Campaign creation/editor)
- `/dashboard/campaigns/reports` (Campaign delivery logs)
- `/dashboard/expenses` (Expense ledger)
- `/dashboard/bills` (Invoices & billing list)
- `/dashboard/reports` (Financial, GST, Sales reports)
- `/dashboard/settings` (Café configuration)
- `/dashboard/staff` (Staff accounts & attendance)
- `/menu` (Public customer QR digital menu)
- `/menu/track` (Public order status tracking)

---

## I. POTENTIAL MIGRATION RISKS & MITIGATIONS

1. **Financial Precision**: Money fields must preserve `DECIMAL(10, 2)` or `DECIMAL(12, 2)` precision in Eloquent models using `$casts = ['amount' => 'decimal:2']`.
2. **Stock Deduction Atomicity**: Complex stock deductions during order completion/cancellation must be wrapped in `DB::transaction()` to ensure atomicity.
3. **Session Token Compatibility**: Converting NestJS JWT SHA-256 session lookups to Laravel Session or Sanctum tokens without breaking client headers (`Authorization: Bearer <token>`).
4. **Hostinger Process Budget**: Ensure Laravel operates strictly as a conventional PHP application without persistent Node.js processes.

---

## J. RECOMMENDED LARAVEL REPLACEMENT FOR EACH COMPONENT

- **NestJS Controllers/Services** $\rightarrow$ Laravel Controllers & Service classes (`app/Services/...`).
- **Prisma Models** $\rightarrow$ Laravel Eloquent Models (`app/Models/...`).
- **NestJS DTOs** $\rightarrow$ Laravel Form Requests (`app/Http/Requests/...`).
- **NestJS Guards** $\rightarrow$ Laravel Middleware (`app/Http/Middleware/...`) & Policies (`app/Policies/...`).
- **Hostinger Cron / Queue** $\rightarrow$ Laravel Artisan Commands & Hostinger Cron `php artisan schedule:run`.
- **Static Assets** $\rightarrow$ Laravel Storage disk (`storage/app/public` linked to `public/storage`).
