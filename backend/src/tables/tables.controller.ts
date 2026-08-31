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
  Request,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { ShiftTableDto } from './dto/shift-table.dto';
import { MergeTablesDto } from './dto/merge-tables.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@Body() createTableDto: CreateTableDto) {
    return this.tablesService.create(createTableDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  findAll(@Query('all') all?: string) {
    const includeInactive = all === 'true';
    return this.tablesService.findAll(includeInactive);
  }

  @Post('shift')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  shiftTable(@Body() shiftTableDto: ShiftTableDto, @Request() req: any) {
    const staffId = req.user?.id || req.user?.sub;
    return this.tablesService.shiftTable(shiftTableDto, staffId);
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER, Role.CASHIER)
  mergeTables(@Body() mergeTablesDto: MergeTablesDto, @Request() req: any) {
    const staffId = req.user?.id || req.user?.sub;
    return this.tablesService.mergeTables(mergeTablesDto, staffId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER)
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Get('token/:token')
  async findByToken(@Param('token') token: string) {
    const table = await this.tablesService.findByToken(token);
    return {
      id: table.id,
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      status: table.status,
      isActive: table.isActive,
    };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(@Param('id') id: string, @Body() updateTableDto: UpdateTableDto) {
    return this.tablesService.update(id, updateTableDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }

  @Post(':id/regenerate-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  regenerateToken(@Param('id') id: string) {
    return this.tablesService.regenerateQrToken(id);
  }
}
