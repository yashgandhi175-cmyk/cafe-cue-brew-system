<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\MenuController;
use App\Http\Controllers\PublicMenuController;
use App\Http\Controllers\TableController;
use App\Http\Controllers\PublicTableController;
use App\Http\Controllers\WaiterCallController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\LoyaltyController;
use App\Http\Controllers\CreditController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PublicOrderController;
use App\Http\Controllers\BillController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\CouponController;
use App\Http\Controllers\BannerController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\MarketingController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\UploadController;

// Public Endpoints
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'system' => 'Café Cue & Brew Laravel Backend Foundation',
        'laravel' => app()->version(),
        'version' => '1.0.0',
        'timestamp' => now()->toIso8601String(),
    ]);
});

Route::get('/health/ready', function () {
    try {
        \Illuminate\Support\Facades\DB::select('SELECT 1');
        return response()->json([
            'status' => 'ready',
            'database' => 'connected',
            'system' => 'Café Cue & Brew Laravel Backend Foundation',
            'timestamp' => now()->toIso8601String(),
        ]);
    } catch (\Throwable $e) {
        return response()->json([
            'status' => 'degraded',
            'database' => 'unavailable',
            'timestamp' => now()->toIso8601String(),
        ], 503);
    }
});

Route::get('/staff/public', [StaffController::class, 'publicStaff']);

Route::middleware(['throttle:10,1'])->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
});

// Public Menu & QR Ordering
Route::middleware(['throttle:60,1'])->group(function () {
    Route::get('/public/settings', [PublicMenuController::class, 'settings']);
    Route::get('/public/categories', [PublicMenuController::class, 'categories']);
    Route::get('/public/banners', [PublicMenuController::class, 'banners']);
    Route::get('/public/menu', [PublicMenuController::class, 'index']);

    Route::get('/public/tables/validate', [PublicTableController::class, 'showByToken']);
    Route::get('/tables/token/{token}', [PublicTableController::class, 'showByToken']);
    Route::get('/public/tables/{token}', [PublicTableController::class, 'showByToken']);

    Route::post('/public/tables/{tableId}/call-waiter', [WaiterCallController::class, 'store']);

    Route::post('/public/orders', [PublicOrderController::class, 'store']);
    Route::get('/public/orders/track/{trackingToken}', [PublicOrderController::class, 'track']);
    Route::get('/public/orders/active-token/{tableId}', [PublicOrderController::class, 'activeToken']);
    Route::get('/public/orders/cart/{tableId}', [PublicOrderController::class, 'getCart']);
    Route::post('/public/orders/cart/{tableId}', [PublicOrderController::class, 'updateCart']);
    Route::put('/public/orders/cart/{tableId}', [PublicOrderController::class, 'syncCart']);
    Route::delete('/public/orders/cart/{tableId}', [PublicOrderController::class, 'clearCart']);

    Route::post('/billing/coupons/validate', [BillController::class, 'validateCoupon']);
});

