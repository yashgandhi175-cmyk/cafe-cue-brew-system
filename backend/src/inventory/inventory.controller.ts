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
import { InventoryService } from './inventory.service';
import {
  CreateIngredientDto,
  UpdateIngredientDto,
  CreateRecipeDto,
  UpdateRecipeDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  CreatePurchaseDto,
  UpdatePurchaseDto,
  CreateWastageDto,
  StockAdjustmentDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Response } from 'express';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==========================================
  // INGREDIENTS
  // ==========================================
  @Post('ingredients')
  createIngredient(
    @Body() dto: CreateIngredientDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.createIngredient(dto, user.id);
  }

  @Get('ingredients')
  findAllIngredients(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.findAllIngredients(user.id);
  }

  @Get('ingredients/:id')
  findOneIngredient(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.findOneIngredient(id, user.id);
  }

  @Patch('ingredients/:id')
  updateIngredient(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.updateIngredient(id, dto, user.id);
  }

  @Delete('ingredients/:id')
  deleteIngredient(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.deleteIngredient(id, user.id);
  }

  // ==========================================
  // RECIPES
  // ==========================================
  @Post('recipes')
  createRecipe(
    @Body() dto: CreateRecipeDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.createRecipe(dto, user.id);
  }

  @Get('recipes')
  findAllRecipes(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.findAllRecipes(user.id);
  }

  @Get('recipes/:id')
  findOneRecipe(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.findOneRecipe(id, user.id);
  }

  @Patch('recipes/:id')
  updateRecipe(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.updateRecipe(id, dto, user.id);
  }

  @Delete('recipes/:id')
  deleteRecipe(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.deleteRecipe(id, user.id);
  }

  // ==========================================
  // SUPPLIERS
  // ==========================================
  @Post('suppliers')
  createSupplier(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.createSupplier(dto, user.id);
  }

  @Get('suppliers')
  findAllSuppliers(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.findAllSuppliers(user.id);
  }

  @Get('suppliers/:id')
  findOneSupplier(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.findOneSupplier(id, user.id);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.updateSupplier(id, dto, user.id);
  }

  @Delete('suppliers/:id')
  deleteSupplier(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.deleteSupplier(id, user.id);
  }

  // ==========================================
  // PURCHASES
  // ==========================================
  @Post('purchases')
  createPurchase(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.createPurchase(dto, user.id);
  }

  @Get('purchases')
  findAllPurchases(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.findAllPurchases(user.id);
  }

  @Get('purchases/:id')
  findOnePurchase(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.findOnePurchase(id, user.id);
  }

  @Patch('purchases/:id')
  updatePurchase(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.updatePurchase(id, dto, user.id);
  }

  @Delete('purchases/:id')
  deletePurchase(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.deletePurchase(id, user.id);
  }

  @Post('purchases/:id/finalize')
  finalizePurchase(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.finalizePurchase(id, user.id);
  }

  @Post('purchases/:id/reverse')
  reversePurchase(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.reversePurchase(id, user.id);
  }

  // ==========================================
  // WASTAGE
  // ==========================================
  @Post('wastage')
  createWastage(
    @Body() dto: CreateWastageDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.createWastage(dto, user.id);
  }

  @Get('wastage')
  findAllWastage(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.findAllWastage(user.id);
  }

  @Get('wastage/:id')
  findOneWastage(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.findOneWastage(id, user.id);
  }

  @Delete('wastage/:id')
  deleteWastage(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.deleteWastage(id, user.id);
  }

  // ==========================================
  // ADJUSTMENTS
  // ==========================================
  @Post('adjust')
  adjustStock(
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.adjustStock(dto, user.id);
  }

  // ==========================================
  // LEDGER
  // ==========================================
  @Get('ledger')
  getLedger(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.getLedger(user.id);
  }

  // ==========================================
  // ANALYTICS & COSTING
  // ==========================================
  @Get('value-estimate')
  getValueEstimate(@CurrentUser() user: { id: string; role: string }) {
    return this.inventoryService.getValueEstimate(user.id);
  }

  @Get('food-cost')
  getFoodCost(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.getFoodCost(startDate, endDate, user.id);
  }

  @Get('wastage-analytics')
  getWastageAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.getWastageAnalytics(
      startDate,
      endDate,
      user.id,
    );
  }

  @Get('operating-contribution')
  getOperatingContribution(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.inventoryService.getOperatingContribution(
      startDate,
      endDate,
      user.id,
    );
  }

  // ==========================================
  // EXPORTS
  // ==========================================
  @Get('export/ledger')
  async exportLedger(
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const csv = await this.inventoryService.exportLedgerCsv(user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
    res.status(200).send(csv);
  }

  @Get('export/stock-balance')
  async exportStockBalance(
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const csv = await this.inventoryService.exportStockBalanceCsv(user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=stock-balance.csv',
    );
    res.status(200).send(csv);
  }

  @Get('export/wastage')
  async exportWastage(
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const csv = await this.inventoryService.exportWastageCsv(user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=wastage.csv');
    res.status(200).send(csv);
  }
}
