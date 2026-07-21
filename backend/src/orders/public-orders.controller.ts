import { Controller, Post, Get, Delete, Put, Body, Param, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('public/orders')
@UseGuards(ThrottlerGuard)
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // limit to max 3 orders per minute per IP
  createPublicOrder(@Body() createPublicOrderDto: CreatePublicOrderDto) {
    return this.ordersService.createPublicOrder(createPublicOrderDto);
  }

  @Get('track/:trackingToken')
  getOrderTrackingDetails(@Param('trackingToken') trackingToken: string) {
    return this.ordersService.getOrderTrackingDetails(trackingToken);
  }

  @Get('active-token/:tableId')
  getActiveTrackingTokenForTable(@Param('tableId') tableId: string) {
    return this.ordersService.getActiveTrackingTokenForTable(tableId);
  }

  @Get('cart/:tableId')
  async getCart(@Param('tableId') tableId: string) {
    return this.ordersService.getCart(tableId);
  }

  @Post('cart/:tableId')
  async updateCart(
    @Param('tableId') tableId: string,
    @Body()
    dto: {
      menuItemId: string;
      variantId?: string;
      addonIds: string[];
      quantity: number;
      notes?: string;
    },
  ) {
    return this.ordersService.updateCartItem(
      tableId,
      dto.menuItemId,
      dto.variantId || null,
      dto.addonIds,
      dto.quantity,
      dto.notes,
    );
  }

  @Delete('cart/:tableId')
  async clearCart(@Param('tableId') tableId: string) {
    return this.ordersService.clearCart(tableId);
  }

  @Put('cart/:tableId')
  async syncCart(
    @Param('tableId') tableId: string,
    @Body('items')
    items: Array<{
      menuItemId: string;
      variantId?: string;
      addonIds: string[];
      quantity: number;
      notes?: string;
    }>,
  ) {
    return this.ordersService.syncCart(tableId, items || []);
  }
}
