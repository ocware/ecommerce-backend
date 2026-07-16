import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminCustomersController } from './controllers/admin-customers.controller';
import { StoreCustomersController } from './controllers/store-customers.controller';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { CustomerPasswordService } from './services/customer-password.service';
import { CustomerTokenService } from './services/customer-token.service';
import { CustomersService } from './services/customers.service';

@Module({
  imports: [AuthModule],
  controllers: [StoreCustomersController, AdminCustomersController],
  providers: [CustomersService, CustomerPasswordService, CustomerTokenService, CustomerAuthGuard],
  exports: [CustomersService, CustomerTokenService, CustomerAuthGuard],
})
export class CustomersModule {}
