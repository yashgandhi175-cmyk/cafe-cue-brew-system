import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  IsInt,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMenuVariantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsBoolean()
  @IsOptional()
  isVeg?: boolean;

  @IsInt()
  @IsOptional()
  @Min(0)
  prepTime?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  popular?: boolean;

  @IsBoolean()
  @IsOptional()
  recommended?: boolean;

  @IsBoolean()
  @IsOptional()
  bestSeller?: boolean;

  @IsArray()
  @IsOptional()
  @Type(() => CreateMenuVariantDto)
  variants?: CreateMenuVariantDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addonIds?: string[];
}
