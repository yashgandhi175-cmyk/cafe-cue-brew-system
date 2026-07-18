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

  @Get('mysql-diagnostic')
  async runMysqlDiagnostic() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return {
        connection: 'failed',
        query: 'failed',
        error: 'DATABASE_URL environment variable is not defined',
      };
    }

    const report = {
      connection: 'not_attempted',
      query: 'not_attempted',
      result: null as any,
      error: null as string | null,
    };

    console.log(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] Diagnostic endpoint entered`);

    let connection: any = null;
    try {
      const { createConnection } = await import('mysql2/promise');
      
      const parsedUrl = new URL(databaseUrl);
      const host = parsedUrl.hostname;
      const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 3306;
      const user = decodeURIComponent(parsedUrl.username);
      const password = decodeURIComponent(parsedUrl.password);
      const database = parsedUrl.pathname.replace(/^\//, '');

      console.log(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] Before connect to ${host}:${port}/${database} as ${user}`);
      report.connection = 'attempting';
      
      connection = await createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 10000,
      });

      console.log(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] After connect`);
      report.connection = 'success';
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] Connect failed:`, err);
      report.connection = 'failed';
      report.error = err.message || String(err);
      return report;
    }

    try {
      console.log(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] Before SELECT 1`);
      report.query = 'attempting';
      
      const [rows] = await connection.execute('SELECT 1 as result');
      
      console.log(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] After SELECT 1`);
      report.query = 'success';
      report.result = rows;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [MYSQL_DIAGNOSTIC] Query failed:`, err);
      report.query = 'failed';
      report.error = err.message || String(err);
    } finally {
      if (connection) {
        await connection.end().catch(() => {});
      }
    }

    return report;
  }
}
