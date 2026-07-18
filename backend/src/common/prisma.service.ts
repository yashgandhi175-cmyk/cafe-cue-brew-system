import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Let Prisma connect lazily on the first request context query to avoid pre-fork socket breakage
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
