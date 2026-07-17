import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/create-campaign.dto';
import { CampaignFilterDto } from './dto/campaign-filter.dto';
import { Prisma, CampaignStatus } from '@prisma/client';

@Injectable()
export class CampaignService {
  constructor(private prisma: PrismaService) {}

  async createCampaign(dto: CreateCampaignDto, staffId: string) {
    if (dto.couponId) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id: dto.couponId },
      });
      if (!coupon) {
        throw new NotFoundException('Coupon not found.');
      }
    }

    if (new Date(dto.scheduledAt) < new Date()) {
      throw new BadRequestException('Scheduled date must be in the future.');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: dto.name,
          type: dto.type,
          status: CampaignStatus.DRAFT,
          templateId: dto.templateId,
          templateVariables: dto.templateVariables ?? Prisma.JsonNull,
          targetSegmentRule: dto.targetSegmentRule,
          couponId: dto.couponId ?? null,
          scheduledAt: new Date(dto.scheduledAt),
          createdByStaffId: staffId,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CAMPAIGN_CREATE',
          entityType: 'Campaign',
          entityId: created.id,
          oldData: null,
          newData: JSON.stringify(created),
          ipAddress: '127.0.0.1',
        },
      });

      return created;
    });
  }

  async getCampaigns(query: CampaignFilterDto) {
    const where: Prisma.CampaignWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.search) {
      where.name = {
        contains: query.search,
      };
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          coupon: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getCampaignById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found.');
    }
    return campaign;
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto, staffId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found.');
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        'Only campaigns in DRAFT status can be modified.',
      );
    }

    if (dto.couponId) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id: dto.couponId },
      });
      if (!coupon) {
        throw new NotFoundException('Coupon not found.');
      }
    }

    if (dto.scheduledAt && new Date(dto.scheduledAt) < new Date()) {
      throw new BadRequestException('Scheduled date must be in the future.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          templateId: dto.templateId,
          templateVariables:
            dto.templateVariables !== undefined
              ? (dto.templateVariables ?? Prisma.JsonNull)
              : undefined,
          targetSegmentRule: dto.targetSegmentRule,
          couponId: dto.couponId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CAMPAIGN_UPDATE',
          entityType: 'Campaign',
          entityId: id,
          oldData: JSON.stringify(campaign),
          newData: JSON.stringify(updated),
          ipAddress: '127.0.0.1',
        },
      });

      return updated;
    });
  }

  async deleteCampaign(id: string, staffId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found.');
    }

    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only DRAFT or CANCELLED campaigns can be deleted.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.campaign.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CAMPAIGN_DELETE',
          entityType: 'Campaign',
          entityId: id,
          oldData: JSON.stringify(campaign),
          newData: null,
          ipAddress: '127.0.0.1',
        },
      });

      return deleted;
    });
  }
}
