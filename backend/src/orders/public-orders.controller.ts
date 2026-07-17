import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
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
}
