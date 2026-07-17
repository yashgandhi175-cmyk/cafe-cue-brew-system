import { IsNotEmpty, IsString, Matches, IsUUID } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID('all', { message: 'Staff ID must be a valid UUID' })
  staffId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN must be exactly 4 or 6 digits' })
  pin: string;
}
