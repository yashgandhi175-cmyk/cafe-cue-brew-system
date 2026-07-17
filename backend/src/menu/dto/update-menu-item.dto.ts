import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  IsInt,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMenuVariantDto } from './create-menu-item.dto';

export class UpdateMenuItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  basePrice?: number;

  @IsBoolean()
  @IsOptional()
  isVeg?: boolean;

  @IsBoolean()
  @IsOptional()
  available?: boolean;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsOptional()
  @Type(() => CreateMenuVariantDto)
  variants?: CreateMenuVariantDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addonIds?: string[];
}
