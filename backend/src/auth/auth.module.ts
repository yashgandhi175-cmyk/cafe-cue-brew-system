import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { StaffModule } from '../staff/staff.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    StaffModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (!jwtSecret) {
          throw new Error(
            'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing!',
          );
        }

        if (
          isProduction &&
          (jwtSecret === 'cafe-cue-brew-super-secret-key-2026' ||
            jwtSecret === 'dev-secret-key')
        ) {
          throw new Error(
            'CRITICAL SECURITY ERROR: Insecure default JWT_SECRET cannot be used in production mode!',
          );
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ||
              '12h') as unknown as number,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
