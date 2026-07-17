import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/create-banner.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Controller()
export class BannersController {
  constructor(
    private bannersService: BannersService,
    private prisma: PrismaService,
  ) {}

  // ==========================================
  // PUBLIC ENDPOINTS (UN-GUARDED / READ-ONLY)
  // ==========================================

  @Get('public/banners')
  async getActiveBannersPublic() {
    return this.bannersService.getActiveBannersPublic();
  }

  // ==========================================
  // STAFF MANAGEMENT ENDPOINTS (GUARDED)
  // ==========================================

  @Post('banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async createBanner(
    @Body() dto: CreateBannerDto,
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.bannersService.createBanner(dto);
  }

  @Put('banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async updateBanner(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.bannersService.updateBanner(id, dto);
  }

  @Get('banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async listAllBanners(@CurrentUser() staff: { role: Role }) {
    await this.verifyPermission(staff);
    return this.bannersService.listAllBanners();
  }

  @Delete('banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async deleteBanner(
    @Param('id') id: string,
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.bannersService.deleteBanner(id);
  }

  @Patch('banners/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async toggleBanner(
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
    @CurrentUser() staff: { role: Role },
  ) {
    await this.verifyPermission(staff);
    return this.bannersService.toggleBannerActive(id, dto.isActive);
  }

  // ==========================================
  // PRIVATE SECURITY HELPERS
  // ==========================================

  private async verifyPermission(staff: { role: Role }) {
    if (staff.role === Role.OWNER) return;
    if (staff.role === Role.MANAGER) {
      const settings = await this.prisma.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      if (settings?.managerCanManageCoupons) {
        return;
      }
    }
    throw new ForbiddenException(
      'You do not have permission to manage banners.',
    );
  }
}
