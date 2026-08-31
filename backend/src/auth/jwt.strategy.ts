import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    if (!jwtSecret) {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing!',
      );
    }

    if (
      isProduction &&
      (jwtSecret === 'cafe-cue-brew-super-secret-key-2026' ||
        jwtSecret === 'dev-secret-key')
    ) {
      throw new Error(
        'CRITICAL SECURITY ERROR: Insecure default JWT_SECRET cannot be used in production mode!',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: string; role: string; sid: string }) {
    // 1. Verify session exists, is active, and is not expired
    const session = await this.prisma.staffSession.findUnique({
      where: { id: payload.sid },
    });

    if (!session || !session.isActive || session.expiredAt < new Date()) {
      throw new UnauthorizedException('Session invalid, expired or logged out');
    }

    // Update lastUsedAt timestamp
    await this.prisma.staffSession.update({
      where: { id: payload.sid },
      data: { lastUsedAt: new Date() },
    });

    // 2. Fetch latest staff record from database
    const staff = await this.prisma.staff.findUnique({
      where: { id: payload.sub },
    });

    if (!staff || staff.status === 'INACTIVE') {
      throw new UnauthorizedException('Staff deactivated or profile not found');
    }

    // 3. Return latest database credentials, overriding any stale JWT claims
    return {
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      mustChangePin: staff.mustChangePin,
    };
  }
}
