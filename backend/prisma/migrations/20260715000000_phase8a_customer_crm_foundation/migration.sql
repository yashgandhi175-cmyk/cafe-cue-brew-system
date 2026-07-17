-- AlterTable Customer
ALTER TABLE `Customer`
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `anniversary` DATETIME(3) NULL,
  ADD COLUMN `marketingConsentAt` DATETIME(3) NULL,
  ADD COLUMN `marketingConsentSource` ENUM('QR_CHECKOUT', 'CUSTOMER_VERIFIED_PROFILE', 'POS_STAFF_CAPTURE', 'IMPORT') NULL,
  ADD COLUMN `marketingOptOutAt` DATETIME(3) NULL,
  ADD COLUMN `loyaltyPoints` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `status` ENUM('ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  ADD INDEX `Customer_marketingConsent_idx`(`marketingConsent`),
  ADD INDEX `Customer_status_idx`(`status`);

-- Drop normal index
DROP INDEX `Customer_phone_idx` ON `Customer`;

-- AlterTable RestaurantSettings
ALTER TABLE `RestaurantSettings`
  ADD COLUMN `managerCanViewCustomerCRM` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `managerCanManageCustomerCRM` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `newCustomerWindowDays` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `regularCustomerVisitThreshold` INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN `vipCustomerSpendThreshold` DECIMAL(10, 2) NOT NULL DEFAULT 10000.00,
  ADD COLUMN `highSpenderAverageSpendThreshold` DECIMAL(10, 2) NOT NULL DEFAULT 1000.00,
  ADD COLUMN `atRiskDays` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `inactiveDays` INTEGER NOT NULL DEFAULT 60;

-- CreateTable CustomerIdentityConflict
CREATE TABLE `CustomerIdentityConflict` (
  `id` VARCHAR(191) NOT NULL,
  `normalizedPhone` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'RESOLVED', 'IGNORED') NOT NULL DEFAULT 'PENDING',
  `reason` TEXT NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolvedByStaffId` VARCHAR(191) NULL,
  `resolutionNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CustomerIdentityConflict_normalizedPhone_idx`(`normalizedPhone`),
  INDEX `CustomerIdentityConflict_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable CustomerIdentityConflictMember
CREATE TABLE `CustomerIdentityConflictMember` (
  `conflictId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `originalPhone` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`conflictId`, `customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable CustomerTag
CREATE TABLE `CustomerTag` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CustomerTag_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable CustomerTagAssignment
CREATE TABLE `CustomerTagAssignment` (
  `customerId` VARCHAR(191) NOT NULL,
  `tagId` VARCHAR(191) NOT NULL,
  `assignedById` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `CustomerTagAssignment_customerId_idx`(`customerId`),
  INDEX `CustomerTagAssignment_tagId_idx`(`tagId`),
  PRIMARY KEY (`customerId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerIdentityConflict` ADD CONSTRAINT `CustomerIdentityConflict_resolvedByStaffId_fkey` FOREIGN KEY (`resolvedByStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerIdentityConflictMember` ADD CONSTRAINT `CustomerIdentityConflictMember_conflictId_fkey` FOREIGN KEY (`conflictId`) REFERENCES `CustomerIdentityConflict`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerIdentityConflictMember` ADD CONSTRAINT `CustomerIdentityConflictMember_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerTagAssignment` ADD CONSTRAINT `CustomerTagAssignment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerTagAssignment` ADD CONSTRAINT `CustomerTagAssignment_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `CustomerTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerTagAssignment` ADD CONSTRAINT `CustomerTagAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
