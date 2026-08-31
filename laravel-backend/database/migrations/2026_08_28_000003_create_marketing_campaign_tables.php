<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS `CampaignTemplate` (
              `id` VARCHAR(191) NOT NULL,
              `externalIdentifier` VARCHAR(191) NOT NULL,
              `type` ENUM('WHATSAPP', 'EMAIL', 'SMS', 'PUSH') NOT NULL,
              `name` VARCHAR(191) NOT NULL,
              `contentPattern` TEXT NOT NULL,
              `variableSpecs` JSON NOT NULL,
              `language` VARCHAR(191) NOT NULL DEFAULT 'en',
              `isActive` TINYINT(1) NOT NULL DEFAULT 1,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              UNIQUE INDEX `CampaignTemplate_externalIdentifier_key`(`externalIdentifier`),
              INDEX `CampaignTemplate_isActive_type_idx`(`isActive`, `type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS `Campaign` (
              `id` VARCHAR(191) NOT NULL,
              `name` VARCHAR(191) NOT NULL,
              `type` ENUM('WHATSAPP', 'EMAIL', 'SMS', 'PUSH') NOT NULL,
              `status` ENUM('DRAFT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
              `templateId` VARCHAR(191) NOT NULL,
              `templateVariables` JSON NULL,
              `targetSegmentRule` JSON NOT NULL,
              `couponId` VARCHAR(191) NULL,
              `scheduledAt` DATETIME(3) NOT NULL,
              `createdByStaffId` VARCHAR(191) NOT NULL,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              INDEX `Campaign_status_idx`(`status`),
              INDEX `Campaign_scheduledAt_status_idx`(`scheduledAt`, `status`),
              INDEX `Campaign_couponId_idx`(`couponId`),
              INDEX `Campaign_createdByStaffId_idx`(`createdByStaffId`),
              CONSTRAINT `Campaign_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
              CONSTRAINT `Campaign_createdByStaffId_fkey` FOREIGN KEY (`createdByStaffId`) REFERENCES `Staff` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS `MarketingQueueJob` (
              `id` VARCHAR(191) NOT NULL,
              `campaignId` VARCHAR(191) NOT NULL,
              `customerId` VARCHAR(191) NULL,
              `recipientAddress` VARCHAR(191) NOT NULL,
              `payload` JSON NOT NULL,
              `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
              `attempts` INT NOT NULL DEFAULT 0,
              `runAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `lockedAt` DATETIME(3) NULL,
              `errorLog` TEXT NULL,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              INDEX `MarketingQueueJob_status_runAfter_attempts_idx`(`status`, `runAfter`, `attempts`),
              INDEX `MarketingQueueJob_status_lockedAt_idx`(`status`, `lockedAt`),
              INDEX `MarketingQueueJob_campaignId_idx`(`campaignId`),
              INDEX `MarketingQueueJob_customerId_idx`(`customerId`),
              CONSTRAINT `MarketingQueueJob_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT `MarketingQueueJob_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS `CampaignDeliveryLog` (
              `id` VARCHAR(191) NOT NULL,
              `campaignId` VARCHAR(191) NOT NULL,
              `customerId` VARCHAR(191) NULL,
              `recipientAddress` VARCHAR(191) NOT NULL,
              `messageSid` VARCHAR(191) NULL,
              `status` ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'BOUNCED') NOT NULL DEFAULT 'QUEUED',
              `errorCode` VARCHAR(191) NULL,
              `sentAt` DATETIME(3) NULL,
              `deliveredAt` DATETIME(3) NULL,
              `readAt` DATETIME(3) NULL,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              UNIQUE INDEX `CampaignDeliveryLog_messageSid_key`(`messageSid`),
              INDEX `CampaignDeliveryLog_campaignId_status_idx`(`campaignId`, `status`),
              INDEX `CampaignDeliveryLog_customerId_idx`(`customerId`),
              INDEX `CampaignDeliveryLog_createdAt_idx`(`createdAt`),
              CONSTRAINT `CampaignDeliveryLog_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
              CONSTRAINT `CampaignDeliveryLog_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function down(): void
    {
        DB::statement("DROP TABLE IF EXISTS `CampaignDeliveryLog`;");
        DB::statement("DROP TABLE IF EXISTS `MarketingQueueJob`;");
        DB::statement("DROP TABLE IF EXISTS `Campaign`;");
        DB::statement("DROP TABLE IF EXISTS `CampaignTemplate`;");
    }
};
