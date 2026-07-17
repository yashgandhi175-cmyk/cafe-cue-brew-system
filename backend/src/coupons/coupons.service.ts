import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { Prisma, Coupon } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  async validateCoupon(
    code: string,
    subtotal: number,
    customerId?: string,
  ): Promise<{
    valid: boolean;
    message: string;
    coupon?: Coupon;
    appliedDiscountEstimate: number;
    normalizedCode: string;
    displayName?: string;
  }> {
    const normalized = code.trim().toUpperCase();

    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalized },
    });

    if (!coupon) {
      return {
        valid: false,
        message: 'Coupon code not found.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    if (!coupon.isActive) {
      return {
        valid: false,
        message: 'This coupon is inactive.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    // Validate legacy types
    if (coupon.type === 'BIRTHDAY' || coupon.type === 'FESTIVAL') {
      return {
        valid: false,
        message: 'Unsupported legacy coupon type.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    const now = new Date();
    if (now < new Date(coupon.startDate)) {
      return {
        valid: false,
        message: 'This coupon is not active yet.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    if (now > new Date(coupon.endDate)) {
      return {
        valid: false,
        message: 'This coupon has expired.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    if (subtotal < Number(coupon.minOrder)) {
      return {
        valid: false,
        message: `Minimum order amount of ₹${coupon.minOrder.toString()} is required.`,
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        message: 'This coupon usage limit has been reached.',
        appliedDiscountEstimate: 0,
        normalizedCode: normalized,
      };
    }

    // Validate per-customer limits
    if (coupon.perCustLimit !== null) {
      if (!customerId) {
        return {
          valid: false,
          message: 'Customer registration is required to use this coupon.',
          appliedDiscountEstimate: 0,
          normalizedCode: normalized,
        };
      }

      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || customer.status !== 'ACTIVE') {
        return {
          valid: false,
          message: 'Customer is inactive or not found.',
          appliedDiscountEstimate: 0,
          normalizedCode: normalized,
        };
      }

      const counter = await this.prisma.customerCouponUsageCounter.findUnique({
        where: {
          couponId_customerId: {
            couponId: coupon.id,
            customerId,
          },
        },
      });

      if (counter && counter.usageCount >= coupon.perCustLimit) {
        return {
          valid: false,
          message: `You have already used this coupon the maximum allowed times (${coupon.perCustLimit}).`,
          appliedDiscountEstimate: 0,
          normalizedCode: normalized,
        };
      }
    }

    // Calculate applied discount estimate
    let discount = 0;
    if (coupon.type === 'FLAT') {
      discount = Number(coupon.value);
    } else if (coupon.type === 'PERCENTAGE') {
      discount = subtotal * (Number(coupon.value) / 100);
      if (coupon.maxDiscount !== null) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    }

    const appliedDiscountEstimate = this.roundToTwo(
      Math.min(discount, subtotal),
    );

    return {
      valid: true,
      message: 'Coupon is valid.',
      coupon,
      appliedDiscountEstimate,
      normalizedCode: normalized,
      displayName: coupon.name || coupon.code,
    };
  }

  async createCoupon(dto: CreateCouponDto, staffId: string) {
    const normalized = dto.code.trim().toUpperCase();

    const existing = await this.prisma.coupon.findUnique({
      where: { code: normalized },
    });
    if (existing) {
      throw new ConflictException('Coupon code already exists.');
    }

    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException('Start date must be before end date.');
    }

    return this.prisma.coupon.create({
      data: {
        code: normalized,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        minOrder: new Prisma.Decimal(dto.minOrder || 0),
        maxDiscount: dto.maxDiscount
          ? new Prisma.Decimal(dto.maxDiscount)
          : null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        usageLimit: dto.usageLimit ?? null,
        perCustLimit: dto.perCustLimit ?? null,
        isActive: dto.isActive ?? true,
        createdByStaffId: staffId,
      },
    });
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }

    const updateData: Prisma.CouponUpdateInput = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.value !== undefined)
      updateData.value = new Prisma.Decimal(dto.value);
    if (dto.minOrder !== undefined)
      updateData.minOrder = new Prisma.Decimal(dto.minOrder);
    if (dto.maxDiscount !== undefined) {
      updateData.maxDiscount = dto.maxDiscount
        ? new Prisma.Decimal(dto.maxDiscount)
        : null;
    }
    if (dto.startDate !== undefined)
      updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);
    if (dto.usageLimit !== undefined) updateData.usageLimit = dto.usageLimit;
    if (dto.perCustLimit !== undefined)
      updateData.perCustLimit = dto.perCustLimit;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const start =
      dto.startDate !== undefined
        ? new Date(dto.startDate)
        : new Date(coupon.startDate);
    const end =
      dto.endDate !== undefined
        ? new Date(dto.endDate)
        : new Date(coupon.endDate);

    if (start > end) {
      throw new BadRequestException('Start date must be before end date.');
    }

    return this.prisma.coupon.update({
      where: { id },
      data: updateData,
    });
  }

  async listCoupons(query: {
    status?: 'ACTIVE' | 'INACTIVE';
    timeline?: 'SCHEDULED' | 'CURRENT' | 'EXPIRED';
    search?: string;
  }) {
    const whereClause: Prisma.CouponWhereInput = {};

    if (query.status) {
      whereClause.isActive = query.status === 'ACTIVE';
    }

    const now = new Date();
    if (query.timeline === 'SCHEDULED') {
      whereClause.startDate = { gt: now };
    } else if (query.timeline === 'CURRENT') {
      whereClause.startDate = { lte: now };
      whereClause.endDate = { gte: now };
    } else if (query.timeline === 'EXPIRED') {
      whereClause.endDate = { lt: now };
    }

    if (query.search) {
      whereClause.OR = [
        { code: { contains: query.search } },
        { name: { contains: query.search } },
      ];
    }

    return this.prisma.coupon.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { couponUsages: true },
        },
      },
    });
  }

  async getCouponUsageLedger(
    couponId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const [usages, total] = await Promise.all([
      this.prisma.couponUsage.findMany({
        where: { couponId },
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          order: {
            select: { id: true, orderNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.couponUsage.count({ where: { couponId } }),
    ]);

    return {
      usages,
      total,
      page,
      limit,
    };
  }

  async toggleCouponActive(id: string, isActive: boolean) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive },
    });
  }
}
