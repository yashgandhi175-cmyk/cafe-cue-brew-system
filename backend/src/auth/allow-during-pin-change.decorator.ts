import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_PIN_CHANGE_KEY = 'allowDuringPinChange';
export const AllowDuringPinChange = () =>
  SetMetadata(ALLOW_DURING_PIN_CHANGE_KEY, true);
