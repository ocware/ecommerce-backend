import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the service health status', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'ecommerce-backend',
    });
  });
});
