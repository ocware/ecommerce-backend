import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller({
  path: 'health',
  version: VERSION_NEUTRAL,
})
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: 'Application health status',
    schema: {
      example: {
        status: 'ok',
        service: 'ecommerce-backend',
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      service: 'ecommerce-backend',
    };
  }
}
