-- AlterTable RestaurantSettings
ALTER TABLE `RestaurantSettings` ADD COLUMN `enableLoyalty` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `loyaltySpendAmount` DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
    ADD COLUMN `loyaltyPointsEarned` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `loyaltyRedemptionPoints` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `loyaltyRedemptionValue` DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
    ADD COLUMN `loyaltyMinimumRedeemPoints` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `loyaltyMaximumRedeemPercent` DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    ADD COLUMN `loyaltyRedemptionRequestExpiryMinutes` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `managerCanAdjustLoyaltyPoints` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `managerCanApproveLoyaltyRedemption` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Bill
ALTER TABLE `Bill` ADD COLUMN `loyaltyDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `loyaltyEligibleAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `activeRedemptionRequestId` VARCHAR(191) NULL;

-- CreateTable LoyaltyTransaction
CREATE TABLE `LoyaltyTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `type` ENUM('EARN', 'REDEEM', 'EARN_REVERSAL', 'REDEMPTION_REVERSAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'EXPIRE') NOT NULL,
    `pointsChange` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `billId` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NULL,
    `redemptionRequestId` VARCHAR(191) NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `eligibleAmountSnapshot` DECIMAL(10, 2) NULL,
    `earnSpendAmountSnapshot` DECIMAL(10, 2) NULL,
    `earnPointsSnapshot` INTEGER NULL,
    `redemptionValueSnapshot` DECIMAL(10, 2) NULL,
    `redemptionPointsSnapshot` INTEGER NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `createdByStaffId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LoyaltyTransaction_idempotencyKey_key`(`idempotencyKey`),
    INDEX `LoyaltyTransaction_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `LoyaltyTransaction_billId_idx`(`billId`),
    INDEX `LoyaltyTransaction_orderId_idx`(`orderId`),
    INDEX `LoyaltyTransaction_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable LoyaltyRedemptionRequest
CREATE TABLE `LoyaltyRedemptionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `requestedPoints` INTEGER NOT NULL,
    `approvedPoints` INTEGER NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `expiredAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedByStaffId` VARCHAR(191) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectedByStaffId` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LoyaltyRedemptionRequest_billId_idx`(`billId`),
    INDEX `LoyaltyRedemptionRequest_customerId_idx`(`customerId`),
    INDEX `LoyaltyRedemptionRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Bill_activeRedemptionRequestId_key` ON `Bill`(`activeRedemptionRequestId`);

-- AddForeignKey
ALTER TABLE `Bill` ADD CONSTRAINT `Bill_activeRedemptionRequestId_fkey` FOREIGN KEY (`activeRedemptionRequestId`) REFERENCES `LoyaltyRedemptionRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyTransaction` ADD CONSTRAINT `LoyaltyTransaction_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyTransaction` ADD CONSTRAINT `LoyaltyTransaction_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyTransaction` ADD CONSTRAINT `LoyaltyTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyTransaction` ADD CONSTRAINT `LoyaltyTransaction_redemptionRequestId_fkey` FOREIGN KEY (`redemptionRequestId`) REFERENCES `LoyaltyRedemptionRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyTransaction` ADD CONSTRAINT `LoyaltyTransaction_createdByStaffId_fkey` FOREIGN KEY (`createdByStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyRedemptionRequest` ADD CONSTRAINT `LoyaltyRedemptionRequest_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyRedemptionRequest` ADD CONSTRAINT `LoyaltyRedemptionRequest_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyRedemptionRequest` ADD CONSTRAINT `LoyaltyRedemptionRequest_approvedByStaffId_fkey` FOREIGN KEY (`approvedByStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoyaltyRedemptionRequest` ADD CONSTRAINT `LoyaltyRedemptionRequest_rejectedByStaffId_fkey` FOREIGN KEY (`rejectedByStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
