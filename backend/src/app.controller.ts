import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  getHello(): string {
    return this.appService.getHello();
  }

  @Get('prisma-diagnostic')
  async runPrismaDiagnostic() {
    const report = {
      connect: 'not_attempted',
      select1: 'not_attempted',
      staffCount: 'not_attempted',
      errorType: null as string | null,
      errorMessage: null as string | null,
      stack: null as string | null,
    };

    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Diagnostic endpoint entered`);

    // 1. Try $connect
    try {
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Before $connect()`);
      report.connect = 'attempting';
      await this.prisma.$connect();
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] After $connect()`);
      report.connect = 'success';
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] $connect() failed:`, err);
      report.connect = 'failed';
      report.errorType = err.constructor?.name || typeof err;
      report.errorMessage = err.message || String(err);
      report.stack = err.stack || null;
      return report;
    }

    // 2. Try SELECT 1
    try {
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Before SELECT 1`);
      report.select1 = 'attempting';
      const result = await this.prisma.$queryRaw`SELECT 1 as result`;
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] After SELECT 1, returned:`, JSON.stringify(result));
      report.select1 = 'success';
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] SELECT 1 failed:`, err);
      report.select1 = 'failed';
      report.errorType = err.constructor?.name || typeof err;
      report.errorMessage = err.message || String(err);
      report.stack = err.stack || null;
      return report;
    }

    // 3. Try staff.count()
    try {
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] Before staff.count()`);
      report.staffCount = 'attempting';
      const count = await this.prisma.staff.count();
      console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] After staff.count(), returned:`, count);
      report.staffCount = 'success';
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] staff.count() failed:`, err);
      report.staffCount = 'failed';
      report.errorType = err.constructor?.name || typeof err;
      report.errorMessage = err.message || String(err);
      report.stack = err.stack || null;
      return report;
    }

    return report;
  }
}
