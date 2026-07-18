import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Staff } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export type SanitizedStaff = Omit<Staff, 'pinHash'>;

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(createStaffDto: CreateStaffDto): Promise<SanitizedStaff> {
    const existing = await this.prisma.staff.findUnique({
      where: { phone: createStaffDto.phone },
    });

    if (existing) {
      throw new ConflictException(
        'Staff member with this phone number already exists',
      );
    }

    const pinHash = await bcrypt.hash(createStaffDto.pin, 10);

    const staff = await this.prisma.staff.create({
      data: {
        name: createStaffDto.name,
        phone: createStaffDto.phone,
        role: createStaffDto.role,
        pinHash,
      },
    });

    return this.sanitizeStaff(staff);
  }

  async findAll(): Promise<SanitizedStaff[]> {
    // Lazily run database seeding if empty (inside request context, after fork!)
    try {
      const { seedDatabaseIfEmpty } = await import('../seed.js');
      await seedDatabaseIfEmpty(this.prisma);
    } catch (seedErr) {
      console.error('Failed to run lazy database seeding:', seedErr);
    }

    const staffList = await this.prisma.staff.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return staffList.map((s) => this.sanitizeStaff(s));
  }

  async findOne(id: string): Promise<SanitizedStaff> {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return this.sanitizeStaff(staff);
  }

  async findOneWithPinHash(id: string): Promise<Staff> {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }

  async findByPhone(phone: string): Promise<Staff | null> {
    return this.prisma.staff.findUnique({ where: { phone } });
  }

  async update(
    id: string,
    updateStaffDto: UpdateStaffDto,
  ): Promise<SanitizedStaff> {
    const staff = await this.findOne(id);

    if (updateStaffDto.phone && updateStaffDto.phone !== staff.phone) {
      const existing = await this.prisma.staff.findUnique({
        where: { phone: updateStaffDto.phone },
      });
      if (existing) {
        throw new ConflictException(
          'Staff member with this phone number already exists',
        );
      }
    }

    const updated = await this.prisma.staff.update({
      where: { id },
      data: updateStaffDto,
    });

    // Invalidate sessions immediately if staff member is deactivated
    if (updateStaffDto.status === 'INACTIVE') {
      await this.prisma.staffSession.deleteMany({
        where: { staffId: id },
      });
    }

    return this.sanitizeStaff(updated);
  }

  async changePin(id: string, newPin: string): Promise<{ message: string }> {
    await this.findOne(id);
    const pinHash = await bcrypt.hash(newPin, 10);

    await this.prisma.staff.update({
      where: { id },
      data: {
        pinHash,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    // Invalidate active sessions to force re-login
    await this.prisma.staffSession.deleteMany({
      where: { staffId: id },
    });

    return {
      message: 'PIN changed successfully. Existing sessions invalidated.',
    };
  }

  async updateOwnPin(
    id: string,
    currentPin: string,
    newPin: string,
    confirmPin: string,
  ): Promise<{ message: string }> {
    if (newPin !== confirmPin) {
      throw new BadRequestException(
        'New PIN and confirmation PIN do not match',
      );
    }

    const staff = await this.findOneWithPinHash(id);

    const isMatch = await bcrypt.compare(currentPin, staff.pinHash);
    if (!isMatch) {
      throw new BadRequestException('Incorrect current PIN');
    }

    const pinHash = await bcrypt.hash(newPin, 10);

    // Update PIN and mark mustChangePin as false
    await this.prisma.staff.update({
      where: { id },
      data: {
        pinHash,
        mustChangePin: false,
      },
    });

    // Invalidate all active sessions to force a clean login with the new credentials
    await this.prisma.staffSession.deleteMany({
      where: { staffId: id },
    });

    return { message: 'PIN changed successfully. Please log in again.' };
  }

  async incrementFailedAttempts(
    id: string,
    maxAttempts: number,
    lockDurationMinutes: number,
  ): Promise<{ attempts: number; lockedUntil: Date | null } | undefined> {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) return undefined;

    const attempts = staff.failedAttempts + 1;
    let lockedUntil: Date | null = null;

    if (attempts >= maxAttempts) {
      lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
    }

    await this.prisma.staff.update({
      where: { id },
      data: {
        failedAttempts: attempts,
        lockedUntil,
      },
    });

    return { attempts, lockedUntil };
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.prisma.staff.update({
      where: { id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  sanitizeStaff(staff: Staff): SanitizedStaff {
    const sanitized = { ...staff } as Record<string, any>;
    delete sanitized.pinHash;
    return sanitized as SanitizedStaff;
  }
}
