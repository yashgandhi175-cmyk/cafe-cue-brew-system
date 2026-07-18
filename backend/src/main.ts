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

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin:
      configService.get<string>('FRONTEND_URL') || 'http://localhost:3000',
    credentials: true,
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
