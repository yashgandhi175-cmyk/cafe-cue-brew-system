import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateAddonDto, UpdateAddonDto } from './dto/addon.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // ADDONS MANAGEMENT
  // ==========================================

  async createAddon(createAddonDto: CreateAddonDto) {
    const existing = await this.prisma.addon.findUnique({
      where: { name: createAddonDto.name },
    });

    if (existing) {
      throw new ConflictException('Addon with this name already exists');
    }

    return this.prisma.addon.create({
      data: createAddonDto,
    });
  }

  async findAllAddons(includeInactive = false) {
    return this.prisma.addon.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOneAddon(id: string) {
    const addon = await this.prisma.addon.findUnique({
      where: { id },
    });

    if (!addon) {
      throw new NotFoundException('Addon not found');
    }

    return addon;
  }

  async updateAddon(id: string, updateAddonDto: UpdateAddonDto) {
    await this.findOneAddon(id);

    if (updateAddonDto.name) {
      const existing = await this.prisma.addon.findUnique({
        where: { name: updateAddonDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Addon with this name already exists');
      }
    }

    return this.prisma.addon.update({
      where: { id },
      data: updateAddonDto,
    });
  }

  async removeAddon(id: string) {
    // Soft delete addon by deactivating
    await this.findOneAddon(id);
    return this.prisma.addon.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==========================================
  // MENU ITEMS MANAGEMENT
  // ==========================================

  async createMenuItem(createMenuItemDto: CreateMenuItemDto) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { name: createMenuItemDto.name },
    });

    if (existing) {
      throw new ConflictException('Menu item with this name already exists');
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: createMenuItemDto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Use transaction to create Menu Item, Variants and Addon Mappings atomically
    return this.prisma.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.create({
        data: {
          name: createMenuItemDto.name,
          description: createMenuItemDto.description,
          categoryId: createMenuItemDto.categoryId,
          image: createMenuItemDto.image,
          basePrice: createMenuItemDto.basePrice,
          isVeg: createMenuItemDto.isVeg ?? true,
          prepTime: createMenuItemDto.prepTime,
          displayOrder: createMenuItemDto.displayOrder ?? 0,
          popular: createMenuItemDto.popular ?? false,
          recommended: createMenuItemDto.recommended ?? false,
          bestSeller: createMenuItemDto.bestSeller ?? false,
        },
      });

      // Create variants if provided
      if (createMenuItemDto.variants && createMenuItemDto.variants.length > 0) {
        await tx.menuVariant.createMany({
          data: createMenuItemDto.variants.map((v) => ({
            menuItemId: menuItem.id,
            name: v.name,
            price: v.price,
          })),
        });
      }

      // Create addon links if provided
      if (createMenuItemDto.addonIds && createMenuItemDto.addonIds.length > 0) {
        await tx.menuItemAddon.createMany({
          data: createMenuItemDto.addonIds.map((addonId) => ({
            menuItemId: menuItem.id,
            addonId,
          })),
        });
      }

      return tx.menuItem.findUnique({
        where: { id: menuItem.id },
        include: {
          variants: true,
          menuItemAddons: {
            include: { addon: true },
          },
        },
      });
    });
  }

  async findAllMenuItems(categoryId?: string, includeInactive = false) {
    const where: Prisma.MenuItemWhereInput = {};
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (!includeInactive) {
      where.isActive = true;
      where.category = { isActive: true }; // Only show items belonging to active categories
    }

    return this.prisma.menuItem.findMany({
      where,
      include: {
        category: true,
        variants: {
          where: includeInactive ? {} : { isActive: true },
        },
        menuItemAddons: {
          where: { addon: { isActive: true } },
          include: { addon: true },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findOneMenuItem(id: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
        menuItemAddons: {
          include: { addon: true },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundException('Menu item not found');
    }

    return menuItem;
  }

  async updateMenuItem(id: string, updateMenuItemDto: UpdateMenuItemDto) {
    const currentItem = await this.findOneMenuItem(id);

    if (updateMenuItemDto.name) {
      const existing = await this.prisma.menuItem.findUnique({
        where: { name: updateMenuItemDto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Menu item with this name already exists');
      }
    }

    if (updateMenuItemDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateMenuItemDto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update basic details
      await tx.menuItem.update({
        where: { id },
        data: {
          name: updateMenuItemDto.name,
          description: updateMenuItemDto.description,
          categoryId: updateMenuItemDto.categoryId,
          image: updateMenuItemDto.image,
          basePrice: updateMenuItemDto.basePrice,
          isVeg: updateMenuItemDto.isVeg,
          available: updateMenuItemDto.available,
          prepTime: updateMenuItemDto.prepTime,
          displayOrder: updateMenuItemDto.displayOrder,
          popular: updateMenuItemDto.popular,
          recommended: updateMenuItemDto.recommended,
          bestSeller: updateMenuItemDto.bestSeller,
          isActive: updateMenuItemDto.isActive,
        },
      });

      // 2. Sync variants if provided
      if (updateMenuItemDto.variants) {
        // Mark existing variants as inactive (soft delete) or remove them if never ordered
        // Wait, to keep it simple, we can delete the current variants and recreate them, OR update existing.
        // But since we want to protect historical orders, we soft-delete existing variants by deactivating them,
        // and create/upsert the new ones.
        await tx.menuVariant.updateMany({
          where: { menuItemId: id },
          data: { isActive: false },
        });

        for (const variant of updateMenuItemDto.variants) {
          // Find if we already have a variant with this name
          const existingVar = currentItem.variants.find(
            (v) => v.name === variant.name,
          );
          if (existingVar) {
            await tx.menuVariant.update({
              where: { id: existingVar.id },
              data: {
                price: variant.price,
                isActive: true, // reactivate
              },
            });
          } else {
            await tx.menuVariant.create({
              data: {
                menuItemId: id,
                name: variant.name,
                price: variant.price,
              },
            });
          }
        }
      }

      // 3. Sync addon links if provided
      if (updateMenuItemDto.addonIds) {
        // Remove existing MenuItemAddon mappings for this item
        await tx.menuItemAddon.deleteMany({
          where: { menuItemId: id },
        });

        // Insert new mappings
        if (updateMenuItemDto.addonIds.length > 0) {
          await tx.menuItemAddon.createMany({
            data: updateMenuItemDto.addonIds.map((addonId) => ({
              menuItemId: id,
              addonId,
            })),
          });
        }
      }

      return tx.menuItem.findUnique({
        where: { id },
        include: {
          variants: true,
          menuItemAddons: {
            include: { addon: true },
          },
        },
      });
    });
  }

  async removeMenuItem(id: string) {
    // Soft delete menu item & deactivate variants
    await this.findOneMenuItem(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.menuVariant.updateMany({
        where: { menuItemId: id },
        data: { isActive: false },
      });

      return tx.menuItem.update({
        where: { id },
        data: { isActive: false, available: false },
      });
    });
  }

  // ==========================================
  // BANNERS MANAGEMENT
  // ==========================================

  async createBanner(data: {
    image: string;
    title: string;
    subtitle?: string;
    buttonText?: string;
    buttonAction?: string;
    startDate: Date;
    endDate: Date;
    priority?: number;
  }) {
    return this.prisma.banner.create({
      data,
    });
  }

  async updateBanner(
    id: string,
    data: {
      image?: string;
      title?: string;
      subtitle?: string;
      buttonText?: string;
      buttonAction?: string;
      startDate?: Date;
      endDate?: Date;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.banner.update({
      where: { id },
      data,
    });
  }

  async removeBanner(id: string) {
    return this.prisma.banner.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAllBanners(includeInactive = false) {
    return this.prisma.banner.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { priority: 'desc' },
    });
  }

  async getPublicBanners() {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async bulkPriceUpdate(payload: {
    categoryId?: string;
    updateType: 'PERCENTAGE' | 'FLAT';
    action: 'INCREASE' | 'DECREASE';
    value: number;
  }) {
    const { categoryId, updateType, action, value } = payload;
    if (value <= 0) {
      throw new ConflictException('Value must be greater than zero');
    }

    // Fetch matching menu items
    const items = await this.prisma.menuItem.findMany({
      where: categoryId && categoryId !== 'all' ? { categoryId } : {},
      include: { variants: true },
    });

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const basePriceNum = Number(item.basePrice);
        let newBasePrice = basePriceNum;
        const multiplier = action === 'INCREASE' ? 1 : -1;

        if (updateType === 'PERCENTAGE') {
          newBasePrice =
            basePriceNum + basePriceNum * (value / 100) * multiplier;
        } else {
          newBasePrice = basePriceNum + value * multiplier;
        }

        newBasePrice = Math.max(0, Math.round(newBasePrice * 100) / 100);

        await tx.menuItem.update({
          where: { id: item.id },
          data: { basePrice: newBasePrice },
        });

        for (const variant of item.variants) {
          const varPriceNum = Number(variant.price);
          let newVarPrice = varPriceNum;
          if (updateType === 'PERCENTAGE') {
            newVarPrice =
              varPriceNum + varPriceNum * (value / 100) * multiplier;
          } else {
            newVarPrice = varPriceNum + value * multiplier;
          }
          newVarPrice = Math.max(0, Math.round(newVarPrice * 100) / 100);

          await tx.menuVariant.update({
            where: { id: variant.id },
            data: { price: newVarPrice },
          });
        }
      }
    });
  }

  async getPublicSettings() {
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });
    if (settings) {
      delete (settings as any).cashierMaxDiscountPercent;
      delete (settings as any).managerMaxDiscountPercent;
      delete (settings as any).managerCanViewFinancialAnalytics;
      delete (settings as any).managerCanViewFinancialReports;
    }
    return settings;
  }
}
