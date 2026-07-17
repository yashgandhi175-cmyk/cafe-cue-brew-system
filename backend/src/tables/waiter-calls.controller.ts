import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { TablesService } from './tables.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser as CurrentUserDecorator } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('waiter-calls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaiterCallsController {
  constructor(private tablesService: TablesService) {}

  @Get('active')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER)
  async getActiveWaiterCalls() {
    return this.tablesService.getActiveWaiterCalls();
  }

  @Patch(':id/acknowledge')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER)
  async acknowledge(
    @Param('id') id: string,
    @CurrentUserDecorator() staff: { id: string },
  ) {
    return this.tablesService.acknowledgeWaiterCall(id, staff.id);
  }

  @Patch(':id/resolve')
  @Roles(Role.OWNER, Role.MANAGER, Role.WAITER)
  async resolve(
    @Param('id') id: string,
    @CurrentUserDecorator() staff: { id: string },
  ) {
    return this.tablesService.resolveWaiterCall(id, staff.id);
  }
}
