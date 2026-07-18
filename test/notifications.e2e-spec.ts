import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NotificationChannel, NotificationStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { NotificationDeliveryService } from '../src/modules/notifications/services/notification-delivery.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('Notifications API', () => {
  const notificationId = '11111111-1111-4111-8111-111111111111';
  const staffId = '22222222-2222-4222-8222-222222222222';
  let app: INestApplication;
  const notifications = {
    list: jest.fn(),
    markRead: jest.fn(),
    retry: jest.fn(),
    sendEmail: jest.fn(),
    sendSms: jest.fn(),
    sendAdmin: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationDeliveryService)
      .useValue(notifications)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: staffId,
            email: 'admin@example.test',
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('lists unread admin notifications with transformed pagination', async () => {
    notifications.list.mockResolvedValue({
      items: [{ id: notificationId, channel: NotificationChannel.ADMIN }],
      pagination: { page: 2, limit: 10, total: 1, pageCount: 1 },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/notifications?channel=ADMIN&unreadOnly=true&page=2&limit=10')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(notifications.list).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: NotificationChannel.ADMIN,
        unreadOnly: true,
        page: 2,
        limit: 10,
      }),
    );
  });

  it('marks an admin notification as read by the current staff user', async () => {
    notifications.markRead.mockResolvedValue({ id: notificationId, readByStaffUserId: staffId });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .patch(`/api/v1/admin/notifications/${notificationId}/read`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(notifications.markRead).toHaveBeenCalledWith(notificationId, staffId);
  });

  it('retries failed provider deliveries through a protected endpoint', async () => {
    notifications.retry.mockResolvedValue({
      id: notificationId,
      status: NotificationStatus.SENT,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/admin/notifications/${notificationId}/retry`)
      .set('Authorization', 'Bearer token')
      .expect(201);

    expect(notifications.retry).toHaveBeenCalledWith(notificationId);
  });
});
