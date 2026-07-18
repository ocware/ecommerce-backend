import { Injectable } from '@nestjs/common';

import { ShippingService } from '../../../modules/shipping/services/shipping.service';

@Injectable()
export class ShipmentTrackingUpdateJob {
  constructor(private readonly shipping: ShippingService) {}

  handle(data: { shipmentId?: string; limit?: number }) {
    return data.shipmentId
      ? this.shipping.trackShipment(data.shipmentId)
      : this.shipping.refreshShipmentTracking(data.limit ?? 100);
  }
}
