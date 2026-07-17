import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdjustPointsDto, CreateRedemptionRequestDto } from './dto/loyalty.dto';
import { LoyaltyRedemptionRequestStatus } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('customers/:id/loyalty')
  getProfile(@Param('id') customerId: string) {
    return this.loyaltyService.getLoyaltyProfile(customerId);
  }

  @Get('customers/:id/loyalty/transactions')
  getTransactions(
    @Param('id') customerId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.loyaltyService.getTransactions(customerId, page, limit);
  }

  @Post('customers/:id/loyalty/adjust')
  adjustPoints(
    @Param('id') customerId: string,
    @Body() dto: AdjustPointsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.loyaltyService.adjustPoints(customerId, dto, user.id);
  }

  @Get('loyalty/analytics')
  getAnalytics(@CurrentUser() user: { id: string }) {
    return this.loyaltyService.getAnalytics(user.id);
  }

  @Get('loyalty/redemption-requests')
  listRequests(
    @Query('billId') billId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: LoyaltyRedemptionRequestStatus,
  ) {
    return this.loyaltyService.listRedemptionRequests({
      billId,
      customerId,
      status,
    });
  }

  @Post('loyalty/redemption-requests')
  createRequest(@Body() dto: CreateRedemptionRequestDto) {
    return this.loyaltyService.createRedemptionRequest(dto);
  }

  @Get('loyalty/redemption-requests/:id')
  getRequest(@Param('id') id: string) {
    return this.loyaltyService.getRedemptionRequest(id);
  }

  @Post('loyalty/redemption-requests/:id/approve')
  approveRequest(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.loyaltyService.approveRedemptionRequest(id, user.id);
  }

  @Post('loyalty/redemption-requests/:id/reject')
  rejectRequest(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.loyaltyService.rejectRedemptionRequest(id, user.id);
  }

  @Post('loyalty/redemption-requests/:id/cancel')
  cancelRequest(@Param('id') id: string) {
    return this.loyaltyService.cancelRedemptionRequest(id);
  }
}
