process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
  if (err && err.stack) {
    console.error(err.stack);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Application is shutting down gracefully...');
});

process.on('exit', (code) => {
  console.log(`Node process is exiting with code: ${code}`);
});

async function bootstrap() {
  // Sanitize and percent-encode DATABASE_URL password and append connection pool parameters
  if (process.env.DATABASE_URL) {
    let dbUrl = process.env.DATABASE_URL;
    const match = dbUrl.match(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/);
    if (match) {
      const prefix = match[1];
      const rawPassword = match[3];
      const suffix = match[4];
      if (rawPassword && !rawPassword.includes('%')) {
        const encodedPassword = encodeURIComponent(rawPassword);
        dbUrl = `${prefix}${encodedPassword}${suffix}`;
        console.log('Sanitized DATABASE_URL password format for Prisma compatibility.');
      }
    }
    if (!dbUrl.includes('connection_limit')) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl += `${separator}connection_limit=25&connect_timeout=10&pool_timeout=10`;
    }
    process.env.DATABASE_URL = dbUrl;
  } else {
    console.warn('WARNING: DATABASE_URL environment variable is not defined!');
  }

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      const frontendUrl = configService.get<string>('FRONTEND_URL');
      const allowed = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://cafecuebrew.com',
        'https://www.cafecuebrew.com',
        frontendUrl,
      ].filter(Boolean);

      if (allowed.some((a) => a && (origin === a || origin.startsWith('https://cafecuebrew.com') || origin.endsWith('.cafecuebrew.com')))) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Set global prefix for all API controllers
  app.setGlobalPrefix('api');



  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: ${port}`);
}
void bootstrap();
