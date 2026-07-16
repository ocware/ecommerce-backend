import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { InventoryService } from '../services/inventory.service';

@ApiTags('store inventory')
@Controller({ path: 'store/inventory', version: '1' })
export class StoreInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':variantId')
  getAvailability(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventoryService.getAvailability(variantId);
  }
}
