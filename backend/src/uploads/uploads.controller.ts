import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder')
    folder: 'logo' | 'menu' | 'categories' | 'banners' | 'receipts',
  ) {
    const validFolders = ['logo', 'menu', 'categories', 'banners', 'receipts'];
    if (!validFolders.includes(folder)) {
      throw new BadRequestException(
        'Invalid target folder. Must be logo, menu, categories, banners, or receipts.',
      );
    }

    const filePath = await this.uploadsService.uploadImage(file, folder);
    return { filePath };
  }
}
