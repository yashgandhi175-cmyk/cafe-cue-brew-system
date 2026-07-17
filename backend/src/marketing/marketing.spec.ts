/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controller';
import { PrismaService } from '../common/prisma.service';
import { CampaignStatus, CampaignType } from '@prisma/client';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('Marketing Engine Foundation Unit Tests', () => {
  let campaignService: CampaignService;
  let templateService: TemplateService;

  const mockPrisma = {
    campaign: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    campaignTemplate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    coupon: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };

  beforeAll(async () => {
    jest
      .spyOn(PrismaService.prototype, '$connect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$disconnect')
      .mockImplementation(() => Promise.resolve());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignController, TemplateController],
      providers: [
        CampaignService,
        TemplateService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    campaignService = module.get<CampaignService>(CampaignService);
    templateService = module.get<TemplateService>(TemplateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Campaign CRUD', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);

    const validCampaignDto = {
      name: 'Promo Campaign',
      type: CampaignType.WHATSAPP,
      templateId: 'temp-1',
      targetSegmentRule: { vip: true },
      scheduledAt: futureDate.toISOString(),
      couponId: 'coupon-uuid',
    };

    it('createCampaign - should throw NotFound if couponId provided but coupon not found', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue(null);
      await expect(
        campaignService.createCampaign(validCampaignDto, 'staff-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('createCampaign - should throw BadRequest if scheduledAt is in the past', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({ id: 'coupon-uuid' });
      const pastCampaignDto = {
        ...validCampaignDto,
        scheduledAt: new Date(Date.now() - 100000).toISOString(),
      };
      await expect(
        campaignService.createCampaign(pastCampaignDto, 'staff-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('createCampaign - should successfully create campaign and write audit log', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({ id: 'coupon-uuid' });
      mockPrisma.campaign.create.mockResolvedValue({
        id: 'campaign-1',
        ...validCampaignDto,
      });

      const res = await campaignService.createCampaign(
        validCampaignDto,
        'staff-1',
      );
      expect(res).toBeDefined();
      expect(mockPrisma.campaign.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            staffId: 'staff-1',
            action: 'CAMPAIGN_CREATE',
            entityType: 'Campaign',
          }),
        }),
      );
    });

    it('getCampaignById - should throw NotFound if campaign not found', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);
      await expect(
        campaignService.getCampaignById('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateCampaign - should throw BadRequest if campaign is not in DRAFT status', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'campaign-1',
        status: CampaignStatus.PROCESSING,
      });

      await expect(
        campaignService.updateCampaign(
          'campaign-1',
          { name: 'New Name' },
          'staff-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deleteCampaign - should throw BadRequest if campaign is not in DRAFT or CANCELLED status', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'campaign-1',
        status: CampaignStatus.QUEUED,
      });

      await expect(
        campaignService.deleteCampaign('campaign-1', 'staff-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deleteCampaign - should delete successfully if campaign is in DRAFT or CANCELLED status', async () => {
      const draftCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.DRAFT,
      };
      mockPrisma.campaign.findUnique.mockResolvedValue(draftCampaign);
      mockPrisma.campaign.delete.mockResolvedValue(draftCampaign);

      const res = await campaignService.deleteCampaign('campaign-1', 'staff-1');
      expect(res).toBeDefined();
      expect(mockPrisma.campaign.delete).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CAMPAIGN_DELETE',
          }),
        }),
      );
    });
  });

  describe('Template CRUD', () => {
    const validTemplateDto = {
      externalIdentifier: 'temp_external_1',
      type: CampaignType.WHATSAPP,
      name: 'Template One',
      contentPattern: 'Hello {{1}}',
      variableSpecs: { 1: 'name' },
      language: 'en',
    };

    it('createTemplate - should throw Conflict if externalIdentifier already exists', async () => {
      mockPrisma.campaignTemplate.findUnique.mockResolvedValue({
        id: 'existing-id',
      });
      await expect(
        templateService.createTemplate(validTemplateDto, 'staff-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('createTemplate - should create template successfully and write audit log', async () => {
      mockPrisma.campaignTemplate.findUnique.mockResolvedValue(null);
      mockPrisma.campaignTemplate.create.mockResolvedValue({
        id: 'temp-1',
        ...validTemplateDto,
      });

      const res = await templateService.createTemplate(
        validTemplateDto,
        'staff-1',
      );
      expect(res).toBeDefined();
      expect(mockPrisma.campaignTemplate.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TEMPLATE_CREATE',
            entityType: 'CampaignTemplate',
          }),
        }),
      );
    });

    it('getTemplateById - should throw NotFound if template not found', async () => {
      mockPrisma.campaignTemplate.findUnique.mockResolvedValue(null);
      await expect(
        templateService.getTemplateById('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deleteTemplate - should delete template successfully and write audit log', async () => {
      const template = { id: 'temp-1', externalIdentifier: 'temp_external_1' };
      mockPrisma.campaignTemplate.findUnique.mockResolvedValue(template);
      mockPrisma.campaignTemplate.delete.mockResolvedValue(template);

      const res = await templateService.deleteTemplate('temp-1', 'staff-1');
      expect(res).toBeDefined();
      expect(mockPrisma.campaignTemplate.delete).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TEMPLATE_DELETE',
          }),
        }),
      );
    });
  });
});
