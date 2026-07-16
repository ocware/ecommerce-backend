import { Body, Controller, Get, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { CurrentStaff } from '../decorators/current-staff.decorator';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { StaffAuthGuard } from '../guards/staff-auth.guard';
import { AuthService } from '../services/auth.service';
import { AuthenticatedStaff } from '../types/authenticated-staff';

@ApiTags('admin auth')
@Controller({
  path: 'admin/auth',
  version: '1',
})
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ipAddress: string, @Req() request: Request) {
    return this.authService.login(dto, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  logout(@Body() dto: LogoutDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.authService.logout(dto, staff);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(StaffAuthGuard)
  getMe(@CurrentStaff() staff: AuthenticatedStaff) {
    return {
      staff,
    };
  }
}
