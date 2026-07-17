import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  VoidExpenseDto,
} from './dto/expenses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Response } from 'express';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.expensesService.createExpense(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string; role: string }) {
    return this.expensesService.findAllExpenses(user.id);
  }

  @Get('export')
  async export(
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const csv = await this.expensesService.exportExpensesCsv(user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.status(200).send(csv);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.expensesService.findOneExpense(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.expensesService.updateExpense(id, dto, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.expensesService.deleteExpense(id, user.id);
  }

  @Post(':id/void')
  void(
    @Param('id') id: string,
    @Body() dto: VoidExpenseDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.expensesService.voidExpense(id, dto, user.id);
  }
}
