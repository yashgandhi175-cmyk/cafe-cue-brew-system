import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role, OrderStatus, PaymentStatus, OrderSource } from '@prisma/client';

import { CreatePosOrderDto } from './dto/create-pos-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffOrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post('pos')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async createPosOrder(
    @CurrentUser() staff: { id: string; role: Role },
    @Body() dto: CreatePosOrderDto,
  ) {
    return this.ordersService.createPosOrder(staff.id, staff.role, dto);
  }

  @Get('live')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  async getLiveOrders() {
    return this.ordersService.getLiveOrders();
  }

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('paymentStatus') paymentStatus?: PaymentStatus,
    @Query('source') source?: OrderSource,
    @Query('tableId') tableId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ordersService.getOrders({
      page,
      limit,
      status,
      paymentStatus,
      source,
      tableId,
      search,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.getOrderById(id);
  }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
    @Body('override') override?: boolean,
    @Body('overrideReason') overrideReason?: string,
    @CurrentUser() staff?: { id: string; role: Role },
  ) {
    if (!status) {
      throw new BadRequestException('Status is required');
    }
    const staffId = staff?.id || 'system';
    const staffRole = staff?.role || Role.WAITER;
    return this.ordersService.updateOrderStatus(
      id,
      status,
      staffId,
      staffRole,
      override,
      overrideReason,
    );
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async cancelOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('customReason') customReason?: string,
    @CurrentUser() staff?: { id: string; role: Role },
  ) {
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required');
    }
    const staffId = staff?.id || 'system';
    const staffRole = staff?.role || Role.MANAGER;
    return this.ordersService.cancelOrder(
      id,
      reason,
      customReason,
      staffId,
      staffRole,
    );
  }

  @Post(':id/void')
  @Roles(Role.OWNER)
  async voidOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() staff?: { id: string; role: Role },
  ) {
    if (!reason) {
      throw new BadRequestException('Void reason is required');
    }
    const staffId = staff?.id || 'system';
    const staffRole = staff?.role || Role.OWNER;
    return this.ordersService.voidOrder(id, reason, staffId, staffRole);
  }
}
