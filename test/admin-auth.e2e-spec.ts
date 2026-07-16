import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthService } from '../src/modules/auth/services/auth.service';
import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { StaffRole } from '../src/modules/auth/types/staff-role';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    accessToken?: string;
    staff?: {
      email: string;
    };
  };
  errors: Array<{
    code: string;
  }>;
};

describe('Admin auth API', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    listStaffUsers: jest.fn(),
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
      .overrideProvider(AuthService)
      .useValue(authService)
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
            id: 'support-id',
            email: 'support@example.com',
            name: 'Support',
            role: StaffRole.SUPPORT,
            sessionId: 'session-id',
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

  it('logs staff users in through the admin auth route', async () => {
    authService.login.mockResolvedValue({
      staff: {
        id: 'owner-id',
        email: 'owner@example.com',
        name: 'Owner',
        role: StaffRole.OWNER,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/auth/login')
      .send({
        email: 'owner@example.com',
        password: 'correct-password',
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.accessToken).toBe('access-token');
        expect(body.data.staff?.email).toBe('owner@example.com');
      });
  });

  it('blocks staff-management APIs without the required permission', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', 'Bearer token')
      .expect(403)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.errors[0].code).toBe('INSUFFICIENT_PERMISSION');
      });
  });
});
