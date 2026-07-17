import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  VoidExpenseDto,
} from './dto/expenses.dto';
import { Role, Prisma } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // PERMISSION CHECK HELPER
  // ==========================================

  async checkPermission(
    userId: string,
    capability: 'managerCanManageExpenses' | 'managerCanViewProfitEstimate',
  ): Promise<void> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: userId },
    });
    if (!staff) {
      throw new UnauthorizedException('Staff member not found.');
    }
    if (staff.role === Role.OWNER) {
      return;
    }
    if (staff.role === Role.MANAGER) {
      const settings = await this.prisma.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      if (settings && settings[capability]) {
        return;
      }
    }
    throw new ForbiddenException(
      'You do not have permission to perform this action.',
    );
  }

  // ==========================================
  // EXPENSES CRUD
  // ==========================================

  async createExpense(dto: CreateExpenseDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageExpenses');
    return this.prisma.expense.create({
      data: {
        expenseDate: new Date(dto.expenseDate),
        category: dto.category,
        title: dto.title,
        amount: new Prisma.Decimal(dto.amount),
        paymentMethod: dto.paymentMethod,
        referenceNumber: dto.referenceNumber,
        status: 'ACTIVE',
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async findAllExpenses(userId: string) {
    // Both managers with manage capability and owners can list expenses
    // Wait, let's also allow users with profit estimate capability to view expenses
    try {
      await this.checkPermission(userId, 'managerCanManageExpenses');
    } catch {
      await this.checkPermission(userId, 'managerCanViewProfitEstimate');
    }

    return this.prisma.expense.findMany({
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });
  }

  async findOneExpense(id: string, userId: string) {
    try {
      await this.checkPermission(userId, 'managerCanManageExpenses');
    } catch {
      await this.checkPermission(userId, 'managerCanViewProfitEstimate');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found.');
    }
    return expense;
  }

  async updateExpense(id: string, dto: UpdateExpenseDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageExpenses');
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Expense not found.');
    }
    if (expense.status === 'VOIDED') {
      throw new BadRequestException('Voided expenses cannot be updated.');
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.expenseDate !== undefined)
      data.expenseDate = new Date(dto.expenseDate);
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.referenceNumber !== undefined)
      data.referenceNumber = dto.referenceNumber;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.expense.update({
      where: { id },
      data,
    });
  }

  async deleteExpense(id: string, userId: string) {
    await this.checkPermission(userId, 'managerCanManageExpenses');
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Expense not found.');
    }
    return this.prisma.expense.delete({ where: { id } });
  }

  // ==========================================
  // VOID EXPENSE
  // ==========================================

  async voidExpense(id: string, dto: VoidExpenseDto, userId: string) {
    await this.checkPermission(userId, 'managerCanManageExpenses');
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Expense not found.');
    }
    if (expense.status === 'VOIDED') {
      throw new BadRequestException('Expense is already voided.');
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidReason: dto.voidReason,
      },
    });
  }

  // ==========================================
  // CSV EXPORTS (PREVENTING FORMULA INJECTION)
  // ==========================================

  private sanitizeCsvCell(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (
      str.startsWith('=') ||
      str.startsWith('+') ||
      str.startsWith('-') ||
      str.startsWith('@')
    ) {
      str = "'" + str;
    }
    return str;
  }

  async exportExpensesCsv(userId: string): Promise<string> {
    const list = await this.findAllExpenses(userId);
    const headers = [
      'Expense ID',
      'Expense Date',
      'Category',
      'Title',
      'Amount',
      'Payment Method',
      'Reference Number',
      'Status',
      'Void Reason',
      'Notes',
      'Created By',
      'Created At',
    ];

    const rows = list.map((e) => [
      e.id,
      e.expenseDate.toISOString().slice(0, 10),
      e.category,
      e.title,
      e.amount,
      e.paymentMethod || '',
      e.referenceNumber || '',
      e.status,
      e.voidReason || '',
      e.notes || '',
      e.createdBy.name,
      e.createdAt.toISOString(),
    ]);

    const content = [
      headers.map((h) => `"${this.sanitizeCsvCell(h)}"`).join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${this.sanitizeCsvCell(cell)}"`).join(','),
      ),
    ];
    return content.join('\r\n');
  }
}
