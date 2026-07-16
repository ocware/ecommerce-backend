import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CustomerStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { CustomersService } from '../src/modules/customers/services/customers.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    accessToken?: string;
    customer?: {
      email: string;
    };
    name?: string;
    note?: string;
  };
};

describe('Customers API', () => {
  let app: INestApplication;
  const customersService = {
    register: jest.fn(),
    getProfile: jest.fn(),
    createGuestCheckoutProfile: jest.fn(),
    addNote: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CustomersService)
      .useValue(customersService)
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
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              staff?: {
                id: string;
                email: string;
                name: string;
                role: StaffRole;
                sessionId: string;
              };
            };
          };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: 'admin-id',
            email: 'admin@example.com',
            name: 'Admin',
            role: StaffRole.ADMIN,
            sessionId: 'staff-session-id',
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

  it('registers storefront customers through the customers module', async () => {
    customersService.register.mockResolvedValue({
      customer: {
        id: 'customer-id',
        email: 'customer@example.com',
        phone: null,
        name: 'Customer',
        status: CustomerStatus.ACTIVE,
        marketingConsent: true,
      },
      accessToken: 'customer-access-token',
      refreshToken: 'customer-refresh-token',
      expiresIn: 900,
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/customers/register')
      .send({
        email: 'customer@example.com',
        name: 'Customer',
        password: 'correct-password',
        marketingConsent: true,
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.accessToken).toBe('customer-access-token');
        expect(body.data.customer?.email).toBe('customer@example.com');
      });
  });

  it('returns authenticated customer profile', async () => {
    customersService.getProfile.mockResolvedValue({
      id: 'customer-id',
      email: 'customer@example.com',
      phone: null,
      name: 'Customer',
      status: CustomerStatus.ACTIVE,
      marketingConsent: false,
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/store/customers/me')
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.name).toBe('Customer');
      });
  });

  it('creates guest checkout profiles without customer auth', async () => {
    customersService.createGuestCheckoutProfile.mockResolvedValue({
      id: 'guest-id',
      email: 'guest@example.com',
      name: 'Guest Customer',
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/customers/guest-checkout-profile')
      .send({
        email: 'guest@example.com',
        name: 'Guest Customer',
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.name).toBe('Guest Customer');
      });
  });

  it('allows staff to add customer notes through admin APIs', async () => {
    customersService.addNote.mockResolvedValue({
      id: 'note-id',
      customerId: 'customer-id',
      staffUserId: 'admin-id',
      note: 'Prefers phone support',
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/customers/customer-id/notes')
      .set('Authorization', 'Bearer token')
      .send({
        note: 'Prefers phone support',
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.note).toBe('Prefers phone support');
      });
  });
});
