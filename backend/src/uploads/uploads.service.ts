import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import sharp from 'sharp';

@Injectable()
export class UploadsService {
  private baseUploadDir: string;

  constructor(configService: ConfigService) {
    this.baseUploadDir = configService.get<string>('UPLOAD_DIR') || './uploads';
    this.ensureDirectoryExists(this.baseUploadDir);
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: 'logo' | 'menu' | 'categories' | 'banners' | 'receipts',
  ): Promise<string> {
    // 1. Validate file exists
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // 2. Validate MIME Type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG and WEBP are allowed.',
      );
    }

    // 3. Validate size (Max 5MB)
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('File size too large. Max 5MB is allowed.');
    }

    const folderDir = path.join(this.baseUploadDir, folder);
    this.ensureDirectoryExists(folderDir);

    // 4. Generate unique filename with .webp extension
    const uniqueFilename = `${crypto.randomUUID()}.webp`;
    const targetFilePath = path.join(folderDir, uniqueFilename);

    // 5. Compress and convert to WebP using sharp
    try {
      await sharp(file.buffer)
        .webp({ quality: 80 })
        .resize({
          width: 800,
          height: 800,
          fit: 'inside',
          withoutEnlargement: true,
        }) // moderate resize for web performance
        .toFile(targetFilePath);
    } catch (error) {
      console.error('Image compression failed:', error);
      throw new BadRequestException('Failed to process and compress image');
    }

    // 6. Return relative path for MySQL storage (using forward slashes for compatibility)
    return `uploads/${folder}/${uniqueFilename}`;
  }

  private ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
