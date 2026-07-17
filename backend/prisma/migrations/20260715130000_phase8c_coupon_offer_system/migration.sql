-- AlterTable
ALTER TABLE `RestaurantSettings` ADD COLUMN `managerCanManageCoupons` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Bill` ADD COLUMN `appliedCouponId` VARCHAR(191) NULL,
    ADD COLUMN `appliedCouponCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Coupon` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `usedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `createdByStaffId` VARCHAR(191) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `perCustLimit` INTEGER NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `CouponUsage` ADD COLUMN `billId` VARCHAR(191) NOT NULL,
    ADD COLUMN `couponCodeSnapshot` VARCHAR(191) NOT NULL,
    ADD COLUMN `discountTypeSnapshot` ENUM('FLAT', 'PERCENTAGE', 'BIRTHDAY', 'FESTIVAL') NOT NULL,
    ADD COLUMN `discountValueSnapshot` DECIMAL(10, 2) NOT NULL,
    ADD COLUMN `maximumDiscountSnapshot` DECIMAL(10, 2) NULL,
    ADD COLUMN `appliedDiscountSnapshot` DECIMAL(10, 2) NOT NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'REVERSED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `reversedAt` DATETIME(3) NULL,
    MODIFY `customerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `targetAction` ENUM('COUPON', 'MENU_ITEM', 'CATEGORY', 'NONE') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `targetCouponId` VARCHAR(191) NULL,
    ADD COLUMN `targetMenuItemId` VARCHAR(191) NULL,
    ADD COLUMN `targetCategoryId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CustomerCouponUsageCounter` (
    `couponId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`couponId`, `customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CouponUsage_billId_key` ON `CouponUsage`(`billId`);

-- CreateIndex
CREATE INDEX `CouponUsage_createdAt_idx` ON `CouponUsage`(`createdAt`);

-- CreateIndex
CREATE INDEX `CouponUsage_couponId_idx` ON `CouponUsage`(`couponId`);

-- CreateIndex
CREATE INDEX `CouponUsage_customerId_idx` ON `CouponUsage`(`customerId`);

-- CreateIndex
CREATE INDEX `CouponUsage_orderId_idx` ON `CouponUsage`(`orderId`);

-- CreateIndex
CREATE INDEX `Banner_targetCouponId_idx` ON `Banner`(`targetCouponId`);

-- CreateIndex
CREATE INDEX `Banner_targetMenuItemId_idx` ON `Banner`(`targetMenuItemId`);

-- CreateIndex
CREATE INDEX `Banner_targetCategoryId_idx` ON `Banner`(`targetCategoryId`);

-- CreateIndex
CREATE INDEX `CustomerCouponUsageCounter_couponId_idx` ON `CustomerCouponUsageCounter`(`couponId`);

-- CreateIndex
CREATE INDEX `CustomerCouponUsageCounter_customerId_idx` ON `CustomerCouponUsageCounter`(`customerId`);

-- AddForeignKey
ALTER TABLE `Coupon` ADD CONSTRAINT `Coupon_createdByStaffId_fkey` FOREIGN KEY (`createdByStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponUsage` ADD CONSTRAINT `CouponUsage_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponUsage` ADD CONSTRAINT `CouponUsage_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_targetCouponId_fkey` FOREIGN KEY (`targetCouponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_targetMenuItemId_fkey` FOREIGN KEY (`targetMenuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_targetCategoryId_fkey` FOREIGN KEY (`targetCategoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerCouponUsageCounter` ADD CONSTRAINT `CustomerCouponUsageCounter_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerCouponUsageCounter` ADD CONSTRAINT `CustomerCouponUsageCounter_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