// Protected Endpoints
Route::middleware(['jwt.auth'])->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/change-pin', [AuthController::class, 'changePin']);

    // Staff Management
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::get('/staff', [StaffController::class, 'index']);
        Route::post('/staff', [StaffController::class, 'store']);
        Route::put('/staff/{id}', [StaffController::class, 'update']);
        Route::put('/staff/{id}/pin', [StaffController::class, 'changePin']);
        Route::delete('/staff/{id}', [StaffController::class, 'destroy']);
        Route::get('/staff/sessions', [StaffController::class, 'sessions']);
        Route::post('/staff/sessions/revoke-all', [StaffController::class, 'revokeSessions']);
        Route::get('/staff/login-history', [StaffController::class, 'loginHistory']);
        Route::get('/staff/attendance', [StaffController::class, 'attendance']);
    });
    Route::put('/staff/me/pin', [AuthController::class, 'changePin']);
    Route::post('/staff/attendance/clock-in', [StaffController::class, 'clockIn']);
    Route::post('/staff/attendance/clock-out', [StaffController::class, 'clockOut']);

    // Settings
    Route::get('/settings', [SettingsController::class, 'show']);
    Route::put('/settings', [SettingsController::class, 'update'])->middleware('role:OWNER');

    // Categories
    Route::get('/categories', [CategoryController::class, 'index'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/categories/{id}', [CategoryController::class, 'show'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::put('/categories/{id}', [CategoryController::class, 'update']);
        Route::delete('/categories/{id}', [CategoryController::class, 'destroy']);
    });

    // Menu & Addons
    Route::get('/menu/addons', [MenuController::class, 'addons'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/menu/addons/all', [MenuController::class, 'addons'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/menu/items', [MenuController::class, 'index'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/menu/items/{id}', [MenuController::class, 'show'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/menu/addons', [MenuController::class, 'storeAddon']);
        Route::put('/menu/addons/{id}', [MenuController::class, 'updateAddon']);
        Route::delete('/menu/addons/{id}', [MenuController::class, 'destroyAddon']);
        Route::post('/menu/items', [MenuController::class, 'store']);
        Route::post('/menu/items/bulk-price-update', [MenuController::class, 'bulkPriceUpdate']);
        Route::put('/menu/items/{id}', [MenuController::class, 'update']);
        Route::delete('/menu/items/{id}', [MenuController::class, 'destroy']);
    });

    // Tables
    Route::get('/tables', [TableController::class, 'index'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/tables/{id}', [TableController::class, 'show'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::post('/tables/shift', [TableController::class, 'shiftTable'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::post('/tables/merge', [TableController::class, 'mergeTables'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/tables', [TableController::class, 'store']);
        Route::put('/tables/{id}', [TableController::class, 'update']);
        Route::delete('/tables/{id}', [TableController::class, 'destroy']);
        Route::post('/tables/{id}/qr-token', [TableController::class, 'generateQrToken']);
        Route::post('/tables/{id}/regenerate-token', [TableController::class, 'generateQrToken']);
    });

    // Waiter Calls (Staff)
    Route::middleware(['role:OWNER,MANAGER,CASHIER,WAITER'])->group(function () {
        Route::get('/waiter-calls', [WaiterCallController::class, 'index']);
        Route::get('/waiter-calls/active', [WaiterCallController::class, 'index']);
        Route::put('/waiter-calls/{id}/status', [WaiterCallController::class, 'updateStatus']);
        Route::patch('/waiter-calls/{id}/acknowledge', [WaiterCallController::class, 'acknowledge']);
        Route::patch('/waiter-calls/{id}/resolve', [WaiterCallController::class, 'resolve']);
    });

    // POS Orders
    Route::get('/orders/live', [OrderController::class, 'getLiveOrders'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/orders/{id}', [OrderController::class, 'show'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::put('/orders/{id}/status', [OrderController::class, 'updateStatus'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::patch('/orders/{id}/status', [OrderController::class, 'updateStatus'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');

    Route::middleware(['role:OWNER,MANAGER,CASHIER'])->group(function () {
        Route::post('/orders/pos', [OrderController::class, 'createPosOrder']);
        Route::post('/orders', [OrderController::class, 'createPosOrder']);
        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders/{id}/cancel', [OrderController::class, 'cancel']);
    });

    Route::post('/orders/{id}/void', [OrderController::class, 'void'])->middleware('role:OWNER');

    // Billing
    Route::get('/bills/{orderId}', [BillController::class, 'show'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER,CASHIER'])->group(function () {
        Route::post('/billing/orders/{id}/finalize', [BillController::class, 'finalize']);
        Route::post('/billing/orders/{id}/discount', [BillController::class, 'discount']);
    });

    // Payments
    Route::middleware(['role:OWNER,MANAGER,CASHIER'])->group(function () {
        Route::post('/payments', [PaymentController::class, 'store']);
        Route::post('/payments/split', [PaymentController::class, 'split']);
    });

    // Inventory - Ingredients
    Route::get('/inventory/ingredients', [InventoryController::class, 'ingredients'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/inventory/ingredients/{id}', [InventoryController::class, 'showIngredient'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/ingredients', [InventoryController::class, 'createIngredient']);
        Route::patch('/inventory/ingredients/{id}', [InventoryController::class, 'updateIngredient']);
        Route::put('/inventory/ingredients/{id}', [InventoryController::class, 'updateIngredient']);
        Route::delete('/inventory/ingredients/{id}', [InventoryController::class, 'destroyIngredient']);
    });

    // Inventory - Recipes
    Route::get('/inventory/recipes', [InventoryController::class, 'recipes'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/inventory/recipes/{id}', [InventoryController::class, 'showRecipe'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/recipes', [InventoryController::class, 'createRecipe']);
        Route::patch('/inventory/recipes/{id}', [InventoryController::class, 'updateRecipe']);
        Route::put('/inventory/recipes/{id}', [InventoryController::class, 'updateRecipe']);
        Route::delete('/inventory/recipes/{id}', [InventoryController::class, 'destroyRecipe']);
    });

    // Inventory - Suppliers
    Route::get('/inventory/suppliers', [InventoryController::class, 'suppliers'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::get('/inventory/suppliers/{id}', [InventoryController::class, 'showSupplier'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/suppliers', [InventoryController::class, 'createSupplier']);
        Route::patch('/inventory/suppliers/{id}', [InventoryController::class, 'updateSupplier']);
        Route::put('/inventory/suppliers/{id}', [InventoryController::class, 'updateSupplier']);
        Route::delete('/inventory/suppliers/{id}', [InventoryController::class, 'destroySupplier']);
    });

    // Inventory - Purchases
    Route::get('/inventory/purchases', [InventoryController::class, 'purchases'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::get('/inventory/purchases/{id}', [InventoryController::class, 'showPurchase'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/purchases', [InventoryController::class, 'createPurchase']);
        Route::patch('/inventory/purchases/{id}', [InventoryController::class, 'updatePurchase']);
        Route::put('/inventory/purchases/{id}', [InventoryController::class, 'updatePurchase']);
        Route::delete('/inventory/purchases/{id}', [InventoryController::class, 'destroyPurchase']);
        Route::post('/inventory/purchases/{id}/finalize', [InventoryController::class, 'finalizePurchase']);
        Route::post('/inventory/purchases/{id}/reverse', [InventoryController::class, 'reversePurchase']);
    });

    // Inventory - Wastage
    Route::get('/inventory/wastage', [InventoryController::class, 'wastage'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::get('/inventory/wastage/{id}', [InventoryController::class, 'showWastage'])->middleware('role:OWNER,MANAGER,CASHIER,WAITER');
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/wastage', [InventoryController::class, 'createWastage']);
        Route::delete('/inventory/wastage/{id}', [InventoryController::class, 'destroyWastage']);
    });

    // Inventory - Adjustments & Ledger & Analytics & Exports
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::post('/inventory/adjust', [InventoryController::class, 'adjustStock']);
        Route::post('/inventory/ingredients/adjust', [InventoryController::class, 'adjustStock']);
        Route::post('/inventory/stock-count/reconcile', [InventoryController::class, 'reconcileStockCount']);
        Route::get('/inventory/ledger', [InventoryController::class, 'stockTransactions']);
        Route::get('/inventory/stock-transactions', [InventoryController::class, 'stockTransactions']);
        Route::get('/inventory/value-estimate', [InventoryController::class, 'valueEstimate']);
        Route::get('/inventory/food-cost', [InventoryController::class, 'foodCost']);
        Route::get('/inventory/wastage-analytics', [InventoryController::class, 'wastageAnalytics']);
        Route::get('/inventory/operating-contribution', [InventoryController::class, 'operatingContribution']);
        Route::get('/inventory/export/ledger', [InventoryController::class, 'exportLedger']);
        Route::get('/inventory/export/stock-balance', [InventoryController::class, 'exportStockBalance']);
        Route::get('/inventory/export/wastage', [InventoryController::class, 'exportWastage']);
    });

    // Customers & CRM
    Route::get('/customers/analytics', [CustomerController::class, 'analytics'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::get('/customers/export', [CustomerController::class, 'export'])->middleware('role:OWNER,MANAGER');
    Route::get('/customers/tags', [CustomerController::class, 'tags'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::post('/customers/tags', [CustomerController::class, 'storeTag'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::delete('/customers/tags/{id}', [CustomerController::class, 'deactivateTag'])->middleware('role:OWNER,MANAGER');

    Route::middleware(['role:OWNER,MANAGER,CASHIER'])->group(function () {
        Route::get('/customers', [CustomerController::class, 'index']);
        Route::post('/customers', [CustomerController::class, 'store']);
        Route::get('/customers/{id}', [CustomerController::class, 'show']);
        Route::put('/customers/{id}', [CustomerController::class, 'update']);
        Route::patch('/customers/{id}', [CustomerController::class, 'update']);
        Route::patch('/customers/{id}/consent', [CustomerController::class, 'updateConsent']);
        Route::post('/customers/{id}/tags', [CustomerController::class, 'assignTag']);
        Route::delete('/customers/{id}/tags/{tagId}', [CustomerController::class, 'removeTagAssignment']);
    });

    // Customer Loyalty
    Route::get('/customers/{id}/loyalty', [LoyaltyController::class, 'getProfile'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::get('/customers/{id}/loyalty/transactions', [LoyaltyController::class, 'getTransactions'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::post('/customers/{id}/loyalty/adjust', [LoyaltyController::class, 'adjustPoints'])->middleware('role:OWNER,MANAGER');

    Route::get('/loyalty/analytics', [LoyaltyController::class, 'analytics'])->middleware('role:OWNER,MANAGER');
    Route::get('/loyalty/redemption-requests', [LoyaltyController::class, 'listRedemptionRequests'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::post('/loyalty/redemption-requests', [LoyaltyController::class, 'createRedemptionRequest'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::get('/loyalty/redemption-requests/{id}', [LoyaltyController::class, 'getRedemptionRequest'])->middleware('role:OWNER,MANAGER,CASHIER');
    Route::post('/loyalty/redemption-requests/{id}/approve', [LoyaltyController::class, 'approveRedemptionRequest'])->middleware('role:OWNER,MANAGER');
    Route::post('/loyalty/redemption-requests/{id}/reject', [LoyaltyController::class, 'rejectRedemptionRequest'])->middleware('role:OWNER,MANAGER');
    Route::post('/loyalty/redemption-requests/{id}/cancel', [LoyaltyController::class, 'cancelRedemptionRequest'])->middleware('role:OWNER,MANAGER,CASHIER');

    // Customer Credits
    Route::middleware(['role:OWNER,MANAGER,CASHIER'])->group(function () {
        Route::get('/credits', [CreditController::class, 'index']);
        Route::get('/credits/summary', [CreditController::class, 'getCreditsSummary']);
        Route::get('/credits/customer/{customerId}', [CreditController::class, 'getCustomerCreditDetails']);
        Route::post('/credits/payment', [CreditController::class, 'recordCreditPayment']);
        Route::get('/credits/analytics', [CreditController::class, 'analytics']);
    });

    // Expenses
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::get('/expenses/export', [ExpenseController::class, 'export']);
        Route::get('/expenses', [ExpenseController::class, 'index']);
        Route::post('/expenses', [ExpenseController::class, 'store']);
        Route::get('/expenses/{id}', [ExpenseController::class, 'show']);
        Route::put('/expenses/{id}', [ExpenseController::class, 'update']);
        Route::patch('/expenses/{id}', [ExpenseController::class, 'update']);
        Route::delete('/expenses/{id}', [ExpenseController::class, 'destroy']);
        Route::post('/expenses/{id}/void', [ExpenseController::class, 'void']);
    });

    // WhatsApp Marketing & Queue & Campaigns
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::get('/marketing/campaigns', [MarketingController::class, 'index']);
        Route::post('/marketing/campaigns', [MarketingController::class, 'store']);
        Route::get('/marketing/campaigns/{id}', [MarketingController::class, 'show']);
        Route::put('/marketing/campaigns/{id}', [MarketingController::class, 'update']);
        Route::patch('/marketing/campaigns/{id}', [MarketingController::class, 'update']);
        Route::delete('/marketing/campaigns/{id}', [MarketingController::class, 'destroy']);
        Route::post('/marketing/campaigns/{id}/queue', [MarketingController::class, 'queue']);
        Route::post('/marketing/campaigns/{id}/cancel', [MarketingController::class, 'cancel']);

        Route::post('/marketing/queue/process', [MarketingController::class, 'processQueue']);
        Route::post('/marketing/queue/recover', [MarketingController::class, 'recoverQueue']);
        Route::get('/marketing/queue/status', [MarketingController::class, 'getQueueStatus']);

        Route::get('/marketing/analytics', [MarketingController::class, 'analytics']);
        Route::get('/marketing/analytics/{id}', [MarketingController::class, 'campaignAnalytics']);
    });

    // Coupons & Banners
    Route::get('/coupons', [CouponController::class, 'index']);
    Route::get('/banners', [BannerController::class, 'index']);
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::patch('/coupons/{id}/status', [CouponController::class, 'toggleStatus']);
        Route::patch('/banners/{id}/status', [BannerController::class, 'toggleStatus']);
    });

    // Analytics & Reports
    Route::middleware(['role:OWNER,MANAGER'])->group(function () {
        Route::get('/analytics/overview', [AnalyticsController::class, 'overview']);
        Route::get('/analytics/sales-trend', [AnalyticsController::class, 'salesTrend']);
        Route::get('/analytics/orders', [AnalyticsController::class, 'orders']);
        Route::get('/analytics/payments', [AnalyticsController::class, 'payments']);
        Route::get('/analytics/discounts', [AnalyticsController::class, 'discounts']);
        Route::get('/analytics/items', [AnalyticsController::class, 'items']);
        Route::get('/analytics/customers', [AnalyticsController::class, 'customers']);
        Route::get('/analytics/order-performance', [AnalyticsController::class, 'orderPerformance']);
        Route::get('/analytics/waiter-calls', [AnalyticsController::class, 'waiterCalls']);
        Route::get('/analytics/tables', [AnalyticsController::class, 'tables']);
        Route::get('/analytics/coupons', [AnalyticsController::class, 'coupons']);
        Route::get('/analytics/dashboard', [AnalyticsController::class, 'dashboard']);

        Route::get('/reports/daily-sales', [ReportController::class, 'dailySales']);
        Route::get('/reports/payments', [ReportController::class, 'payments']);
        Route::get('/reports/gst', [ReportController::class, 'gst']);
        Route::get('/reports/credit-due', [ReportController::class, 'creditDue']);
        Route::get('/reports/cancellations', [ReportController::class, 'cancellations']);
        Route::get('/reports/orders', [ReportController::class, 'orders']);
        Route::get('/reports/items', [ReportController::class, 'items']);
        Route::get('/reports/customers', [ReportController::class, 'customers']);
        Route::get('/reports/discounts', [ReportController::class, 'discounts']);
        Route::get('/reports/coupons', [ReportController::class, 'coupons']);
        Route::get('/reports/inventory-valuation', [ReportController::class, 'inventoryValuation']);
        Route::get('/reports/expenses', [ReportController::class, 'expenses']);
        Route::get('/reports/{type}/export.csv', [ReportController::class, 'exportCsv']);

        Route::get('/inventory/analytics/value', [InventoryController::class, 'valueEstimate']);
        Route::get('/inventory/analytics/food-cost', [InventoryController::class, 'foodCost']);
        Route::get('/inventory/analytics/wastage', [InventoryController::class, 'wastageAnalytics']);
        Route::get('/inventory/analytics/operating-contribution', [InventoryController::class, 'operatingContribution']);
        Route::get('/marketing/analytics/overview', [MarketingController::class, 'analytics']);
        Route::get('/marketing/campaigns/{id}/analytics', [MarketingController::class, 'campaignAnalytics']);
    });

    Route::post('/uploads', [UploadController::class, 'store']);
});
