import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { CampaignType } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalIdentifier: string;

  @IsEnum(CampaignType)
  type: CampaignType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  contentPattern: string;

  @IsObject()
  @IsNotEmpty()
  variableSpecs: Record<string, any>;

  @IsString()
  @IsOptional()
  @MaxLength(12)
  language?: string = 'en';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalIdentifier?: string;

  @IsEnum(CampaignType)
  @IsOptional()
  type?: CampaignType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  contentPattern?: string;

  @IsObject()
  @IsOptional()
  variableSpecs?: Record<string, any>;

  @IsString()
  @IsOptional()
  @MaxLength(12)
  language?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
