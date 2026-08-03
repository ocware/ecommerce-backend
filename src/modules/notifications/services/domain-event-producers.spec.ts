import { CustomerStatus, StaffRole, StaffStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../auth/services/audit-log.service';
import { AuthEventPublisher } from '../../auth/services/auth-event-publisher.service';
import { AuthService } from '../../auth/services/auth.service';
import { PasswordService } from '../../auth/services/password.service';
import { TokenService } from '../../auth/services/token.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { CustomerEventPublisher } from '../../customers/services/customer-event-publisher.service';
import { CustomerPasswordService } from '../../customers/services/customer-password.service';
import { CustomerTokenService } from '../../customers/services/customer-token.service';
import { CustomersService } from '../../customers/services/customers.service';
import { InventoryEventPublisher } from '../../inventory/services/inventory-event-publisher.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { SettingsService } from '../../settings/services/settings.service';

describe('notification domain event producers', () => {
  it('publishes PasswordResetRequested only after a reset token is stored', async () => {
    const staff = {
      id: 'staff-id',
      email: 'staff@example.test',
      name: 'Staff',
      role: StaffRole.ADMIN,
      status: StaffStatus.ACTIVE,
    };
    const prisma = {
      staffUser: { findUnique: jest.fn(() => staff) },
      passwordResetToken: { create: jest.fn(() => ({ id: 'reset-request-id' })) },
    };
    const tokens = {
      createPasswordResetToken: jest.fn(() => ({
        token: 'raw-reset-token',
        tokenHash: 'token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      })),
    };
    const audit = { record: jest.fn() };
    const events = { publish: jest.fn() };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as PasswordService,
      tokens as unknown as TokenService,
      audit as unknown as AuditLogService,
      events as unknown as AuthEventPublisher,
    );

    await service.requestPasswordReset({ email: staff.email });

    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'PasswordResetRequested',
        passwordResetTokenId: 'reset-request-id',
        staffUserId: staff.id,
        resetToken: 'raw-reset-token',
      }),
    );
  });

  it('publishes CustomerRegistered with transactional contact details', async () => {
    const customer = {
      id: 'customer-id',
      email: 'customer@example.test',
      phone: '+989121234567',
      name: 'Customer',
      status: CustomerStatus.ACTIVE,
      marketingConsent: false,
    };
    const prisma = {
      customer: {
        findUnique: jest.fn(() => null),
        findFirst: jest.fn(() => null),
        create: jest.fn(() => customer),
      },
      customerSession: { create: jest.fn(() => ({ id: 'session-id' })) },
    };
    const password = { hashPassword: jest.fn(() => Promise.resolve('password-hash')) };
    const tokens = {
      createRefreshToken: jest.fn(() => ({
        token: 'refresh-token',
        tokenHash: 'refresh-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      })),
      createAccessToken: jest.fn(() => 'access-token'),
    };
    const events = { publish: jest.fn() };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      password as unknown as CustomerPasswordService,
      tokens as unknown as CustomerTokenService,
      events as unknown as CustomerEventPublisher,
      { get: jest.fn() } as never,
      { send: jest.fn() } as never,
    );

    await service.register({
      email: customer.email,
      phone: customer.phone,
      name: customer.name,
      password: 'password123',
    });

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CustomerRegistered',
        customerId: customer.id,
        email: customer.email,
        phone: customer.phone,
      }),
    );
  });

  it('publishes InventoryLow when initialized stock is at its threshold', async () => {
    const item = {
      id: 'inventory-id',
      variantId: 'variant-id',
      currentStock: 2,
      reservedStock: 0,
      lowStockThreshold: 2,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transaction = {
      inventoryItem: { create: jest.fn(() => item) },
      inventoryMovement: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const catalog = {
      getVariantReference: jest.fn(() => ({ id: item.variantId, name: 'Variant', sku: 'SKU-1' })),
    };
    const events = { publish: jest.fn() };
    const settings = { get: jest.fn(() => Promise.resolve({ lowStockThreshold: 2 })) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      events as unknown as InventoryEventPublisher,
      settings as unknown as SettingsService,
    );

    await service.initializeInventory({
      variantId: item.variantId,
      currentStock: item.currentStock,
    });

    expect(events.publish).toHaveBeenCalledWith({
      name: 'InventoryLow',
      occurredAt: expect.any(Date) as Date,
      eventId: 'inventory-id:0',
      inventoryItemId: item.id,
      variantId: item.variantId,
      availableStock: 2,
      lowStockThreshold: 2,
    });
  });
});
