import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CategoriesService } from '../categories/categories.service';

@Controller('public')
export class PublicMenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Get('settings')
  async getPublicSettings() {
    const settings = await this.menuService.getPublicSettings();
    if (!settings) {
      throw new NotFoundException('Settings not found');
    }
    return settings;
  }

  @Get('categories')
  async getPublicCategories() {
    return this.categoriesService.findAll(false); // False means only active ones
  }

  @Get('banners')
  async getPublicBanners() {
    return this.menuService.getPublicBanners();
  }

  @Get('menu')
  async getPublicMenuItems(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('veg') veg?: string,
    @Query('popular') popular?: string,
    @Query('bestSeller') bestSeller?: string,
  ) {
    const includeInactive = false;
    let items = await this.menuService.findAllMenuItems(
      categoryId,
      includeInactive,
    );

    // Apply client-side search filtering
    if (search) {
      const term = search.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          (item.description && item.description.toLowerCase().includes(term)),
      );
    }

    // Apply veg filter
    if (veg === 'true') {
      items = items.filter((item) => item.isVeg);
    }

    // Apply popular filter
    if (popular === 'true') {
      items = items.filter((item) => item.popular);
    }

    // Apply bestSeller filter
    if (bestSeller === 'true') {
      items = items.filter((item) => item.bestSeller);
    }

    return items;
  }
}
