import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  IsDateString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CampaignType } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(CampaignType)
  type: CampaignType;

  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsObject()
  @IsOptional()
  templateVariables?: Record<string, any>;

  @IsObject()
  @IsNotEmpty()
  targetSegmentRule: Record<string, any>;

  @IsUUID()
  @IsOptional()
  couponId?: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledAt: string;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsEnum(CampaignType)
  @IsOptional()
  type?: CampaignType;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsObject()
  @IsOptional()
  templateVariables?: Record<string, any>;

  @IsObject()
  @IsOptional()
  targetSegmentRule?: Record<string, any>;

  @IsUUID()
  @IsOptional()
  couponId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
