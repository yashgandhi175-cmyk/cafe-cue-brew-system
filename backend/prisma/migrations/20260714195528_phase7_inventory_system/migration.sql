-- AlterTable settings
ALTER TABLE `RestaurantSettings` 
  ADD COLUMN `allowNegativeStock` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `managerCanManageInventory` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `managerCanViewInventoryCost` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `managerCanManageExpenses` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `managerCanViewProfitEstimate` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable Supplier
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `gstin` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable Ingredient
ALTER TABLE `Ingredient`
  ADD COLUMN `sku` VARCHAR(191) NULL,
  ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN `reorderLevel` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  ADD COLUMN `lastPurchaseCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `averageCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `preferredSupplierId` VARCHAR(191) NULL,
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Perform safe column type alterations
ALTER TABLE `Ingredient`
  MODIFY COLUMN `currentStock` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  MODIFY COLUMN `minimumStock` DECIMAL(12, 3) NOT NULL DEFAULT 0.000;

-- Copy costPerUnit into lastPurchaseCost and averageCost as initial data backfill
UPDATE `Ingredient` SET `lastPurchaseCost` = `costPerUnit`, `averageCost` = `costPerUnit`;

-- Drop costPerUnit
ALTER TABLE `Ingredient` DROP COLUMN `costPerUnit`;

