import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/create-campaign.dto';
import { CampaignFilterDto } from './dto/campaign-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('marketing/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class CampaignController {
  constructor(private campaignService: CampaignService) {}

  @Post()
  async createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() staff: { id: string },
  ) {
    return this.campaignService.createCampaign(dto, staff.id);
  }

  @Get()
  async getCampaigns(@Query() query: CampaignFilterDto) {
    return this.campaignService.getCampaigns(query);
  }

  @Get(':id')
  async getCampaignById(@Param('id') id: string) {
    return this.campaignService.getCampaignById(id);
  }

  @Patch(':id')
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() staff: { id: string },
  ) {
    return this.campaignService.updateCampaign(id, dto, staff.id);
  }

  @Delete(':id')
  async deleteCampaign(
    @Param('id') id: string,
    @CurrentUser() staff: { id: string },
  ) {
    return this.campaignService.deleteCampaign(id, staff.id);
  }
}
