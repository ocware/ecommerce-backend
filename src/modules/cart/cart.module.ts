import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { CustomersModule } from '../customers/customers.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';
import { StoreCustomerCartController } from './controllers/store-customer-cart.controller';
import { StoreGuestCartsController } from './controllers/store-guest-carts.controller';
import { CartService } from './services/cart.service';
import { CartTokenService } from './services/cart-token.service';

@Module({
  imports: [CatalogModule, InventoryModule, CustomersModule, DiscountsModule, SettingsModule],
  controllers: [StoreGuestCartsController, StoreCustomerCartController],
  providers: [CartService, CartTokenService],
  exports: [CartService],
})
export class CartModule {}
