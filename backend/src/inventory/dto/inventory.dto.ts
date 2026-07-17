import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minimumStock?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reorderLevel?: number;

  @IsString()
  @IsOptional()
  preferredSupplierId?: string;
}

export class UpdateIngredientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minimumStock?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reorderLevel?: number;

  @IsString()
  @IsOptional()
  preferredSupplierId?: string;
}

export class CreateRecipeDto {
  @IsString()
  @IsOptional()
  menuItemId?: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsOptional()
  addonId?: string;

  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  quantity: number;
}

export class UpdateRecipeDto {
  @IsString()
  @IsOptional()
  menuItemId?: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsOptional()
  addonId?: string;

  @IsString()
  @IsOptional()
  ingredientId?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.001)
  quantity?: number;
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  gstin?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class PurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @IsString()
  @IsNotEmpty()
  purchaseUnit: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  purchaseQuantity: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  conversionFactor: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  unitPurchaseCost: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax?: number;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  otherCharges?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

export class UpdatePurchaseDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tax?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  otherCharges?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class CreateWastageDto {
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.001)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class StockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @IsNumber()
  @IsNotEmpty()
  quantityChange: number;

  @IsString()
  @IsNotEmpty()
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

  @IsString()
  @IsOptional()
  reason?: string;
}
