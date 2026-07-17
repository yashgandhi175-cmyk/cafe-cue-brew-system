import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { StaffService } from '../staff/staff.service';
import { PrismaService } from '../common/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private staffService: StaffService,
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: loginDto.staffId },
    });

    if (!staff) {
      throw new UnauthorizedException('Staff profile not found');
    }

    if (staff.status === 'INACTIVE') {
      throw new ForbiddenException('Staff account is deactivated');
    }

    // Load security settings
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    const maxFailedAttempts = settings?.maxFailedAttempts ?? 5;
    const lockDurationMinutes = settings?.accountLockDuration ?? 15;
    const pinLength = settings?.pinLength ?? 4;

    // Validate PIN policy length
    if (loginDto.pin.length !== pinLength) {
      throw new BadRequestException(
        `PIN must be exactly ${pinLength} digits according to policy.`,
      );
    }

    // Check lock
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      const remainingMs = staff.lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

      // Log failed attempt due to lock
      await this.logHistory(staff.id, 'FAILED', 'Account is locked', ipAddress);

      throw new ForbiddenException(
        `Account is temporarily locked. Try again in ${remainingMinutes} minute(s).`,
      );
    }

    // Compare PIN
    const isMatch = await bcrypt.compare(loginDto.pin, staff.pinHash);

    if (!isMatch) {
      // Increment attempts
      const result = await this.staffService.incrementFailedAttempts(
        staff.id,
        maxFailedAttempts,
        lockDurationMinutes,
      );

      await this.logHistory(staff.id, 'FAILED', 'Incorrect PIN', ipAddress);

      if (result && result.lockedUntil) {
        throw new UnauthorizedException(
          `Incorrect PIN. Too many failed attempts. Account locked for ${lockDurationMinutes} minutes.`,
        );
      } else {
        const remaining = maxFailedAttempts - (result?.attempts ?? 0);
        throw new UnauthorizedException(
          `Incorrect PIN. ${remaining} attempt(s) remaining.`,
        );
      }
    }

    // Reset attempts on successful login
    await this.staffService.resetFailedAttempts(staff.id);

    // Generate secure session identifier
    const sessionId = crypto.randomUUID();
    const payload = {
      sub: staff.id,
      role: staff.role,
      name: staff.name,
      sid: sessionId,
    };
    const token = this.jwtService.sign(payload);

    // Create session record (storing a SHA-256 hash of the JWT token to prevent leakage)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionTimeoutMinutes = settings?.sessionTimeout ?? 720;
    const expiredAt = new Date(Date.now() + sessionTimeoutMinutes * 60 * 1000);

    await this.prisma.staffSession.create({
      data: {
        id: sessionId,
        staffId: staff.id,
        token: tokenHash,
        expiredAt,
        userAgent,
        ipAddress,
      },
    });

    // Update last login
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { lastLogin: new Date() },
    });

    // Log success
    await this.logHistory(staff.id, 'SUCCESS', null, ipAddress);

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'LOGIN',
        ipAddress,
      },
    });

    return {
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        mustChangePin: staff.mustChangePin,
      },
    };
  }

  async logout(token: string, staffId: string, ipAddress?: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    // Delete session
    await this.prisma.staffSession.deleteMany({
      where: { token: tokenHash },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: 'LOGOUT',
        ipAddress,
      },
    });

    return { message: 'Logged out successfully' };
  }

  private async logHistory(
    staffId: string,
    status: string,
    failureReason: string | null,
    ipAddress?: string,
  ) {
    await this.prisma.staffLoginHistory.create({
      data: {
        staffId,
        status,
        failureReason,
        ipAddress,
      },
    });
  }
}
