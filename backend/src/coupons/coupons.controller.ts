import {
  Controller,
  Post,
  Put,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CartPricingService } from '../orders/cart-pricing.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Controller()
export class CouponsController {
  constructor(
    private couponsService: CouponsService,
    private cartPricingService: CartPricingService,
    private prisma: PrismaService,
  ) {}

  // ==========================================
  // PUBLIC ENDPOINTS (UN-GUARDED / READ-ONLY)
  // ==========================================

  @Post('public/coupons/validate')
  @HttpCode(200)
  async publicValidateCoupon(@Body() dto: ValidateCouponDto) {
    // 1. Authoritatively calculate subtotal from raw cart items
    const { subtotal } = await this.cartPricingService.resolveAndValidateCart(
      dto.items,
    );

    // 2. Perform validation checks
    const result = await this.couponsService.validateCoupon(
      dto.code,
      subtotal,
      dto.customerId,
    );

    // 3. Return sanitized response for privacy protection
    return {
      valid: result.valid,
      normalizedCode: result.normalizedCode,
      displayName: result.displayName,
      discountType: result.coupon?.type || null,
      appliedDiscountEstimate: result.appliedDiscountEstimate,
      message: result.message,
    };
  }

  @Get('public/coupons')
  async getPublicCoupons() {
    const now = new Date();
    return this.prisma.coupon.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        type: true,
        value: true,
        minOrder: true,
        maxDiscount: true,
      },
      orderBy: {
        minOrder: 'asc',
      },
    });
  }

  // ==========================================
  // STAFF MANAGEMENT ENDPOINTS (GUARDED)
  // ==========================================

  @Post('coupons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async createCoupon(
    @Body() dto: CreateCouponDto,
    @CurrentUser() staff: { id: string; role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.couponsService.createCoupon(dto, staff.id);
  }

  @Put('coupons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async updateCoupon(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.couponsService.updateCoupon(id, dto);
  }

  @Get('coupons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async listCoupons(
    @Query()
    query: {
      status?: 'ACTIVE' | 'INACTIVE';
      timeline?: 'SCHEDULED' | 'CURRENT' | 'EXPIRED';
      search?: string;
    },
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.couponsService.listCoupons(query);
  }

  @Patch('coupons/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async toggleCoupon(
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.couponsService.toggleCouponActive(id, dto.isActive);
  }

  @Get('coupons/:id/ledger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async getCouponUsageLedger(
    @Param('id') id: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 50,
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.couponsService.getCouponUsageLedger(id, page, limit);
  }

  // ==========================================
  // PRIVATE SECURITY HELPERS
  // ==========================================

  private async verifyPermission(staff: { role: Role }) {
    if (staff.role === Role.OWNER) return;
    if (staff.role === Role.MANAGER) {
      const settings = await this.prisma.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      if (settings?.managerCanManageCoupons) {
        return;
      }
    }
    throw new ForbiddenException(
      'You do not have permission to manage coupons.',
    );
  }
}
