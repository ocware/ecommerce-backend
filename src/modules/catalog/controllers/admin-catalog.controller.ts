import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { CreateAttributeValueDto } from '../dto/create-attribute-value.dto';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CreateConfiguredProductDto } from '../dto/create-configured-product.dto';
import { CreateProductAttributeDto } from '../dto/create-product-attribute.dto';
import { CreateProductCollectionDto } from '../dto/create-product-collection.dto';
import { CreateProductImageDto } from '../dto/create-product-image.dto';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { SetResourceIdsDto } from '../dto/set-resource-ids.dto';
import { SetVariantAttributeValuesDto } from '../dto/set-variant-attribute-values.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { UpdateProductCollectionDto } from '../dto/update-product-collection.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { UpsertProductPriceDto } from '../dto/upsert-product-price.dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('admin catalog')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageProducts)
@Controller({ path: 'admin', version: '1' })
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Post('products/configured')
  createConfiguredProduct(@Body() dto: CreateConfiguredProductDto) {
    return this.catalogService.createConfiguredProduct(dto);
  }

  @Get('products')
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalogService.listAdminProducts(query);
  }

  @Get('products/:id')
  findProduct(@Param('id') id: string) {
    return this.catalogService.findAdminProduct(id);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.catalogService.archiveProduct(id);
  }

  @Post('products/:id/variants')
  createVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.catalogService.createVariant(id, dto);
  }

  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.catalogService.updateVariant(id, dto);
  }

  @Put('variants/:id/attribute-values')
  setVariantAttributeValues(@Param('id') id: string, @Body() dto: SetVariantAttributeValuesDto) {
    return this.catalogService.setVariantAttributeValues(id, dto);
  }

  @Put('variants/:id/price')
  upsertPrice(@Param('id') id: string, @Body() dto: UpsertProductPriceDto) {
    return this.catalogService.upsertPrice(id, dto);
  }

  @Post('products/:id/attributes')
  createAttribute(@Param('id') id: string, @Body() dto: CreateProductAttributeDto) {
    return this.catalogService.createAttribute(id, dto);
  }

  @Post('attributes/:id/values')
  createAttributeValue(@Param('id') id: string, @Body() dto: CreateAttributeValueDto) {
    return this.catalogService.createAttributeValue(id, dto);
  }

  @Post('products/:id/images')
  createImage(@Param('id') id: string, @Body() dto: CreateProductImageDto) {
    return this.catalogService.createImage(id, dto);
  }

  @Delete('products/:productId/images/:imageId')
  deleteImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.catalogService.deleteProductImage(productId, imageId);
  }

  @Put('products/:id/categories')
  setProductCategories(@Param('id') id: string, @Body() dto: SetResourceIdsDto) {
    return this.catalogService.setProductCategories(id, dto);
  }

  @Put('products/:id/related-products')
  setRelatedProducts(@Param('id') id: string, @Body() dto: SetResourceIdsDto) {
    return this.catalogService.setRelatedProducts(id, dto);
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Get('categories')
  listCategories() {
    return this.catalogService.listAdminCategories();
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Post('brands')
  createBrand(@Body() dto: CreateBrandDto) {
    return this.catalogService.createBrand(dto);
  }

  @Get('brands')
  listBrands() {
    return this.catalogService.listAdminBrands();
  }

  @Patch('brands/:id')
  updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.catalogService.updateBrand(id, dto);
  }

  @Post('collections')
  createCollection(@Body() dto: CreateProductCollectionDto) {
    return this.catalogService.createCollection(dto);
  }

  @Get('collections')
  listCollections() {
    return this.catalogService.listAdminCollections();
  }

  @Patch('collections/:id')
  updateCollection(@Param('id') id: string, @Body() dto: UpdateProductCollectionDto) {
    return this.catalogService.updateCollection(id, dto);
  }

  @Put('collections/:id/products')
  setCollectionProducts(@Param('id') id: string, @Body() dto: SetResourceIdsDto) {
    return this.catalogService.setCollectionProducts(id, dto);
  }
}
