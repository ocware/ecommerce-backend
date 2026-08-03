import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerSessionStatus, CustomerStatus, Prisma } from '@prisma/client';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../../../shared/communications/sms-provider';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AddCustomerNoteDto } from '../dto/add-customer-note.dto';
import { ConfirmCustomerPasswordResetDto } from '../dto/confirm-customer-password-reset.dto';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { CompleteCustomerOtpRegistrationDto } from '../dto/complete-customer-otp-registration.dto';
import { CreateGuestCheckoutProfileDto } from '../dto/create-guest-checkout-profile.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { ListCustomersQueryDto } from '../dto/list-customers-query.dto';
import { LogoutCustomerDto } from '../dto/logout-customer.dto';
import { RefreshCustomerTokenDto } from '../dto/refresh-customer-token.dto';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { RequestCustomerOtpDto } from '../dto/request-customer-otp.dto';
import { RequestCustomerPasswordResetDto } from '../dto/request-customer-password-reset.dto';
import { UpdateCustomerProfileDto } from '../dto/update-customer-profile.dto';
import { UpdateCustomerAddressDto } from '../dto/update-customer-address.dto';
import { UpdateCustomerStatusDto } from '../dto/update-customer-status.dto';
import { VerifyCustomerOtpDto } from '../dto/verify-customer-otp.dto';
import { AuthenticatedCustomer } from '../types/authenticated-customer';
import { CustomerPasswordService } from './customer-password.service';
import { CustomerEventPublisher } from './customer-event-publisher.service';
import { CustomerTokenService } from './customer-token.service';

type CustomerAuthResponse = {
  customer: SerializedCustomer;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type SerializedCustomer = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  status: CustomerStatus;
  marketingConsent: boolean;
};

