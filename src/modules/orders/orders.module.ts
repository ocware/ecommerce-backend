import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CustomersModule } from '../customers/customers.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { StoreCheckoutController } from './controllers/store-checkout.controller';
import { StoreOrdersController } from './controllers/store-orders.controller';
import { OrderEventPublisher } from './services/order-event-publisher.service';
import { OrdersService } from './services/orders.service';

@Module({
  imports: [AuthModule, CartModule, CustomersModule, DiscountsModule, InventoryModule],
  controllers: [StoreCheckoutController, StoreOrdersController, AdminOrdersController],
  providers: [OrdersService, OrderEventPublisher],
  exports: [OrdersService, OrderEventPublisher],
})
export class OrdersModule {}
