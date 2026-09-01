# CAFÉ CUE & BREW — MIGRATION MAP (PHASE 0)

---

## 1. COMPONENT MAPPING TABLE

| NestJS Module / Component | Current Location | Target Laravel Component | Target Location |
| :--- | :--- | :--- | :--- |
| `AuthModule` / `AuthService` | `backend/src/auth/` | `AuthController`, `AuthService`, `StaffSession` | `app/Http/Controllers/AuthController.php`, `app/Services/AuthService.php` |
| `JwtAuthGuard` / `RolesGuard` | `backend/src/auth/` | Custom Middleware & Gates | `app/Http/Middleware/VerifyStaffSession.php`, `app/Providers/AuthServiceProvider.php` |
| `StaffModule` / `StaffService` | `backend/src/staff/` | `StaffController`, `StaffService` | `app/Http/Controllers/StaffController.php`, `app/Services/StaffService.php` |
| `CategoriesModule` | `backend/src/categories/` | `CategoryController` | `app/Http/Controllers/CategoryController.php` |
| `MenuModule` | `backend/src/menu/` | `MenuController`, `PublicMenuController` | `app/Http/Controllers/MenuController.php` |
| `TablesModule` | `backend/src/tables/` | `TableController`, `WaiterCallController` | `app/Http/Controllers/TableController.php`, `app/Http/Controllers/WaiterCallController.php` |
| `OrdersModule` | `backend/src/orders/` | `OrderController`, `BillingController`, `PaymentController`, `OrderService` | `app/Http/Controllers/OrderController.php`, `app/Services/OrderService.php` |
| `InventoryModule` | `backend/src/inventory/` | `InventoryController`, `StockService` | `app/Http/Controllers/InventoryController.php`, `app/Services/StockService.php` |
| `CustomersModule` | `backend/src/customers/` | `CustomerController`, `CreditController`, `LoyaltyController` | `app/Http/Controllers/CustomerController.php`, `app/Services/LoyaltyService.php` |
| `CouponsModule` | `backend/src/coupons/` | `CouponController` | `app/Http/Controllers/CouponController.php` |
| `BannersModule` | `backend/src/banners/` | `BannerController` | `app/Http/Controllers/BannerController.php` |
| `ExpensesModule` | `backend/src/expenses/` | `ExpenseController` | `app/Http/Controllers/ExpenseController.php` |
| `MarketingModule` | `backend/src/marketing/` | `CampaignController`, `MarketingQueueJob` Command | `app/Http/Controllers/CampaignController.php`, `app/Console/Commands/ProcessMarketingQueue.php` |
| `AnalyticsModule` | `backend/src/analytics/` | `AnalyticsController`, `ReportController` | `app/Http/Controllers/AnalyticsController.php`, `app/Services/ReportService.php` |
| `SettingsModule` | `backend/src/settings/` | `SettingController` | `app/Http/Controllers/SettingController.php` |
| `UploadsModule` | `backend/src/uploads/` | `UploadController` | `app/Http/Controllers/UploadController.php` |

---

## 2. PRISMA MODEL TO ELOQUENT MODEL MAPPING

