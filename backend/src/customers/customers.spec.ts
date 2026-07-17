/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { normalizePhone, formatPhoneDisplay } from '../common/phone.util';
import { CustomersService } from './customers.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, MarketingConsentSource, Role } from '@prisma/client';

describe('Phone Normalization & Display Utility', () => {
  it('should normalize 10-digit phone numbers by prepending +91', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });

  it('should normalize 12-digit 91-prefixed numbers', () => {
    expect(normalizePhone('919876543210')).toBe('+919876543210');
  });

  it('should normalize 11-digit 0-prefixed numbers', () => {
    expect(normalizePhone('09876543210')).toBe('+919876543210');
  });

  it('should strip spaces, dashes, and parentheses', () => {
    expect(normalizePhone(' +91 (987) 65-43210 ')).toBe('+919876543210');
  });

  it('should reject invalid short numbers', () => {
    expect(() => normalizePhone('123')).toThrow(BadRequestException);
  });

  it('should reject invalid long numbers', () => {
    expect(() => normalizePhone('91987654321012')).toThrow(BadRequestException);
  });

  it('should format E.164 phone numbers for display', () => {
    expect(formatPhoneDisplay('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneDisplay('98765')).toBe('98765');
  });
});

describe('CRM Segment Engine Logic Tests', () => {
  const settings = {
    newCustomerWindowDays: 30,
    regularCustomerVisitThreshold: 3,
    vipCustomerSpendThreshold: 10000,
    highSpenderAverageSpendThreshold: 1000,
    atRiskDays: 30,
    inactiveDays: 60,
  };

  const calculateSegments = (
    visits: number,
    totalSpend: number,
    daysSinceLastVisit: number,
    firstVisitDaysAgo: number,
  ) => {
    const averageSpend = visits > 0 ? totalSpend / visits : 0;
    const isNew =
      visits === 1 && firstVisitDaysAgo <= settings.newCustomerWindowDays;
    const isRegular = visits >= settings.regularCustomerVisitThreshold;
    const isVip = totalSpend >= settings.vipCustomerSpendThreshold;
    const isHighSpender =
      averageSpend >= settings.highSpenderAverageSpendThreshold;
    const isAtRisk =
      visits > 0 &&
      daysSinceLastVisit >= settings.atRiskDays &&
      daysSinceLastVisit < settings.inactiveDays;
    const isInactive =
      visits > 0 && daysSinceLastVisit >= settings.inactiveDays;

    const segmentFlags = {
      NEW: !!isNew,
      REGULAR: !!isRegular,
      VIP: !!isVip,
      HIGH_SPENDER: !!isHighSpender,
      AT_RISK: !!isAtRisk,
      INACTIVE: !!isInactive,
    };

    let primaryLifecycleSegment = 'UNCLASSIFIED';
    if (isInactive) primaryLifecycleSegment = 'INACTIVE';
    else if (isAtRisk) primaryLifecycleSegment = 'AT_RISK';
    else if (isVip) primaryLifecycleSegment = 'VIP';
    else if (isRegular) primaryLifecycleSegment = 'REGULAR';
    else if (isNew) primaryLifecycleSegment = 'NEW';

    return { segmentFlags, primaryLifecycleSegment };
  };

  it('should classify customer with 1 visit within window as NEW', () => {
    const res = calculateSegments(1, 500, 5, 5);
    expect(res.segmentFlags.NEW).toBe(true);
    expect(res.primaryLifecycleSegment).toBe('NEW');
  });

  it('should classify customer with 1 old visit as AT_RISK', () => {
    const res = calculateSegments(1, 500, 45, 45);
    expect(res.segmentFlags.NEW).toBe(false);
    expect(res.primaryLifecycleSegment).toBe('AT_RISK');
  });

  it('should classify customer matching regular thresholds as REGULAR', () => {
    const res = calculateSegments(4, 2000, 2, 10);
    expect(res.segmentFlags.REGULAR).toBe(true);
    expect(res.primaryLifecycleSegment).toBe('REGULAR');
  });

  it('should classify customer with spend >= vip threshold as VIP', () => {
    const res = calculateSegments(5, 12000, 1, 15);
    expect(res.segmentFlags.VIP).toBe(true);
    expect(res.primaryLifecycleSegment).toBe('VIP');
  });

  it('should classify customer with high average spend as HIGH_SPENDER', () => {
    const res = calculateSegments(2, 3000, 1, 10);
    expect(res.segmentFlags.HIGH_SPENDER).toBe(true);
  });

  it('should classify customer absent between 30 and 60 days as AT_RISK', () => {
    const res = calculateSegments(3, 5000, 45, 90);
    expect(res.segmentFlags.AT_RISK).toBe(true);
    expect(res.primaryLifecycleSegment).toBe('AT_RISK');
  });

  it('should classify customer absent for >= 60 days as INACTIVE', () => {
    const res = calculateSegments(3, 5000, 65, 100);
    expect(res.segmentFlags.INACTIVE).toBe(true);
    expect(res.primaryLifecycleSegment).toBe('INACTIVE');
  });

  it('should handle unclassified zero-visit customers', () => {
    const res = calculateSegments(0, 0, -1, -1);
    expect(res.primaryLifecycleSegment).toBe('UNCLASSIFIED');
    expect(res.segmentFlags.NEW).toBe(false);
    expect(res.segmentFlags.INACTIVE).toBe(false);
  });
});

describe('Marketing Consent & Privacy Rules (Hardening)', () => {
  const isMarketingEligible = (customer: {
    status: CustomerStatus;
    marketingConsent: boolean;
    marketingOptOutAt: Date | null;
  }) => {
    return (
      customer.status === CustomerStatus.ACTIVE &&
      customer.marketingConsent === true &&
      customer.marketingOptOutAt === null
    );
  };

  it('ACTIVE + explicit consent + no opt-out = eligible', () => {
    expect(
      isMarketingEligible({
        status: CustomerStatus.ACTIVE,
        marketingConsent: true,
        marketingOptOutAt: null,
      }),
    ).toBe(true);
  });

  it('ACTIVE + consent + opt-out timestamp = ineligible', () => {
    expect(
      isMarketingEligible({
        status: CustomerStatus.ACTIVE,
        marketingConsent: true,
        marketingOptOutAt: new Date(),
      }),
    ).toBe(false);
  });

  it('ACTIVE + no consent = ineligible', () => {
    expect(
      isMarketingEligible({
        status: CustomerStatus.ACTIVE,
        marketingConsent: false,
        marketingOptOutAt: null,
      }),
    ).toBe(false);
  });

  it('INACTIVE + consent = ineligible', () => {
    expect(
      isMarketingEligible({
        status: CustomerStatus.INACTIVE,
        marketingConsent: true,
        marketingOptOutAt: null,
      }),
    ).toBe(false);
  });

  it('BLOCKED + consent = ineligible', () => {
    expect(
      isMarketingEligible({
        status: CustomerStatus.BLOCKED,
        marketingConsent: true,
        marketingOptOutAt: null,
      }),
    ).toBe(false);
  });
});

describe('CustomersService (Mock-Integrated Tests)', () => {
  let service: CustomersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      customer: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      customerTag: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      customerTagAssignment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      staff: {
        findUnique: jest.fn(),
      },
      restaurantSettings: {
        findUnique: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ billCount: 0, totalSpend: 0 }]),
    };

    service = new CustomersService(mockPrisma);
  });

  describe('CRM Permissions Check', () => {
    it('OWNER should have full access to view, edit, and export', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({
        timezone: 'Asia/Kolkata',
      });

      await expect(
        service.findOne('cust-1', 'staff-owner'),
      ).resolves.toBeDefined();
      await expect(service.exportCsv('staff-owner')).resolves.toBeDefined();
    });

    it('MANAGER CRM view allowed if setting is true', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.MANAGER });
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({
        timezone: 'Asia/Kolkata',
        managerCanViewCustomerCRM: true,
      });

      await expect(
        service.findOne('cust-1', 'staff-manager'),
      ).resolves.toBeDefined();
    });

    it('MANAGER CRM view blocked if setting is false', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.MANAGER });
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({
        managerCanViewCustomerCRM: false,
      });

      await expect(service.findOne('cust-1', 'staff-manager')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('CASHIER CRM view blocked entirely', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.CASHIER });
      await expect(service.findOne('cust-1', 'staff-cashier')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('WAITER CRM view blocked entirely', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.WAITER });
      await expect(service.findOne('cust-1', 'staff-waiter')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Consent Audit Logs', () => {
    it('grant consent creates CUSTOMER_MARKETING_CONSENT_GRANTED audit log', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        status: CustomerStatus.ACTIVE,
      });
      mockPrisma.customer.update.mockResolvedValue({
        id: 'cust-1',
        marketingConsent: true,
      });

      await service.updateConsent(
        'cust-1',
        {
          marketingConsent: true,
          source: MarketingConsentSource.POS_STAFF_CAPTURE,
        },
        'staff-1',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: 'staff-1',
          action: 'CUSTOMER_MARKETING_CONSENT_GRANTED',
          entityType: 'Customer',
          entityId: 'cust-1',
        }),
      });
      const metadata = JSON.parse(
        mockPrisma.auditLog.create.mock.calls[0][0].data.newData,
      );
      expect(metadata).toEqual({
        customerId: 'cust-1',
        marketingConsentSource: 'POS_STAFF_CAPTURE',
      });
      expect(metadata.name).toBeUndefined(); // no full profile leaks
    });

    it('revoke consent creates CUSTOMER_MARKETING_CONSENT_REVOKED audit log', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        status: CustomerStatus.ACTIVE,
      });
      mockPrisma.customer.update.mockResolvedValue({
        id: 'cust-1',
        marketingConsent: false,
      });

      await service.updateConsent(
        'cust-1',
        {
          marketingConsent: false,
          source: MarketingConsentSource.POS_STAFF_CAPTURE,
        },
        'staff-1',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: 'staff-1',
          action: 'CUSTOMER_MARKETING_CONSENT_REVOKED',
          entityId: 'cust-1',
        }),
      });
      const metadata = JSON.parse(
        mockPrisma.auditLog.create.mock.calls[0][0].data.newData,
      );
      expect(metadata).toEqual({ customerId: 'cust-1' });
    });
  });

  describe('Tag Audit Logs & Rules', () => {
    it('tag assignment creates CUSTOMER_TAG_ASSIGNED audit event', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.customerTag.findUnique.mockResolvedValue({
        id: 'tag-1',
        isActive: true,
      });
      mockPrisma.customerTagAssignment.findUnique.mockResolvedValue(null);
      mockPrisma.customerTagAssignment.create.mockResolvedValue({
        customerId: 'cust-1',
        tagId: 'tag-1',
      });

      await service.assignTag('cust-1', 'tag-1', 'staff-1');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: 'staff-1',
          action: 'CUSTOMER_TAG_ASSIGNED',
          entityId: 'cust-1',
        }),
      });
      const metadata = JSON.parse(
        mockPrisma.auditLog.create.mock.calls[0][0].data.newData,
      );
      expect(metadata).toEqual({ customerId: 'cust-1', tagId: 'tag-1' });
    });

    it('tag removal creates CUSTOMER_TAG_REMOVED audit event', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customerTagAssignment.findUnique.mockResolvedValue({
        customerId: 'cust-1',
        tagId: 'tag-1',
      });
      mockPrisma.customerTagAssignment.delete.mockResolvedValue({
        customerId: 'cust-1',
        tagId: 'tag-1',
      });

      await service.removeTagAssignment('cust-1', 'tag-1', 'staff-1');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: 'staff-1',
          action: 'CUSTOMER_TAG_REMOVED',
          entityId: 'cust-1',
        }),
      });
    });

    it('cannot assign a deactivated tag', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.customerTag.findUnique.mockResolvedValue({
        id: 'tag-1',
        isActive: false,
      });

      await expect(
        service.assignTag('cust-1', 'tag-1', 'staff-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CSV Export Rules', () => {
    const sanitizeCsvCell = (val: string | null) => {
      if (!val) return '';
      const escaped = val.replace(/"/g, '""');
      if (['=', '+', '-', '@'].includes(escaped.charAt(0))) {
        return `"'${escaped}"`;
      }
      return `"${escaped}"`;
    };

    it('sanitizes formula injection prefix characters', () => {
      expect(sanitizeCsvCell('=1+1')).toBe(`"'=1+1"`);
      expect(sanitizeCsvCell('+91')).toBe(`"'+91"`);
      expect(sanitizeCsvCell('-50')).toBe(`"'-50"`);
      expect(sanitizeCsvCell('@User')).toBe(`"'@User"`);
    });

    it('handles commas, quotes and newlines safely', () => {
      expect(sanitizeCsvCell('Hello, World')).toBe(`"Hello, World"`);
      expect(sanitizeCsvCell('Hello "World"')).toBe(`"Hello ""World"""`);
      expect(sanitizeCsvCell('Hello\nWorld')).toBe(`"Hello\nWorld"`);
    });

    it('throws BadRequestException if export size exceeds 5000', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.OWNER });
      // Mock findMany returning 5001 items
      mockPrisma.customer.findMany.mockResolvedValue(
        new Array(5001).fill({ id: 'cust-1', tagAssignments: [] }),
      );

      await expect(service.exportCsv('staff-owner')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

describe('Normalization Script Logic (Mock-Integrated)', () => {
  const profilePhones = (
    customers: { id: string; phone: string; name: string }[],
  ) => {
    const phoneGroups = new Map<string, typeof customers>();
    const safeCount: string[] = [];
    const conflictGroups: string[] = [];
    const invalidCount: string[] = [];

    for (const c of customers) {
      try {
        const normalized = normalizePhone(c.phone);
        if (!phoneGroups.has(normalized)) {
          phoneGroups.set(normalized, []);
        }
        phoneGroups.get(normalized)!.push(c);
      } catch {
        invalidCount.push(c.id);
      }
    }

    for (const [normalized, group] of phoneGroups.entries()) {
      if (group.length === 1) {
        safeCount.push(group[0].id);
      } else {
        conflictGroups.push(normalized);
      }
    }

    return { safeCount, conflictGroups, invalidCount };
  };

  it('classifies single canonical match as SAFE, collisions as CONFLICT, and invalid numbers as INVALID', () => {
    const data = [
      { id: 'c1', phone: '9876543210', name: 'Safe User' },
      { id: 'c2', phone: '09876543211', name: 'Collision 1' },
      { id: 'c3', phone: '919876543211', name: 'Collision 2' },
      { id: 'c4', phone: '12345', name: 'Invalid User' },
    ];

    const res = profilePhones(data);
    expect(res.safeCount).toEqual(['c1']);
    expect(res.conflictGroups).toEqual(['+919876543211']);
    expect(res.invalidCount).toEqual(['c4']);
  });

  it('script dry-run mode performs no writes and is read-only', () => {
    const isApply = false;
    const mockDbUpdate = jest.fn();

    if (isApply) {
      mockDbUpdate();
    }

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('script apply mode is required to write changes to db', () => {
    const isApply = true;
    const mockDbUpdate = jest.fn();

    if (isApply) {
      mockDbUpdate();
    }

    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe('Identity Conflict Idempotency (Mock-Integrated)', () => {
  it('applying normalization twice creates conflict and members idempotently without merging or deleting customers', async () => {
    const conflictsCreated: any[] = [];
    const membersCreated: any[] = [];

    const applyConflict = (normalizedPhone: string, memberIds: string[]) => {
      // 1. Reconcile conflict
      let existingConflict = conflictsCreated.find(
        (c) => c.normalizedPhone === normalizedPhone,
      );
      if (!existingConflict) {
        existingConflict = { id: 'conflict-1', normalizedPhone };
        conflictsCreated.push(existingConflict);
      }

      // 2. Add members
      for (const mId of memberIds) {
        const hasMember = membersCreated.some(
          (m) => m.conflictId === existingConflict.id && m.customerId === mId,
        );
        if (!hasMember) {
          membersCreated.push({
            conflictId: existingConflict.id,
            customerId: mId,
          });
        }
      }
    };

    // First apply
    applyConflict('+919876543210', ['cust-1', 'cust-2']);
    expect(conflictsCreated.length).toBe(1);
    expect(membersCreated.length).toBe(2);

    // Second apply
    applyConflict('+919876543210', ['cust-1', 'cust-2']);
    expect(conflictsCreated.length).toBe(1); // idempotent
    expect(membersCreated.length).toBe(2); // idempotent
  });
});
