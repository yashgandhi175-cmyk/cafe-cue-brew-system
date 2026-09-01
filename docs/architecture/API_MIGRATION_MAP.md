# CAFÉ CUE & BREW — API MIGRATION MAP (PHASE 3)

This document maps all 72+ NestJS API endpoints from `backend/src/` to their corresponding Laravel 11 routes, controllers, request validations, authentication guards, and business services.

---

## 1. ENDPOINT MIGRATION MATRIX

| Module | HTTP Method | Route | NestJS Controller / Handler | Laravel Route | Laravel Controller | Auth Required | Role Required | Key Database / Business Logic |
|---|---|---|---|---|---|---|---|---|
| **Health** | GET | `/api/health` | `AppController.getHealth()` | `GET /api/health` | Closure in `routes/api.php` | No | None | System status, timestamp & version |
| **Auth** | POST | `/api/auth/login` | `AuthController.login()` | `POST /api/auth/login` | `AuthController@login` | No | None | Staff PIN verification, failed attempt tracking, 15m lockout, JWT generation, StaffSession creation |
| **Auth** | POST | `/api/auth/logout` | `AuthController.logout()` | `POST /api/auth/logout` | `AuthController@logout` | Yes | Any | Delete/deactivate `StaffSession`, audit log entry |
| **Auth** | GET | `/api/auth/me` | `AuthController.getProfile()` | `GET /api/auth/me` | `AuthController@me` | Yes | Any | Return current authenticated staff profile |
| **Auth** | POST | `/api/auth/change-pin` | `AuthController.changePin()` | `POST /api/auth/change-pin` | `AuthController@changePin` | Yes | Any | Verify old PIN, hash new PIN, set `mustChangePin = false` |
| **Staff** | GET | `/api/staff` | `StaffController.getStaff()` | `GET /api/staff` | `StaffController@index` | Yes | OWNER, MANAGER | List all staff members (excluding sensitive pinHash) |
| **Staff** | POST | `/api/staff` | `StaffController.createStaff()` | `POST /api/staff` | `StaffController@store` | Yes | OWNER | Create new staff member, bcrypt hash initial PIN |
| **Staff** | PUT | `/api/staff/:id` | `StaffController.updateStaff()` | `PUT /api/staff/{id}` | `StaffController@update` | Yes | OWNER | Update staff name, phone, role, status |
| **Staff** | DELETE | `/api/staff/:id` | `StaffController.deleteStaff()` | `DELETE /api/staff/{id}` | `StaffController@destroy` | Yes | OWNER | Deactivate/delete staff account |
| **Staff** | GET | `/api/staff/sessions` | `StaffController.getSessions()` | `GET /api/staff/sessions` | `StaffController@sessions` | Yes | OWNER, MANAGER | List active sessions across staff |
| **Staff** | POST | `/api/staff/sessions/revoke-all` | `StaffController.revokeSessions()` | `POST /api/staff/sessions/revoke-all` | `StaffController@revokeSessions` | Yes | OWNER | Revoke all active staff sessions |
| **Staff** | GET | `/api/staff/login-history` | `StaffController.getLoginHistory()` | `GET /api/staff/login-history` | `StaffController@loginHistory` | Yes | OWNER, MANAGER | Audit login history attempts |
| **Staff** | GET | `/api/staff/attendance` | `StaffController.getAttendance()` | `GET /api/staff/attendance` | `StaffController@attendance` | Yes | OWNER, MANAGER | List clock-in/out records |
| **Staff** | POST | `/api/staff/attendance/clock-in` | `StaffController.clockIn()` | `POST /api/staff/attendance/clock-in` | `StaffController@clockIn` | Yes | Any | Record staff clock-in timestamp |
| **Staff** | POST | `/api/staff/attendance/clock-out` | `StaffController.clockOut()` | `POST /api/staff/attendance/clock-out` | `StaffController@clockOut` | Yes | Any | Record clock-out timestamp and calculate shift duration |
| **Settings** | GET | `/api/settings` | `SettingsController.getSettings()` | `GET /api/settings` | `SettingsController@show` | No | None | Fetch singleton `RestaurantSettings` (default) |
| **Settings** | PUT | `/api/settings` | `SettingsController.updateSettings()` | `PUT /api/settings` | `SettingsController@update` | Yes | OWNER | Update operational, billing, tax & security configurations |
| **Categories** | GET | `/api/categories` | `CategoriesController.getCategories()` | `GET /api/categories` | `CategoryController@index` | No | None | List active menu categories |
| **Categories** | POST | `/api/categories` | `CategoriesController.createCategory()` | `POST /api/categories` | `CategoryController@store` | Yes | OWNER, MANAGER | Create new category |
| **Categories** | PUT | `/api/categories/:id` | `CategoriesController.updateCategory()` | `PUT /api/categories/{id}` | `CategoryController@update` | Yes | OWNER, MANAGER | Update category details/order |
| **Categories** | DELETE | `/api/categories/:id` | `CategoriesController.deleteCategory()` | `DELETE /api/categories/{id}` | `CategoryController@destroy` | Yes | OWNER, MANAGER | Delete/deactivate category |
| **Menu** | GET | `/api/menu` | `MenuController.getMenu()` | `GET /api/menu` | `MenuController@index` | No | None | List menu items with variants & addons |
| **Menu** | POST | `/api/menu` | `MenuController.createMenuItem()` | `POST /api/menu` | `MenuController@store` | Yes | OWNER, MANAGER | Create new menu item |
| **Menu** | PUT | `/api/menu/:id` | `MenuController.updateMenuItem()` | `PUT /api/menu/{id}` | `MenuController@update` | Yes | OWNER, MANAGER | Update menu item details/pricing |
| **Menu** | DELETE | `/api/menu/:id` | `MenuController.deleteMenuItem()` | `DELETE /api/menu/{id}` | `MenuController@destroy` | Yes | OWNER, MANAGER | Soft-delete or deactivate menu item |
| **Menu** | POST | `/api/menu/:id/variants` | `MenuController.createVariant()` | `POST /api/menu/{id}/variants` | `MenuController@storeVariant` | Yes | OWNER, MANAGER | Add variant to menu item |
| **Menu** | PUT | `/api/menu/variants/:id` | `MenuController.updateVariant()` | `PUT /api/menu/variants/{id}` | `MenuController@updateVariant` | Yes | OWNER, MANAGER | Update variant pricing |
| **Menu** | DELETE | `/api/menu/variants/:id` | `MenuController.deleteVariant()` | `DELETE /api/menu/variants/{id}` | `MenuController@destroyVariant` | Yes | OWNER, MANAGER | Delete variant |
| **Menu** | GET | `/api/menu/addons` | `MenuController.getAddons()` | `GET /api/menu/addons` | `MenuController@addons` | No | None | List global addons |
| **Menu** | POST | `/api/menu/addons` | `MenuController.createAddon()` | `POST /api/menu/addons` | `MenuController@storeAddon` | Yes | OWNER, MANAGER | Create new addon |
| **Menu** | PUT | `/api/menu/addons/:id` | `MenuController.updateAddon()` | `PUT /api/menu/addons/{id}` | `MenuController@updateAddon` | Yes | OWNER, MANAGER | Update addon details |
| **Menu** | DELETE | `/api/menu/addons/:id` | `MenuController.deleteAddon()` | `DELETE /api/menu/addons/{id}` | `MenuController@destroyAddon` | Yes | OWNER, MANAGER | Delete addon |
| **Public Menu** | GET | `/api/public/menu` | `PublicMenuController.getPublicMenu()` | `GET /api/public/menu` | `PublicMenuController@index` | No | None | Public QR digital menu feed |
| **Tables** | GET | `/api/tables` | `TablesController.getTables()` | `GET /api/tables` | `TableController@index` | Yes | Any | List dining tables & status |
| **Tables** | POST | `/api/tables` | `TablesController.createTable()` | `POST /api/tables` | `TableController@store` | Yes | OWNER, MANAGER | Create table |
| **Tables** | PUT | `/api/tables/:id` | `TablesController.updateTable()` | `PUT /api/tables/{id}` | `TableController@update` | Yes | OWNER, MANAGER | Update table capacity/status |
| **Tables** | DELETE | `/api/tables/:id` | `TablesController.deleteTable()` | `DELETE /api/tables/{id}` | `TableController@destroy` | Yes | OWNER, MANAGER | Delete table |
| **Tables** | POST | `/api/tables/:id/qr-token` | `TablesController.generateQrToken()` | `POST /api/tables/{id}/qr-token` | `TableController@generateQrToken` | Yes | OWNER, MANAGER | Generate secure QR ordering token |
| **Public Tables** | GET | `/api/public/tables/:token` | `PublicTablesController.getTableByToken()` | `GET /api/public/tables/{token}` | `PublicTableController@showByToken` | No | None | Validate QR token and fetch table info |
| **Waiter Calls** | POST | `/api/public/tables/:tableId/call-waiter` | `WaiterCallsController.createCall()` | `POST /api/public/tables/{tableId}/call-waiter` | `WaiterCallController@store` | No | None | Customer requests waiter call |
| **Waiter Calls** | GET | `/api/waiter-calls` | `WaiterCallsController.getCalls()` | `GET /api/waiter-calls` | `WaiterCallController@index` | Yes | WAITER, CASHIER, MANAGER, OWNER | Staff list active waiter calls |
| **Waiter Calls** | PUT | `/api/waiter-calls/:id/status` | `WaiterCallsController.updateStatus()` | `PUT /api/waiter-calls/{id}/status` | `WaiterCallController@updateStatus` | Yes | WAITER, CASHIER, MANAGER, OWNER | Acknowledge or resolve call |
| **Customers** | GET | `/api/customers` | `CustomersController.getCustomers()` | `GET /api/customers` | `CustomerController@index` | Yes | OWNER, MANAGER, CASHIER | Search/list CRM customers |
| **Customers** | POST | `/api/customers` | `CustomersController.createCustomer()` | `POST /api/customers` | `CustomerController@store` | Yes | Any | Create customer record (E.164 phone) |
| **Customers** | GET | `/api/customers/:id` | `CustomersController.getCustomer()` | `GET /api/customers/{id}` | `CustomerController@show` | Yes | Any | Customer profile & stats |
| **Customers** | PUT | `/api/customers/:id` | `CustomersController.updateCustomer()` | `PUT /api/customers/{id}` | `CustomerController@update` | Yes | Any | Update customer profile |
| **Customers** | GET | `/api/customers/tags` | `CustomersController.getTags()` | `GET /api/customers/tags` | `CustomerController@tags` | Yes | OWNER, MANAGER | List customer tags |
| **Customers** | POST | `/api/customers/tags` | `CustomersController.createTag()` | `POST /api/customers/tags` | `CustomerController@storeTag` | Yes | OWNER, MANAGER | Create customer tag |
| **Loyalty** | GET | `/api/loyalty/balance/:customerId` | `LoyaltyController.getBalance()` | `GET /api/loyalty/balance/{customerId}` | `LoyaltyController@balance` | Yes | Any | Fetch customer loyalty points |
| **Loyalty** | POST | `/api/loyalty/earn` | `LoyaltyController.earn()` | `POST /api/loyalty/earn` | `LoyaltyController@earn` | Yes | CASHIER, MANAGER, OWNER | Earn loyalty points on order |
| **Loyalty** | POST | `/api/loyalty/redeem` | `LoyaltyController.redeem()` | `POST /api/loyalty/redeem` | `LoyaltyController@redeem` | Yes | CASHIER, MANAGER, OWNER | Create redemption request |
| **Loyalty** | GET | `/api/loyalty/requests` | `LoyaltyController.getRequests()` | `GET /api/loyalty/requests` | `LoyaltyController@requests` | Yes | MANAGER, OWNER | Pending redemption requests |
| **Loyalty** | PUT | `/api/loyalty/requests/:id/approve` | `LoyaltyController.approve()` | `PUT /api/loyalty/requests/{id}/approve` | `LoyaltyController@approve` | Yes | MANAGER, OWNER | Approve redemption request |
| **Loyalty** | PUT | `/api/loyalty/requests/:id/reject` | `LoyaltyController.reject()` | `PUT /api/loyalty/requests/{id}/reject` | `LoyaltyController@reject` | Yes | MANAGER, OWNER | Reject redemption request |
| **Credits** | GET | `/api/credits` | `CreditsController.getCredits()` | `GET /api/credits` | `CreditController@index` | Yes | OWNER, MANAGER, CASHIER | List credit ledgers |
| **Credits** | POST | `/api/credits` | `CreditsController.createCredit()` | `POST /api/credits` | `CreditController@store` | Yes | OWNER, MANAGER, CASHIER | Create customer credit invoice |
| **Credits** | GET | `/api/credits/customer/:customerId` | `CreditsController.getCustomerCredits()` | `GET /api/credits/customer/{customerId}` | `CreditController@customerCredits` | Yes | Any | Customer credit ledger history |
| **Credits** | POST | `/api/credits/:id/payment` | `CreditsController.recordPayment()` | `POST /api/credits/{id}/payment` | `CreditController@recordPayment` | Yes | CASHIER, MANAGER, OWNER | Record payment against credit ledger |
| **Orders** | GET | `/api/orders` | `StaffOrdersController.getOrders()` | `GET /api/orders` | `OrderController@index` | Yes | Any | List orders with status filters |
| **Orders** | POST | `/api/orders` | `StaffOrdersController.createOrder()` | `POST /api/orders` | `OrderController@store` | Yes | Any | POS Order Creation (transactional) |
| **Orders** | GET | `/api/orders/:id` | `StaffOrdersController.getOrder()` | `GET /api/orders/{id}` | `OrderController@show` | Yes | Any | Fetch single order details |
| **Orders** | PUT | `/api/orders/:id/status` | `StaffOrdersController.updateStatus()` | `PUT /api/orders/{id}/status` | `OrderController@updateStatus` | Yes | Any | KDS Order status transition |
| **Orders** | POST | `/api/orders/:id/cancel` | `StaffOrdersController.cancelOrder()` | `POST /api/orders/{id}/cancel` | `OrderController@cancel` | Yes | MANAGER, OWNER | Cancel/Void order |
| **Public Orders** | POST | `/api/public/orders` | `PublicOrdersController.createPublicOrder()` | `POST /api/public/orders` | `PublicOrderController@store` | No | None | Customer QR order submission |
| **Public Orders** | GET | `/api/public/orders/track/:token` | `PublicOrdersController.trackOrder()` | `GET /api/public/orders/track/{token}` | `PublicOrderController@track` | No | None | Public order status timeline |
| **Billing** | GET | `/api/bills/:orderId` | `BillingController.getBill()` | `GET /api/bills/{orderId}` | `BillController@show` | Yes | Any | Fetch bill breakdown |
| **Billing** | POST | `/api/bills/:orderId/finalize` | `BillingController.finalizeBill()` | `POST /api/bills/{orderId}/finalize` | `BillController@finalize` | Yes | CASHIER, MANAGER, OWNER | Finalize invoice and calculate taxes/discounts |
| **Billing** | POST | `/api/bills/:orderId/apply-discount` | `BillingController.applyDiscount()` | `POST /api/bills/{orderId}/apply-discount` | `BillController@applyDiscount` | Yes | CASHIER, MANAGER, OWNER | Apply manual discount to bill |
| **Payments** | POST | `/api/payments` | `PaymentsController.recordPayment()` | `POST /api/payments` | `PaymentController@store` | Yes | CASHIER, MANAGER, OWNER | Process payment (Cash, UPI, Card, Credit) |
| **Payments** | POST | `/api/payments/split` | `PaymentsController.recordSplitPayment()` | `POST /api/payments/split` | `PaymentController@storeSplit` | Yes | CASHIER, MANAGER, OWNER | Process multi-method split payment |
| **Inventory** | GET | `/api/inventory/ingredients` | `InventoryController.getIngredients()` | `GET /api/inventory/ingredients` | `InventoryController@ingredients` | Yes | OWNER, MANAGER | List stock ingredients |
| **Inventory** | POST | `/api/inventory/ingredients` | `InventoryController.createIngredient()` | `POST /api/inventory/ingredients` | `InventoryController@storeIngredient` | Yes | OWNER, MANAGER | Create ingredient |
| **Inventory** | PUT | `/api/inventory/ingredients/:id` | `InventoryController.updateIngredient()` | `PUT /api/inventory/ingredients/{id}` | `InventoryController@updateIngredient` | Yes | OWNER, MANAGER | Update ingredient stock levels |
| **Inventory** | GET | `/api/inventory/recipes` | `InventoryController.getRecipes()` | `GET /api/inventory/recipes` | `InventoryController@recipes` | Yes | OWNER, MANAGER | BOM Recipe mapping |
| **Inventory** | POST | `/api/inventory/recipes` | `InventoryController.createRecipe()` | `POST /api/inventory/recipes` | `InventoryController@storeRecipe` | Yes | OWNER, MANAGER | Create recipe mapping |
| **Inventory** | GET | `/api/inventory/stock-transactions` | `InventoryController.getStockTransactions()` | `GET /api/inventory/stock-transactions` | `InventoryController@stockTransactions` | Yes | OWNER, MANAGER | Audit stock ledger |
| **Inventory** | POST | `/api/inventory/stock-transactions` | `InventoryController.recordStockTransaction()` | `POST /api/inventory/stock-transactions` | `InventoryController@storeStockTransaction` | Yes | OWNER, MANAGER | Manual stock adjustment |
| **Inventory** | GET | `/api/inventory/purchases` | `InventoryController.getPurchases()` | `GET /api/inventory/purchases` | `InventoryController@purchases` | Yes | OWNER, MANAGER | List purchases |
| **Inventory** | POST | `/api/inventory/purchases` | `InventoryController.createPurchase()` | `POST /api/inventory/purchases` | `InventoryController@storePurchase` | Yes | OWNER, MANAGER | Draft purchase invoice |
| **Inventory** | PUT | `/api/inventory/purchases/:id/finalize` | `InventoryController.finalizePurchase()` | `PUT /api/inventory/purchases/{id}/finalize` | `InventoryController@finalizePurchase` | Yes | OWNER, MANAGER | Finalize purchase and update stock |
| **Inventory** | GET | `/api/inventory/suppliers` | `InventoryController.getSuppliers()` | `GET /api/inventory/suppliers` | `InventoryController@suppliers` | Yes | OWNER, MANAGER | List suppliers |
| **Inventory** | POST | `/api/inventory/suppliers` | `InventoryController.createSupplier()` | `POST /api/inventory/suppliers` | `InventoryController@storeSupplier` | Yes | OWNER, MANAGER | Create supplier |
| **Inventory** | GET | `/api/inventory/wastage` | `InventoryController.getWastage()` | `GET /api/inventory/wastage` | `InventoryController@wastage` | Yes | OWNER, MANAGER | Wastage entries |
| **Inventory** | POST | `/api/inventory/wastage` | `InventoryController.recordWastage()` | `POST /api/inventory/wastage` | `InventoryController@storeWastage` | Yes | OWNER, MANAGER | Record wastage entry |
| **Coupons** | GET | `/api/coupons` | `CouponsController.getCoupons()` | `GET /api/coupons` | `CouponController@index` | Yes | OWNER, MANAGER | List coupons |
| **Coupons** | POST | `/api/coupons` | `CouponsController.createCoupon()` | `POST /api/coupons` | `CouponController@store` | Yes | OWNER, MANAGER | Create discount coupon |
| **Coupons** | PUT | `/api/coupons/:id` | `CouponsController.updateCoupon()` | `PUT /api/coupons/{id}` | `CouponController@update` | Yes | OWNER, MANAGER | Update coupon rules |
| **Public Coupons** | POST | `/api/public/coupons/validate` | `CouponsController.validateCoupon()` | `POST /api/public/coupons/validate` | `CouponController@validateCoupon` | No | None | Validate coupon code for order |
| **Banners** | GET | `/api/banners` | `BannersController.getBanners()` | `GET /api/banners` | `BannerController@index` | Yes | OWNER, MANAGER | Staff banner management |
| **Banners** | POST | `/api/banners` | `BannersController.createBanner()` | `POST /api/banners` | `BannerController@store` | Yes | OWNER, MANAGER | Create banner |
| **Banners** | PUT | `/api/banners/:id` | `BannersController.updateBanner()` | `PUT /api/banners/{id}` | `BannerController@update` | Yes | OWNER, MANAGER | Update banner |
| **Banners** | DELETE | `/api/banners/:id` | `BannersController.deleteBanner()` | `DELETE /api/banners/{id}` | `BannerController@destroy` | Yes | OWNER, MANAGER | Delete banner |
| **Public Banners** | GET | `/api/public/banners` | `BannersController.getPublicBanners()` | `GET /api/public/banners` | `BannerController@publicBanners` | No | None | Public promo banners feed |
| **Expenses** | GET | `/api/expenses` | `ExpensesController.getExpenses()` | `GET /api/expenses` | `ExpenseController@index` | Yes | OWNER, MANAGER | List expenses |
| **Expenses** | POST | `/api/expenses` | `ExpensesController.createExpense()` | `POST /api/expenses` | `ExpenseController@store` | Yes | OWNER, MANAGER | Create expense entry |
| **Expenses** | PUT | `/api/expenses/:id/void` | `ExpensesController.voidExpense()` | `PUT /api/expenses/{id}/void` | `ExpenseController@void` | Yes | OWNER | Void expense entry |
| **Marketing** | GET | `/api/marketing/campaigns` | `CampaignController.getCampaigns()` | `GET /api/marketing/campaigns` | `MarketingController@campaigns` | Yes | OWNER, MANAGER | List campaigns |
| **Marketing** | POST | `/api/marketing/campaigns` | `CampaignController.createCampaign()` | `POST /api/marketing/campaigns` | `MarketingController@storeCampaign` | Yes | OWNER, MANAGER | Create marketing campaign |
| **Marketing** | POST | `/api/marketing/queue/process` | `QueueController.processQueue()` | `POST /api/marketing/queue/process` | `MarketingController@processQueue` | Yes/Cron | Any | Process marketing queue (HTTP/Hostinger Cron) |
| **Marketing** | POST | `/api/marketing/queue/recover` | `QueueController.recoverQueue()` | `POST /api/marketing/queue/recover` | `MarketingController@recoverQueue` | Yes/Cron | Any | Recover stalled queue jobs |
| **Marketing** | GET | `/api/marketing/analytics` | `MarketingAnalyticsController.getAnalytics()` | `GET /api/marketing/analytics` | `MarketingController@analytics` | Yes | OWNER, MANAGER | Marketing campaign performance |
| **Analytics** | GET | `/api/analytics/dashboard` | `AnalyticsController.getDashboard()` | `GET /api/analytics/dashboard` | `AnalyticsController@dashboard` | Yes | OWNER, MANAGER | Executive KPI Dashboard |
| **Analytics** | GET | `/api/analytics/sales` | `AnalyticsController.getSales()` | `GET /api/analytics/sales` | `AnalyticsController@sales` | Yes | OWNER, MANAGER | Sales breakdown & trends |
| **Analytics** | GET | `/api/analytics/inventory` | `AnalyticsController.getInventoryAnalytics()` | `GET /api/analytics/inventory` | `AnalyticsController@inventory` | Yes | OWNER, MANAGER | Stock valuation & food cost |
| **Analytics** | GET | `/api/analytics/customers` | `AnalyticsController.getCustomerAnalytics()` | `GET /api/analytics/customers` | `AnalyticsController@customers` | Yes | OWNER, MANAGER | CRM insights & RFM segments |
| **Reports** | GET | `/api/reports/gst` | `ReportsController.getGstReport()` | `GET /api/reports/gst` | `ReportController@gst` | Yes | OWNER, MANAGER | GST tax return summary |
| **Reports** | GET | `/api/reports/sales/export` | `ReportsController.exportSales()` | `GET /api/reports/sales/export` | `ReportController@exportSales` | Yes | OWNER, MANAGER | CSV sales export |
| **Reports** | GET | `/api/reports/inventory/export` | `ReportsController.exportInventory()` | `GET /api/reports/inventory/export` | `ReportController@exportInventory` | Yes | OWNER, MANAGER | CSV stock export |
| **Uploads** | POST | `/api/uploads` | `UploadsController.uploadFile()` | `POST /api/uploads` | `UploadController@store` | Yes | Any | Local file upload (menu images, banners) |
