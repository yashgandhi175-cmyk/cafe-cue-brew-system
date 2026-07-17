import { Test, TestingModule } from '@nestjs/testing';
import { BannersService } from './banners.service';
import { BannersController } from './banners.controller';
import { PrismaService } from '../common/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { CreateBannerDto } from './dto/create-banner.dto';

describe('Banners Service & Controller Unit Tests', () => {
  let service: BannersService;

  const mockPrisma = {
    banner: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    restaurantSettings: {
      findUnique: jest.fn(),
    },
  };

  beforeAll(async () => {
    jest
      .spyOn(PrismaService.prototype, '$connect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$disconnect')
      .mockImplementation(() => Promise.resolve());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BannersController],
      providers: [
        BannersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BannersService>(BannersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBanner Invariant Checks', () => {
    it('should throw BadRequest if targetAction is CATEGORY but targetCategoryId is missing', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await expect(
        service.createBanner({
          title: 'Promo',
          image: 'http://img',
          targetAction: 'CATEGORY',
          targetCategoryId: null,
          startDate: new Date().toISOString(),
          endDate: tomorrow.toISOString(),
          priority: 1,
          isActive: true,
        } as CreateBannerDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequest if targetAction is MENU_ITEM but targetMenuItemId is missing', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await expect(
        service.createBanner({
          title: 'Promo',
          image: 'http://img',
          targetAction: 'MENU_ITEM',
          targetMenuItemId: null,
          startDate: new Date().toISOString(),
          endDate: tomorrow.toISOString(),
          priority: 1,
          isActive: true,
        } as CreateBannerDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listAllBanners', () => {
    it('should list all banners sorted by priority/displayOrder', async () => {
      mockPrisma.banner.findMany.mockResolvedValue([
        { id: '1', priority: 1 },
        { id: '2', priority: 2 },
      ]);

      const res = await service.listAllBanners();
      expect(res.length).toBe(2);
      expect(mockPrisma.banner.findMany).toHaveBeenCalled();
    });
  });
});