CREATE UNIQUE INDEX `Ingredient_sku_key` ON `Ingredient`(`sku`);
CREATE INDEX `Ingredient_preferredSupplierId_idx` ON `Ingredient`(`preferredSupplierId`);
ALTER TABLE `Ingredient` ADD CONSTRAINT `Ingredient_preferredSupplierId_fkey` FOREIGN KEY (`preferredSupplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Recipe
ALTER TABLE `Recipe`
  MODIFY COLUMN `menuItemId` VARCHAR(191) NULL,
  ADD COLUMN `addonId` VARCHAR(191) NULL;

-- Remove old unique constraint on Recipe
ALTER TABLE `Recipe` DROP INDEX `Recipe_menuItemId_variantId_ingredientId_key`;

-- Add new unique constraints
CREATE UNIQUE INDEX `Recipe_menuItemId_ingredientId_key` ON `Recipe`(`menuItemId`, `ingredientId`);
CREATE UNIQUE INDEX `Recipe_variantId_ingredientId_key` ON `Recipe`(`variantId`, `ingredientId`);
CREATE UNIQUE INDEX `Recipe_addonId_ingredientId_key` ON `Recipe`(`addonId`, `ingredientId`);

CREATE INDEX `Recipe_menuItemId_idx` ON `Recipe`(`menuItemId`);
CREATE INDEX `Recipe_variantId_idx` ON `Recipe`(`variantId`);
CREATE INDEX `Recipe_addonId_idx` ON `Recipe`(`addonId`);
CREATE INDEX `Recipe_ingredientId_idx` ON `Recipe`(`ingredientId`);

ALTER TABLE `Recipe` ADD CONSTRAINT `Recipe_addonId_fkey` FOREIGN KEY (`addonId`) REFERENCES `Addon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Purchase
CREATE TABLE `Purchase` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseNumber` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NULL,
    `purchaseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('DRAFT', 'FINALIZED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `otherCharges` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `grandTotal` DECIMAL(10, 2) NOT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Purchase_purchaseNumber_key`(`purchaseNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable PurchaseItem
CREATE TABLE `PurchaseItem` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `ingredientNameSnapshot` VARCHAR(191) NOT NULL,
    `purchaseUnit` VARCHAR(191) NOT NULL,
    `purchaseQuantity` DECIMAL(12, 3) NOT NULL,
    `conversionFactor` DECIMAL(12, 3) NOT NULL,
    `baseQuantityAdded` DECIMAL(12, 3) NOT NULL,
    `unitPurchaseCost` DECIMAL(10, 2) NOT NULL,
    `baseUnitCostSnapshot` DECIMAL(12, 4) NOT NULL,
    `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `lineTotal` DECIMAL(10, 2) NOT NULL,

    INDEX `PurchaseItem_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseItem_ingredientId_idx`(`ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PurchaseItem` ADD CONSTRAINT `PurchaseItem_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PurchaseItem` ADD CONSTRAINT `PurchaseItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Convert enum to varchar to allow renaming values
ALTER TABLE `StockTransaction` MODIFY COLUMN `type` VARCHAR(191) NOT NULL;

-- Rename legacy types
UPDATE `StockTransaction` SET `type` = 'RECIPE_CONSUMPTION' WHERE `type` = 'ORDER_CONSUMPTION';
UPDATE `StockTransaction` SET `type` = 'OPENING_STOCK' WHERE `type` = 'STOCK_IN';
UPDATE `StockTransaction` SET `type` = 'ADJUSTMENT_OUT' WHERE `type` = 'STOCK_OUT';
UPDATE `StockTransaction` SET `type` = 'ADJUSTMENT_IN' WHERE `type` = 'ADJUSTMENT';

-- Add quantityChange and perform backfill
ALTER TABLE `StockTransaction` ADD COLUMN `quantityChange` DECIMAL(12, 3) NOT NULL DEFAULT 0.000;
UPDATE `StockTransaction` SET `quantityChange` = CASE 
  WHEN `type` IN ('RECIPE_CONSUMPTION', 'WASTAGE', 'ADJUSTMENT_OUT') THEN -ABS(`quantity`)
  ELSE ABS(`quantity`)
END;
ALTER TABLE `StockTransaction` DROP COLUMN `quantity`;

-- Modify type column back to the new enum and add remaining columns
ALTER TABLE `StockTransaction`
  MODIFY COLUMN `type` ENUM('OPENING_STOCK', 'PURCHASE', 'PURCHASE_REVERSAL', 'RECIPE_CONSUMPTION', 'CONSUMPTION_REVERSAL', 'WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCK_COUNT_VARIANCE') NOT NULL,
  ADD COLUMN `unitCostSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `totalCostSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `balanceBefore` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  ADD COLUMN `balanceAfter` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  ADD COLUMN `averageCostBefore` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `averageCostAfter` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `referenceType` VARCHAR(191) NULL,
  ADD COLUMN `reversesStockTransactionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `StockTransaction_reversesStockTransactionId_key` ON `StockTransaction`(`reversesStockTransactionId`);
CREATE INDEX `StockTransaction_referenceType_referenceId_idx` ON `StockTransaction`(`referenceType`, `referenceId`);
ALTER TABLE `StockTransaction` ADD CONSTRAINT `StockTransaction_reversesStockTransactionId_fkey` FOREIGN KEY (`reversesStockTransactionId`) REFERENCES `StockTransaction`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable Expense
ALTER TABLE `Expense` CHANGE COLUMN `changedById` `createdById` VARCHAR(191) NOT NULL;
ALTER TABLE `Expense`
  ADD COLUMN `referenceNumber` VARCHAR(191) NULL,
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `voidReason` TEXT NULL,
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX `Expense_createdById_idx` ON `Expense`(`createdById`);
CREATE INDEX `Expense_expenseDate_idx` ON `Expense`(`expenseDate`);

-- CreateTable WastageEntry
CREATE TABLE `WastageEntry` (
    `id` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `recordedById` VARCHAR(191) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WastageEntry_ingredientId_idx`(`ingredientId`),
    INDEX `WastageEntry_recordedById_idx`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WastageEntry` ADD CONSTRAINT `WastageEntry_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WastageEntry` ADD CONSTRAINT `WastageEntry_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable OrderStockConsumption
CREATE TABLE `OrderStockConsumption` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `consumedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrderStockConsumption_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderStockConsumption` ADD CONSTRAINT `OrderStockConsumption_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable OrderStockConsumptionReversal
CREATE TABLE `OrderStockConsumptionReversal` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `reversedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrderStockConsumptionReversal_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderStockConsumptionReversal` ADD CONSTRAINT `OrderStockConsumptionReversal_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
