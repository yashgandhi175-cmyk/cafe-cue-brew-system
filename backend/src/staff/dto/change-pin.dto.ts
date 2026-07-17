import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangeStaffPinDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN must be exactly 4 or 6 digits' })
  newPin: string;
}

export class UpdateOwnPinDto {
  @IsString()
  @IsNotEmpty()
  currentPin: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN must be exactly 4 or 6 digits' })
  newPin: string;

  @IsString()
  @IsNotEmpty()
  confirmPin: string;
}
