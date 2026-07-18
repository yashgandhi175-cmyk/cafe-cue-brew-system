import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
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

  // Automatically run database seeding if empty
  const { PrismaService } = await import('./common/prisma.service.js');
  const { seedDatabaseIfEmpty } = await import('./seed.js');
  const prisma = app.get(PrismaService);
  try {
    await seedDatabaseIfEmpty(prisma);
  } catch (err) {
    console.error('Failed to run automatic database seeding:', err);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: ${port}`);
}
void bootstrap();
