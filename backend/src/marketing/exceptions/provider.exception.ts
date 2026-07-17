/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpException, HttpStatus } from '@nestjs/common';

export class ProviderConfigurationException extends HttpException {
  constructor(message: string) {
    super(
      `[Provider Configuration Error] ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class ProviderAuthenticationException extends HttpException {
  constructor(message: string) {
    super(
      `[Provider Authentication Error] ${message}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class ProviderRequestException extends HttpException {
  constructor(message: string, details?: any) {
    super(
      {
        message: `[Provider Request Error] ${message}`,
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ProviderWebhookException extends HttpException {
  constructor(message: string) {
    super(`[Provider Webhook Error] ${message}`, HttpStatus.BAD_REQUEST);
  }
}
