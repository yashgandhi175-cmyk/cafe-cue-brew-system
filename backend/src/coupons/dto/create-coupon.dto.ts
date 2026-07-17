import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['FLAT', 'PERCENTAGE'], {
    message:
      'Coupon type must be FLAT or PERCENTAGE. Legacy types are unsupported.',
  })
  type: 'FLAT' | 'PERCENTAGE';

  @IsNumber()
  @Min(0.01)
  value: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrder?: number;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  maxDiscount?: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  perCustLimit?: number | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['FLAT', 'PERCENTAGE'])
  @IsOptional()
  type?: 'FLAT' | 'PERCENTAGE';

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  value?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrder?: number;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  maxDiscount?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  perCustLimit?: number | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
