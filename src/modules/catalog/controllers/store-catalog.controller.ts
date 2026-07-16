import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrencyQueryDto } from '../dto/currency-query.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('store catalog')
@Controller({ path: 'store', version: '1' })
export class StoreCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalogService.listStoreProducts(query);
  }

  @Get('products/:slug')
  findProduct(@Param('slug') slug: string, @Query() query: CurrencyQueryDto) {
    return this.catalogService.findStoreProduct(slug, query.currency);
  }

  @Get('categories')
  listCategories() {
    return this.catalogService.listStoreCategories();
  }

  @Get('brands')
  listBrands() {
    return this.catalogService.listStoreBrands();
  }

  @Get('collections')
  listCollections() {
    return this.catalogService.listStoreCollections();
  }
}
