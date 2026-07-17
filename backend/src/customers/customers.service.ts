import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  Role,
  Prisma,
  CustomerStatus,
  MarketingConsentSource,
} from '@prisma/client';
import {
  CustomerQueryDto,
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateTagDto,
  UpdateConsentDto,
} from './dto/customers.dto';
import { normalizePhone } from '../common/phone.util';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // PERMISSION CHECK HELPER
  // ==========================================

  async checkPermission(
    userId: string,
    capability:
      'managerCanViewCustomerCRM' | 'managerCanManageCustomerCRM' | 'ownerOnly',
  ): Promise<void> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
    });
    if (!staff) {
      throw new UnauthorizedException('Staff member not found.');
    }
    if (staff.role === Role.OWNER) {
      return;
    }
    if (capability === 'ownerOnly') {
      throw new ForbiddenException('Only the OWNER can perform this action.');
    }
    if (staff.role === Role.MANAGER) {
      const settings = await this.prisma.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      if (settings && settings[capability]) {
        return;
      }
    }
    throw new ForbiddenException(
      'You do not have permission to perform this action.',
    );
  }

  // ==========================================
  // SEGMENTATION & METRICS CALCULATIONS
  // ==========================================

  async getCustomerMetricsAndSegments(customerId: string, settings: any) {
    const timezone = settings.timezone || 'Asia/Kolkata';

    // In MySQL, offset conversion helper
    const offsetStr = timezone === 'Asia/Kolkata' ? '05:30:00' : '00:00:00';

    // 1. Fetch eligible finalized/paid bills associated with this customer
    // The query calculates subtotal, discounts (coupon + manual), CGST, SGST, serviceCharge, nightCharge, and grandTotal.
    // Earning base is defined as: subtotal - (couponDiscount + manualDiscount).
    // Let's perform a raw SQL aggregation to be extremely precise and Decimal-safe.
    const billsInfo: any[] = await this.prisma.$queryRaw`
      SELECT 
        COUNT(b.id) as billCount,
        COALESCE(SUM(b.grandTotal), 0) as totalSpend,
        COALESCE(MIN(b.createdAt), NULL) as firstVisit,
        COALESCE(MAX(b.createdAt), NULL) as lastVisit,
        COUNT(DISTINCT DATE(ADDTIME(b.createdAt, ${offsetStr}))) as visits
      FROM \`Bill\` b
      INNER JOIN \`Order\` o ON b.orderId = o.id
      WHERE o.customerId = ${customerId}
        AND b.status IN ('FINALIZED', 'PAID')
    `;

    const stats = billsInfo[0] || {
      billCount: 0,
      totalSpend: 0,
      firstVisit: null,
      lastVisit: null,
      visits: 0,
    };

    const visits = Number(stats.visits || 0);
    const totalSpend = Number(stats.totalSpend || 0);
    const averageSpend =
      visits > 0 ? Number((totalSpend / visits).toFixed(2)) : 0;

    const firstVisit = stats.firstVisit ? new Date(stats.firstVisit) : null;
    const lastVisit = stats.lastVisit ? new Date(stats.lastVisit) : null;

    // Days since last visit calculation using Kolkata timezone
    let daysSinceLastVisit = -1;
    if (lastVisit) {
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - lastVisit.getTime());
      daysSinceLastVisit = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // Segment Flags
    const isNew =
      visits === 1 &&
      firstVisit &&
      Math.floor(
        Math.abs(new Date().getTime() - firstVisit.getTime()) /
          (1000 * 60 * 60 * 24),
      ) <= settings.newCustomerWindowDays;
    const isRegular = visits >= settings.regularCustomerVisitThreshold;
    const isVip = totalSpend >= Number(settings.vipCustomerSpendThreshold);
    const isHighSpender =
      averageSpend >= Number(settings.highSpenderAverageSpendThreshold);
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

    // Primary Lifecycle Segment: INACTIVE > AT_RISK > VIP > REGULAR > NEW
    let primaryLifecycleSegment = 'UNCLASSIFIED';
    if (isInactive) primaryLifecycleSegment = 'INACTIVE';
    else if (isAtRisk) primaryLifecycleSegment = 'AT_RISK';
    else if (isVip) primaryLifecycleSegment = 'VIP';
    else if (isRegular) primaryLifecycleSegment = 'REGULAR';
    else if (isNew) primaryLifecycleSegment = 'NEW';

    return {
      totalSpend,
      totalOrders: Number(stats.billCount || 0),
      visits,
      averageSpend,
      firstVisit,
      lastVisit,
      segmentFlags,
      primaryLifecycleSegment,
    };
  }

  // ==========================================
  // CUSTOMER CRUD
  // ==========================================

  async findAll(query: CustomerQueryDto, userId: string) {
    await this.checkPermission(userId, 'managerCanViewCustomerCRM');
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 15)));
    const skip = (page - 1) * limit;

    // Filter build
    const where: Prisma.CustomerWhereInput = {};

    if (query.search) {
      const normalizedSearch = query.search.trim();
      where.OR = [
        { name: { contains: normalizedSearch } },
        { phone: { contains: normalizedSearch } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.marketingConsent) {
      where.marketingConsent = query.marketingConsent === 'true';
    }

    if (query.tag) {
      where.tagAssignments = {
        some: {
          tagId: query.tag,
        },
      };
    }

    const allCustomers = await this.prisma.customer.findMany({
      where,
      include: {
        tagAssignments: {
          include: { tag: true },
        },
      },
    });

    // Populate dynamic segment analytics
    let enriched = await Promise.all(
      allCustomers.map(async (customer) => {
        const metrics = await this.getCustomerMetricsAndSegments(
          customer.id,
          settings,
        );
        return {
          ...customer,
          metrics,
        };
      }),
    );

    // Apply segment filter post-enrichment
    if (query.segment) {
      const segKey = query.segment as
        'NEW' | 'REGULAR' | 'VIP' | 'HIGH_SPENDER' | 'AT_RISK' | 'INACTIVE';
      enriched = enriched.filter(
        (c) =>
          c.metrics.primaryLifecycleSegment === query.segment ||
          !!c.metrics.segmentFlags[segKey],
      );
    }

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    enriched.sort((a: any, b: any) => {
      let valA = a[sortBy] ?? a.metrics[sortBy] ?? 0;
      let valB = b[sortBy] ?? b.metrics[sortBy] ?? 0;

      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = enriched.length;
    const items = enriched.slice(skip, skip + limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanViewCustomerCRM');
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        tagAssignments: {
          include: { tag: true },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    const metrics = await this.getCustomerMetricsAndSegments(
      customer.id,
      settings,
    );

    // Bounded recent orders
    const recentOrders = await this.prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        bills: true,
      },
    });

    return {
      ...customer,
      metrics,
      recentOrders,
    };
  }

  async create(dto: CreateCustomerDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageCustomerCRM');
    const normalizedPhone = normalizePhone(dto.phone);

    const exists = await this.prisma.customer.findUnique({
      where: { phone: normalizedPhone },
    });
    if (exists) {
      throw new BadRequestException(
        'A customer with this phone number already exists.',
      );
    }

    return this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: normalizedPhone,
        email: dto.email?.trim() || null,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        anniversary: dto.anniversary ? new Date(dto.anniversary) : null,
        notes: dto.notes?.trim() || null,
        marketingConsent: dto.marketingConsent ?? false,
        marketingConsentAt: dto.marketingConsent ? new Date() : null,
        marketingConsentSource: dto.marketingConsent
          ? MarketingConsentSource.POS_STAFF_CAPTURE
          : null,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageCustomerCRM');
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    // Do NOT allow phone editing or loyaltyPoint edits here.
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        email: dto.email !== undefined ? dto.email.trim() : undefined,
        birthday:
          dto.birthday !== undefined
            ? dto.birthday
              ? new Date(dto.birthday)
              : null
            : undefined,
        anniversary:
          dto.anniversary !== undefined
            ? dto.anniversary
              ? new Date(dto.anniversary)
              : null
            : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
      },
    });
  }

  async updateConsent(id: string, dto: UpdateConsentDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageCustomerCRM');
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    // Blocked customers cannot have consent set to true
    if (dto.marketingConsent && customer.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException(
        'Cannot grant marketing consent for a blocked customer.',
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.customer.update({
        where: { id },
        data: {
          marketingConsent: dto.marketingConsent,
          marketingConsentAt: dto.marketingConsent ? new Date() : null,
          marketingConsentSource: dto.marketingConsent ? dto.source : null,
          marketingOptOutAt: !dto.marketingConsent ? new Date() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId: userId,
          action: dto.marketingConsent
            ? 'CUSTOMER_MARKETING_CONSENT_GRANTED'
            : 'CUSTOMER_MARKETING_CONSENT_REVOKED',
          entityType: 'Customer',
          entityId: id,
          newData: JSON.stringify(
            dto.marketingConsent
              ? { customerId: id, marketingConsentSource: dto.source }
              : { customerId: id },
          ),
          ipAddress: '127.0.0.1',
        },
      });

      return updated;
    });
  }

  // ==========================================
  // TAG MANAGEMENT
  // ==========================================

  async findAllTags(userId: string) {
    await this.checkPermission(userId, 'managerCanViewCustomerCRM');
    return this.prisma.customerTag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createTag(dto: CreateTagDto, userId: string) {
    await this.checkPermission(userId, 'ownerOnly');
    const normalized = dto.name.trim();

    const exists = await this.prisma.customerTag.findUnique({
      where: { name: normalized },
    });
    if (exists) {
      throw new BadRequestException('A tag with this name already exists.');
    }

    return this.prisma.customerTag.create({
      data: {
        name: normalized,
        description: dto.description || null,
        isActive: true,
      },
    });
  }

  async deactivateTag(id: string, userId: string) {
    await this.checkPermission(userId, 'ownerOnly');
    const tag = await this.prisma.customerTag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found.');
    }

    return this.prisma.customerTag.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assignTag(customerId: string, tagId: string, staffId: string) {
    await this.checkPermission(staffId, 'managerCanManageCustomerCRM');

    const [customer, tag] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.customerTag.findUnique({ where: { id: tagId } }),
    ]);

    if (!customer) throw new NotFoundException('Customer not found.');
    if (!tag) throw new NotFoundException('Tag not found.');
    if (!tag.isActive)
      throw new BadRequestException('Cannot assign a deactivated tag.');

    // Prevent duplicate assignments
    const existing = await this.prisma.customerTagAssignment.findUnique({
      where: { customerId_tagId: { customerId, tagId } },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const assignment = await tx.customerTagAssignment.create({
        data: {
          customerId,
          tagId,
          assignedById: staffId,
        },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CUSTOMER_TAG_ASSIGNED',
          entityType: 'Customer',
          entityId: customerId,
          newData: JSON.stringify({ customerId, tagId }),
          ipAddress: '127.0.0.1',
        },
      });

      return assignment;
    });
  }

  async removeTagAssignment(
    customerId: string,
    tagId: string,
    staffId: string,
  ) {
    await this.checkPermission(staffId, 'managerCanManageCustomerCRM');
    const existing = await this.prisma.customerTagAssignment.findUnique({
      where: { customerId_tagId: { customerId, tagId } },
    });
    if (!existing) {
      throw new NotFoundException('Tag assignment not found.');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deleted = await tx.customerTagAssignment.delete({
        where: { customerId_tagId: { customerId, tagId } },
      });

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CUSTOMER_TAG_REMOVED',
          entityType: 'Customer',
          entityId: customerId,
          newData: JSON.stringify({ customerId, tagId }),
          ipAddress: '127.0.0.1',
        },
      });

      return deleted;
    });
  }

  // ==========================================
  // EXPORT SAFETY
  // ==========================================

  async exportCsv(userId: string): Promise<string> {
    await this.checkPermission(userId, 'ownerOnly');

    const customers = await this.prisma.customer.findMany({
      include: {
        tagAssignments: { include: { tag: true } },
      },
    });

    if (customers.length > 5000) {
      throw new BadRequestException(
        'CSV export limit of 5000 records exceeded.',
      );
    }

    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    // Write AuditLog
    await this.prisma.auditLog.create({
      data: {
        staffId: userId,
        action: 'CRM_EXPORT',
        entityType: 'Customer',
        entityId: 'ALL',
        newData: JSON.stringify({ recordCount: customers.length }),
      },
    });

    const headers = [
      'ID',
      'Name',
      'Phone',
      'Email',
      'Birthday',
      'Anniversary',
      'Marketing Consent',
      'Consent Date',
      'Consent Source',
      'Status',
      'Total Spend',
      'Total Visits',
      'Average Spend',
      'First Visit',
      'Last Visit',
      'Tags',
    ];

    const rows = await Promise.all(
      customers.map(async (c) => {
        const metrics = await this.getCustomerMetricsAndSegments(
          c.id,
          settings,
        );

        // Escape CSV injection formula characters (=, +, -, @)
        const sanitize = (val: string | null) => {
          if (!val) return '';
          const escaped = val.replace(/"/g, '""');
          if (['=', '+', '-', '@'].includes(escaped.charAt(0))) {
            return `"'${escaped}"`;
          }
          return `"${escaped}"`;
        };

        const tagList = c.tagAssignments.map((a) => a.tag.name).join(', ');

        return [
          c.id,
          sanitize(c.name),
          sanitize(c.phone),
          sanitize(c.email),
          c.birthday ? c.birthday.toISOString().slice(0, 10) : '',
          c.anniversary ? c.anniversary.toISOString().slice(0, 10) : '',
          c.marketingConsent ? 'YES' : 'NO',
          c.marketingConsentAt ? c.marketingConsentAt.toISOString() : '',
          c.marketingConsentSource || '',
          c.status,
          metrics.totalSpend.toFixed(2),
          metrics.visits,
          metrics.averageSpend.toFixed(2),
          metrics.firstVisit ? metrics.firstVisit.toISOString() : '',
          metrics.lastVisit ? metrics.lastVisit.toISOString() : '',
          sanitize(tagList),
        ];
      }),
    );

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return csvContent;
  }

  // ==========================================
  // CRM ANALYTICS
  // ==========================================

  async getCrmAnalytics(userId: string) {
    await this.checkPermission(userId, 'managerCanViewCustomerCRM');
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    const customers = await this.prisma.customer.findMany();

    const totalCustomers = customers.length;
    let newCount = 0;
    let regularCount = 0;
    let vipCount = 0;
    let highSpenderCount = 0;
    let atRiskCount = 0;
    let inactiveCount = 0;
    let consentCount = 0;
    let activeCount = 0;
    let returningCount = 0;

    let totalSpendOverall = 0;
    let totalVisitsOverall = 0;

    const customersWithMetrics = await Promise.all(
      customers.map(async (c) => {
        const m = await this.getCustomerMetricsAndSegments(c.id, settings);

        totalSpendOverall += m.totalSpend;
        totalVisitsOverall += m.visits;

        if (m.segmentFlags.NEW) newCount++;
        if (m.segmentFlags.REGULAR) regularCount++;
        if (m.segmentFlags.VIP) vipCount++;
        if (m.segmentFlags.HIGH_SPENDER) highSpenderCount++;
        if (m.segmentFlags.AT_RISK) atRiskCount++;
        if (m.segmentFlags.INACTIVE) inactiveCount++;
        if (m.visits > 1) returningCount++;

        if (c.marketingConsent) consentCount++;
        if (c.status === CustomerStatus.ACTIVE) activeCount++;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          totalSpend: m.totalSpend,
          visits: m.visits,
        };
      }),
    );

    // Repeat Customer Rate: returningCount / customers with >= 1 visit
    const customersWithVisits = customersWithMetrics.filter(
      (c) => c.visits >= 1,
    ).length;
    const repeatRate =
      customersWithVisits > 0
        ? Number(((returningCount / customersWithVisits) * 100).toFixed(2))
        : 0;
    const avgSpendOverall =
      totalVisitsOverall > 0
        ? Number((totalSpendOverall / totalVisitsOverall).toFixed(2))
        : 0;

    // Top Customers by Spend
    customersWithMetrics.sort((a, b) => b.totalSpend - a.totalSpend);
    const topCustomers = customersWithMetrics.slice(0, 10);

    return {
      totalCustomers,
      newCustomers: newCount,
      returningCustomers: returningCount,
      repeatCustomerRate: repeatRate,
      totalEligibleCustomerSpend: totalSpendOverall,
      averageSpendPerVisit: avgSpendOverall,
      activeCustomerCount: activeCount,
      inactiveCustomerCount: inactiveCount,
      atRiskCustomerCount: atRiskCount,
      vipCustomerCount: vipCount,
      highSpenderCustomerCount: highSpenderCount,
      marketingConsentCount: consentCount,
      topCustomers,
      segmentCounts: {
        NEW: newCount,
        REGULAR: regularCount,
        VIP: vipCount,
        HIGH_SPENDER: highSpenderCount,
        AT_RISK: atRiskCount,
        INACTIVE: inactiveCount,
      },
    };
  }
}
