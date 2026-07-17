import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AllowDuringPinChange } from './allow-during-pin-change.decorator';

interface ReqContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: {
    'user-agent'?: string;
    authorization?: string;
  };
}

interface UserPayload {
  id: string;
  name: string;
  phone: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: ReqContext) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers ? req.headers['user-agent'] : undefined;
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @AllowDuringPinChange()
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: ReqContext, @CurrentUser() user: UserPayload) {
    const authHeader = req.headers ? req.headers.authorization : undefined;
    const token = authHeader ? authHeader.replace('Bearer ', '') : '';
    const ipAddress = req.ip || req.socket?.remoteAddress;
    return this.authService.logout(token, user.id, ipAddress);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @AllowDuringPinChange()
  me(@CurrentUser() user: UserPayload) {
    return user;
  }
}
