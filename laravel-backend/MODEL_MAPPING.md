# CAFÉ CUE & BREW — ELOQUENT MODEL MAPPING DOCUMENT (PHASE 2)

This document provides the complete structural mapping between Prisma schema models, MySQL database tables, and Laravel 11 Eloquent Model classes for **Café Cue & Brew**.

---

## 1. COMPREHENSIVE MODEL MAPPING MATRIX

| Prisma Model | Laravel Eloquent Model | MySQL Table Name | Primary Key | Key Type / Incrementing | Timestamp Columns | Relationship Mappings | Key Casts & Notes |
|---|---|---|---|---|---|---|---|
| `Staff` | `App\Models\Staff` | `Staff` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `sessions`, `loginHistories`, `attendances`, `ordersCreated`, `orderStatusChanges`, `paymentsReceived`, `stockTransactions`, `expenses`, `purchasesCreated`, `wastageEntries`, `auditLogs`, `waiterCallsHandled`, `createdCoupons`, `campaignsCreated`, `creditLedgersCreated`, `creditLedgersUpdated`, `creditPaymentsReceived` | `pinHash` hidden; `mustChangePin` (bool), `failedAttempts` (int), `lockedUntil` (datetime) |
| `StaffSession` | `App\Models\StaffSession` | `StaffSession` | `id` | `string` / `false` | `createdAt`, `lastUsedAt` | `staff` (belongsTo) | `token` hidden; `expiredAt` (datetime), `isActive` (bool) |
| `StaffLoginHistory` | `App\Models\StaffLoginHistory` | `StaffLoginHistory` | `id` | `string` / `false` | None (`createdAt` manual) | `staff` (belongsTo) | `createdAt` (datetime) |
| `Attendance` | `App\Models\Attendance` | `Attendance` | `id` | `string` / `false` | None (`createdAt` manual) | `staff` (belongsTo) | `clockIn` (datetime), `clockOut` (datetime), `duration` (int) |
| `RestaurantSettings` | `App\Models\RestaurantSettings` | `RestaurantSettings` | `id` | `string` / `false` | None (`updatedAt` manual) | None | All boolean toggles, integer intervals, and monetary decimal fields mapped exactly |
| `RestaurantTable` | `App\Models\RestaurantTable` | `RestaurantTable` | `id` | `string` / `false` | None | `orders`, `waiterCalls`, `qrToken`, `tableSessions` | `capacity` (int), `isActive` (bool), `status` (Enum TableStatus) |
| `Category` | `App\Models\Category` | `Category` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `menuItems`, `banners` | `displayOrder` (int), `isActive` (bool) |
| `MenuItem` | `App\Models\MenuItem` | `MenuItem` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `category`, `variants`, `menuItemAddons`, `orderItems`, `recipes`, `banners`, `cartItems` | `basePrice` (decimal:2), `isVeg` (bool), `available` (bool), `popular` (bool), `recommended` (bool), `bestSeller` (bool) |
| `MenuVariant` | `App\Models\MenuVariant` | `MenuVariant` | `id` | `string` / `false` | None | `menuItem`, `recipes`, `orderItems`, `cartItems` | `price` (decimal:2), `isActive` (bool) |
| `Addon` | `App\Models\Addon` | `Addon` | `id` | `string` / `false` | None | `menuItemAddons`, `recipes` | `price` (decimal:2), `isActive` (bool) |
| `MenuItemAddon` | `App\Models\MenuItemAddon` | `MenuItemAddon` | Composite `(menuItemId, addonId)` | `false` | None | `menuItem`, `addon` | Pivot mapping table for MenuItems and Addons |
| `Customer` | `App\Models\Customer` | `Customer` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `orders`, `couponUsages`, `tagAssignments`, `identityConflicts`, `loyaltyTransactions`, `loyaltyRedemptionRequests`, `customerCouponUsageCounters`, `queueJobs`, `deliveryLogs`, `creditLedgers` | `marketingConsent` (bool), `loyaltyPoints` (int), `totalSpending` (decimal:2) |
| `CustomerIdentityConflict` | `App\Models\CustomerIdentityConflict` | `CustomerIdentityConflict` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `members`, `resolvedBy` | `resolvedAt` (datetime) |
| `CustomerIdentityConflictMember` | `App\Models\CustomerIdentityConflictMember` | `CustomerIdentityConflictMember` | Composite `(conflictId, customerId)` | `false` | None (`createdAt` manual) | `conflict`, `customer` | Pivot member tracking table |
| `CustomerTag` | `App\Models\CustomerTag` | `CustomerTag` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `assignments` | `isActive` (bool) |
| `CustomerTagAssignment` | `App\Models\CustomerTagAssignment` | `CustomerTagAssignment` | Composite `(customerId, tagId)` | `false` | None (`assignedAt` manual) | `customer`, `tag`, `assignedBy` | `assignedAt` (datetime) |
| `Order` | `App\Models\Order` | `Order` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `tableSession`, `customer`, `table`, `createdBy`, `items`, `statusHistory`, `bills`, `payments`, `couponUsages`, `stockConsumption`, `stockConsumptionReversal`, `loyaltyTransactions` | `subtotal` (decimal:2), `discount` (decimal:2), `taxableAmount` (decimal:2), `grandTotal` (decimal:2), `inventoryDeducted` (bool) |
| `OrderItem` | `App\Models\OrderItem` | `OrderItem` | `id` | `string` / `false` | None | `order`, `menuItem`, `variant`, `addons` | `priceSnapshot` (decimal:2), `discountSnapshot` (decimal:2), `quantity` (int), `totalPrice` (decimal:2) |
| `OrderItemAddon` | `App\Models\OrderItemAddon` | `OrderItemAddon` | `id` | `string` / `false` | None | `orderItem` | `priceSnapshot` (decimal:2) |
| `OrderStatusHistory` | `App\Models\OrderStatusHistory` | `OrderStatusHistory` | `id` | `string` / `false` | None (`changedAt` manual) | `order`, `changedBy` | `changedAt` (datetime) |
| `Bill` | `App\Models\Bill` | `Bill` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `tableSession`, `order`, `payments`, `activeRedemptionRequest`, `loyaltyTransactions`, `loyaltyRedemptionRequests`, `couponUsage` | `subtotal` (decimal:2), `manualDiscount` (decimal:2), `grandTotal` (decimal:2), `taxInclusiveSnapshot` (bool) |
| `Payment` | `App\Models\Payment` | `Payment` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `order`, `bill`, `receivedBy`, `splitPayments` | `amount` (decimal:2), `amountTendered` (decimal:2), `changeDue` (decimal:2), `isSettled` (bool) |
| `SplitPayment` | `App\Models\SplitPayment` | `SplitPayment` | `id` | `string` / `false` | None | `payment` | `amount` (decimal:2) |
| `Coupon` | `App\Models\Coupon` | `Coupon` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `couponUsages`, `createdBy`, `customerCouponUsageCounters`, `banners`, `campaigns` | `value` (decimal:2), `minOrder` (decimal:2), `maxDiscount` (decimal:2), `isActive` (bool), `usedCount` (int) |
| `CouponUsage` | `App\Models\CouponUsage` | `CouponUsage` | `id` | `string` / `false` | None (`createdAt` manual) | `coupon`, `order`, `customer`, `bill` | `discountValueSnapshot` (decimal:2), `appliedDiscountSnapshot` (decimal:2), `reversedAt` (datetime) |
| `Banner` | `App\Models\Banner` | `Banner` | `id` | `string` / `false` | None | `targetCoupon`, `targetMenuItem`, `targetCategory` | `startDate` (datetime), `endDate` (datetime), `priority` (int), `isActive` (bool) |
| `CustomerCouponUsageCounter` | `App\Models\CustomerCouponUsageCounter` | `CustomerCouponUsageCounter` | Composite `(couponId, customerId)` | `false` | `createdAt`, `updatedAt` | `coupon`, `customer` | `usageCount` (int), `version` (int) |
| `WaiterCall` | `App\Models\WaiterCall` | `WaiterCall` | `id` | `string` / `false` | None (`requestedAt` manual) | `table`, `handledBy` | `requestedAt` (datetime), `handledAt` (datetime), `acknowledgedAt` (datetime), `resolvedAt` (datetime) |
| `Ingredient` | `App\Models\Ingredient` | `Ingredient` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `preferredSupplier`, `recipes`, `stockTransactions`, `purchaseItems`, `wastageEntries` | `currentStock` (decimal:3), `minimumStock` (decimal:3), `reorderLevel` (decimal:3), `lastPurchaseCost` (decimal:2), `averageCost` (decimal:2), `isActive` (bool) |
| `Recipe` | `App\Models\Recipe` | `Recipe` | `id` | `string` / `false` | None | `menuItem`, `variant`, `addon`, `ingredient` | `quantity` (decimal:3) |
| `StockTransaction` | `App\Models\StockTransaction` | `StockTransaction` | `id` | `string` / `false` | None (`createdAt` manual) | `ingredient`, `changedBy`, `reversesStockTransaction`, `reversedByTransaction` | `quantityChange` (decimal:3), `balanceBefore` (decimal:3), `balanceAfter` (decimal:3), `unitCostSnapshot` (decimal:2) |
| `Expense` | `App\Models\Expense` | `Expense` | `id` | `string` / `false` | None (`createdAt` manual) | `createdBy` | `expenseDate` (datetime), `amount` (decimal:2) |
| `Supplier` | `App\Models\Supplier` | `Supplier` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `ingredients`, `purchases` | `isActive` (bool) |
| `Purchase` | `App\Models\Purchase` | `Purchase` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `supplier`, `createdBy`, `items` | `subtotal` (decimal:2), `discount` (decimal:2), `tax` (decimal:2), `otherCharges` (decimal:2), `grandTotal` (decimal:2) |
| `PurchaseItem` | `App\Models\PurchaseItem` | `PurchaseItem` | `id` | `string` / `false` | None | `purchase`, `ingredient` | `purchaseQuantity` (decimal:3), `conversionFactor` (decimal:3), `baseQuantityAdded` (decimal:3), `unitPurchaseCost` (decimal:2), `baseUnitCostSnapshot` (decimal:4), `lineTotal` (decimal:2) |
| `WastageEntry` | `App\Models\WastageEntry` | `WastageEntry` | `id` | `string` / `false` | None (`recordedAt` manual) | `ingredient`, `recordedBy` | `quantity` (decimal:3), `recordedAt` (datetime) |
| `OrderStockConsumption` | `App\Models\OrderStockConsumption` | `OrderStockConsumption` | `id` | `string` / `false` | None (`consumedAt` manual) | `order` | `consumedAt` (datetime) |
| `OrderStockConsumptionReversal` | `App\Models\OrderStockConsumptionReversal` | `OrderStockConsumptionReversal` | `id` | `string` / `false` | None (`reversedAt` manual) | `order` | `reversedAt` (datetime) |
| `Notification` | `App\Models\Notification` | `Notification` | `id` | `string` / `false` | None (`createdAt` manual) | None | `isRead` (bool), `createdAt` (datetime) |
| `AuditLog` | `App\Models\AuditLog` | `AuditLog` | `id` | `string` / `false` | None (`createdAt` manual) | `staff` | `createdAt` (datetime) |
| `TableQrToken` | `App\Models\TableQrToken` | `TableQrToken` | `id` | `string` / `false` | None (`createdAt` manual) | `table` | `createdAt` (datetime) |
| `InvoiceSequence` | `App\Models\InvoiceSequence` | `InvoiceSequence` | `id` | `string` / `false` | `createdAt`, `updatedAt` | None | `year` (int), `lastNumber` (int) |
| `LoyaltyTransaction` | `App\Models\LoyaltyTransaction` | `LoyaltyTransaction` | `id` | `string` / `false` | None (`createdAt` manual) | `customer`, `bill`, `order`, `redemptionRequest`, `createdBy` | `pointsChange` (int), `balanceAfter` (int), `eligibleAmountSnapshot` (decimal:2) |
| `LoyaltyRedemptionRequest` | `App\Models\LoyaltyRedemptionRequest` | `LoyaltyRedemptionRequest` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `bill`, `customer`, `approvedBy`, `rejectedBy`, `activeBill`, `loyaltyTransactions` | `requestedPoints` (int), `approvedPoints` (int), `expiresAt` (datetime) |
| `Campaign` | `App\Models\Campaign` | `Campaign` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `coupon`, `createdBy`, `queueJobs`, `deliveryLogs` | `templateVariables` (array), `targetSegmentRule` (array), `scheduledAt` (datetime) |
| `CampaignTemplate` | `App\Models\CampaignTemplate` | `CampaignTemplate` | `id` | `string` / `false` | `createdAt`, `updatedAt` | None | `variableSpecs` (array), `isActive` (bool) |
| `MarketingQueueJob` | `App\Models\MarketingQueueJob` | `MarketingQueueJob` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `campaign`, `customer` | `payload` (array), `attempts` (int), `runAfter` (datetime) |
| `CampaignDeliveryLog` | `App\Models\CampaignDeliveryLog` | `CampaignDeliveryLog` | `id` | `string` / `false` | None (`createdAt` manual) | `campaign`, `customer` | `sentAt` (datetime), `deliveredAt` (datetime), `readAt` (datetime) |
| `TableSession` | `App\Models\TableSession` | `TableSession` | `id` | `string` / `false` | None (`createdAt` manual) | `table`, `orders`, `bills` | `createdAt` (datetime), `closedAt` (datetime) |
| `CustomerCart` | `App\Models\CustomerCart` | `CustomerCart` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `items` | `tableId` unique |
| `CustomerCartItem` | `App\Models\CustomerCartItem` | `CustomerCartItem` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `cart`, `menuItem`, `variant` | `quantity` (int) |
| `CreditLedger` | `App\Models\CreditLedger` | `CreditLedger` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `customer`, `payments`, `createdBy`, `updatedBy` | `billAmount` (decimal:2), `outstandingAmount` (decimal:2), `invoiceDate` (datetime), `dueDate` (datetime) |
| `CreditPayment` | `App\Models\CreditPayment` | `CreditPayment` | `id` | `string` / `false` | `createdAt`, `updatedAt` | `creditLedger`, `receivedBy` | `amount` (decimal:2), `paidAt` (datetime) |

---

## 2. SPECIAL BEHAVIOR & CONFIGURATION NOTES

1. **Table Naming**: All models explicitly declare `protected $table = '...';` matching the exact case-sensitive table names generated by Prisma in MySQL.
2. **Primary Key Type & Incrementing**: All UUID-based models explicitly set `protected $keyType = 'string';` and `public $incrementing = false;`.
3. **Timestamps Mapping**: Models with `createdAt` and `updatedAt` override `CREATED_AT = 'createdAt'` and `UPDATED_AT = 'updatedAt'`. Models lacking one or both set `public $timestamps = false;` to prevent runtime query errors.
4. **Monetary Precision**: All monetary values (`Decimal(10,2)`, `Decimal(12,2)`) and stock quantities (`Decimal(12,3)`) are mapped using Eloquent `'decimal:2'`, `'decimal:3'`, or `'decimal:4'` casts.
5. **Mass Assignment Security**: `$fillable` arrays strictly enumerate permitted fields; sensitive values like `pinHash` in `Staff` and `token` in `StaffSession` are explicitly hidden via `$hidden`.
