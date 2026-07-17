import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });
    if (!settings) {
      throw new NotFoundException('Settings not found.');
    }
    return settings;
  }

  async updateSettings(staffId: string, dto: any) {
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      throw new NotFoundException('Settings not found.');
    }

    // Validate cashier limit
    if (dto.cashierMaxDiscountPercent !== undefined) {
      const cashierVal = Number(dto.cashierMaxDiscountPercent);
      if (isNaN(cashierVal) || cashierVal < 0 || cashierVal > 100) {
        throw new BadRequestException(
          'Cashier max discount percentage must be between 0 and 100.',
        );
      }
    }

    // Validate manager limit
    if (dto.managerMaxDiscountPercent !== undefined) {
      const managerVal = Number(dto.managerMaxDiscountPercent);
      if (isNaN(managerVal) || managerVal < 0 || managerVal > 100) {
        throw new BadRequestException(
          'Manager max discount percentage must be between 0 and 100.',
        );
      }
    }

    // Validate CRM thresholds
    if (dto.newCustomerWindowDays !== undefined) {
      if (Number(dto.newCustomerWindowDays) <= 0) {
        throw new BadRequestException(
          'New Customer Window Days must be greater than 0.',
        );
      }
    }
    if (dto.regularCustomerVisitThreshold !== undefined) {
      if (Number(dto.regularCustomerVisitThreshold) <= 0) {
        throw new BadRequestException(
          'Regular Customer Visit Threshold must be greater than 0.',
        );
      }
    }
    if (dto.vipCustomerSpendThreshold !== undefined) {
      if (Number(dto.vipCustomerSpendThreshold) < 0) {
        throw new BadRequestException(
          'VIP Customer Spend Threshold must be greater than or equal to 0.',
        );
      }
    }
    if (dto.highSpenderAverageSpendThreshold !== undefined) {
      if (Number(dto.highSpenderAverageSpendThreshold) < 0) {
        throw new BadRequestException(
          'High Spender Average Spend Threshold must be greater than or equal to 0.',
        );
      }
    }
    const currentAtRisk =
      dto.atRiskDays !== undefined
        ? Number(dto.atRiskDays)
        : settings.atRiskDays;
    const currentInactive =
      dto.inactiveDays !== undefined
        ? Number(dto.inactiveDays)
        : settings.inactiveDays;
    if (dto.atRiskDays !== undefined && currentAtRisk <= 0) {
      throw new BadRequestException('At Risk Days must be greater than 0.');
    }
    if (dto.inactiveDays !== undefined && currentInactive <= 0) {
      throw new BadRequestException('Inactive Days must be greater than 0.');
    }
    if (currentAtRisk >= currentInactive) {
      throw new BadRequestException(
        'At Risk Days must be strictly less than Inactive Days.',
      );
    }

    // Identify changes for AuditLog
    const oldData: any = {};
    const newData: any = {};
    const updateData: any = {};

    const fieldsToTrack = [
      'name',
      'logo',
      'tagline',
      'address',
      'phone',
      'whatsAppNumber',
      'email',
      'openingTime',
      'closingTime',
      'currency',
      'timezone',
      'enableCash',
      'enableUpi',
      'enableCard',
      'enableCredit',
      'upiId',
      'enableRoundOff',
      'enableServiceCharge',
      'serviceChargePercentage',
      'invoicePrefix',
      'enableGst',
      'gstPercentage',
      'cgstPercentage',
      'sgstPercentage',
      'gstin',
      'taxInclusivePricing',
      'enableNightCharges',
      'nightStart',
      'nightEnd',
      'nightChargeType',
      'nightChargeValue',
      'cashierMaxDiscountPercent',
      'managerMaxDiscountPercent',
      'managerCanViewFinancialAnalytics',
      'managerCanViewFinancialReports',
      'qrOrderingEnabled',
      'requireCustomerName',
      'requireCustomerPhone',
      'manualAcceptQrOrders',
      'managerCanViewCustomerCRM',
      'managerCanManageCustomerCRM',
      'newCustomerWindowDays',
      'regularCustomerVisitThreshold',
      'vipCustomerSpendThreshold',
      'highSpenderAverageSpendThreshold',
      'atRiskDays',
      'inactiveDays',
    ];

    for (const field of fieldsToTrack) {
      if (dto[field] !== undefined) {
        const oldVal = (settings as any)[field];
        const newVal = dto[field];

        // Format Decimals to standard floats for comparison
        const oldCompare =
          oldVal && typeof oldVal.toNumber === 'function'
            ? oldVal.toNumber()
            : oldVal;
        const newCompare = newVal;

        if (oldCompare !== newCompare) {
          oldData[field] = oldCompare;
          newData[field] = newCompare;
          updateData[field] = newVal;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return settings;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantSettings.update({
        where: { id: 'default' },
        data: updateData,
      });

      // Write to Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: 'SETTINGS_UPDATE',
          entityType: 'RestaurantSettings',
          entityId: 'default',
          oldData: JSON.stringify(oldData),
          newData: JSON.stringify(newData),
          ipAddress: '127.0.0.1',
        },
      });

      return updated;
    });
  }
}
