import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CustomerQueryDto,
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateTagDto,
  AssignTagDto,
  UpdateConsentDto,
} from './dto/customers.dto';
import type { Response } from 'express';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  findAll(
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.customersService.findAll(query, user.id);
  }

  @Get('analytics')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  getAnalytics(@CurrentUser() user: { id: string }) {
    return this.customersService.getCrmAnalytics(user.id);
  }

  @Get('export')
  @Roles(Role.OWNER, Role.MANAGER)
  async export(@CurrentUser() user: { id: string }, @Res() res: Response) {
    const csv = await this.customersService.exportCsv(user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
    res.status(200).send(csv);
  }

  @Get('tags')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  findAllTags(@CurrentUser() user: { id: string }) {
    return this.customersService.findAllTags(user.id);
  }

  @Post('tags')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  createTag(@Body() dto: CreateTagDto, @CurrentUser() user: { id: string }) {
    return this.customersService.createTag(dto, user.id);
  }

  @Delete('tags/:id')
  @Roles(Role.OWNER, Role.MANAGER)
  deactivateTag(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.customersService.deactivateTag(id, user.id);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.customersService.findOne(id, user.id);
  }

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: { id: string }) {
    return this.customersService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.customersService.update(id, dto, user.id);
  }

  @Patch(':id/consent')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  updateConsent(
    @Param('id') id: string,
    @Body() dto: UpdateConsentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.customersService.updateConsent(id, dto, user.id);
  }

  @Post(':id/tags')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  assignTag(
    @Param('id') id: string,
    @Body() dto: AssignTagDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.customersService.assignTag(id, dto.tagId, user.id);
  }

  @Delete(':id/tags/:tagId')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  removeTagAssignment(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.customersService.removeTagAssignment(id, tagId, user.id);
  }
}
