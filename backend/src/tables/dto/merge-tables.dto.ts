import { IsString, IsNotEmpty, IsArray, ArrayMinSize, IsOptional } from 'class-validator';

export class MergeTablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sourceTableIds: string[];

  @IsString()
  @IsNotEmpty()
  targetTableId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
