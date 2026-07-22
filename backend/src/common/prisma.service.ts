import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('PrismaService: Database connection pool initialized successfully.');
    } catch (err) {
      console.error('PrismaService: Database connection initialization error:', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
