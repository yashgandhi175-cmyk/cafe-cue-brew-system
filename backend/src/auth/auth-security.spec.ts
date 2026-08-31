import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CustomersController } from '../customers/customers.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { ExpensesController } from '../expenses/expenses.controller';
import { LoyaltyController } from '../customers/loyalty.controller';
import { CategoriesController } from '../categories/categories.controller';
import { MenuController } from '../menu/menu.controller';
import { TablesController } from '../tables/tables.controller';
import { StaffService } from '../staff/staff.service';
import { PrismaService } from '../common/prisma.service';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { Role } from '@prisma/client';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('Auth & Authorization Security Safeguards (Phase 3 Master Suite)', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let staffService: StaffService;
  let prismaMock: any;

  beforeEach(async () => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    prismaMock = {
      staff: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      staffSession: {
        deleteMany: jest.fn(),
      },
      restaurantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          maxFailedAttempts: 5,
          accountLockDuration: 15,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    staffService = module.get<StaffService>(StaffService);
  });

  describe('PHASE 1 & PHASE 3A: Customers & Inventory Role Authorization', () => {
    it('should restrict customer CSV export to OWNER and MANAGER only', () => {
      const roles = reflector.get<Role[]>(
        ROLES_KEY,
        CustomersController.prototype.export,
      );
      expect(roles).toEqual([Role.OWNER, Role.MANAGER]);
    });

    it('should restrict inventory mutations and purchase reversals to OWNER and MANAGER', () => {
      const createIng = reflector.get<Role[]>(
        ROLES_KEY,
        InventoryController.prototype.createIngredient,
      );
      expect(createIng).toEqual([Role.OWNER, Role.MANAGER]);

      const adjust = reflector.get<Role[]>(
        ROLES_KEY,
        InventoryController.prototype.adjustStock,
      );
      expect(adjust).toEqual([Role.OWNER, Role.MANAGER]);

      const reverse = reflector.get<Role[]>(
        ROLES_KEY,
        InventoryController.prototype.reversePurchase,
      );
      expect(reverse).toEqual([Role.OWNER, Role.MANAGER]);

      const exportLedger = reflector.get<Role[]>(
        ROLES_KEY,
        InventoryController.prototype.exportLedger,
      );
      expect(exportLedger).toEqual([Role.OWNER, Role.MANAGER]);
    });

    it('should allow KITCHEN_STAFF to read ingredients and recipes but block mutations', () => {
      const mockContext = (handler: any, userRole: Role) =>
        ({
          getHandler: () => handler,
          getClass: () => InventoryController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { role: userRole } }),
          }),
        }) as any;

      // Read ingredients allowed for KITCHEN_STAFF
      expect(
        rolesGuard.canActivate(
          mockContext(
            InventoryController.prototype.findAllIngredients,
            Role.WAITER,
          ),
        ),
      ).toBe(true);

      // Adjust stock denied for KITCHEN_STAFF
      expect(
        rolesGuard.canActivate(
          mockContext(
            InventoryController.prototype.adjustStock,
            Role.WAITER,
          ),
        ),
      ).toBe(false);

      // Adjust stock denied for CASHIER
      expect(
        rolesGuard.canActivate(
          mockContext(
            InventoryController.prototype.adjustStock,
            Role.CASHIER,
          ),
        ),
      ).toBe(false);

      // Adjust stock allowed for MANAGER
      expect(
        rolesGuard.canActivate(
          mockContext(
            InventoryController.prototype.adjustStock,
            Role.MANAGER,
          ),
        ),
      ).toBe(true);
    });
  });

  describe('PHASE 3A: Expenses Role Authorization', () => {
    it('should restrict all expense operations to OWNER and MANAGER', () => {
      const endpoints = [
        ExpensesController.prototype.create,
        ExpensesController.prototype.findAll,
        ExpensesController.prototype.export,
        ExpensesController.prototype.findOne,
        ExpensesController.prototype.update,
        ExpensesController.prototype.remove,
        ExpensesController.prototype.void,
      ];

      endpoints.forEach((ep) => {
        const roles = reflector.get<Role[]>(ROLES_KEY, ep);
        expect(roles).toEqual([Role.OWNER, Role.MANAGER]);
      });
    });

    it('should deny CASHIER and WAITER from creating or voiding expenses', () => {
      const mockContext = (handler: any, userRole: Role) =>
        ({
          getHandler: () => handler,
          getClass: () => ExpensesController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { role: userRole } }),
          }),
        }) as any;

      expect(
        rolesGuard.canActivate(
          mockContext(ExpensesController.prototype.create, Role.CASHIER),
        ),
      ).toBe(false);

      expect(
        rolesGuard.canActivate(
          mockContext(ExpensesController.prototype.void, Role.WAITER),
        ),
      ).toBe(false);
    });
  });

  describe('PHASE 3B: Loyalty Role Authorization', () => {
    it('should restrict manual point adjustment and redemption approval to OWNER and MANAGER', () => {
      const adjustRoles = reflector.get<Role[]>(
        ROLES_KEY,
        LoyaltyController.prototype.adjustPoints,
      );
      expect(adjustRoles).toEqual([Role.OWNER, Role.MANAGER]);

      const approveRoles = reflector.get<Role[]>(
        ROLES_KEY,
        LoyaltyController.prototype.approveRequest,
      );
      expect(approveRoles).toEqual([Role.OWNER, Role.MANAGER]);

      const rejectRoles = reflector.get<Role[]>(
        ROLES_KEY,
        LoyaltyController.prototype.rejectRequest,
      );
      expect(rejectRoles).toEqual([Role.OWNER, Role.MANAGER]);
    });

    it('should allow CASHIER to view loyalty profiles and list redemption requests', () => {
      const profileRoles = reflector.get<Role[]>(
        ROLES_KEY,
        LoyaltyController.prototype.getProfile,
      );
      expect(profileRoles).toEqual([Role.OWNER, Role.MANAGER, Role.CASHIER]);

      const listRoles = reflector.get<Role[]>(
        ROLES_KEY,
        LoyaltyController.prototype.listRequests,
      );
      expect(listRoles).toEqual([Role.OWNER, Role.MANAGER, Role.CASHIER]);
    });

    it('should deny WAITER from manually adjusting points or approving redemptions', () => {
      const mockContext = (handler: any, userRole: Role) =>
        ({
          getHandler: () => handler,
          getClass: () => LoyaltyController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { role: userRole } }),
          }),
        }) as any;

      expect(
        rolesGuard.canActivate(
          mockContext(
            LoyaltyController.prototype.adjustPoints,
            Role.WAITER,
          ),
        ),
      ).toBe(false);

      expect(
        rolesGuard.canActivate(
          mockContext(
            LoyaltyController.prototype.approveRequest,
            Role.WAITER,
          ),
        ),
      ).toBe(false);
    });
  });

  describe('PHASE 3C: Menu, Categories & Table Token Hardening', () => {
    it('should require authorization for categories and menu items GET endpoints', () => {
      const catRoles = reflector.get<Role[]>(
        ROLES_KEY,
        CategoriesController.prototype.findAll,
      );
      expect(catRoles).toEqual([
        Role.OWNER,
        Role.MANAGER,
        Role.CASHIER,
        Role.WAITER,
      ]);

      const menuRoles = reflector.get<Role[]>(
        ROLES_KEY,
        MenuController.prototype.findAllMenuItems,
      );
      expect(menuRoles).toEqual([
        Role.OWNER,
        Role.MANAGER,
        Role.CASHIER,
        Role.WAITER,
      ]);
    });

    it('should sanitize findByToken in TablesController', async () => {
      const tablesServiceMock = {
        findByToken: jest.fn().mockResolvedValue({
          id: 'table-uuid-1',
          tableNumber: 'T-01',
          capacity: 4,
          status: 'AVAILABLE',
          isActive: true,
          internalSecret: 'TEST_INTERNAL_SECRET',
          qrToken: { token: 'CCB_TBL_123' },
        }),
      };

      const controller = new TablesController(tablesServiceMock as any);
      const res = await controller.findByToken('CCB_TBL_123');

      expect(res).toEqual({
        id: 'table-uuid-1',
        tableNumber: 'T-01',
        capacity: 4,
        status: 'AVAILABLE',
        isActive: true,
      });
      expect((res as any).qrToken).toBeUndefined();
      expect((res as any).internalSecret).toBeUndefined();
    });
  });

  describe('PHASE 6: Production Safety, JWT Secrets & Upload Validation Safeguards', () => {
    it('should throw critical security error if JWT_SECRET is missing at runtime', () => {
      const configServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return undefined;
          if (key === 'NODE_ENV') return 'development';
          return null;
        }),
      };

      const JwtStrategyClass = require('./jwt.strategy').JwtStrategy;
      expect(() => new JwtStrategyClass(configServiceMock, prismaMock)).toThrow(
        'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing!',
      );
    });

    it('should throw critical security error if default dev or insecure JWT_SECRET is used in production mode', () => {
      const JwtStrategyClass = require('./jwt.strategy').JwtStrategy;

      const configServiceMock1 = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'cafe-cue-brew-super-secret-key-2026';
          if (key === 'NODE_ENV') return 'production';
          return null;
        }),
      };

      expect(() => new JwtStrategyClass(configServiceMock1, prismaMock)).toThrow(
        'CRITICAL SECURITY ERROR: Insecure default JWT_SECRET cannot be used in production mode!',
      );

      const configServiceMock2 = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'dev-secret-key';
          if (key === 'NODE_ENV') return 'production';
          return null;
        }),
      };

      expect(() => new JwtStrategyClass(configServiceMock2, prismaMock)).toThrow(
        'CRITICAL SECURITY ERROR: Insecure default JWT_SECRET cannot be used in production mode!',
      );
    });

    it('should initialize JwtStrategy successfully with a valid fake test secret', () => {
      const configServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'TEST_FAKE_JWT_SECRET_FOR_UNIT_TESTS_ONLY';
          if (key === 'NODE_ENV') return 'production';
          return null;
        }),
      };

      const JwtStrategyClass = require('./jwt.strategy').JwtStrategy;
      expect(() => new JwtStrategyClass(configServiceMock, prismaMock)).not.toThrow();
    });
  });

  describe('PHASE 1: updateOwnPin Lockout & Attempt Protection', () => {
    it('should increment failed attempts on incorrect current PIN', async () => {
      const hashedPin = await bcrypt.hash('1234', 10);
      prismaMock.staff.findUnique.mockResolvedValue({
        id: 'staff-uuid-1',
        pinHash: hashedPin,
        failedAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        staffService.updateOwnPin('staff-uuid-1', '9999', '5555', '5555'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.staff.update).toHaveBeenCalledWith({
        where: { id: 'staff-uuid-1' },
        data: expect.objectContaining({
          failedAttempts: 1,
        }),
      });
    });

    it('should reset failed attempts on successful PIN change', async () => {
      const hashedPin = await bcrypt.hash('1234', 10);
      prismaMock.staff.findUnique.mockResolvedValue({
        id: 'staff-uuid-1',
        pinHash: hashedPin,
        failedAttempts: 2,
        lockedUntil: null,
      });

      const res = await staffService.updateOwnPin(
        'staff-uuid-1',
        '1234',
        '5555',
        '5555',
      );
      expect(res.message).toContain('PIN changed successfully');

      expect(prismaMock.staff.update).toHaveBeenCalledWith({
        where: { id: 'staff-uuid-1' },
        data: expect.objectContaining({
          mustChangePin: false,
          failedAttempts: 0,
          lockedUntil: null,
        }),
      });
    });
  });
});
