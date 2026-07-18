import { Injectable } from '@nestjs/common';

import { InventoryService } from '../../../modules/inventory/services/inventory.service';

@Injectable()
export class ExpiredReservationReleaseJob {
  constructor(private readonly inventory: InventoryService) {}

  handle(data: { limit?: number }) {
    return this.inventory.expireReservations(data.limit ?? 100);
  }
}
