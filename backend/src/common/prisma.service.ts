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
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        console.log(
          'PrismaService: Database connection pool initialized successfully.',
        );
        break;
      } catch (err) {
        retries--;
        console.error(
          `PrismaService: Connection attempt failed (${3 - retries}/3). Retrying...`,
          err,
        );
        if (retries === 0) {
          console.error(
            'PrismaService: Database connection initialization failed after 3 retries.',
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
