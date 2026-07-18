import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { StaffService, SanitizedStaff } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { ChangeStaffPinDto, UpdateOwnPinDto } from './dto/change-pin.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role, StaffStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowDuringPinChange } from '../auth/allow-during-pin-change.decorator';

interface UserPayload {
  id: string;
  name: string;
  phone: string;
  role: Role;
}

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('public')
  async getPublicStaffList(): Promise<
    Array<{ id: string; name: string; role: Role }>
  > {
    console.log(`[${new Date().toISOString()}] [PRISMA_DIAGNOSTIC] StaffController.getPublicStaffList() entered`);
    const list = await this.staffService.findAll();
    return list
      .filter((s) => s.status === StaffStatus.ACTIVE)
      .map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
      }));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Post()
  async create(
    @Body() createStaffDto: CreateStaffDto,
  ): Promise<SanitizedStaff> {
    return this.staffService.create(createStaffDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @Get()
  async findAll(): Promise<SanitizedStaff[]> {
    return this.staffService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SanitizedStaff> {
    return this.staffService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStaffDto: UpdateStaffDto,
  ): Promise<SanitizedStaff> {
    const targetStaff = await this.staffService.findOne(id);

    if (
      targetStaff.role === Role.OWNER &&
      updateStaffDto.role &&
      updateStaffDto.role !== Role.OWNER
    ) {
      throw new ForbiddenException('Cannot change the role of an Owner');
    }

    if (
      targetStaff.role === Role.OWNER &&
      updateStaffDto.status === StaffStatus.INACTIVE
    ) {
      throw new ForbiddenException('Cannot deactivate an Owner');
    }

    return this.staffService.update(id, updateStaffDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Put(':id/pin')
  async changePin(
    @Param('id') id: string,
    @Body() changePinDto: ChangeStaffPinDto,
  ): Promise<{ message: string }> {
    return this.staffService.changePin(id, changePinDto.newPin);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/pin')
  @AllowDuringPinChange()
  async updateOwnPin(
    @CurrentUser() currentUser: UserPayload,
    @Body() updateOwnPinDto: UpdateOwnPinDto,
  ): Promise<{ message: string }> {
    return this.staffService.updateOwnPin(
      currentUser.id,
      updateOwnPinDto.currentPin,
      updateOwnPinDto.newPin,
      updateOwnPinDto.confirmPin,
    );
  }
}
