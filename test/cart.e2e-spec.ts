import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { CartService } from '../src/modules/cart/services/cart.service';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    guestToken?: string;
    items?: Array<{ quantity: number }>;
    totals?: { grandTotal: string };
  };
};

describe('Cart API', () => {
  const cartId = '11111111-1111-4111-8111-111111111111';
  const guestCartId = '22222222-2222-4222-8222-222222222222';
  const variantId = '33333333-3333-4333-8333-333333333333';
  let app: INestApplication;
  const cartService = {
    createGuestCart: jest.fn(),
    addGuestItem: jest.fn(),
    applyGuestDiscount: jest.fn(),
    createCustomerCart: jest.fn(),
    mergeGuestCart: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CartService)
      .useValue(cartService)
      .overrideGuard(CustomerAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              customer?: {
                id: string;
                email: string;
                phone: null;
                name: string;
                sessionId: string;
              };
            };
          };
        }) => {
          context.switchToHttp().getRequest().customer = {
            id: 'customer-id',
            email: 'customer@example.com',
            phone: null,
            name: 'Customer',
            sessionId: 'customer-session-id',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    const configService = app.get(ConfigService);
    app.setGlobalPrefix(configService.getOrThrow<string>('app.apiPrefix'));
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.getOrThrow<string>('app.apiVersion'),
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates guest carts and returns their opaque access token', async () => {
    cartService.createGuestCart.mockResolvedValue({
      id: guestCartId,
      guestToken: 'guest-token-with-more-than-thirty-two-characters',
      items: [],
      totals: { grandTotal: '0.00' },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/carts')
      .send({ currency: 'USD' })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.guestToken).toBeDefined();
        expect(body.data.totals?.grandTotal).toBe('0.00');
      });
  });

  it('adds items to guest carts using the cart token', async () => {
    cartService.addGuestItem.mockResolvedValue({
      id: guestCartId,
      items: [{ quantity: 2 }],
      totals: { grandTotal: '39.98' },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/store/carts/${guestCartId}/items`)
      .set('x-cart-token', 'guest-token')
      .send({ variantId, quantity: 2 })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.items?.[0].quantity).toBe(2);
      });
  });

  it('applies coupon codes to guest carts', async () => {
    cartService.applyGuestDiscount.mockResolvedValue({
      id: guestCartId,
      discountCode: 'WELCOME10',
      items: [{ quantity: 2 }],
      totals: { discountTotal: '4.00', grandTotal: '35.98' },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .put(`/api/v1/store/carts/${guestCartId}/discount`)
      .set('x-cart-token', 'guest-token')
      .send({ code: 'WELCOME10' })
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.totals?.grandTotal).toBe('35.98');
      });

    expect(cartService.applyGuestDiscount).toHaveBeenCalledWith(
      guestCartId,
      { code: 'WELCOME10' },
      'guest-token',
    );
  });

  it('creates authenticated customer carts', async () => {
    cartService.createCustomerCart.mockResolvedValue({
      id: cartId,
      customerId: 'customer-id',
      items: [],
      totals: { grandTotal: '0.00' },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/cart')
      .set('Authorization', 'Bearer token')
      .send({ currency: 'USD' })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe(cartId);
      });
  });

  it('merges a guest cart into the authenticated customer cart', async () => {
    cartService.mergeGuestCart.mockResolvedValue({
      id: cartId,
      items: [{ quantity: 3 }],
      totals: { grandTotal: '59.97' },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/store/cart/${cartId}/merge`)
      .set('Authorization', 'Bearer token')
      .send({
        guestCartId,
        guestToken: 'guest-token-with-more-than-thirty-two-characters',
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.items?.[0].quantity).toBe(3);
      });
  });
});
