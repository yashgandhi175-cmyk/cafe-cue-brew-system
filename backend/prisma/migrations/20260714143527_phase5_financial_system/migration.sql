-- CreateTable
CREATE TABLE `Staff` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'WAITER', 'CASHIER') NOT NULL,
    `pinHash` VARCHAR(191) NOT NULL,
    `mustChangePin` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLogin` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffSession` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiredAt` DATETIME(3) NOT NULL,
    `userAgent` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffSession_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffLoginHistory` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `failureReason` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `clockIn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `clockOut` DATETIME(3) NULL,
    `duration` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RestaurantSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `name` VARCHAR(191) NOT NULL DEFAULT 'Cafe Cue & Brew',
    `logo` VARCHAR(191) NULL,
    `tagline` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `whatsAppNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `openingTime` VARCHAR(191) NOT NULL DEFAULT '09:00',
    `closingTime` VARCHAR(191) NOT NULL DEFAULT '23:00',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata',
    `enableCash` BOOLEAN NOT NULL DEFAULT true,
    `enableUpi` BOOLEAN NOT NULL DEFAULT true,
    `enableCard` BOOLEAN NOT NULL DEFAULT true,
    `enableCredit` BOOLEAN NOT NULL DEFAULT true,
    `upiId` VARCHAR(191) NULL,
    `upiQrImage` VARCHAR(191) NULL,
    `enableRoundOff` BOOLEAN NOT NULL DEFAULT true,
    `enableServiceCharge` BOOLEAN NOT NULL DEFAULT false,
    `serviceChargePercentage` DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
    `invoicePrefix` VARCHAR(191) NOT NULL DEFAULT 'CCB',
    `enableGst` BOOLEAN NOT NULL DEFAULT false,
    `gstPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
    `cgstPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 2.5,
    `sgstPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 2.5,
    `gstin` VARCHAR(191) NULL,
    `taxInclusivePricing` BOOLEAN NOT NULL DEFAULT true,
    `enableNightCharges` BOOLEAN NOT NULL DEFAULT false,
    `nightStart` VARCHAR(191) NOT NULL DEFAULT '23:00',
    `nightEnd` VARCHAR(191) NOT NULL DEFAULT '05:00',
    `nightChargeType` VARCHAR(191) NOT NULL DEFAULT 'FLAT',
    `nightChargeValue` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `cashierMaxDiscountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    `managerMaxDiscountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 25.00,
    `managerCanViewFinancialAnalytics` BOOLEAN NOT NULL DEFAULT false,
    `managerCanViewFinancialReports` BOOLEAN NOT NULL DEFAULT false,
    `qrOrderingEnabled` BOOLEAN NOT NULL DEFAULT true,
    `requireCustomerName` BOOLEAN NOT NULL DEFAULT true,
    `requireCustomerPhone` BOOLEAN NOT NULL DEFAULT true,
    `manualAcceptQrOrders` BOOLEAN NOT NULL DEFAULT true,
    `allowCustomerNotes` BOOLEAN NOT NULL DEFAULT true,
    `allowAddons` BOOLEAN NOT NULL DEFAULT true,
    `allowCustomerCancellation` BOOLEAN NOT NULL DEFAULT false,
    `customerCancellationTimeLimit` INTEGER NOT NULL DEFAULT 120,
    `trackOrderTimeline` BOOLEAN NOT NULL DEFAULT true,
    `trackStaffActions` BOOLEAN NOT NULL DEFAULT true,
    `trackCancellationReasons` BOOLEAN NOT NULL DEFAULT true,
    `trackOrderSource` BOOLEAN NOT NULL DEFAULT true,
    `enableQrMenu` BOOLEAN NOT NULL DEFAULT true,
    `showOfferCarousel` BOOLEAN NOT NULL DEFAULT true,
    `carouselRotationSeconds` INTEGER NOT NULL DEFAULT 5,
    `showPopularItems` BOOLEAN NOT NULL DEFAULT true,
    `showBestSellers` BOOLEAN NOT NULL DEFAULT true,
    `showRecommendedItems` BOOLEAN NOT NULL DEFAULT true,
    `showPreparationTime` BOOLEAN NOT NULL DEFAULT true,
    `showVegNonVeg` BOOLEAN NOT NULL DEFAULT true,
    `showUnavailableItems` BOOLEAN NOT NULL DEFAULT true,
    `enableCallWaiter` BOOLEAN NOT NULL DEFAULT true,
    `pinLength` INTEGER NOT NULL DEFAULT 4,
    `sessionTimeout` INTEGER NOT NULL DEFAULT 720,
    `maxFailedAttempts` INTEGER NOT NULL DEFAULT 5,
    `accountLockDuration` INTEGER NOT NULL DEFAULT 15,
    `trackLoginHistory` BOOLEAN NOT NULL DEFAULT true,
    `trackStaffActivity` BOOLEAN NOT NULL DEFAULT true,
    `enableNewOrderSound` BOOLEAN NOT NULL DEFAULT true,
    `enableWaiterCallSound` BOOLEAN NOT NULL DEFAULT true,
    `enableLowStockAlerts` BOOLEAN NOT NULL DEFAULT true,
    `newOrderPollInterval` INTEGER NOT NULL DEFAULT 3,
    `waiterCallPollInterval` INTEGER NOT NULL DEFAULT 3,
    `customerOrderStatusPollInterval` INTEGER NOT NULL DEFAULT 5,
    `ownerDashboardRefreshInterval` INTEGER NOT NULL DEFAULT 15,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RestaurantTable` (
    `id` VARCHAR(191) NOT NULL,
    `tableNumber` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 4,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING') NOT NULL DEFAULT 'AVAILABLE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `RestaurantTable_tableNumber_key`(`tableNumber`),
    INDEX `RestaurantTable_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `basePrice` DECIMAL(10, 2) NOT NULL,
    `isVeg` BOOLEAN NOT NULL DEFAULT true,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `popular` BOOLEAN NOT NULL DEFAULT false,
    `recommended` BOOLEAN NOT NULL DEFAULT false,
    `bestSeller` BOOLEAN NOT NULL DEFAULT false,
    `prepTime` INTEGER NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MenuItem_name_key`(`name`),
    INDEX `MenuItem_categoryId_idx`(`categoryId`),
    INDEX `MenuItem_available_idx`(`available`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuVariant` (
    `id` VARCHAR(191) NOT NULL,
    `menuItemId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `MenuVariant_menuItemId_name_key`(`menuItemId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Addon` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Addon_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuItemAddon` (
    `menuItemId` VARCHAR(191) NOT NULL,
    `addonId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`menuItemId`, `addonId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `marketingConsent` BOOLEAN NOT NULL DEFAULT false,
    `birthday` DATETIME(3) NULL,
    `visitCount` INTEGER NOT NULL DEFAULT 0,
    `totalSpending` DECIMAL(12, 2) NOT NULL DEFAULT 0.0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_phone_key`(`phone`),
    INDEX `Customer_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `publicTrackingToken` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `tableId` VARCHAR(191) NULL,
    `tableNumberSnapshot` VARCHAR(191) NULL,
    `source` ENUM('QR', 'OWNER_POS', 'MANAGER', 'WAITER', 'CASHIER') NOT NULL,
    `status` ENUM('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOIDED') NOT NULL DEFAULT 'RECEIVED',
    `paymentStatus` ENUM('UNPAID', 'PAID', 'PARTIALLY_PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `couponDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `taxableAmount` DECIMAL(10, 2) NOT NULL,
    `cgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `sgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `serviceCharge` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `nightCharge` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `roundOff` DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
    `grandTotal` DECIMAL(10, 2) NOT NULL,
    `couponCode` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `inventoryDeducted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cancellationReason` VARCHAR(191) NULL,
    `cancelledById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    UNIQUE INDEX `Order_publicTrackingToken_key`(`publicTrackingToken`),
    UNIQUE INDEX `Order_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Order_createdAt_idx`(`createdAt`),
    INDEX `Order_status_idx`(`status`),
    INDEX `Order_tableId_idx`(`tableId`),
    INDEX `Order_customerId_idx`(`customerId`),
    INDEX `Order_source_idx`(`source`),
    INDEX `Order_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `menuItemId` VARCHAR(191) NOT NULL,
    `nameSnapshot` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `variantNameSnapshot` VARCHAR(191) NULL,
    `priceSnapshot` DECIMAL(10, 2) NOT NULL,
    `variantPriceSnapshot` DECIMAL(10, 2) NULL,
    `discountSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `quantity` INTEGER NOT NULL,
    `notes` VARCHAR(191) NULL,
    `totalPrice` DECIMAL(10, 2) NOT NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_menuItemId_idx`(`menuItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItemAddon` (
    `id` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `addonId` VARCHAR(191) NOT NULL,
    `nameSnapshot` VARCHAR(191) NOT NULL,
    `priceSnapshot` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `oldStatus` ENUM('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOIDED') NULL,
    `newStatus` ENUM('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOIDED') NOT NULL,
    `changedById` VARCHAR(191) NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,

    INDEX `OrderStatusHistory_orderId_idx`(`orderId`),
    INDEX `OrderStatusHistory_changedAt_idx`(`changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bill` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED', 'PAID', 'VOIDED') NOT NULL DEFAULT 'DRAFT',
    `paymentStatus` ENUM('UNPAID', 'PAID', 'PARTIALLY_PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `itemDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `couponDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `manualDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `totalDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `manualDiscountType` VARCHAR(191) NULL,
    `manualDiscountValue` DECIMAL(10, 2) NULL,
    `manualDiscountReason` TEXT NULL,
    `manualDiscountAppliedBy` VARCHAR(191) NULL,
    `taxableAmount` DECIMAL(10, 2) NOT NULL,
    `cgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `sgst` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `serviceCharge` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `nightCharge` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `preRoundGrandTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    `roundOff` DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
    `grandTotal` DECIMAL(10, 2) NOT NULL,
    `gstRateSnapshot` DECIMAL(5, 2) NOT NULL DEFAULT 5.0,
    `cgstRateSnapshot` DECIMAL(5, 2) NOT NULL DEFAULT 2.5,
    `sgstRateSnapshot` DECIMAL(5, 2) NOT NULL DEFAULT 2.5,
    `taxInclusiveSnapshot` BOOLEAN NOT NULL DEFAULT true,
    `serviceChargeRateSnapshot` DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
    `nightChargeTypeSnapshot` VARCHAR(191) NULL,
    `nightChargeValueSnapshot` DECIMAL(10, 2) NULL,
    `financialVersion` INTEGER NOT NULL DEFAULT 0,
    `finalizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Bill_invoiceNumber_key`(`invoiceNumber`),
    INDEX `Bill_finalizedAt_idx`(`finalizedAt`),
    INDEX `Bill_status_idx`(`status`),
    INDEX `Bill_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NULL,
    `method` ENUM('CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `amountTendered` DECIMAL(10, 2) NULL,
    `changeDue` DECIMAL(10, 2) NULL,
    `reference` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'COMPLETED',
    `isSettled` BOOLEAN NOT NULL DEFAULT true,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receivedById` VARCHAR(191) NOT NULL,
    `paymentIdempotencyKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_paymentIdempotencyKey_key`(`paymentIdempotencyKey`),
    INDEX `Payment_orderId_idx`(`orderId`),
    INDEX `Payment_billId_idx`(`billId`),
    INDEX `Payment_paidAt_idx`(`paidAt`),
    INDEX `Payment_method_idx`(`method`),
    INDEX `Payment_isSettled_idx`(`isSettled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SplitPayment` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `method` ENUM('CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reference` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('FLAT', 'PERCENTAGE', 'BIRTHDAY', 'FESTIVAL') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `minOrder` DECIMAL(10, 2) NOT NULL,
    `maxDiscount` DECIMAL(10, 2) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `usageLimit` INTEGER NULL,
    `perCustLimit` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Coupon_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CouponUsage` (
    `id` VARCHAR(191) NOT NULL,
    `couponId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CouponUsage_usedAt_idx`(`usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `buttonText` VARCHAR(191) NULL,
    `buttonAction` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WaiterCall` (
    `id` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `tableNumberSnapshot` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('PENDING', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
    `handledById` VARCHAR(191) NULL,
    `handledAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,

    INDEX `WaiterCall_requestedAt_idx`(`requestedAt`),
    INDEX `WaiterCall_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ingredient` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `currentStock` DECIMAL(12, 3) NOT NULL,
    `minimumStock` DECIMAL(12, 3) NOT NULL,
    `costPerUnit` DECIMAL(10, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Ingredient_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recipe` (
    `id` VARCHAR(191) NOT NULL,
    `menuItemId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,

    UNIQUE INDEX `Recipe_menuItemId_variantId_ingredientId_key`(`menuItemId`, `variantId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `type` ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'ORDER_CONSUMPTION', 'WASTAGE') NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,

    INDEX `StockTransaction_ingredientId_idx`(`ingredientId`),
    INDEX `StockTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `expenseDate` DATETIME(3) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `oldData` TEXT NULL,
    `newData` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TableQrToken` (
    `id` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TableQrToken_tableId_key`(`tableId`),
    UNIQUE INDEX `TableQrToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceSequence` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InvoiceSequence_year_prefix_key`(`year`, `prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StaffSession` ADD CONSTRAINT `StaffSession_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffLoginHistory` ADD CONSTRAINT `StaffLoginHistory_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuVariant` ADD CONSTRAINT `MenuVariant_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuItemAddon` ADD CONSTRAINT `MenuItemAddon_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuItemAddon` ADD CONSTRAINT `MenuItemAddon_addonId_fkey` FOREIGN KEY (`addonId`) REFERENCES `Addon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `MenuVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItemAddon` ADD CONSTRAINT `OrderItemAddon_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bill` ADD CONSTRAINT `Bill_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SplitPayment` ADD CONSTRAINT `SplitPayment_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponUsage` ADD CONSTRAINT `CouponUsage_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponUsage` ADD CONSTRAINT `CouponUsage_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponUsage` ADD CONSTRAINT `CouponUsage_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WaiterCall` ADD CONSTRAINT `WaiterCall_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WaiterCall` ADD CONSTRAINT `WaiterCall_handledById_fkey` FOREIGN KEY (`handledById`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recipe` ADD CONSTRAINT `Recipe_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recipe` ADD CONSTRAINT `Recipe_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `MenuVariant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recipe` ADD CONSTRAINT `Recipe_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransaction` ADD CONSTRAINT `StockTransaction_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransaction` ADD CONSTRAINT `StockTransaction_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TableQrToken` ADD CONSTRAINT `TableQrToken_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