@Injectable()
export class CustomersService {
  private readonly accessTokenExpiresInSeconds = 15 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: CustomerPasswordService,
    private readonly tokenService: CustomerTokenService,
    private readonly eventPublisher: CustomerEventPublisher,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async register(dto: RegisterCustomerDto): Promise<CustomerAuthResponse> {
    const email = dto.email.toLowerCase();
    const phone = dto.phone ? normalizeIranianMobile(dto.phone) : undefined;
    const existing = await this.prisma.customer.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CUSTOMER_EXISTS',
        message: 'A customer with this email already exists.',
      });
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const customer = await this.prisma.customer.create({
      data: {
        email,
        name: dto.name,
        phone,
        passwordHash,
        marketingConsent: dto.marketingConsent ?? false,
      },
    });

    this.eventPublisher.publish({
      name: 'CustomerRegistered',
      occurredAt: new Date(),
      customerId: customer.id,
      email,
      phone: customer.phone,
      customerName: customer.name,
    });

    return this.createSessionResponse(customer);
  }

  async validateCustomerReferences(ids: string[]): Promise<void> {
    const count = await this.prisma.customer.count({ where: { id: { in: ids } } });
    if (count !== ids.length) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'One or more customers were not found.',
      });
    }
  }

  async login(dto: LoginCustomerDto): Promise<CustomerAuthResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
    });

    if (
      !customer ||
      !customer.passwordHash ||
      !(await this.passwordService.verifyPassword(dto.password, customer.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CUSTOMER_CREDENTIALS',
        message: 'The email or password is incorrect.',
      });
    }

    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'CUSTOMER_ACCOUNT_NOT_ACTIVE',
        message: 'This customer account is not active.',
      });
    }

    await this.prisma.customer.update({
      where: {
        id: customer.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return this.createSessionResponse(customer);
  }

  async requestPasswordReset(dto: RequestCustomerPasswordResetDto): Promise<{ accepted: true }> {
    const email = dto.email.toLowerCase();
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer || customer.status !== CustomerStatus.ACTIVE || !customer.passwordHash) {
      return { accepted: true };
    }

    const now = new Date();
    await this.prisma.customerPasswordResetToken.updateMany({
      where: { customerId: customer.id, usedAt: null },
      data: { usedAt: now },
    });
    const resetToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const stored = await this.prisma.customerPasswordResetToken.create({
      data: {
        customerId: customer.id,
        tokenHash: this.tokenService.hashOpaqueToken(resetToken),
        expiresAt,
      },
    });
    this.eventPublisher.publish({
      name: 'CustomerPasswordResetRequested',
      occurredAt: now,
      customerId: customer.id,
      passwordResetTokenId: stored.id,
      email,
      resetToken,
      expiresAt,
    });
    return { accepted: true };
  }

  async confirmPasswordReset(dto: ConfirmCustomerPasswordResetDto): Promise<{ reset: true }> {
    const resetToken = await this.prisma.customerPasswordResetToken.findUnique({
      where: { tokenHash: this.tokenService.hashOpaqueToken(dto.token) },
    });
    const now = new Date();
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
      throw new UnauthorizedException({
        code: 'INVALID_CUSTOMER_PASSWORD_RESET_TOKEN',
        message: 'The password reset token is invalid or expired.',
      });
    }

    const passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: resetToken.customerId },
        data: { passwordHash },
      }),
      this.prisma.customerPasswordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      this.prisma.customerSession.updateMany({
        where: {
          customerId: resetToken.customerId,
          status: CustomerSessionStatus.ACTIVE,
        },
        data: {
          status: CustomerSessionStatus.REVOKED,
          revokedAt: now,
        },
      }),
    ]);
    return { reset: true };
  }

  async requestOtp(dto: RequestCustomerOtpDto): Promise<{
    expiresIn: number;
    retryAfter: number;
  }> {
    const phone = normalizeIranianMobile(dto.phone);
    const now = new Date();
    const retryAfter = this.config.get<number>('app.otpRetryAfterSeconds', 60);
    const latest = await this.prisma.customerOtpChallenge.findFirst({
      where: { phone },
      orderBy: { requestedAt: 'desc' },
    });
    if (latest && latest.requestedAt.getTime() > now.getTime() - retryAfter * 1000) {
      const remaining = Math.ceil(
        (latest.requestedAt.getTime() + retryAfter * 1000 - now.getTime()) / 1000,
      );
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMITED',
          message: 'Wait before requesting another verification code.',
          details: { retryAfter: remaining },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.customerOtpChallenge.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: now },
    });
    const ttl = this.config.get<number>('app.otpTtlSeconds', 120);
    const developmentCode = this.config.get<string>('app.otpDevelopmentCode');
    const code =
      this.config.get<string>('app.nodeEnv') !== 'production' && developmentCode
        ? developmentCode
        : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challenge = await this.prisma.customerOtpChallenge.create({
      data: {
        phone,
        codeHash: this.otpHash(phone, code),
        expiresAt: new Date(now.getTime() + ttl * 1000),
      },
    });

    try {
      await this.smsProvider.send({
        to: phone,
        message: `کد ورود گالری نقره: ${code}\nاین کد تا ${Math.ceil(ttl / 60)} دقیقه معتبر است.`,
      });
    } catch (error) {
      await this.prisma.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new HttpException(
        {
          code: 'OTP_DELIVERY_FAILED',
          message: 'The verification code could not be delivered.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
        { cause: error },
      );
    }

    return { expiresIn: ttl, retryAfter };
  }

  async verifyOtp(
    dto: VerifyCustomerOtpDto,
  ): Promise<
    | CustomerAuthResponse
    | { registrationRequired: true; registrationToken: string; expiresIn: number }
  > {
    const phone = normalizeIranianMobile(dto.phone);
    const challenge = await this.prisma.customerOtpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { requestedAt: 'desc' },
    });
    const now = new Date();
    const maximumAttempts = this.config.get<number>('app.otpMaxAttempts', 5);
    if (!challenge || challenge.expiresAt <= now || challenge.attempts >= maximumAttempts) {
      throw new UnauthorizedException({
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'The verification code is invalid or expired.',
      });
    }

    const actual = Buffer.from(this.otpHash(phone, dto.code));
    const expected = Buffer.from(challenge.codeHash);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      const attempts = challenge.attempts + 1;
      await this.prisma.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(attempts >= maximumAttempts ? { consumedAt: now } : {}),
        },
      });
      throw new UnauthorizedException({
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'The verification code is invalid or expired.',
      });
    }

    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (customer) {
      this.assertActiveCustomer(customer.status);
      await this.prisma.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: { verifiedAt: now, consumedAt: now, customerId: customer.id },
      });
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { lastLoginAt: now },
      });
      return this.createSessionResponse(customer);
    }

    const registrationToken = randomBytes(48).toString('base64url');
    const registrationTtl = 10 * 60;
    await this.prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        verifiedAt: now,
        registrationTokenHash: this.tokenService.hashOpaqueToken(registrationToken),
        registrationExpiresAt: new Date(now.getTime() + registrationTtl * 1000),
      },
    });
    return {
      registrationRequired: true,
      registrationToken,
      expiresIn: registrationTtl,
    };
  }

  async completeOtpRegistration(
    dto: CompleteCustomerOtpRegistrationDto,
  ): Promise<CustomerAuthResponse> {
    const tokenHash = this.tokenService.hashOpaqueToken(dto.registrationToken);
    const challenge = await this.prisma.customerOtpChallenge.findUnique({
      where: { registrationTokenHash: tokenHash },
    });
    const now = new Date();
    if (
      !challenge ||
      !challenge.verifiedAt ||
      !challenge.registrationExpiresAt ||
      challenge.registrationExpiresAt <= now ||
      challenge.consumedAt
    ) {
      throw new UnauthorizedException({
        code: 'OTP_REGISTRATION_TOKEN_INVALID',
        message: 'The registration token is invalid or expired.',
      });
    }
    const email = dto.email?.toLowerCase();
    if (email && (await this.prisma.customer.findUnique({ where: { email } }))) {
      throw new ConflictException({
        code: 'CUSTOMER_EXISTS',
        message: 'A customer with this email already exists.',
      });
    }

    const customer = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.customer.create({
        data: {
          phone: challenge.phone,
          email,
          name: dto.name.trim(),
          marketingConsent: dto.marketingConsent ?? false,
          lastLoginAt: now,
        },
      });
      await transaction.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: { customerId: created.id, consumedAt: now },
      });
      return created;
    });
    this.eventPublisher.publish({
      name: 'CustomerRegistered',
      occurredAt: now,
      customerId: customer.id,
      email: customer.email,
      phone: customer.phone,
      customerName: customer.name,
    });
    return this.createSessionResponse(customer);
  }

  async refresh(dto: RefreshCustomerTokenDto): Promise<CustomerAuthResponse> {
    const tokenHash = this.tokenService.hashOpaqueToken(dto.refreshToken);
    const session = await this.prisma.customerSession.findUnique({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        customer: true,
      },
    });

    if (
      !session ||
      session.status !== CustomerSessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CUSTOMER_REFRESH_TOKEN',
        message: 'The refresh token is invalid or expired.',
      });
    }

    if (session.customer.status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'CUSTOMER_ACCOUNT_NOT_ACTIVE',
        message: 'This customer account is not active.',
      });
    }

    const refreshToken = this.tokenService.createRefreshToken();
    await this.prisma.customerSession.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: refreshToken.tokenHash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    return this.serializeAuthResponse(session.customer, session.id, refreshToken.token);
  }

  async logout(
    dto: LogoutCustomerDto,
    customer: AuthenticatedCustomer,
  ): Promise<{ revoked: boolean }> {
    const where = dto.refreshToken
      ? {
          refreshTokenHash: this.tokenService.hashOpaqueToken(dto.refreshToken),
        }
      : {
          id: customer.sessionId,
        };

    await this.prisma.customerSession.updateMany({
      where: {
        ...where,
        customerId: customer.id,
        status: CustomerSessionStatus.ACTIVE,
      },
      data: {
        status: CustomerSessionStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    return {
      revoked: true,
    };
  }

  async getSessionCustomer(customerId: string, sessionId: string): Promise<AuthenticatedCustomer> {
    const session = await this.prisma.customerSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        customer: true,
      },
    });

    if (
      !session ||
      session.customerId !== customerId ||
      session.status !== CustomerSessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      session.customer.status !== CustomerStatus.ACTIVE
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CUSTOMER_SESSION',
        message: 'The customer session is invalid or expired.',
      });
    }

    return {
      id: session.customer.id,
      email: session.customer.email,
      phone: session.customer.phone,
      name: session.customer.name,
      sessionId: session.id,
    };
  }

  async getProfile(customer: AuthenticatedCustomer): Promise<SerializedCustomer> {
    const record = await this.prisma.customer.findUnique({
      where: {
        id: customer.id,
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer was not found.',
      });
    }

    return this.serializeCustomer(record);
  }

  async updateProfile(
    customer: AuthenticatedCustomer,
    dto: UpdateCustomerProfileDto,
  ): Promise<SerializedCustomer> {
    const email = dto.email?.toLowerCase();
    const phone = dto.phone ? normalizeIranianMobile(dto.phone) : undefined;
    if (email || phone) {
      const duplicate = await this.prisma.customer.findFirst({
        where: {
          id: { not: customer.id },
          OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
        },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'CUSTOMER_IDENTITY_EXISTS',
          message: 'This email or phone is already assigned to another account.',
        });
      }
    }
    const updated = await this.prisma.customer.update({
      where: {
        id: customer.id,
      },
      data: {
        name: dto.name,
        email,
        phone,
        marketingConsent: dto.marketingConsent,
      },
    });

    return this.serializeCustomer(updated);
  }

  async createAddress(customer: AuthenticatedCustomer, dto: CreateCustomerAddressDto) {
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: {
          customerId: customer.id,
          type: dto.type,
        },
        data: {
          isDefault: false,
        },
      });
    }

    return this.prisma.customerAddress.create({
      data: {
        customerId: customer.id,
        type: dto.type,
        fullName: dto.fullName,
        phone: dto.phone,
        country: dto.country,
        province: dto.province,
        city: dto.city,
        line1: dto.line1,
        line2: dto.line2,
        postalCode: dto.postalCode,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async listAddresses(customer: AuthenticatedCustomer) {
    return this.prisma.customerAddress.findMany({
      where: {
        customerId: customer.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateAddress(customer: AuthenticatedCustomer, id: string, dto: UpdateCustomerAddressDto) {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id, customerId: customer.id },
    });
    if (!address) {
      throw new NotFoundException({
        code: 'CUSTOMER_ADDRESS_NOT_FOUND',
        message: 'Address was not found.',
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const type = dto.type ?? address.type;
      if (dto.isDefault) {
        await transaction.customerAddress.updateMany({
          where: { customerId: customer.id, type, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return transaction.customerAddress.update({
        where: { id },
        data: dto,
      });
    });
  }

  async deleteAddress(customer: AuthenticatedCustomer, id: string) {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id, customerId: customer.id },
    });
    if (!address) {
      throw new NotFoundException({
        code: 'CUSTOMER_ADDRESS_NOT_FOUND',
        message: 'Address was not found.',
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.customerAddress.delete({ where: { id } });
      if (!address.isDefault) return;
      const fallback = await transaction.customerAddress.findFirst({
        where: { customerId: customer.id, type: address.type },
        orderBy: { createdAt: 'desc' },
      });
      if (fallback) {
        await transaction.customerAddress.update({
          where: { id: fallback.id },
          data: { isDefault: true },
        });
      }
    });
    return { deleted: true };
  }

  async createGuestCheckoutProfile(dto: CreateGuestCheckoutProfileDto) {
    return this.prisma.guestCheckoutProfile.create({
      data: {
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        name: dto.name,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async listCustomers(query: ListCustomersQueryDto) {
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
          ],
        }
      : {};
    const skip = (query.page - 1) * query.limit;
    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items: customers.map((customer) => ({
        ...this.serializeCustomer(customer),
        ordersCount: customer._count.orders,
        createdAt: customer.createdAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  async findCustomer(id: string): Promise<SerializedCustomer> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id,
      },
    });

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer was not found.',
      });
    }

    return this.serializeCustomer(customer);
  }

  async updateCustomerStatus(
    id: string,
    dto: UpdateCustomerStatusDto,
  ): Promise<SerializedCustomer> {
    const customer = await this.prisma.customer.update({
      where: {
        id,
      },
      data: {
        status: dto.status,
      },
    });

    return this.serializeCustomer(customer);
  }

  async addNote(id: string, dto: AddCustomerNoteDto, staff: AuthenticatedStaff) {
    await this.findCustomer(id);

    return this.prisma.customerNote.create({
      data: {
        customerId: id,
        staffUserId: staff.id,
        note: dto.note,
      },
    });
  }

  async listNotes(id: string) {
    await this.findCustomer(id);

    return this.prisma.customerNote.findMany({
      where: {
        customerId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async createSessionResponse(customer: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string;
    status: CustomerStatus;
    marketingConsent: boolean;
  }): Promise<CustomerAuthResponse> {
    const refreshToken = this.tokenService.createRefreshToken();
    const session = await this.prisma.customerSession.create({
      data: {
        customerId: customer.id,
        refreshTokenHash: refreshToken.tokenHash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    return this.serializeAuthResponse(customer, session.id, refreshToken.token);
  }

  private otpHash(phone: string, code: string): string {
    return this.tokenService.hashOpaqueToken(`customer-otp:${phone}:${code}`);
  }

  private assertActiveCustomer(status: CustomerStatus): void {
    if (status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'CUSTOMER_ACCOUNT_NOT_ACTIVE',
        message: 'This customer account is not active.',
      });
    }
  }

  private serializeAuthResponse(
    customer: {
      id: string;
      email: string | null;
      phone: string | null;
      name: string;
      status: CustomerStatus;
      marketingConsent: boolean;
    },
    sessionId: string,
    refreshToken: string,
  ): CustomerAuthResponse {
    return {
      customer: this.serializeCustomer(customer),
      accessToken: this.tokenService.createAccessToken({
        sub: customer.id,
        email: customer.email,
        phone: customer.phone,
        name: customer.name,
        sessionId,
        type: 'customer_access',
      }),
      refreshToken,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  private serializeCustomer(customer: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string;
    status: CustomerStatus;
    marketingConsent: boolean;
  }): SerializedCustomer {
    return {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      name: customer.name,
      status: customer.status,
      marketingConsent: customer.marketingConsent,
    };
  }
}

export function normalizeIranianMobile(input: string): string {
  const compact = input.replace(/[\s()-]/g, '');
  const local = compact.startsWith('0098')
    ? compact.slice(4)
    : compact.startsWith('+98')
      ? compact.slice(3)
      : compact.startsWith('98')
        ? compact.slice(2)
        : compact.startsWith('0')
          ? compact.slice(1)
          : compact;
  if (!/^9\d{9}$/.test(local)) {
    throw new UnauthorizedException({
      code: 'INVALID_PHONE_NUMBER',
      message: 'A valid Iranian mobile number is required.',
    });
  }
  return `+98${local}`;
}
