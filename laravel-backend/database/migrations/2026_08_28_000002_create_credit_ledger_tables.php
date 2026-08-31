<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS `CreditLedger` (
              `id` VARCHAR(191) NOT NULL,
              `customerId` VARCHAR(191) NOT NULL,
              `invoiceNumber` VARCHAR(191) NOT NULL,
              `invoiceDate` DATETIME(3) NOT NULL,
              `billAmount` DECIMAL(10, 2) NOT NULL,
              `outstandingAmount` DECIMAL(10, 2) NOT NULL,
              `creditDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `dueDate` DATETIME(3) NULL,
              `creditType` ENUM('WEEKLY', 'FIFTEEN_DAYS', 'MONTHLY', 'CUSTOM') NOT NULL DEFAULT 'MONTHLY',
              `notes` TEXT NULL,
              `settlementStatus` ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
              `createdById` VARCHAR(191) NULL,
              `updatedById` VARCHAR(191) NULL,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              UNIQUE INDEX `CreditLedger_invoiceNumber_key`(`invoiceNumber`),
              INDEX `CreditLedger_customerId_idx`(`customerId`),
              CONSTRAINT `CreditLedger_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
              CONSTRAINT `CreditLedger_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Staff` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
              CONSTRAINT `CreditLedger_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `Staff` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS `CreditPayment` (
              `id` VARCHAR(191) NOT NULL,
              `creditLedgerId` VARCHAR(191) NOT NULL,
              `amount` DECIMAL(10, 2) NOT NULL,
              `method` VARCHAR(191) NOT NULL,
              `reference` VARCHAR(191) NULL,
              `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `receivedById` VARCHAR(191) NOT NULL,
              `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
              `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
              PRIMARY KEY (`id`),
              INDEX `CreditPayment_creditLedgerId_idx`(`creditLedgerId`),
              CONSTRAINT `CreditPayment_creditLedgerId_fkey` FOREIGN KEY (`creditLedgerId`) REFERENCES `CreditLedger` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT `CreditPayment_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `Staff` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function down(): void
    {
        DB::statement("DROP TABLE IF EXISTS `CreditPayment`;");
        DB::statement("DROP TABLE IF EXISTS `CreditLedger`;");
    }
};
