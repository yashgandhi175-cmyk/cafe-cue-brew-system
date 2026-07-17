import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { CampaignType, CampaignStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CampaignFilterDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
