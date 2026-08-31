/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-ccb-marketing-key'] || request.headers['x-api-key'];

    const secret = this.configService.get<string>('MARKETING_QUEUE_SECRET');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (!secret) {
      if (isProduction) {
        throw new UnauthorizedException(
          'CRITICAL SECURITY ERROR: MARKETING_QUEUE_SECRET is missing in production mode.',
        );
      }
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    if (!apiKey || apiKey !== secret) {
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    return true;
  }
}
