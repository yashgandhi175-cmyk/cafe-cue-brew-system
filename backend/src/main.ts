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
  console.log('[BOOTSTRAP STEP 1/6] Application process started.');

  // Sanitize and percent-encode DATABASE_URL password and append connection pool parameters
  if (process.env.DATABASE_URL) {
    console.log('[BOOTSTRAP STEP 2/6] Evaluating DATABASE_URL parameters...');
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

  console.log('[BOOTSTRAP STEP 3/6] Initializing NestFactory AppModule...');
  const app = await NestFactory.create(AppModule);
  console.log('[BOOTSTRAP STEP 4/6] NestFactory AppModule created successfully.');

  const configService = app.get(ConfigService);

  console.log('[BOOTSTRAP STEP 5/6] Setting up CORS, validation pipes, and API prefix...');
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

  // Enable shutdown hooks for graceful exit and database pool disconnect
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  console.log(`[BOOTSTRAP STEP 6/6] Binding server listener to 0.0.0.0:${port}...`);
  await app.listen(port, '0.0.0.0');
  console.log(`[BOOTSTRAP SUCCESS] Server actively listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('[BOOTSTRAP FATAL ERROR] Application failed during startup:', err);
  process.exit(1);
});
