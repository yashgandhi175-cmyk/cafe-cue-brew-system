import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import * as crypto from 'crypto';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

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
}
