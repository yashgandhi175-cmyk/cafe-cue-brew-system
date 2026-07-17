import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('marketing/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class TemplateController {
  constructor(private templateService: TemplateService) {}

  @Post()
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() staff: { id: string },
  ) {
    return this.templateService.createTemplate(dto, staff.id);
  }

  @Get()
  async getTemplates() {
    return this.templateService.getTemplates();
  }

  @Get(':id')
  async getTemplateById(@Param('id') id: string) {
    return this.templateService.getTemplateById(id);
  }

  @Patch(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() staff: { id: string },
  ) {
    return this.templateService.updateTemplate(id, dto, staff.id);
  }

  @Delete(':id')
  async deleteTemplate(
    @Param('id') id: string,
    @CurrentUser() staff: { id: string },
  ) {
    return this.templateService.deleteTemplate(id, staff.id);
  }
}
