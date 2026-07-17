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

    const secret =
      this.configService.get<string>('MARKETING_QUEUE_SECRET') ||
      'default_marketing_secret';

    if (!apiKey || apiKey !== secret) {
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    return true;
  }
}
