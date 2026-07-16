import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomerSessionStatus, CustomerStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AddCustomerNoteDto } from '../dto/add-customer-note.dto';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { CreateGuestCheckoutProfileDto } from '../dto/create-guest-checkout-profile.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { LogoutCustomerDto } from '../dto/logout-customer.dto';
import { RefreshCustomerTokenDto } from '../dto/refresh-customer-token.dto';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { UpdateCustomerProfileDto } from '../dto/update-customer-profile.dto';
import { UpdateCustomerStatusDto } from '../dto/update-customer-status.dto';
import { AuthenticatedCustomer } from '../types/authenticated-customer';
import { CustomerPasswordService } from './customer-password.service';
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
  ) {}

  async register(dto: RegisterCustomerDto): Promise<CustomerAuthResponse> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.customer.findUnique({
      where: {
        email,
      },
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
        phone: dto.phone,
        passwordHash,
        marketingConsent: dto.marketingConsent ?? false,
      },
    });

    return this.createSessionResponse(customer);
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
    const updated = await this.prisma.customer.update({
      where: {
        id: customer.id,
      },
      data: {
        name: dto.name,
        phone: dto.phone,
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

  listOrderHistory(): unknown[] {
    return [];
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

  async listCustomers(): Promise<SerializedCustomer[]> {
    const customers = await this.prisma.customer.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return customers.map((customer) => this.serializeCustomer(customer));
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
