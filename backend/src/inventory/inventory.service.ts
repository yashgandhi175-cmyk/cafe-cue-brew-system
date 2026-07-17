import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateIngredientDto,
  UpdateIngredientDto,
  CreateRecipeDto,
  UpdateRecipeDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  CreatePurchaseDto,
  UpdatePurchaseDto,
  CreateWastageDto,
  StockAdjustmentDto,
} from './dto/inventory.dto';
import {
  Role,
  StockTxType,
  PurchaseStatus,
  Prisma,
  BillStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // PERMISSION CHECK HELPER
  // ==========================================

  async checkPermission(
    userId: string,
    capability:
      | 'managerCanManageInventory'
      | 'managerCanViewInventoryCost'
      | 'managerCanManageExpenses'
      | 'managerCanViewProfitEstimate',
  ): Promise<void> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
    });
    if (!staff) {
      throw new UnauthorizedException('Staff member not found.');
    }
    if (staff.role === Role.OWNER) {
      return;
    }
    if (staff.role === Role.MANAGER) {
      const settings = await this.prisma.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      if (settings && settings[capability]) {
        return;
      }
    }
    throw new ForbiddenException(
      'You do not have permission to perform this action.',
    );
  }

  // ==========================================
  // INGREDIENTS CRUD
  // ==========================================

  async createIngredient(dto: CreateIngredientDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const existing = await this.prisma.ingredient.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(
        `Ingredient with name "${dto.name}" already exists.`,
      );
    }
    if (dto.sku) {
      const existingSku = await this.prisma.ingredient.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new BadRequestException(
          `Ingredient with SKU "${dto.sku}" already exists.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          unit: dto.unit,
          category: dto.category ?? 'OTHER',
          minimumStock: dto.minimumStock
            ? new Prisma.Decimal(dto.minimumStock)
            : 0,
          reorderLevel: dto.reorderLevel
            ? new Prisma.Decimal(dto.reorderLevel)
            : 0,
          preferredSupplierId: dto.preferredSupplierId,
          currentStock: 0,
          averageCost: 0,
          lastPurchaseCost: 0,
        },
      });

      // Write opening StockTransaction
      await tx.stockTransaction.create({
        data: {
          ingredientId: ingredient.id,
          type: StockTxType.OPENING_STOCK,
          quantityChange: 0,
          unitCostSnapshot: 0,
          totalCostSnapshot: 0,
          balanceBefore: 0,
          balanceAfter: 0,
          averageCostBefore: 0,
          averageCostAfter: 0,
          reason: 'Initial setup of ingredient.',
          changedById: userId,
        },
      });

      return ingredient;
    });
  }

  async findAllIngredients(userId: string) {
    const list = await this.prisma.ingredient.findMany({
      include: { preferredSupplier: true },
      orderBy: { name: 'asc' },
    });

    // Hide averageCost and lastPurchaseCost if the user doesn't have costing view permission
    let hasCostPermission = true;
    try {
      await this.checkPermission(userId, 'managerCanViewInventoryCost');
    } catch {
      hasCostPermission = false;
    }

    if (!hasCostPermission) {
      return list.map((ing) => {
        const copy = { ...ing } as Record<string, unknown>;
        copy['averageCost'] = undefined;
        copy['lastPurchaseCost'] = undefined;
        return copy as typeof ing;
      });
    }

    return list;
  }

  async findOneIngredient(id: string, userId: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: { preferredSupplier: true },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found.');
    }

    let hasCostPermission = true;
    try {
      await this.checkPermission(userId, 'managerCanViewInventoryCost');
    } catch {
      hasCostPermission = false;
    }

    if (!hasCostPermission) {
      const copy = { ...ingredient } as Record<string, unknown>;
      copy['averageCost'] = undefined;
      copy['lastPurchaseCost'] = undefined;
      return copy as typeof ingredient;
    }

    return ingredient;
  }

  async updateIngredient(id: string, dto: UpdateIngredientDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found.');
    }

    if (dto.name && dto.name !== ingredient.name) {
      const existing = await this.prisma.ingredient.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(
          `Ingredient with name "${dto.name}" already exists.`,
        );
      }
    }

    if (dto.sku && dto.sku !== ingredient.sku) {
      const existingSku = await this.prisma.ingredient.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new BadRequestException(
          `Ingredient with SKU "${dto.sku}" already exists.`,
        );
      }
    }

    const data: Prisma.IngredientUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.minimumStock !== undefined) {
      data.minimumStock = new Prisma.Decimal(dto.minimumStock);
    }
    if (dto.reorderLevel !== undefined) {
      data.reorderLevel = new Prisma.Decimal(dto.reorderLevel);
    }
    if (dto.preferredSupplierId !== undefined) {
      if (dto.preferredSupplierId) {
        data.preferredSupplier = { connect: { id: dto.preferredSupplierId } };
      } else {
        data.preferredSupplier = { disconnect: true };
      }
    }

    return this.prisma.ingredient.update({
      where: { id },
      data,
    });
  }

  async deleteIngredient(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found.');
    }

    // Check if ingredient has active recipes or transactions
    const recipeCount = await this.prisma.recipe.count({
      where: { ingredientId: id },
    });
    if (recipeCount > 0) {
      throw new BadRequestException(
        'Cannot delete ingredient linked to menu/variant/addon recipes.',
      );
    }

    return this.prisma.ingredient.delete({ where: { id } });
  }

  // ==========================================
  // RECIPES CRUD
  // ==========================================

  private validateRecipeOwnership(dto: {
    menuItemId?: string;
    variantId?: string;
    addonId?: string;
  }) {
    let ownerCount = 0;
    if (dto.menuItemId) ownerCount++;
    if (dto.variantId) ownerCount++;
    if (dto.addonId) ownerCount++;

    if (ownerCount !== 1) {
      throw new BadRequestException(
        'Recipe ownership check failed: Recipe must belong to exactly one entity (menuItemId, variantId, or addonId).',
      );
    }
  }

  async createRecipe(dto: CreateRecipeDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    this.validateRecipeOwnership(dto);

    // Verify ingredient exists
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: dto.ingredientId },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found.');
    }

    // Check unique constraint manually
    if (dto.menuItemId) {
      const existing = await this.prisma.recipe.findUnique({
        where: {
          menuItemId_ingredientId: {
            menuItemId: dto.menuItemId,
            ingredientId: dto.ingredientId,
          },
        },
      });
      if (existing) {
        throw new BadRequestException(
          'Recipe already exists for this menu item and ingredient.',
        );
      }
    } else if (dto.variantId) {
      const existing = await this.prisma.recipe.findUnique({
        where: {
          variantId_ingredientId: {
            variantId: dto.variantId,
            ingredientId: dto.ingredientId,
          },
        },
      });
      if (existing) {
        throw new BadRequestException(
          'Recipe already exists for this variant and ingredient.',
        );
      }
    } else if (dto.addonId) {
      const existing = await this.prisma.recipe.findUnique({
        where: {
          addonId_ingredientId: {
            addonId: dto.addonId,
            ingredientId: dto.ingredientId,
          },
        },
      });
      if (existing) {
        throw new BadRequestException(
          'Recipe already exists for this addon and ingredient.',
        );
      }
    }

    return this.prisma.recipe.create({
      data: {
        menuItemId: dto.menuItemId,
        variantId: dto.variantId,
        addonId: dto.addonId,
        ingredientId: dto.ingredientId,
        quantity: new Prisma.Decimal(dto.quantity),
      },
    });
  }

  async findAllRecipes(_userId: string) {
    void _userId;
    return this.prisma.recipe.findMany({
      include: {
        ingredient: true,
        menuItem: true,
        variant: true,
        addon: true,
      },
    });
  }

  async findOneRecipe(id: string, _userId: string) {
    void _userId;
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredient: true,
        menuItem: true,
        variant: true,
        addon: true,
      },
    });
    if (!recipe) {
      throw new NotFoundException('Recipe not found.');
    }
    return recipe;
  }

  async updateRecipe(id: string, dto: UpdateRecipeDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new NotFoundException('Recipe not found.');
    }

    // Merge old owners and new owners to check ownership
    const checkDto = {
      menuItemId:
        (dto.menuItemId !== undefined ? dto.menuItemId : recipe.menuItemId) ??
        undefined,
      variantId:
        (dto.variantId !== undefined ? dto.variantId : recipe.variantId) ??
        undefined,
      addonId:
        (dto.addonId !== undefined ? dto.addonId : recipe.addonId) ?? undefined,
    };
    this.validateRecipeOwnership(checkDto);

    const data: Prisma.RecipeUpdateInput = {};
    if (dto.menuItemId !== undefined)
      data.menuItem = dto.menuItemId
        ? { connect: { id: dto.menuItemId } }
        : { disconnect: true };
    if (dto.variantId !== undefined)
      data.variant = dto.variantId
        ? { connect: { id: dto.variantId } }
        : { disconnect: true };
    if (dto.addonId !== undefined)
      data.addon = dto.addonId
        ? { connect: { id: dto.addonId } }
        : { disconnect: true };
    if (dto.ingredientId !== undefined)
      data.ingredient = { connect: { id: dto.ingredientId } };
    if (dto.quantity !== undefined)
      data.quantity = new Prisma.Decimal(dto.quantity);

    return this.prisma.recipe.update({
      where: { id },
      data,
    });
  }

  async deleteRecipe(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new NotFoundException('Recipe not found.');
    }
    return this.prisma.recipe.delete({ where: { id } });
  }

  // ==========================================
  // SUPPLIERS CRUD
  // ==========================================

  async createSupplier(dto: CreateSupplierDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    return this.prisma.supplier.create({
      data: {
        name: dto.name,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        gstin: dto.gstin,
        address: dto.address,
        notes: dto.notes,
      },
    });
  }

  async findAllSuppliers(_userId: string) {
    void _userId;
    return this.prisma.supplier.findMany();
  }

  async findOneSupplier(id: string, _userId: string) {
    void _userId;
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }
    return supplier;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.gstin !== undefined) data.gstin = dto.gstin;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async deleteSupplier(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }
    return this.prisma.supplier.delete({ where: { id } });
  }

  // ==========================================
  // PURCHASES CRUD & FINALIZATION & REVERSALS
  // ==========================================

  async createPurchase(dto: CreatePurchaseDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    // Verify supplier
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }

    // Generate unique purchase number PUR-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const purchaseNumber = `PUR-${dateStr}-${randomDigits}`;

    // Verify unique purchase number
    const existing = await this.prisma.purchase.findUnique({
      where: { purchaseNumber },
    });
    if (existing) {
      throw new BadRequestException(
        'Unique purchase number conflict. Try again.',
      );
    }

    // Verify all ingredients exist
    const ingIds = dto.items.map((it) => it.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingIds } },
    });
    if (ingredients.length !== new Set(ingIds).size) {
      throw new BadRequestException(
        'Some ingredients in the purchase items do not exist.',
      );
    }

    const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

    // Calculate totals
    let calculatedSubtotal = new Decimal(0);
    const validatedItems = dto.items.map((item) => {
      const ing = ingredientMap.get(item.ingredientId);
      if (!ing) {
        throw new NotFoundException(
          `Ingredient with ID ${item.ingredientId} not found.`,
        );
      }
      const qty = new Decimal(item.purchaseQuantity);
      const cost = new Decimal(item.unitPurchaseCost);
      const tax = new Decimal(item.tax ?? 0);
      const lineTotal = qty.mul(cost).add(tax);
      calculatedSubtotal = calculatedSubtotal.add(lineTotal);

      return {
        ingredientId: item.ingredientId,
        ingredientNameSnapshot: ing.name,
        purchaseUnit: item.purchaseUnit,
        purchaseQuantity: new Prisma.Decimal(item.purchaseQuantity),
        conversionFactor: new Prisma.Decimal(item.conversionFactor),
        baseQuantityAdded: new Prisma.Decimal(
          qty.mul(new Decimal(item.conversionFactor)).toNumber(),
        ),
        unitPurchaseCost: new Prisma.Decimal(item.unitPurchaseCost),
        baseUnitCostSnapshot: new Prisma.Decimal(0), // Set at finalization
        tax: new Prisma.Decimal(item.tax ?? 0),
        lineTotal: new Prisma.Decimal(lineTotal.toNumber()),
      };
    });

    const discount = new Decimal(dto.discount ?? 0);
    const tax = new Decimal(dto.tax ?? 0);
    const otherCharges = new Decimal(dto.otherCharges ?? 0);
    const grandTotal = calculatedSubtotal
      .sub(discount)
      .add(tax)
      .add(otherCharges);

    return this.prisma.purchase.create({
      data: {
        purchaseNumber,
        supplierId: dto.supplierId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
        purchaseDate: dto.purchaseDate
          ? new Date(dto.purchaseDate)
          : new Date(),
        status: PurchaseStatus.DRAFT,
        subtotal: new Prisma.Decimal(calculatedSubtotal.toNumber()),
        discount: new Prisma.Decimal(discount.toNumber()),
        tax: new Prisma.Decimal(tax.toNumber()),
        otherCharges: new Prisma.Decimal(otherCharges.toNumber()),
        grandTotal: new Prisma.Decimal(grandTotal.toNumber()),
        notes: dto.notes,
        createdById: userId,
        items: {
          create: validatedItems,
        },
      },
      include: {
        items: true,
      },
    });
  }

  async findAllPurchases(_userId: string) {
    void _userId;
    return this.prisma.purchase.findMany({
      include: {
        supplier: true,
        items: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOnePurchase(id: string, _userId: string) {
    void _userId;
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true, role: true } },
        items: true,
      },
    });
    if (!purchase) {
      throw new NotFoundException('Purchase not found.');
    }
    return purchase;
  }

  async updatePurchase(id: string, dto: UpdatePurchaseDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase) {
      throw new NotFoundException('Purchase not found.');
    }
    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT purchases can be updated.');
    }

    // Handle supplier
    const supplierId =
      dto.supplierId !== undefined ? dto.supplierId : purchase.supplierId;
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      // If items are updated, delete old items and create new ones
      if (dto.items) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

        const ingIds = dto.items.map((it) => it.ingredientId);
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: ingIds } },
        });
        const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

        let calculatedSubtotal = new Decimal(0);
        const validatedItems = dto.items.map((item) => {
          const ing = ingredientMap.get(item.ingredientId);
          if (!ing)
            throw new NotFoundException(
              `Ingredient ${item.ingredientId} not found.`,
            );
          const qty = new Decimal(item.purchaseQuantity);
          const cost = new Decimal(item.unitPurchaseCost);
          const itemTax = new Decimal(item.tax ?? 0);
          const lineTotal = qty.mul(cost).add(itemTax);
          calculatedSubtotal = calculatedSubtotal.add(lineTotal);

          return {
            purchaseId: id,
            ingredientId: item.ingredientId,
            ingredientNameSnapshot: ing.name,
            purchaseUnit: item.purchaseUnit,
            purchaseQuantity: new Prisma.Decimal(item.purchaseQuantity),
            conversionFactor: new Prisma.Decimal(item.conversionFactor),
            baseQuantityAdded: new Prisma.Decimal(
              qty.mul(new Decimal(item.conversionFactor)).toNumber(),
            ),
            unitPurchaseCost: new Prisma.Decimal(item.unitPurchaseCost),
            baseUnitCostSnapshot: new Prisma.Decimal(0),
            tax: new Prisma.Decimal(item.tax ?? 0),
            lineTotal: new Prisma.Decimal(lineTotal.toNumber()),
          };
        });

        await tx.purchaseItem.createMany({ data: validatedItems });

        const discount = new Decimal(
          dto.discount !== undefined ? dto.discount : purchase.discount,
        );
        const tax = new Decimal(dto.tax !== undefined ? dto.tax : purchase.tax);
        const otherCharges = new Decimal(
          dto.otherCharges !== undefined
            ? dto.otherCharges
            : purchase.otherCharges,
        );
        const grandTotal = calculatedSubtotal
          .sub(discount)
          .add(tax)
          .add(otherCharges);

        return tx.purchase.update({
          where: { id },
          data: {
            supplierId,
            invoiceNumber:
              dto.invoiceNumber !== undefined
                ? dto.invoiceNumber
                : purchase.invoiceNumber,
            invoiceDate: dto.invoiceDate
              ? new Date(dto.invoiceDate)
              : purchase.invoiceDate,
            purchaseDate: dto.purchaseDate
              ? new Date(dto.purchaseDate)
              : purchase.purchaseDate,
            subtotal: new Prisma.Decimal(calculatedSubtotal.toNumber()),
            discount: new Prisma.Decimal(discount.toNumber()),
            tax: new Prisma.Decimal(tax.toNumber()),
            otherCharges: new Prisma.Decimal(otherCharges.toNumber()),
            grandTotal: new Prisma.Decimal(grandTotal.toNumber()),
            notes: dto.notes !== undefined ? dto.notes : purchase.notes,
          },
          include: { items: true },
        });
      } else {
        // Just update top level
        const discount = new Decimal(
          dto.discount !== undefined ? dto.discount : purchase.discount,
        );
        const tax = new Decimal(dto.tax !== undefined ? dto.tax : purchase.tax);
        const otherCharges = new Decimal(
          dto.otherCharges !== undefined
            ? dto.otherCharges
            : purchase.otherCharges,
        );
        const subtotal = new Decimal(purchase.subtotal);
        const grandTotal = subtotal.sub(discount).add(tax).add(otherCharges);

        return tx.purchase.update({
          where: { id },
          data: {
            supplierId,
            invoiceNumber:
              dto.invoiceNumber !== undefined
                ? dto.invoiceNumber
                : purchase.invoiceNumber,
            invoiceDate: dto.invoiceDate
              ? new Date(dto.invoiceDate)
              : purchase.invoiceDate,
            purchaseDate: dto.purchaseDate
              ? new Date(dto.purchaseDate)
              : purchase.purchaseDate,
            discount: new Prisma.Decimal(discount.toNumber()),
            tax: new Prisma.Decimal(tax.toNumber()),
            otherCharges: new Prisma.Decimal(otherCharges.toNumber()),
            grandTotal: new Prisma.Decimal(grandTotal.toNumber()),
            notes: dto.notes !== undefined ? dto.notes : purchase.notes,
          },
          include: { items: true },
        });
      }
    });
  }

  async deletePurchase(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Purchase not found.');
    }
    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT purchases can be deleted.');
    }
    return this.prisma.purchase.delete({ where: { id } });
  }

  // ==========================================
  // PURCHASE FINALIZATION
  // ==========================================

  async finalizePurchase(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: { include: { ingredient: true } } },
      });

      if (!purchase) throw new NotFoundException('Purchase not found.');
      if (purchase.status !== PurchaseStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT purchases can be finalized.');
      }
      if (purchase.items.length === 0) {
        throw new BadRequestException(
          'Purchase must contain at least one item.',
        );
      }

      const totalDiscount = new Decimal(purchase.discount);
      const totalOtherCharges = new Decimal(purchase.otherCharges);

      // Raw cost sum
      let sumRawCost = new Decimal(0);
      for (const item of purchase.items) {
        const raw = new Decimal(item.purchaseQuantity).mul(
          new Decimal(item.unitPurchaseCost),
        );
        sumRawCost = sumRawCost.add(raw);
      }

      let allocatedDiscountSum = new Decimal(0);
      let allocatedOtherChargesSum = new Decimal(0);
      const landedCosts: Decimal[] = [];

      for (let i = 0; i < purchase.items.length; i++) {
        const item = purchase.items[i];
        const rawCost = new Decimal(item.purchaseQuantity).mul(
          new Decimal(item.unitPurchaseCost),
        );

        let itemDiscount = new Decimal(0);
        let itemOtherCharges = new Decimal(0);

        if (sumRawCost.gt(0)) {
          if (i === purchase.items.length - 1) {
            itemDiscount = totalDiscount.sub(allocatedDiscountSum);
            itemOtherCharges = totalOtherCharges.sub(allocatedOtherChargesSum);
          } else {
            const ratio = rawCost.div(sumRawCost);
            itemDiscount = totalDiscount.mul(ratio).toDecimalPlaces(4);
            itemOtherCharges = totalOtherCharges.mul(ratio).toDecimalPlaces(4);

            allocatedDiscountSum = allocatedDiscountSum.add(itemDiscount);
            allocatedOtherChargesSum =
              allocatedOtherChargesSum.add(itemOtherCharges);
          }
        }

        const itemTax = new Decimal(item.tax);
        // LandedCost_i = RawCost_i - ProportionalDiscount_i + tax + ProportionalOtherCharges_i
        const landedCost = rawCost
          .sub(itemDiscount)
          .add(itemTax)
          .add(itemOtherCharges);

        landedCosts.push(landedCost);
      }

      // Recompute average costs and update stock
      for (let i = 0; i < purchase.items.length; i++) {
        const item = purchase.items[i];
        const finalLandedCost = landedCosts[i];
        const baseQty = new Decimal(item.baseQuantityAdded);

        if (baseQty.lte(0)) {
          throw new BadRequestException(
            `Base quantity for item "${item.ingredientNameSnapshot}" must be greater than 0.`,
          );
        }

        const baseUnitCost = finalLandedCost.div(baseQty);

        // Update purchase item with actual base cost snapshot
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: {
            baseUnitCostSnapshot: new Prisma.Decimal(baseUnitCost.toNumber()),
          },
        });

        const currentStock = new Decimal(item.ingredient.currentStock);
        const averageCost = new Decimal(item.ingredient.averageCost);

        let newAverageCost = baseUnitCost;
        if (currentStock.gt(0)) {
          // Weighted average formula: (Q_curr * C_avg + Q_new * C_new) / (Q_curr + Q_new)
          newAverageCost = currentStock
            .mul(averageCost)
            .add(baseQty.mul(baseUnitCost))
            .div(currentStock.add(baseQty));
        }

        const newStock = currentStock.add(baseQty);

        // Create StockTransaction
        await tx.stockTransaction.create({
          data: {
            ingredientId: item.ingredientId,
            type: StockTxType.PURCHASE,
            quantityChange: new Prisma.Decimal(baseQty.toNumber()),
            unitCostSnapshot: new Prisma.Decimal(baseUnitCost.toNumber()),
            totalCostSnapshot: new Prisma.Decimal(finalLandedCost.toNumber()),
            balanceBefore: new Prisma.Decimal(currentStock.toNumber()),
            balanceAfter: new Prisma.Decimal(newStock.toNumber()),
            averageCostBefore: new Prisma.Decimal(averageCost.toNumber()),
            averageCostAfter: new Prisma.Decimal(newAverageCost.toNumber()),
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            reason: `Purchase finalized: ${purchase.purchaseNumber}`,
            changedById: userId,
          },
        });

        // Update Ingredient stock cache & average cost
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            currentStock: new Prisma.Decimal(newStock.toNumber()),
            averageCost: new Prisma.Decimal(newAverageCost.toNumber()),
            lastPurchaseCost: new Prisma.Decimal(baseUnitCost.toNumber()),
          },
        });
      }

      // Mark purchase as finalized
      return tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.FINALIZED },
        include: { items: true },
      });
    });
  }

  // ==========================================
  // PURCHASE REVERSAL
  // ==========================================

  async reversePurchase(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: { include: { ingredient: true } } },
      });

      if (!purchase) throw new NotFoundException('Purchase not found.');
      if (purchase.status !== PurchaseStatus.FINALIZED) {
        throw new BadRequestException(
          'Only FINALIZED purchases can be reversed.',
        );
      }

      // Fetch the PURCHASE StockTransactions associated with this purchase
      const purchaseTxs = await tx.stockTransaction.findMany({
        where: {
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          type: StockTxType.PURCHASE,
        },
      });

      // Map to quickly find the original transaction by ingredient
      const txMap = new Map(purchaseTxs.map((t) => [t.ingredientId, t]));

      // 1. Chronology check: Ensure no later stock-affecting transaction exists for any ingredient
      for (const item of purchase.items) {
        const originalTx = txMap.get(item.ingredientId);
        if (!originalTx) {
          throw new BadRequestException(
            `Original stock transaction not found for ingredient "${item.ingredient.name}". Cannot reverse.`,
          );
        }

        const laterTx = await tx.stockTransaction.findFirst({
          where: {
            ingredientId: item.ingredientId,
            createdAt: { gt: originalTx.createdAt },
            NOT: {
              referenceType: 'PURCHASE',
              referenceId: purchase.id,
            },
          },
        });

        if (laterTx) {
          throw new BadRequestException(
            `Reversal blocked: later stock-affecting transaction exists for ingredient "${item.ingredient.name}".`,
          );
        }
      }

      // 2. Perform reversal
      for (const item of purchase.items) {
        const originalTx = txMap.get(item.ingredientId);
        if (!originalTx) {
          throw new BadRequestException(
            `Original transaction not found for ingredient "${item.ingredient.name}".`,
          );
        }

        const currentStock = new Decimal(item.ingredient.currentStock);
        const currentAverageCost = new Decimal(item.ingredient.averageCost);

        // Restored stock and average cost from original balanceBefore and averageCostBefore
        const restoredStock = new Decimal(originalTx.balanceBefore);
        const restoredAverageCost = new Decimal(originalTx.averageCostBefore);

        // Quantity change is negative (undoing addition)
        const qtyChange = new Decimal(item.baseQuantityAdded).negated();
        const baseUnitCost = new Decimal(originalTx.unitCostSnapshot);
        const finalLandedCost = new Decimal(originalTx.totalCostSnapshot);

        // Write PURCHASE_REVERSAL StockTransaction
        await tx.stockTransaction.create({
          data: {
            ingredientId: item.ingredientId,
            type: StockTxType.PURCHASE_REVERSAL,
            quantityChange: new Prisma.Decimal(qtyChange.toNumber()),
            unitCostSnapshot: new Prisma.Decimal(baseUnitCost.toNumber()),
            totalCostSnapshot: new Prisma.Decimal(
              finalLandedCost.negated().toNumber(),
            ),
            balanceBefore: new Prisma.Decimal(currentStock.toNumber()),
            balanceAfter: new Prisma.Decimal(restoredStock.toNumber()),
            averageCostBefore: new Prisma.Decimal(
              currentAverageCost.toNumber(),
            ),
            averageCostAfter: new Prisma.Decimal(
              restoredAverageCost.toNumber(),
            ),
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            reversesStockTransactionId: originalTx.id,
            reason: `Purchase reversed & cancelled: ${purchase.purchaseNumber}`,
            changedById: userId,
          },
        });

        // Update Ingredient stock & averageCost to restored snapshots
        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: {
            currentStock: new Prisma.Decimal(restoredStock.toNumber()),
            averageCost: new Prisma.Decimal(restoredAverageCost.toNumber()),
          },
        });
      }

      // Mark purchase as CANCELLED
      return tx.purchase.update({
        where: { id },
        data: { status: PurchaseStatus.CANCELLED },
        include: { items: true },
      });
    });
  }

  // ==========================================
  // WASTAGE CRUD & ANALYTICS
  // ==========================================

  async createWastage(dto: CreateWastageDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    return this.prisma.$transaction(async (tx) => {
      const ing = await tx.ingredient.findUnique({
        where: { id: dto.ingredientId },
      });
      if (!ing) throw new NotFoundException('Ingredient not found.');

      const settings = await tx.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      const allowNegative = settings?.allowNegativeStock ?? true;

      const qty = new Decimal(dto.quantity);
      const balanceBefore = new Decimal(ing.currentStock);
      const balanceAfter = balanceBefore.sub(qty);

      if (!allowNegative && balanceAfter.lt(0)) {
        throw new BadRequestException(
          `Insufficient stock to record wastage for ingredient: ${ing.name}`,
        );
      }

      const avgCost = new Decimal(ing.averageCost);
      const wastageTotalCost = qty.mul(avgCost);

      const wastage = await tx.wastageEntry.create({
        data: {
          ingredientId: dto.ingredientId,
          quantity: new Prisma.Decimal(qty.toNumber()),
          reason: dto.reason,
          notes: dto.notes,
          recordedById: userId,
        },
      });

      // Write StockTransaction
      await tx.stockTransaction.create({
        data: {
          ingredientId: dto.ingredientId,
          type: StockTxType.WASTAGE,
          quantityChange: new Prisma.Decimal(qty.negated().toNumber()),
          unitCostSnapshot: new Prisma.Decimal(avgCost.toNumber()),
          totalCostSnapshot: new Prisma.Decimal(
            wastageTotalCost.negated().toNumber(),
          ),
          balanceBefore: new Prisma.Decimal(balanceBefore.toNumber()),
          balanceAfter: new Prisma.Decimal(balanceAfter.toNumber()),
          averageCostBefore: new Prisma.Decimal(avgCost.toNumber()),
          averageCostAfter: new Prisma.Decimal(avgCost.toNumber()),
          referenceType: 'WASTAGE',
          referenceId: wastage.id,
          reason: `Wastage recorded: ${dto.reason}. ${dto.notes ?? ''}`,
          changedById: userId,
        },
      });

      // Update current stock
      await tx.ingredient.update({
        where: { id: dto.ingredientId },
        data: { currentStock: new Prisma.Decimal(balanceAfter.toNumber()) },
      });

      return wastage;
    });
  }

  async findAllWastage(_userId: string) {
    void _userId;
    return this.prisma.wastageEntry.findMany({
      include: {
        ingredient: true,
        recordedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async findOneWastage(id: string, _userId: string) {
    void _userId;
    const entry = await this.prisma.wastageEntry.findUnique({
      where: { id },
      include: {
        ingredient: true,
        recordedBy: { select: { id: true, name: true, role: true } },
      },
    });
    if (!entry) throw new NotFoundException('Wastage entry not found.');
    return entry;
  }

  async deleteWastage(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.wastageEntry.findUnique({
        where: { id },
        include: { ingredient: true },
      });
      if (!entry) throw new NotFoundException('Wastage entry not found.');

      // Find the associated stock transaction
      const stockTx = await tx.stockTransaction.findFirst({
        where: {
          referenceType: 'WASTAGE',
          referenceId: entry.id,
          type: StockTxType.WASTAGE,
        },
      });

      // Chronology check: block deletion if later stock-affecting transaction exists
      if (stockTx) {
        const laterTx = await tx.stockTransaction.findFirst({
          where: {
            ingredientId: entry.ingredientId,
            createdAt: { gt: stockTx.createdAt },
          },
        });
        if (laterTx) {
          throw new BadRequestException(
            'Cannot delete wastage entry: later stock-affecting transactions exist.',
          );
        }
      }

      // Restore stock
      const qty = new Decimal(entry.quantity);
      const newStock = new Decimal(entry.ingredient.currentStock).add(qty);

      if (stockTx) {
        await tx.stockTransaction.delete({ where: { id: stockTx.id } });
      }
      await tx.wastageEntry.delete({ where: { id } });

      await tx.ingredient.update({
        where: { id: entry.ingredientId },
        data: { currentStock: new Prisma.Decimal(newStock.toNumber()) },
      });

      return { success: true };
    });
  }

  // ==========================================
  // STOCK ADJUSTMENTS (MANUAL ADJUST)
  // ==========================================

  async adjustStock(dto: StockAdjustmentDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageInventory');

    return this.prisma.$transaction(async (tx) => {
      const ing = await tx.ingredient.findUnique({
        where: { id: dto.ingredientId },
      });
      if (!ing) throw new NotFoundException('Ingredient not found.');

      const settings = await tx.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      const allowNegative = settings?.allowNegativeStock ?? true;

      const qtyChange = new Decimal(dto.quantityChange);
      const balanceBefore = new Decimal(ing.currentStock);
      const balanceAfter = balanceBefore.add(qtyChange);

      if (!allowNegative && balanceAfter.lt(0)) {
        throw new BadRequestException(
          `Insufficient stock for manual adjustment on ingredient: ${ing.name}`,
        );
      }

      const avgCost = new Decimal(ing.averageCost);
      const totalCostSnapshot = qtyChange.mul(avgCost);

      const st = await tx.stockTransaction.create({
        data: {
          ingredientId: dto.ingredientId,
          type:
            dto.type === 'ADJUSTMENT_IN'
              ? StockTxType.ADJUSTMENT_IN
              : StockTxType.ADJUSTMENT_OUT,
          quantityChange: new Prisma.Decimal(qtyChange.toNumber()),
          unitCostSnapshot: new Prisma.Decimal(avgCost.toNumber()),
          totalCostSnapshot: new Prisma.Decimal(totalCostSnapshot.toNumber()),
          balanceBefore: new Prisma.Decimal(balanceBefore.toNumber()),
          balanceAfter: new Prisma.Decimal(balanceAfter.toNumber()),
          averageCostBefore: new Prisma.Decimal(avgCost.toNumber()),
          averageCostAfter: new Prisma.Decimal(avgCost.toNumber()),
          reason: dto.reason ?? 'Manual stock adjustment.',
          changedById: userId,
        },
      });

      await tx.ingredient.update({
        where: { id: dto.ingredientId },
        data: { currentStock: new Prisma.Decimal(balanceAfter.toNumber()) },
      });

      return st;
    });
  }

  // ==========================================
  // LEDGER / TRANSACTION LOG
  // ==========================================

  async getLedger(userId: string) {
    // Requires Cost permission if costs are retrieved
    let hasCostPermission = true;
    try {
      await this.checkPermission(userId, 'managerCanViewInventoryCost');
    } catch {
      hasCostPermission = false;
    }

    const txs = await this.prisma.stockTransaction.findMany({
      include: {
        ingredient: true,
        changedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!hasCostPermission) {
      return txs.map((t) => {
        const copy = { ...t } as Record<string, unknown>;
        copy['unitCostSnapshot'] = undefined;
        copy['totalCostSnapshot'] = undefined;
        copy['averageCostBefore'] = undefined;
        copy['averageCostAfter'] = undefined;
        return copy as typeof t;
      });
    }

    return txs;
  }

  // ==========================================
  // COSTING & VALUE ESTIMATES & ANALYTICS
  // ==========================================

  async getValueEstimate(userId: string) {
    await this.checkPermission(userId, 'managerCanViewInventoryCost');

    const ingredients = await this.prisma.ingredient.findMany();
    let totalValue = new Decimal(0);
    const breakdown = ingredients.map((ing) => {
      const stock = new Decimal(ing.currentStock);
      const avg = new Decimal(ing.averageCost);
      const value = stock.mul(avg);
      totalValue = totalValue.add(value);

      return {
        id: ing.id,
        name: ing.name,
        sku: ing.sku,
        currentStock: ing.currentStock,
        averageCost: ing.averageCost,
        estimatedValue: value.toNumber(),
      };
    });

    return {
      totalEstimatedValue: totalValue.toNumber(),
      ingredients: breakdown,
    };
  }

  async getFoodCost(startDate: string, endDate: string, userId: string) {
    await this.checkPermission(userId, 'managerCanViewInventoryCost');

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Sum up recipe consumption & consumption reversals
    const txs = await this.prisma.stockTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        type: {
          in: [
            StockTxType.RECIPE_CONSUMPTION,
            StockTxType.CONSUMPTION_REVERSAL,
          ],
        },
      },
    });

    let totalFoodCost = new Decimal(0);
    for (const t of txs) {
      // quantityChange is negative for RECIPE_CONSUMPTION and positive for CONSUMPTION_REVERSAL.
      // We want food cost to be positive, so we accumulate the negative of totalCostSnapshot.
      totalFoodCost = totalFoodCost.sub(new Decimal(t.totalCostSnapshot));
    }

    // Sales taxableAmount from Completed/Paid bills in that period
    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: start, lte: end },
        status: { in: [BillStatus.FINALIZED, BillStatus.PAID] },
      },
    });

    const totalSales = bills.reduce(
      (sum, b) => sum.add(new Decimal(b.taxableAmount)),
      new Decimal(0),
    );
    const foodCostPercentage = totalSales.gt(0)
      ? totalFoodCost.div(totalSales).mul(100)
      : new Decimal(0);

    return {
      totalFoodCost: totalFoodCost.toNumber(),
      totalSalesRevenue: totalSales.toNumber(),
      foodCostPercentage: foodCostPercentage.toNumber(),
    };
  }

  async getWastageAnalytics(
    startDate: string,
    endDate: string,
    userId: string,
  ) {
    await this.checkPermission(userId, 'managerCanViewInventoryCost');

    const start = new Date(startDate);
    const end = new Date(endDate);

    const txs = await this.prisma.stockTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        type: StockTxType.WASTAGE,
      },
      include: { ingredient: true },
    });

    let totalWastageCost = new Decimal(0);
    const reasonBreakdown: Record<string, Decimal> = {};
    const ingredientBreakdown: Record<
      string,
      { name: string; cost: Decimal; qty: Decimal }
    > = {};

    for (const t of txs) {
      const cost = new Decimal(t.totalCostSnapshot).abs();
      const qty = new Decimal(t.quantityChange).abs();
      totalWastageCost = totalWastageCost.add(cost);

      const reason = t.reason || 'UNKNOWN';
      let rCat = 'OTHER';
      if (reason.toLowerCase().includes('expired')) rCat = 'EXPIRED';
      else if (reason.toLowerCase().includes('spoiled')) rCat = 'SPOILED';
      else if (reason.toLowerCase().includes('spilled')) rCat = 'SPILLED';
      else if (reason.toLowerCase().includes('burnt')) rCat = 'BURNT';

      reasonBreakdown[rCat] = (reasonBreakdown[rCat] || new Decimal(0)).add(
        cost,
      );

      const ingId = t.ingredientId;
      if (!ingredientBreakdown[ingId]) {
        ingredientBreakdown[ingId] = {
          name: t.ingredient.name,
          cost: new Decimal(0),
          qty: new Decimal(0),
        };
      }
      ingredientBreakdown[ingId].cost =
        ingredientBreakdown[ingId].cost.add(cost);
      ingredientBreakdown[ingId].qty = ingredientBreakdown[ingId].qty.add(qty);
    }

    const ingredientsList = Object.entries(ingredientBreakdown).map(
      ([id, item]) => ({
        ingredientId: id,
        name: item.name,
        totalCost: item.cost.toNumber(),
        totalQuantity: item.qty.toNumber(),
      }),
    );

    const reasonsList = Object.entries(reasonBreakdown).map(
      ([reason, cost]) => ({
        reason,
        totalCost: cost.toNumber(),
      }),
    );

    return {
      totalWastageCost: totalWastageCost.toNumber(),
      byReason: reasonsList,
      byIngredient: ingredientsList,
    };
  }

  async getOperatingContribution(
    startDate: string,
    endDate: string,
    userId: string,
  ) {
    await this.checkPermission(userId, 'managerCanViewProfitEstimate');

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1. Sales revenue using Finalized or Paid bills
    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: start, lte: end },
        status: { in: [BillStatus.FINALIZED, BillStatus.PAID] },
      },
    });
    const revenue = bills.reduce(
      (sum, b) => sum.add(new Decimal(b.taxableAmount)),
      new Decimal(0),
    );

    // 2. Food cost (stock transactions consumption - consumption reversal)
    const foodCostTxs = await this.prisma.stockTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        type: {
          in: [
            StockTxType.RECIPE_CONSUMPTION,
            StockTxType.CONSUMPTION_REVERSAL,
          ],
        },
      },
    });
    let foodCost = new Decimal(0);
    for (const t of foodCostTxs) {
      foodCost = foodCost.sub(new Decimal(t.totalCostSnapshot));
    }

    // 3. Operating expenses (excluding voided expenses)
    const expenses = await this.prisma.expense.findMany({
      where: {
        expenseDate: { gte: start, lte: end },
        status: { not: 'VOIDED' },
      },
    });
    const totalExpenses = expenses.reduce(
      (sum, e) => sum.add(new Decimal(e.amount)),
      new Decimal(0),
    );

    const contribution = revenue.sub(foodCost).sub(totalExpenses);

    return {
      salesRevenue: revenue.toNumber(),
      foodCost: foodCost.toNumber(),
      operatingExpenses: totalExpenses.toNumber(),
      estimatedOperatingContribution: contribution.toNumber(),
    };
  }

  // ==========================================
  // CSV EXPORTS (PREVENTING FORMULA INJECTION)
  // ==========================================

  private sanitizeCsvCell(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Protect against CSV injection
    if (
      str.startsWith('=') ||
      str.startsWith('+') ||
      str.startsWith('-') ||
      str.startsWith('@')
    ) {
      str = "'" + str;
    }
    return str;
  }

  async exportLedgerCsv(userId: string): Promise<string> {
    const list = await this.getLedger(userId);
    // Columns
    const headers = [
      'Transaction ID',
      'Ingredient Name',
      'SKU',
      'Type',
      'Quantity Change',
      'Unit Cost Snapshot',
      'Total Cost Snapshot',
      'Balance Before',
      'Balance After',
      'Average Cost Before',
      'Average Cost After',
      'Reference Type',
      'Reference ID',
      'Reason',
      'Changed By',
      'Created At',
    ];

    const rows: string[][] = list.map((t) => [
      t.id,
      t.ingredient.name,
      t.ingredient.sku || '',
      t.type,
      String(t.quantityChange),
      (
        (t as Record<string, unknown>)[
          'unitCostSnapshot'
        ] as Prisma.Decimal | null
      )?.toString() ?? '',
      (
        (t as Record<string, unknown>)[
          'totalCostSnapshot'
        ] as Prisma.Decimal | null
      )?.toString() ?? '',
      String(t.balanceBefore),
      String(t.balanceAfter),
      (
        (t as Record<string, unknown>)[
          'averageCostBefore'
        ] as Prisma.Decimal | null
      )?.toString() ?? '',
      (
        (t as Record<string, unknown>)[
          'averageCostAfter'
        ] as Prisma.Decimal | null
      )?.toString() ?? '',
      t.referenceType || '',
      t.referenceId || '',
      t.reason || '',
      t.changedBy.name,
      t.createdAt.toISOString(),
    ]);

    return this.buildCsvString(headers, rows);
  }

  async exportStockBalanceCsv(userId: string): Promise<string> {
    const list = await this.findAllIngredients(userId);
    const headers = [
      'Ingredient Name',
      'SKU',
      'Unit',
      'Category',
      'Current Stock',
      'Average Cost',
      'Total Value',
      'Minimum Stock',
      'Reorder Level',
    ];

    const rows = list.map((ing) => {
      const stock = new Decimal(ing.currentStock ?? 0);
      const avg = new Decimal(ing.averageCost ?? 0);
      const val = stock.mul(avg);

      return [
        ing.name,
        ing.sku || '',
        ing.unit,
        ing.category,
        ing.currentStock ?? '',
        ing.averageCost ?? '',
        val.toNumber(),
        ing.minimumStock ?? '',
        ing.reorderLevel ?? '',
      ];
    });

    return this.buildCsvString(headers, rows);
  }

  async exportWastageCsv(userId: string): Promise<string> {
    const list = await this.findAllWastage(userId);
    const headers = [
      'Wastage ID',
      'Ingredient Name',
      'Quantity Wasted',
      'Reason',
      'Notes',
      'Recorded By',
      'Recorded At',
    ];

    const rows = list.map((w) => [
      w.id,
      w.ingredient.name,
      w.quantity,
      w.reason,
      w.notes || '',
      w.recordedBy.name,
      w.recordedAt.toISOString(),
    ]);

    return this.buildCsvString(headers, rows);
  }

  private buildCsvString(headers: string[], rows: any[][]): string {
    const content = [
      headers.map((h) => `"${this.sanitizeCsvCell(h)}"`).join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${this.sanitizeCsvCell(cell)}"`).join(','),
      ),
    ];
    return content.join('\r\n');
  }
}
