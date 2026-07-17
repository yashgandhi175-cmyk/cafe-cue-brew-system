import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import * as bcrypt from 'bcryptjs';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const mockStaffId = '11111111-2222-3333-4444-555555555555';
  const mockSessionId = '22222222-3333-4444-5555-666666666666';

  beforeAll(async () => {
    // Mock Prisma's database connect/disconnect methods to allow tests to run offline
    jest
      .spyOn(PrismaService.prototype, '$connect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$disconnect')
      .mockImplementation(() => Promise.resolve());

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Login & Verification Mock Tests', () => {
    it('1. Correct PIN Login should succeed', async () => {
      // Mock db staff check using mockImplementation returning Promise.resolve of never cast to avoid warnings
      const hash = await bcrypt.hash('1234', 10);
      jest.spyOn(prisma.staff, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: mockStaffId,
          name: 'Test Owner',
          phone: '+919999999999',
          role: 'OWNER',
          pinHash: hash,
          mustChangePin: false,
          status: 'ACTIVE',
          failedAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as never),
      );

      // Mock update to avoid real db update calls during logins
      jest
        .spyOn(prisma.staff, 'update')
        .mockImplementation(() => Promise.resolve({} as unknown as never));

      // Mock session creation
      jest.spyOn(prisma.staffSession, 'create').mockImplementation(() =>
        Promise.resolve({
          id: mockSessionId,
          staffId: mockStaffId,
          token: 'sha256_mock_hash',
          expiredAt: new Date(Date.now() + 100000),
          userAgent: null,
          ipAddress: null,
          isActive: true,
          lastUsedAt: new Date(),
          createdAt: new Date(),
        } as unknown as never),
      );

      // Mock settings
      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() =>
          Promise.resolve({
            id: 'default',
            name: 'Cafe Cue & Brew',
            pinLength: 4,
            maxFailedAttempts: 5,
            accountLockDuration: 15,
            sessionTimeout: 720,
          } as unknown as never),
        );

      // Reset mock login history recorder & audit logs
      jest
        .spyOn(prisma.staffLoginHistory, 'create')
        .mockImplementation(() => Promise.resolve({} as unknown as never));
      jest
        .spyOn(prisma.auditLog, 'create')
        .mockImplementation(() => Promise.resolve({} as unknown as never));

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ staffId: mockStaffId, pin: '1234' })
        .expect(200);

      const body = res.body as { token: string; staff: { role: string } };
      expect(body).toHaveProperty('token');
      expect(body.staff.role).toBe('OWNER');
    });

    it('2. Incorrect PIN Login should return 401 Unauthorized', async () => {
      const hash = await bcrypt.hash('1234', 10);
      jest.spyOn(prisma.staff, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: mockStaffId,
          name: 'Test Owner',
          phone: '+919999999999',
          role: 'OWNER',
          pinHash: hash,
          mustChangePin: false,
          status: 'ACTIVE',
          failedAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as never),
      );

      jest
        .spyOn(prisma.staff, 'update')
        .mockImplementation(() => Promise.resolve({} as unknown as never));

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ staffId: mockStaffId, pin: '9999' })
        .expect(401);

      const body = res.body as { message: string };
      expect(body.message).toContain('Incorrect PIN');
    });

    it('3. Inactive Staff login should be rejected', async () => {
      const hash = await bcrypt.hash('1234', 10);
      jest.spyOn(prisma.staff, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: mockStaffId,
          name: 'Test Owner',
          phone: '+919999999999',
          role: 'OWNER',
          pinHash: hash,
          mustChangePin: false,
          status: 'INACTIVE',
          failedAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as never),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ staffId: mockStaffId, pin: '1234' })
        .expect(403);

      const body = res.body as { message: string };
      expect(body.message).toContain('deactivated');
    });

    it('4. Lockout check on maximum failed attempts', async () => {
      const hash = await bcrypt.hash('1234', 10);
      jest.spyOn(prisma.staff, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: mockStaffId,
          name: 'Test Owner',
          phone: '+919999999999',
          role: 'OWNER',
          pinHash: hash,
          mustChangePin: false,
          status: 'ACTIVE',
          failedAttempts: 0,
          lockedUntil: new Date(Date.now() + 600000), // locked for 10 more minutes
          lastLogin: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as never),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ staffId: mockStaffId, pin: '1234' })
        .expect(403);

      const body = res.body as { message: string };
      expect(body.message).toContain('locked');
    });
  });
});
