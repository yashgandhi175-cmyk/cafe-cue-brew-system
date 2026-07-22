process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';

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
  // Sanitize and percent-encode DATABASE_URL password if it contains special characters (like '@')
  if (process.env.DATABASE_URL) {
    const match = process.env.DATABASE_URL.match(/^(mysql:\/\/([^:]+):)(.*)(@([^@]+)\/([^/]+))$/);
    if (match) {
      const prefix = match[1];
      const rawPassword = match[3];
      const suffix = match[4];
      if (rawPassword && !rawPassword.includes('%')) {
        const encodedPassword = encodeURIComponent(rawPassword);
        process.env.DATABASE_URL = `${prefix}${encodedPassword}${suffix}`;
        console.log('Sanitized DATABASE_URL password format for Prisma compatibility.');
      }
    }
  } else {
    console.warn('WARNING: DATABASE_URL environment variable is not defined!');
  }

  // Run database schema synchronization conditionally based on environment
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('Running database schema sync (prisma db push) in development mode...');
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      console.log('Development database schema sync completed.');
    } catch (dbError) {
      console.error('Error running development database schema sync:', dbError);
    }
  } else {
    try {
      console.log('Running production database migration (prisma migrate deploy)...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('Production database migration completed.');
    } catch (dbError) {
      console.warn('Production database migration notice:', dbError);
    }
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
