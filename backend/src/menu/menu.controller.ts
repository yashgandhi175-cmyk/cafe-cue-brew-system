import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateAddonDto, UpdateAddonDto } from './dto/addon.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // ==========================================
  // ADDONS ENDPOINTS
  // ==========================================

  @Post('addons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  createAddon(@Body() createAddonDto: CreateAddonDto) {
    return this.menuService.createAddon(createAddonDto);
  }

  @Get('addons')
  findAllAddons(@Query('all') all?: string) {
    const includeInactive = all === 'true';
    return this.menuService.findAllAddons(includeInactive);
  }

  @Put('addons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  updateAddon(@Param('id') id: string, @Body() updateAddonDto: UpdateAddonDto) {
    return this.menuService.updateAddon(id, updateAddonDto);
  }

  @Delete('addons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  removeAddon(@Param('id') id: string) {
    return this.menuService.removeAddon(id);
  }

  // ==========================================
  // MENU ITEMS ENDPOINTS
  // ==========================================

  @Post('items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  createMenuItem(@Body() createMenuItemDto: CreateMenuItemDto) {
    return this.menuService.createMenuItem(createMenuItemDto);
  }

  @Get('items')
  findAllMenuItems(
    @Query('categoryId') categoryId?: string,
    @Query('all') all?: string,
  ) {
    const includeInactive = all === 'true';
    return this.menuService.findAllMenuItems(categoryId, includeInactive);
  }

  @Get('items/:id')
  findOneMenuItem(@Param('id') id: string) {
    return this.menuService.findOneMenuItem(id);
  }

  @Post('items/bulk-price-update')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  bulkPriceUpdate(
    @Body() payload: {
      categoryId?: string;
      updateType: 'PERCENTAGE' | 'FLAT';
      action: 'INCREASE' | 'DECREASE';
      value: number;
    }
  ) {
    return this.menuService.bulkPriceUpdate(payload);
  }

  @Put('items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  updateMenuItem(
    @Param('id') id: string,
    @Body() updateMenuItemDto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateMenuItem(id, updateMenuItemDto);
  }

  @Delete('items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  removeMenuItem(@Param('id') id: string) {
    return this.menuService.removeMenuItem(id);
  }
}
