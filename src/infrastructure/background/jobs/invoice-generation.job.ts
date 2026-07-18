import { Injectable } from '@nestjs/common';

import { OrdersService } from '../../../modules/orders/services/orders.service';

@Injectable()
export class InvoiceGenerationJob {
  constructor(private readonly orders: OrdersService) {}

  async handle(data: { orderId: string }) {
    const order = await this.orders.getAdminOrder(data.orderId);
    return { generatedAt: new Date().toISOString(), order };
  }
}
