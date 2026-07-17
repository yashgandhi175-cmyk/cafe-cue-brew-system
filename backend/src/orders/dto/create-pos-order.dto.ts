import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PosOrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
}

export enum DiscountType {
  FLAT = 'FLAT',
  PERCENTAGE = 'PERCENTAGE',
}

export class CreatePosOrderItemDto {
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addonIds?: string[];

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePosOrderDto {
  @IsEnum(PosOrderType)
  orderType: PosOrderType;

  @IsString()
  @IsOptional()
  tableId?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsBoolean()
  @IsOptional()
  marketingConsent?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePosOrderItemDto)
  items: CreatePosOrderItemDto[];

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsEnum(DiscountType)
  @IsOptional()
  manualDiscountType?: DiscountType;

  @IsNumber()
  @IsOptional()
  manualDiscountValue?: number;

  @IsString()
  @IsOptional()
  manualDiscountReason?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
