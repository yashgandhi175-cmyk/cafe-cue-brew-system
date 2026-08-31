import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid E.164 phone number',
  })
  phone: string;

  @IsEnum(Role)
  role: Role;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$|^\d{6}$/, {
    message: 'PIN must be exactly 4 or 6 digits',
  })
  pin: string;
}