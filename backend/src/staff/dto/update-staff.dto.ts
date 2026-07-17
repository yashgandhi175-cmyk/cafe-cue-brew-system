import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { Role, StaffStatus } from '@prisma/client';

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid E.164 phone number',
  })
  phone?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsEnum(StaffStatus)
  @IsOptional()
  status?: StaffStatus;
}
