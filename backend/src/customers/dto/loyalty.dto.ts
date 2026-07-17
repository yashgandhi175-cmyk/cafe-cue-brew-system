import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class AdjustPointsDto {
  @IsNotEmpty()
  @IsNumber()
  pointsChange: number;

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;
}

export class CreateRedemptionRequestDto {
  @IsNotEmpty()
  @IsString()
  billId: string;

  @IsNotEmpty()
  @IsString()
  customerId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  requestedPoints: number;
}
