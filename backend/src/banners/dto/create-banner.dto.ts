import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class CreateBannerDto {
  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  buttonText?: string;

  @IsString()
  @IsOptional()
  buttonAction?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(['COUPON', 'MENU_ITEM', 'CATEGORY', 'NONE'], {
    message: 'targetAction must be COUPON, MENU_ITEM, CATEGORY, or NONE.',
  })
  targetAction: 'COUPON' | 'MENU_ITEM' | 'CATEGORY' | 'NONE';

  @IsString()
  @IsOptional()
  targetCouponId?: string;

  @IsString()
  @IsOptional()
  targetMenuItemId?: string;

  @IsString()
  @IsOptional()
  targetCategoryId?: string;
}

export class UpdateBannerDto {
  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  buttonText?: string;

  @IsString()
  @IsOptional()
  buttonAction?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(['COUPON', 'MENU_ITEM', 'CATEGORY', 'NONE'])
  @IsOptional()
  targetAction?: 'COUPON' | 'MENU_ITEM' | 'CATEGORY' | 'NONE';

  @IsString()
  @IsOptional()
  targetCouponId?: string;

  @IsString()
  @IsOptional()
  targetMenuItemId?: string;

  @IsString()
  @IsOptional()
  targetCategoryId?: string;
}
