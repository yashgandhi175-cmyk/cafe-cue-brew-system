import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ALLOW_DURING_PIN_CHANGE_KEY } from './allow-during-pin-change.decorator';

interface TokenUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  mustChangePin?: boolean;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  override handleRequest<TUser = TokenUser>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException();
    }

    const staffUser = user as TokenUser;

    // Check if user is required to change PIN
    if (staffUser.mustChangePin) {
      const isAllowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DURING_PIN_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (!isAllowed) {
        throw new ForbiddenException(
          'A mandatory PIN change is required. Please change your PIN.',
        );
      }
    }

    return staffUser as unknown as TUser;
  }
}
