/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class AudienceService {
  buildPrismaWhere(ruleGroup: any): Prisma.CustomerWhereInput {
    if (!ruleGroup) {
      return { status: 'ACTIVE', whatsappConsent: true };
    }

    const conjunction = ruleGroup.conjunction || 'AND';
    const rules = ruleGroup.rules || [];

    const conditions: Prisma.CustomerWhereInput[] = [];

    for (const rule of rules) {
      if (rule.conjunction) {
        // Nested rule group
        conditions.push(this.buildPrismaWhere(rule));
      } else {
        // Individual rule
        const condition = this.parseRule(rule);
        if (condition) {
          conditions.push(condition);
        }
      }
    }

    if (conditions.length === 0) {
      return { status: 'ACTIVE', whatsappConsent: true };
    }

    if (conjunction === 'OR') {
      return {
        status: 'ACTIVE',
        whatsappConsent: true,
        OR: conditions,
      };
    } else {
      return {
        status: 'ACTIVE',
        whatsappConsent: true,
        AND: conditions,
      };
    }
  }

  private parseRule(rule: any): Prisma.CustomerWhereInput | null {
    const { field, operator, value } = rule;
    if (!field) return null;

    switch (field) {
      case 'tags': {
        const tags = Array.isArray(value) ? value : [value];
        if (operator === 'EQUALS' || operator === 'IN') {
          return { tagAssignments: { some: { tag: { name: { in: tags } } } } };
        }
        if (operator === 'NOT_EQUALS' || operator === 'NOT_IN') {
          return {
            NOT: { tagAssignments: { some: { tag: { name: { in: tags } } } } },
          };
        }
        break;
      }

      case 'loyaltyTier': {
        let minPoints = 0;
        let maxPoints = 999999;
        const tierName = String(value).toUpperCase();
        if (tierName === 'BRONZE') {
          maxPoints = 99;
        } else if (tierName === 'SILVER') {
          minPoints = 100;
          maxPoints = 499;
        } else if (tierName === 'GOLD') {
          minPoints = 500;
          maxPoints = 999;
        } else if (tierName === 'PLATINUM') {
          minPoints = 1000;
        }
        return {
          loyaltyPoints: { gte: minPoints, lte: maxPoints },
        };
      }

      case 'totalSpend': {
        const spendVal = Number(value);
        if (operator === 'GREATER_THAN') {
          return { totalSpending: { gt: spendVal } };
        }
        if (operator === 'LESS_THAN') {
          return { totalSpending: { lt: spendVal } };
        }
        return { totalSpending: { gte: spendVal } };
      }

      case 'totalOrders': {
        return {
          orders: {
            some: { status: 'COMPLETED' },
          },
        };
      }

      case 'lastVisitDays': {
        const days = Number(value);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        if (operator === 'GREATER_THAN') {
          return {
            orders: {
              none: {
                status: 'COMPLETED',
                createdAt: { gte: cutoffDate },
              },
            },
          };
        } else {
          return {
            orders: {
              some: {
                status: 'COMPLETED',
                createdAt: { gte: cutoffDate },
              },
            },
          };
        }
      }

      case 'phoneExists':
        return { phone: { not: '' } };

      case 'whatsappConsent':
        return { whatsappConsent: value === true || value === 'true' };
    }

    return null;
  }
}
