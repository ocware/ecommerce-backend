import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { UpdateHomeContentDto } from '../dto/update-home-content.dto';
import { UpsertContentPageDto } from '../dto/upsert-content-page.dto';
import { UpsertHomeSlideDto } from '../dto/upsert-home-slide.dto';
import { CmsService } from '../services/cms.service';

@ApiTags('admin content')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageSettings)
@Controller({ path: 'admin/content', version: '1' })
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('home')
  home() {
    return this.cms.getAdminHome();
  }

  @Patch('home')
  updateHome(
    @Body() dto: UpdateHomeContentDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.cms.updateHome(dto, staff.id);
  }

  @Post('home/slides')
  createSlide(
    @Body() dto: UpsertHomeSlideDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.cms.createSlide(dto, staff.id);
  }

  @Put('home/slides/:id')
  updateSlide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertHomeSlideDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.cms.updateSlide(id, dto, staff.id);
  }

  @Delete('home/slides/:id')
  deleteSlide(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.deleteSlide(id);
  }

  @Get('pages')
  pages() {
    return this.cms.listAdminPages();
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.cms.getAdminPage(slug);
  }

  @Put('pages/:slug')
  upsertPage(
    @Param('slug') slug: string,
    @Body() dto: UpsertContentPageDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.cms.upsertPage(slug, dto, staff.id);
  }
}