| Prisma Model Name | Existing MySQL Table | Target Laravel Eloquent Model | Eloquent Relations |
| :--- | :--- | :--- | :--- |
| `Staff` | `Staff` | `App\Models\Staff` | `hasMany(StaffSession::class)`, `hasMany(Order::class, 'createdById')`, etc. |
| `StaffSession` | `StaffSession` | `App\Models\StaffSession` | `belongsTo(Staff::class)` |
| `StaffLoginHistory` | `StaffLoginHistory` | `App\Models\StaffLoginHistory` | `belongsTo(Staff::class)` |
| `Attendance` | `Attendance` | `App\Models\Attendance` | `belongsTo(Staff::class)` |
| `RestaurantSettings` | `RestaurantSettings` | `App\Models\RestaurantSettings` | N/A (Single-row configuration) |
| `RestaurantTable` | `RestaurantTable` | `App\Models\RestaurantTable` | `hasMany(Order::class)`, `hasMany(WaiterCall::class)`, `hasOne(TableQrToken::class)` |
| `Category` | `Category` | `App\Models\Category` | `hasMany(MenuItem::class)` |
| `MenuItem` | `MenuItem` | `App\Models\MenuItem` | `belongsTo(Category::class)`, `hasMany(MenuVariant::class)`, `hasMany(Recipe::class)` |
| `MenuVariant` | `MenuVariant` | `App\Models\MenuVariant` | `belongsTo(MenuItem::class)`, `hasMany(Recipe::class)` |
| `Addon` | `Addon` | `App\Models\Addon` | `hasMany(Recipe::class)` |
| `Customer` | `Customer` | `App\Models\Customer` | `hasMany(Order::class)`, `hasMany(CreditLedger::class)`, `hasMany(LoyaltyTransaction::class)` |
| `Order` | `Order` | `App\Models\Order` | `belongsTo(Customer::class)`, `belongsTo(RestaurantTable::class)`, `hasMany(OrderItem::class)` |
| `OrderItem` | `OrderItem` | `App\Models\OrderItem` | `belongsTo(Order::class)`, `belongsTo(MenuItem::class)`, `hasMany(OrderItemAddon::class)` |
| `Bill` | `Bill` | `App\Models\Bill` | `belongsTo(Order::class)`, `hasMany(Payment::class)` |
| `Payment` | `Payment` | `App\Models\Payment` | `belongsTo(Order::class)`, `belongsTo(Bill::class)`, `hasMany(SplitPayment::class)` |
| `Ingredient` | `Ingredient` | `App\Models\Ingredient` | `hasMany(Recipe::class)`, `hasMany(StockTransaction::class)` |
| `Recipe` | `Recipe` | `App\Models\Recipe` | `belongsTo(MenuItem::class)`, `belongsTo(Ingredient::class)` |
| `StockTransaction` | `StockTransaction` | `App\Models\StockTransaction` | `belongsTo(Ingredient::class)`, `belongsTo(Staff::class, 'changedById')` |
| `Supplier` | `Supplier` | `App\Models\Supplier` | `hasMany(Purchase::class)` |
| `Purchase` | `Purchase` | `App\Models\Purchase` | `belongsTo(Supplier::class)`, `hasMany(PurchaseItem::class)` |
| `WastageEntry` | `WastageEntry` | `App\Models\WastageEntry` | `belongsTo(Ingredient::class)` |
| `Expense` | `Expense` | `App\Models\Expense` | `belongsTo(Staff::class, 'createdById')` |
| `CreditLedger` | `CreditLedger` | `App\Models\CreditLedger` | `belongsTo(Customer::class)`, `hasMany(CreditPayment::class)` |
| `Coupon` | `Coupon` | `App\Models\Coupon` | `hasMany(CouponUsage::class)` |
| `Campaign` | `Campaign` | `App\Models\Campaign` | `hasMany(MarketingQueueJob::class)` |

---

## 3. DTO TO FORM REQUEST MAPPING

- `LoginDto` $\rightarrow$ `App\Http\Requests\LoginRequest`
- `CreateOrderDto` $\rightarrow$ `App\Http\Requests\CreateOrderRequest`
- `CreateMenuItemDto` $\rightarrow$ `App\Http\Requests\CreateMenuItemRequest`
- `CreateIngredientDto` $\rightarrow$ `App\Http\Requests\CreateIngredientRequest`
- `CreatePurchaseDto` $\rightarrow$ `App\Http\Requests\CreatePurchaseRequest`
- `CreateExpenseDto` $\rightarrow$ `App\Http\Requests\CreateExpenseRequest`
- `RecordCreditPaymentDto` $\rightarrow$ `App\Http\Requests\RecordCreditPaymentRequest`
- `CreateCouponDto` $\rightarrow$ `App\Http\Requests\CreateCouponRequest`
- `CreateCampaignDto` $\rightarrow$ `App\Http\Requests\CreateCampaignRequest`

---

## 4. CRON & SCHEDULER MAPPING

- `POST /api/marketing/queue/process` (NestJS controller) $\rightarrow$ `php artisan marketing:process-queue` (Laravel Console Command invoked by Hostinger Cron).
- Stale Job Recovery $\rightarrow$ `php artisan marketing:recover-stale-jobs` (Scheduled in `routes/console.php`).
