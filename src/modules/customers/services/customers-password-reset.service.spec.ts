import { CustomerSessionStatus, CustomerStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SmsProvider } from '../../../shared/communications/sms-provider';
import { CustomerPasswordService } from './customer-password.service';
import { CustomerEventPublisher } from './customer-event-publisher.service';
import { CustomerTokenService } from './customer-token.service';
import { CustomersService } from './customers.service';

describe('CustomersService password reset', () => {
  const customer = {
    id: 'customer-id',
    email: 'customer@example.test',
    passwordHash: 'old-hash',
    status: CustomerStatus.ACTIVE,
  };
  const prisma = {
    customer: {
      findUnique: jest.fn(),
      update: jest.fn(() => Promise.resolve(customer)),
    },
    customerPasswordResetToken: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      create: jest.fn(() =>
        Promise.resolve({
          id: 'reset-id',
          customerId: customer.id,
        }),
      ),
      findUnique: jest.fn(),
      update: jest.fn(() => Promise.resolve({ id: 'reset-id' })),
    },
    customerSession: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const password = {
    hashPassword: jest.fn(() => Promise.resolve('new-hash')),
  };
  const tokens = {
    hashOpaqueToken: jest.fn((value: string) => `hash:${value}`),
  };
  const events = { publish: jest.fn() };
  const service = new CustomersService(
    prisma as unknown as PrismaService,
    password as unknown as CustomerPasswordService,
    tokens as unknown as CustomerTokenService,
    events as unknown as CustomerEventPublisher,
    { get: (_key: string, fallback: unknown) => fallback } as never,
    { send: jest.fn() } as unknown as SmsProvider,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns an enumeration-safe response while publishing a one-time token for an eligible customer', async () => {
    prisma.customer.findUnique.mockResolvedValue(customer);

    await expect(
      service.requestPasswordReset({ email: 'CUSTOMER@example.test' }),
    ).resolves.toEqual({ accepted: true });
    expect(prisma.customerPasswordResetToken.updateMany).toHaveBeenCalledWith({
      where: { customerId: customer.id, usedAt: null },
      data: { usedAt: expect.any(Date) as Date },
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CustomerPasswordResetRequested',
        customerId: customer.id,
        email: customer.email,
        resetToken: expect.any(String) as string,
      }),
    );
  });

  it('changes the password, consumes the token, and revokes active sessions atomically', async () => {
    prisma.customerPasswordResetToken.findUnique.mockResolvedValue({
      id: 'reset-id',
      customerId: customer.id,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.confirmPasswordReset({
        token: 'valid-reset-token-that-is-long-enough',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual({ reset: true });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: customer.id },
      data: { passwordHash: 'new-hash' },
    });
    expect(prisma.customerSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId: customer.id,
          status: CustomerSessionStatus.ACTIVE,
        },
        data: {
          status: CustomerSessionStatus.REVOKED,
          revokedAt: expect.any(Date) as Date,
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
