import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] PrismaService constructor entered`);
    
    const rawUrl = process.env.DATABASE_URL || '';
    let maskedUrl = 'NOT_SET';
    if (rawUrl) {
      maskedUrl = rawUrl.replace(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/, (match, p1, p2, p3, p4) => {
        return `${p1}********${p4}`;
      });
    }
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] DATABASE_URL before super() is: ${maskedUrl}`);
    if (rawUrl) {
      const match = rawUrl.match(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/);
      if (match) {
        const rawPassword = match[3];
        console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Password contains '@': ${rawPassword.includes('@')}`);
        console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Password contains '%40': ${rawPassword.includes('%40')}`);
      }
    }

    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Before calling super()`);
    super();
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] After calling super()`);
  }

  async onModuleInit() {
    // Let Prisma connect lazily on the first request context query to avoid pre-fork socket breakage
  }

  async $connect() {
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Before $connect()`);
    await super.$connect();
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] After $connect()`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
