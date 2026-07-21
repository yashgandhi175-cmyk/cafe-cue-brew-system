import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ShiftTableDto {
  @IsString()
  @IsNotEmpty()
  sourceTableId: string;

  @IsString()
  @IsNotEmpty()
  targetTableId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
