import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { ShiftTableDto } from './dto/shift-table.dto';
import { MergeTablesDto } from './dto/merge-tables.dto';
import { FinancialCalculationService } from '../orders/financial-calculation.service';
import { TableStatus, SessionStatus, BillStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class TablesService {
  constructor(
    private prisma: PrismaService,
    private calcService: FinancialCalculationService,
  ) {}

  async create(createTableDto: CreateTableDto) {
    const existing = await this.prisma.restaurantTable.findUnique({
      where: { tableNumber: createTableDto.tableNumber },
    });

    if (existing) {
      throw new ConflictException('Table with this number already exists');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create table
      const table = await tx.restaurantTable.create({
        data: {
          tableNumber: createTableDto.tableNumber,
          capacity: createTableDto.capacity ?? 4,
        },
      });

      // 2. Create secure QR token
      const secureToken =
        'CCB_TBL_' + crypto.randomBytes(24).toString('hex').toUpperCase();
      await tx.tableQrToken.create({
        data: {
          tableId: table.id,
          token: secureToken,
        },
      });

      return tx.restaurantTable.findUnique({
        where: { id: table.id },
        include: { qrToken: true },
      });
    });
  }

  async findAll(includeInactive = false) {
    return this.prisma.restaurantTable.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { qrToken: true },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: { qrToken: true },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    return table;
  }

  async findByToken(token: string) {
    const tableQrToken = await this.prisma.tableQrToken.findUnique({
      where: { token },
      include: {
        table: {
          include: { qrToken: true },
        },
      },
    });

    if (!tableQrToken || !tableQrToken.table || !tableQrToken.table.isActive) {
      throw new NotFoundException('Invalid or inactive table QR token');
    }

    return tableQrToken.table;
  }

  async update(id: string, updateTableDto: UpdateTableDto) {
    await this.findOne(id);

    if (updateTableDto.tableNumber) {
      const existing = await this.prisma.restaurantTable.findUnique({
        where: { tableNumber: updateTableDto.tableNumber },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Table with this number already exists');
      }
    }

    return this.prisma.restaurantTable.update({
      where: { id },
      data: updateTableDto,
      include: { qrToken: true },
    });
  }

  async remove(id: string) {
    // Soft delete by deactivating
    await this.findOne(id);
    return this.prisma.restaurantTable.update({
      where: { id },
      data: { isActive: false },
      include: { qrToken: true },
    });
  }

  async regenerateQrToken(id: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      // 1. Delete old TableQrToken
      await tx.tableQrToken.deleteMany({
        where: { tableId: id },
      });

      // 2. Generate a new secure token
      const secureToken =
        'CCB_TBL_' + crypto.randomBytes(24).toString('hex').toUpperCase();
      await tx.tableQrToken.create({
        data: {
          tableId: id,
          token: secureToken,
        },
      });

      return tx.restaurantTable.findUnique({
        where: { id },
        include: { qrToken: true },
      });
    });
  }

  async validateTableAndToken(tableId: string, token: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      include: { qrToken: true },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Table is inactive or does not exist.');
    }

    if (!table.qrToken || table.qrToken.token !== token) {
      throw new BadRequestException('Invalid or expired table QR token.');
    }

    return table;
  }

  async createWaiterCall(tableId: string, token: string) {
    const table = await this.validateTableAndToken(tableId, token);

    // 1. Check if there is already an active pending call
    const pendingCall = await this.prisma.waiterCall.findFirst({
      where: {
        tableId,
        status: 'PENDING',
      },
    });

    if (pendingCall) {
      return {
        message:
          'Waiter has already been notified for your table. Please wait.',
        cooldownSeconds: 0,
        alreadyPending: true,
      };
    }

    // 2. Enforce 60-second cooldown rate limit
    const lastCall = await this.prisma.waiterCall.findFirst({
      where: {
        tableId,
        requestedAt: {
          gte: new Date(Date.now() - 60000), // last 60 seconds
        },
      },
    });

    if (lastCall) {
      const elapsedMs = Date.now() - new Date(lastCall.requestedAt).getTime();
      const remainingSeconds = Math.max(
        0,
        Math.ceil((60000 - elapsedMs) / 1000),
      );
      throw new BadRequestException(
        `Please wait ${remainingSeconds} seconds before calling the waiter again.`,
      );
    }

    // 3. Create Waiter Call
    await this.prisma.waiterCall.create({
      data: {
        tableId: table.id,
        tableNumberSnapshot: table.tableNumber,
        status: 'PENDING',
      },
    });

    return {
      message: 'Waiter has been called successfully.',
      cooldownSeconds: 60,
      alreadyPending: false,
    };
  }

  async getActiveWaiterCalls() {
    return this.prisma.waiterCall.findMany({
      where: {
        status: { in: ['PENDING', 'ACKNOWLEDGED'] },
      },
      include: {
        table: true,
        handledBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  async acknowledgeWaiterCall(id: string, staffId: string) {
    const call = await this.prisma.waiterCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Waiter call not found');
    if (call.status !== 'PENDING') {
      throw new BadRequestException('Waiter call is not in PENDING status');
    }

    return this.prisma.waiterCall.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        handledById: staffId,
        handledAt: new Date(),
        acknowledgedAt: new Date(),
      },
    });
  }

  async resolveWaiterCall(id: string, staffId: string) {
    const call = await this.prisma.waiterCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Waiter call not found');
    if (call.status === 'RESOLVED') {
      throw new BadRequestException('Waiter call is already resolved');
    }

    return this.prisma.waiterCall.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        handledById: staffId,
        handledAt: new Date(),
        resolvedAt: new Date(),
      },
    });
  }

  async shiftTable(dto: ShiftTableDto, staffId?: string) {
    const { sourceTableId, targetTableId, reason } = dto;

    if (sourceTableId === targetTableId) {
      throw new BadRequestException('Source and target table cannot be the same.');
    }

    const sourceTable = await this.prisma.restaurantTable.findUnique({
      where: { id: sourceTableId },
    });
    if (!sourceTable) {
      throw new NotFoundException('Source table not found.');
    }

    const targetTable = await this.prisma.restaurantTable.findUnique({
      where: { id: targetTableId },
    });
    if (!targetTable) {
      throw new NotFoundException('Target table not found.');
    }

    if (!targetTable.isActive) {
      throw new BadRequestException('Target table is inactive.');
    }

    if (targetTable.status !== TableStatus.AVAILABLE) {
      throw new BadRequestException(
        `Target Table ${targetTable.tableNumber} is currently occupied or reserved. Use Merge Tables to combine occupied tables.`,
      );
    }

    const activeSession = await this.prisma.tableSession.findFirst({
      where: { tableId: sourceTableId, status: SessionStatus.ACTIVE },
    });

    if (!activeSession) {
      throw new BadRequestException(
        `Source Table ${sourceTable.tableNumber} does not have an active session to shift.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Re-link active session to target table
      await tx.tableSession.update({
        where: { id: activeSession.id },
        data: { tableId: targetTableId },
      });

      // 2. Update orders linked to source table / session
      await tx.order.updateMany({
        where: { tableSessionId: activeSession.id },
        data: {
          tableId: targetTableId,
          tableNumberSnapshot: targetTable.tableNumber,
        },
      });

      // 3. Update persistent cart if any
      const sourceCart = await tx.customerCart.findUnique({
        where: { tableId: sourceTableId },
        include: { items: true },
      });

      if (sourceCart) {
        const targetCart = await tx.customerCart.findUnique({
          where: { tableId: targetTableId },
        });

        if (targetCart) {
          await tx.customerCartItem.updateMany({
            where: { cartId: sourceCart.id },
            data: { cartId: targetCart.id },
          });
          await tx.customerCart.delete({ where: { id: sourceCart.id } });
        } else {
          await tx.customerCart.update({
            where: { id: sourceCart.id },
            data: { tableId: targetTableId },
          });
        }
      }

      // 4. Update waiter calls if any
      await tx.waiterCall.updateMany({
        where: { tableId: sourceTableId, status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
        data: {
          tableId: targetTableId,
          tableNumberSnapshot: targetTable.tableNumber,
        },
      });

      // 5. Update table statuses
      await tx.restaurantTable.update({
        where: { id: sourceTableId },
        data: { status: TableStatus.AVAILABLE },
      });

      await tx.restaurantTable.update({
        where: { id: targetTableId },
        data: { status: TableStatus.OCCUPIED },
      });

      // 6. Create Audit Log
      if (staffId) {
        await tx.auditLog.create({
          data: {
            staffId,
            action: 'TABLE_SHIFT',
            entityType: 'RestaurantTable',
            entityId: targetTableId,
            newData: JSON.stringify({
              fromTable: sourceTable.tableNumber,
              toTable: targetTable.tableNumber,
              reason: reason || 'Customer shifted tables',
            }),
          },
        });
      }

      return {
        message: `Successfully shifted Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
        sourceTableId,
        targetTableId,
        targetTableNumber: targetTable.tableNumber,
      };
    });
  }

  async mergeTables(dto: MergeTablesDto, staffId?: string) {
    const { sourceTableIds, targetTableId, reason } = dto;

    if (sourceTableIds.includes(targetTableId)) {
      throw new BadRequestException('Target table cannot be in the list of source tables to merge.');
    }

    const targetTable = await this.prisma.restaurantTable.findUnique({
      where: { id: targetTableId },
    });
    if (!targetTable || !targetTable.isActive) {
      throw new NotFoundException('Target table not found or inactive.');
    }

    const sourceTables = await this.prisma.restaurantTable.findMany({
      where: { id: { in: sourceTableIds } },
    });

    if (sourceTables.length !== sourceTableIds.length) {
      throw new NotFoundException('One or more source tables were not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Ensure target table has an active TableSession
      let targetSession = await tx.tableSession.findFirst({
        where: { tableId: targetTableId, status: SessionStatus.ACTIVE },
      });

      if (!targetSession) {
        targetSession = await tx.tableSession.create({
          data: {
            tableId: targetTableId,
            status: SessionStatus.ACTIVE,
          },
        });
      }

      // 2. Re-link orders & carts from each source table to target session
      for (const sTable of sourceTables) {
        const sourceSession = await tx.tableSession.findFirst({
          where: { tableId: sTable.id, status: SessionStatus.ACTIVE },
        });

        if (sourceSession) {
          await tx.order.updateMany({
            where: { tableSessionId: sourceSession.id },
            data: {
              tableId: targetTableId,
              tableSessionId: targetSession.id,
              tableNumberSnapshot: targetTable.tableNumber,
            },
          });

          await tx.bill.updateMany({
            where: { tableSessionId: sourceSession.id, status: BillStatus.DRAFT },
            data: { status: BillStatus.VOIDED },
          });

          await tx.tableSession.update({
            where: { id: sourceSession.id },
            data: { status: SessionStatus.CLOSED, closedAt: new Date() },
          });
        }

        const sourceCart = await tx.customerCart.findUnique({
          where: { tableId: sTable.id },
          include: { items: true },
        });

        if (sourceCart) {
          let targetCart = await tx.customerCart.findUnique({
            where: { tableId: targetTableId },
          });

          if (!targetCart) {
            targetCart = await tx.customerCart.create({
              data: { tableId: targetTableId },
            });
          }

          await tx.customerCartItem.updateMany({
            where: { cartId: sourceCart.id },
            data: { cartId: targetCart.id },
          });

          await tx.customerCart.delete({ where: { id: sourceCart.id } });
        }

        await tx.waiterCall.updateMany({
          where: { tableId: sTable.id, status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
          data: {
            tableId: targetTableId,
            tableNumberSnapshot: targetTable.tableNumber,
          },
        });

        await tx.restaurantTable.update({
          where: { id: sTable.id },
          data: { status: TableStatus.AVAILABLE },
        });
      }

      await tx.restaurantTable.update({
        where: { id: targetTableId },
        data: { status: TableStatus.OCCUPIED },
      });

      // 3. Recalculate target session draft bill
      const allSessionOrders = await tx.order.findMany({
        where: {
          tableSessionId: targetSession.id,
          status: { notIn: ['CANCELLED', 'VOIDED'] },
        },
      });

      const totalSubtotal = allSessionOrders.reduce((acc, o) => acc + Number(o.subtotal), 0);

      const dbSettings = await tx.restaurantSettings.findFirst();
      const settings = dbSettings || {
        enableGst: true,
        cgstPercentage: 2.5,
        sgstPercentage: 2.5,
        enableServiceCharge: false,
        serviceChargePercentage: 0,
        enableNightCharge: false,
        nightChargePercentage: 0,
        nightChargeStartHour: 23,
        nightChargeEndHour: 5,
        enableRoundOff: true,
      };

      const calcResult = this.calcService.calculate({
        subtotal: totalSubtotal,
        manualDiscount: 0,
        couponDiscount: 0,
        settings: settings as any,
      });

      let targetDraftBill = await tx.bill.findFirst({
        where: { tableSessionId: targetSession.id, status: BillStatus.DRAFT },
      });

      if (targetDraftBill) {
        await tx.bill.update({
          where: { id: targetDraftBill.id },
          data: {
            subtotal: calcResult.subtotal,
            discount: calcResult.discount,
            totalDiscount: calcResult.discount,
            taxableAmount: calcResult.taxableAmount,
            cgst: calcResult.cgst,
            sgst: calcResult.sgst,
            serviceCharge: calcResult.serviceCharge,
            nightCharge: calcResult.nightCharge,
            roundOff: calcResult.roundOff,
            grandTotal: calcResult.grandTotal,
          },
        });
      } else if (allSessionOrders.length > 0) {
        await tx.bill.create({
          data: {
            invoiceNumber: null,
            status: BillStatus.DRAFT,
            paymentStatus: 'UNPAID',
            orderId: allSessionOrders[0].id,
            tableSessionId: targetSession.id,
            subtotal: calcResult.subtotal,
            discount: calcResult.discount,
            itemDiscount: 0,
            couponDiscount: 0,
            manualDiscount: 0,
            totalDiscount: calcResult.discount,
            taxableAmount: calcResult.taxableAmount,
            cgst: calcResult.cgst,
            sgst: calcResult.sgst,
            serviceCharge: calcResult.serviceCharge,
            nightCharge: calcResult.nightCharge,
            roundOff: calcResult.roundOff,
            grandTotal: calcResult.grandTotal,
          },
        });
      }

      const mergedNumbers = sourceTables.map((t) => t.tableNumber).join(', ');
      if (staffId) {
        await tx.auditLog.create({
          data: {
            staffId,
            action: 'TABLE_MERGE',
            entityType: 'RestaurantTable',
            entityId: targetTableId,
            newData: JSON.stringify({
              sourceTables: mergedNumbers,
              targetTable: targetTable.tableNumber,
              reason: reason || 'Combined tables for group seating',
            }),
          },
        });
      }

      return {
        message: `Successfully merged Tables (${mergedNumbers}) into Table ${targetTable.tableNumber}`,
        sourceTableIds,
        targetTableId,
        targetTableNumber: targetTable.tableNumber,
      };
    });
  }
}
