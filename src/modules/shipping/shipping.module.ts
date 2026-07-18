import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminShipmentsController } from './controllers/admin-shipments.controller';
import { AdminShippingConfigurationController } from './controllers/admin-shipping-configuration.controller';
import { StoreShippingController } from './controllers/store-shipping.controller';
import { ShipmentEventPublisher } from './services/shipment-event-publisher.service';
import { ShippingService } from './services/shipping.service';
import { ShippingRatesModule } from './shipping-rates.module';

@Module({
  imports: [AuthModule, CustomersModule, OrdersModule, ShippingRatesModule],
  controllers: [
    AdminShippingConfigurationController,
    AdminShipmentsController,
    StoreShippingController,
  ],
  providers: [ShippingService, ShipmentEventPublisher],
  exports: [ShippingService, ShipmentEventPublisher, ShippingRatesModule],
})
export class ShippingModule {}
