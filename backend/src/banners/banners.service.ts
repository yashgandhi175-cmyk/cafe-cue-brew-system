import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/create-banner.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  private validateBannerTargets(
    action: 'COUPON' | 'MENU_ITEM' | 'CATEGORY' | 'NONE',
    couponId?: string | null,
    menuItemId?: string | null,
    categoryId?: string | null,
  ) {
    if (action === 'COUPON') {
      if (!couponId || menuItemId || categoryId) {
        throw new BadRequestException(
          'For COUPON action, targetCouponId must be set and all other target IDs must be null.',
        );
      }
    } else if (action === 'MENU_ITEM') {
      if (!menuItemId || couponId || categoryId) {
        throw new BadRequestException(
          'For MENU_ITEM action, targetMenuItemId must be set and all other target IDs must be null.',
        );
      }
    } else if (action === 'CATEGORY') {
      if (!categoryId || couponId || menuItemId) {
        throw new BadRequestException(
          'For CATEGORY action, targetCategoryId must be set and all other target IDs must be null.',
        );
      }
    } else if (action === 'NONE') {
      if (couponId || menuItemId || categoryId) {
        throw new BadRequestException(
          'For NONE action, all target IDs must be null.',
        );
      }
    }
  }

  async createBanner(dto: CreateBannerDto) {
    this.validateBannerTargets(
      dto.targetAction,
      dto.targetCouponId,
      dto.targetMenuItemId,
      dto.targetCategoryId,
    );

    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException('Start date must be before end date.');
    }

    return this.prisma.banner.create({
      data: {
        image: dto.image,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        buttonText: dto.buttonText ?? null,
        buttonAction: dto.buttonAction ?? null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        targetAction: dto.targetAction,
        targetCouponId: dto.targetCouponId ?? null,
        targetMenuItemId: dto.targetMenuItemId ?? null,
        targetCategoryId: dto.targetCategoryId ?? null,
      },
    });
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('Banner not found.');
    }

    const action = dto.targetAction ?? banner.targetAction;
    const couponId =
      dto.targetCouponId !== undefined
        ? dto.targetCouponId
        : banner.targetCouponId;
    const menuItemId =
      dto.targetMenuItemId !== undefined
        ? dto.targetMenuItemId
        : banner.targetMenuItemId;
    const categoryId =
      dto.targetCategoryId !== undefined
        ? dto.targetCategoryId
        : banner.targetCategoryId;

    this.validateBannerTargets(action, couponId, menuItemId, categoryId);

    const updateData: Prisma.BannerUpdateInput = {};
    if (dto.image !== undefined) updateData.image = dto.image;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.subtitle !== undefined) updateData.subtitle = dto.subtitle;
    if (dto.buttonText !== undefined) updateData.buttonText = dto.buttonText;
    if (dto.buttonAction !== undefined)
      updateData.buttonAction = dto.buttonAction;
    if (dto.startDate !== undefined)
      updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.targetAction !== undefined)
      updateData.targetAction = dto.targetAction;

    updateData.targetCoupon = couponId
      ? { connect: { id: couponId } }
      : { disconnect: true };
    updateData.targetMenuItem = menuItemId
      ? { connect: { id: menuItemId } }
      : { disconnect: true };
    updateData.targetCategory = categoryId
      ? { connect: { id: categoryId } }
      : { disconnect: true };

    const start =
      dto.startDate !== undefined
        ? new Date(dto.startDate)
        : new Date(banner.startDate);
    const end =
      dto.endDate !== undefined
        ? new Date(dto.endDate)
        : new Date(banner.endDate);

    if (start > end) {
      throw new BadRequestException('Start date must be before end date.');
    }

    return this.prisma.banner.update({
      where: { id },
      data: updateData,
    });
  }

  async listAllBanners() {
    const banners = await this.prisma.banner.findMany({
      orderBy: { priority: 'desc' },
      include: {
        targetCoupon: { select: { id: true, code: true, name: true } },
        targetMenuItem: { select: { id: true, name: true } },
        targetCategory: { select: { id: true, name: true } },
      },
    });

    return banners.map((b) => {
      let targetType: 'NONE' | 'CATEGORY' | 'MENU_ITEM' | 'CUSTOM' = 'NONE';
      let targetAction: string | null = null;

      if (b.targetAction === 'CATEGORY') {
        targetType = 'CATEGORY';
        targetAction = b.targetCategoryId;
      } else if (b.targetAction === 'MENU_ITEM') {
        targetType = 'MENU_ITEM';
        targetAction = b.targetMenuItemId;
      } else if (b.targetAction === 'COUPON') {
        targetType = 'CUSTOM';
        targetAction = b.targetCoupon?.id || null;
      }

      return {
        id: b.id,
        image: b.image,
        imageUrl: b.image,
        title: b.title,
        subtitle: b.subtitle,
        description: b.subtitle,
        buttonText: b.buttonText,
        buttonAction: b.buttonAction,
        startDate: b.startDate,
        endDate: b.endDate,
        isActive: b.isActive,
        priority: b.priority,
        displayOrder: b.priority,
        targetAction: targetAction,
        targetType: targetType,
        rawTargetAction: b.targetAction,
        targetCouponCode: b.targetCoupon?.code || null,
        targetMenuItemId: b.targetMenuItemId,
        targetCategoryId: b.targetCategoryId,
      };
    });
  }

  async getActiveBannersPublic() {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { priority: 'desc' },
      include: {
        targetCoupon: { select: { id: true, code: true } },
        targetMenuItem: { select: { id: true } },
        targetCategory: { select: { id: true } },
      },
    });

    return banners.map((b) => {
      let targetType: 'NONE' | 'CATEGORY' | 'MENU_ITEM' | 'CUSTOM' = 'NONE';
      let targetAction: string | null = null;

      if (b.targetAction === 'CATEGORY') {
        targetType = 'CATEGORY';
        targetAction = b.targetCategoryId;
      } else if (b.targetAction === 'MENU_ITEM') {
        targetType = 'MENU_ITEM';
        targetAction = b.targetMenuItemId;
      } else if (b.targetAction === 'COUPON') {
        targetType = 'CUSTOM';
        targetAction = b.targetCoupon?.code || null;
      }

      return {
        id: b.id,
        image: b.image,
        imageUrl: b.image,
        title: b.title,
        subtitle: b.subtitle,
        description: b.subtitle,
        buttonText: b.buttonText,
        buttonAction: b.buttonAction,
        targetAction: targetAction,
        targetType: targetType,
        rawTargetAction: b.targetAction,
        targetCouponCode: b.targetCoupon?.code || null,
        targetMenuItemId: b.targetMenuItemId,
        targetCategoryId: b.targetCategoryId,
      };
    });
  }

  async deleteBanner(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('Banner not found.');
    }
    return this.prisma.banner.delete({ where: { id } });
  }

  async toggleBannerActive(id: string, isActive: boolean) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException('Banner not found.');
    }
    return this.prisma.banner.update({
      where: { id },
      data: { isActive },
    });
  }
}
