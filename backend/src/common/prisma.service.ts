import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const rawUrl = process.env.DATABASE_URL || '';
    let maskedUrl = 'NOT_SET';
    if (rawUrl) {
      maskedUrl = rawUrl.replace(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/, (match, p1, p2, p3, p4) => {
        return `${p1}********${p4}`;
      });
    }
    console.log(`[PRISMA_DIAGNOSTIC] DATABASE_URL before super() is: ${maskedUrl}`);
    if (rawUrl) {
      const match = rawUrl.match(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/);
      if (match) {
        const rawPassword = match[3];
        console.log(`[PRISMA_DIAGNOSTIC] Password contains '@': ${rawPassword.includes('@')}`);
        console.log(`[PRISMA_DIAGNOSTIC] Password contains '%40': ${rawPassword.includes('%40')}`);
      } else {
        console.log('[PRISMA_DIAGNOSTIC] DATABASE_URL did not match standard MySQL regex pattern');
      }
    }
    super();
  }

  async onModuleInit() {
    // Let Prisma connect lazily on the first request context query to avoid pre-fork socket breakage
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
