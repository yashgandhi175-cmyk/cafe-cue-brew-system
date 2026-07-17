import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@Controller('public/tables')
@UseGuards(ThrottlerGuard)
export class PublicTablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('validate')
  async validateTable(
    @Query('tableId') tableId: string,
    @Query('token') token: string,
  ) {
    if (!tableId || !token) {
      throw new BadRequestException(
        'tableId and token query parameters are required.',
      );
    }

    const table = await this.tablesService.validateTableAndToken(
      tableId,
      token,
    );
    return {
      id: table.id,
      tableNumber: table.tableNumber,
      capacity: table.capacity,
    };
  }

  @Post('call-waiter')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // limit to max 5 calls per minute per IP
  async callWaiter(
    @Body('tableId') tableId: string,
    @Body('token') token: string,
  ) {
    if (!tableId || !token) {
      throw new BadRequestException('tableId and token are required.');
    }

    return this.tablesService.createWaiterCall(tableId, token);
  }
}
