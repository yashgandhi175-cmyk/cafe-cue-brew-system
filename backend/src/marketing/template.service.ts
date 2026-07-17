import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';

@Injectable()
export class TemplateService {
  constructor(private prisma: PrismaService) {}

  async createTemplate(dto: CreateTemplateDto, staffId: string) {
    const existing = await this.prisma.campaignTemplate.findUnique({
      where: { externalIdentifier: dto.externalIdentifier },
    });
    if (existing) {
      throw new ConflictException(
        'Template with this external identifier already exists.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.campaignTemplate.create({
        data: {
          externalIdentifier: dto.externalIdentifier,
          type: dto.type,
          name: dto.name,
          contentPattern: dto.contentPattern,
          variableSpecs: dto.variableSpecs,
          language: dto.language ?? 'en',
          isActive: dto.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'TEMPLATE_CREATE',
          entityType: 'CampaignTemplate',
          entityId: created.id,
          oldData: null,
          newData: JSON.stringify(created),
          ipAddress: '127.0.0.1',
        },
      });

      return created;
    });
  }

  async getTemplates() {
    return this.prisma.campaignTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplateById(id: string) {
    const template = await this.prisma.campaignTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Template not found.');
    }
    return template;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, staffId: string) {
    const template = await this.prisma.campaignTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Template not found.');
    }

    if (
      dto.externalIdentifier &&
      dto.externalIdentifier !== template.externalIdentifier
    ) {
      const existing = await this.prisma.campaignTemplate.findUnique({
        where: { externalIdentifier: dto.externalIdentifier },
      });
      if (existing) {
        throw new ConflictException(
          'Template with this external identifier already exists.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.campaignTemplate.update({
        where: { id },
        data: {
          externalIdentifier: dto.externalIdentifier,
          type: dto.type,
          name: dto.name,
          contentPattern: dto.contentPattern,
          variableSpecs: dto.variableSpecs,
          language: dto.language,
          isActive: dto.isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'TEMPLATE_UPDATE',
          entityType: 'CampaignTemplate',
          entityId: id,
          oldData: JSON.stringify(template),
          newData: JSON.stringify(updated),
          ipAddress: '127.0.0.1',
        },
      });

      return updated;
    });
  }

  async deleteTemplate(id: string, staffId: string) {
    const template = await this.prisma.campaignTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Template not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.campaignTemplate.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'TEMPLATE_DELETE',
          entityType: 'CampaignTemplate',
          entityId: id,
          oldData: JSON.stringify(template),
          newData: null,
          ipAddress: '127.0.0.1',
        },
      });

      return deleted;
    });
  }
}
