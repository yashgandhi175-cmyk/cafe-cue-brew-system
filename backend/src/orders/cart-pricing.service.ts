import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CartPricingService {
  constructor(private prisma: PrismaService) {}

  roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  async resolveAndValidateCart(
    items: Array<{
      menuItemId: string;
      variantId?: string;
      addonIds?: string[];
      quantity: number;
    }>,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    subtotal: number;
    validatedItems: Array<{
      menuItemId: string;
      nameSnapshot: string;
      variantId?: string;
      variantNameSnapshot?: string;
      priceSnapshot: number;
      variantPriceSnapshot?: number;
      quantity: number;
      addons: Array<{
        addonId: string;
        nameSnapshot: string;
        priceSnapshot: number;
      }>;
      totalPrice: number;
    }>;
  }> {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        validatedItems: [],
      };
    }

    const settings = await tx.restaurantSettings.findUnique({
      where: { id: 'default' },
    });
    if (!settings) {
      throw new BadRequestException('Restaurant settings not found.');
    }

    const itemIds = items.map((i) => i.menuItemId);
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: {
        variants: true,
        menuItemAddons: {
          include: { addon: true },
        },
      },
    });

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));
    let calculatedSubtotal = 0;
    const validatedItemsList: any[] = [];

    for (const itemDto of items) {
      if (itemDto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than zero.');
      }

      const menuItem = menuItemMap.get(itemDto.menuItemId);
      if (!menuItem || !menuItem.isActive || !menuItem.available) {
        throw new BadRequestException(
          `Menu item with ID "${itemDto.menuItemId}" is currently unavailable.`,
        );
      }

      let unitPrice = Number(menuItem.basePrice);
      let variantName: string | undefined;
      let variantPrice: number | undefined;

      // Validate Variant
      if (itemDto.variantId) {
        const variant = menuItem.variants.find(
          (v) => v.id === itemDto.variantId && v.isActive,
        );
        if (!variant) {
          throw new BadRequestException(
            `Selected variant for item "${menuItem.name}" is invalid.`,
          );
        }
        unitPrice = Number(variant.price);
        variantName = variant.name;
        variantPrice = Number(variant.price);
      } else if (menuItem.variants.filter((v) => v.isActive).length > 0) {
        throw new BadRequestException(
          `Please select a pricing variant for item "${menuItem.name}".`,
        );
      }

      // Validate Addons
      let addonsCost = 0;
      const validatedAddons: Array<{
        addonId: string;
        nameSnapshot: string;
        priceSnapshot: number;
      }> = [];

      if (itemDto.addonIds && itemDto.addonIds.length > 0) {
        if (!settings.allowAddons) {
          throw new BadRequestException('Addons are currently disabled.');
        }

        for (const addonId of itemDto.addonIds) {
          const mapping = menuItem.menuItemAddons.find(
            (ma) => ma.addonId === addonId && ma.addon.isActive,
          );
          if (!mapping) {
            throw new BadRequestException(
              `Selected addon is not mapped to item "${menuItem.name}".`,
            );
          }
          addonsCost += Number(mapping.addon.price);
          validatedAddons.push({
            addonId: mapping.addon.id,
            nameSnapshot: mapping.addon.name,
            priceSnapshot: Number(mapping.addon.price),
          });
        }
      }

      const itemTotal = this.roundToTwo(
        (unitPrice + addonsCost) * itemDto.quantity,
      );
      calculatedSubtotal += itemTotal;

      validatedItemsList.push({
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        variantId: itemDto.variantId,
        variantNameSnapshot: variantName,
        priceSnapshot: Number(menuItem.basePrice),
        variantPriceSnapshot: variantPrice,
        quantity: itemDto.quantity,
        addons: validatedAddons,
        totalPrice: itemTotal,
      });
    }

    return {
      subtotal: this.roundToTwo(calculatedSubtotal),
      validatedItems: validatedItemsList,
    };
  }
}
