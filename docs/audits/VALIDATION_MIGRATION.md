# CAFÉ CUE & BREW — REQUEST VALIDATION MIGRATION MAP (PHASE 3)

This document details the mapping of NestJS class-validator DTOs to Laravel 11 Form Request validation rules.

---

## 1. DTO TO FORM REQUEST MAPPING TABLE

| Feature Module | NestJS DTO Class | Laravel Form Request Class | Key Validation Rules Migrated |
|---|---|---|---|
| **Auth** | `LoginDto` | `App\Http\Requests\LoginRequest` | `staffId` (required, string, uuid), `pin` (required, string, digits:4 or 6 based on settings) |
| **Auth** | `ChangePinDto` | `App\Http\Requests\ChangePinRequest` | `oldPin` (required, string), `newPin` (required, string, min:4, max:6) |
| **Staff** | `CreateStaffDto` | `App\Http\Requests\CreateStaffRequest` | `name` (required, string), `phone` (required, string, unique:Staff), `role` (required, in:OWNER,MANAGER,WAITER,CASHIER), `pin` (required, string) |
| **Staff** | `UpdateStaffDto` | `App\Http\Requests\UpdateStaffRequest` | `name` (nullable, string), `phone` (nullable, string), `role` (nullable, in:OWNER,MANAGER,WAITER,CASHIER), `status` (nullable, in:ACTIVE,INACTIVE) |
| **Settings** | `UpdateSettingsDto` | `App\Http\Requests\UpdateSettingsRequest` | All boolean flags (`enableCash`, `enableGst`, etc.), numeric tax percentages (min:0, max:100), discount caps, session timeout minutes |
| **Categories** | `CreateCategoryDto` | `App\Http\Requests\CreateCategoryRequest` | `name` (required, string, unique:Category), `displayOrder` (integer, min:0), `isActive` (boolean) |
| **Menu** | `CreateMenuItemDto` | `App\Http\Requests\CreateMenuItemRequest` | `name` (required, string, unique:MenuItem), `categoryId` (required, exists:Category,id), `basePrice` (required, numeric, min:0), `isVeg` (boolean) |
| **Menu** | `CreateVariantDto` | `App\Http\Requests\CreateVariantRequest` | `name` (required, string), `price` (required, numeric, min:0), `isActive` (boolean) |
| **Tables** | `CreateTableDto` | `App\Http\Requests\CreateTableRequest` | `tableNumber` (required, string, unique:RestaurantTable), `capacity` (integer, min:1) |
| **Orders** | `CreateOrderDto` | `App\Http\Requests\CreateOrderRequest` | `source` (required, in:QR,OWNER_POS,MANAGER,WAITER,CASHIER), `tableId` (nullable, exists:RestaurantTable,id), `customerId` (nullable, exists:Customer,id), `items` (required, array, min:1), `items.*.menuItemId` (required, exists:MenuItem,id), `items.*.quantity` (required, integer, min:1) |
| **Billing** | `ApplyDiscountDto` | `App\Http\Requests\ApplyDiscountRequest` | `type` (required, in:FLAT,PERCENTAGE), `value` (required, numeric, min:0), `reason` (required, string, min:3) |
| **Payments** | `RecordPaymentDto` | `App\Http\Requests\RecordPaymentRequest` | `orderId` (required, exists:Order,id), `method` (required, in:CASH,UPI,CARD,CREDIT), `amount` (required, numeric, min:0.01) |
| **Inventory** | `CreateIngredientDto` | `App\Http\Requests\CreateIngredientRequest` | `name` (required, string, unique:Ingredient), `unit` (required, string), `currentStock` (numeric, min:0), `minimumStock` (numeric, min:0) |
| **Inventory** | `CreatePurchaseDto` | `App\Http\Requests\CreatePurchaseRequest` | `supplierId` (required, exists:Supplier,id), `items` (required, array, min:1), `items.*.ingredientId` (required, exists:Ingredient,id), `items.*.purchaseQuantity` (required, numeric, min:0.001) |
| **Customers** | `CreateCustomerDto` | `App\Http\Requests\CreateCustomerRequest` | `name` (required, string), `phone` (required, string, E.164 phone format normalization), `email` (nullable, email) |
| **Coupons** | `CreateCouponDto` | `App\Http\Requests\CreateCouponRequest` | `code` (required, string, unique:Coupon), `type` (required, in:FLAT,PERCENTAGE,BIRTHDAY,FESTIVAL), `value` (required, numeric, min:0), `startDate` (required, date), `endDate` (required, date, after_or_equal:startDate) |
| **Expenses** | `CreateExpenseDto` | `App\Http\Requests\CreateExpenseRequest` | `expenseDate` (required, date), `category` (required, string), `title` (required, string), `amount` (required, numeric, min:0.01) |
| **Marketing** | `CreateCampaignDto` | `App\Http\Requests\CreateCampaignRequest` | `name` (required, string), `type` (required, in:WHATSAPP,EMAIL,SMS,PUSH), `templateId` (required, exists:CampaignTemplate,id), `targetSegmentRule` (required, array), `scheduledAt` (required, date) |
