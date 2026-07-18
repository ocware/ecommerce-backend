import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { ListMediaQueryDto } from '../dto/list-media-query.dto';
import { UpdateBannerDto } from '../dto/update-banner.dto';
import { UploadBannerDto } from '../dto/upload-banner.dto';
import { UploadCategoryImageDto } from '../dto/upload-category-image.dto';
import { UploadProductImageDto } from '../dto/upload-product-image.dto';
import { UploadShopLogoDto } from '../dto/upload-shop-logo.dto';
import { MediaService } from '../services/media.service';

const uploadOptions = { limits: { files: 1, fileSize: 10 * 1024 * 1024 } };

@ApiTags('admin media')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/media', version: '1' })
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @RequirePermissions(Permission.ManageProducts)
  list(@Query() query: ListMediaQueryDto) {
    return this.mediaService.listAdmin(query);
  }

  @Post('products/:productId/images')
  @RequirePermissions(Permission.ManageProducts)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadProductImage(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UploadProductImageDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.mediaService.uploadProductImage(productId, dto, file, staff.id);
  }

  @Put('categories/:categoryId/image')
  @RequirePermissions(Permission.ManageProducts)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadCategoryImage(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UploadCategoryImageDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.mediaService.uploadCategoryImage(categoryId, dto, file, staff.id);
  }

  @Put('shop-logo')
  @RequirePermissions(Permission.ManageSettings)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadShopLogo(
    @Body() dto: UploadShopLogoDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.mediaService.uploadShopLogo(dto, file, staff.id);
  }

  @Post('banners')
  @RequirePermissions(Permission.ManageSettings)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadBanner(
    @Body() dto: UploadBannerDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.mediaService.uploadBanner(dto, file, staff.id);
  }

  @Patch('banners/:id')
  @RequirePermissions(Permission.ManageSettings)
  updateBanner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.mediaService.updateBanner(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.ManageProducts)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.deleteAsset(id);
  }
}
