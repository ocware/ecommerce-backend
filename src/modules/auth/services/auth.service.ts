import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { StaffSessionStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { CreateStaffUserDto } from '../dto/create-staff-user.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { AuthenticatedStaff } from '../types/authenticated-staff';
import { StaffStatus } from '../types/staff-role';
import { AuditLogService } from './audit-log.service';
import { AuthEventPublisher } from './auth-event-publisher.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthResponse = {
  staff: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresInSeconds = 15 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: AuthEventPublisher,
  ) {}

  async createStaffUser(
    dto: CreateStaffUserDto,
    actor: AuthenticatedStaff,
  ): Promise<AuthResponse['staff']> {
    const existing = await this.prisma.staffUser.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'STAFF_USER_EXISTS',
        message: 'A staff user with this email already exists.',
      });
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const staff = await this.prisma.staffUser.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role,
        passwordHash,
      },
    });

    await this.auditLogService.record({
      staffUserId: actor.id,
      action: 'STAFF_USER_CREATED',
      entityType: 'StaffUser',
      entityId: staff.id,
      metadata: {
        email: staff.email,
        role: staff.role,
      },
    });

    return this.serializeStaff(staff);
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthResponse> {
    const staff = await this.prisma.staffUser.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
    });

    if (!staff || !(await this.passwordService.verifyPassword(dto.password, staff.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'The email or password is incorrect.',
      });
    }

    if (staff.status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'STAFF_ACCOUNT_NOT_ACTIVE',
        message: 'This staff account is not active.',
      });
    }

    const refreshToken = this.tokenService.createRefreshToken();
    const session = await this.prisma.staffSession.create({
      data: {
        staffUserId: staff.id,
        refreshTokenHash: refreshToken.tokenHash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    await this.prisma.staffUser.update({
      where: {
        id: staff.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    await this.auditLogService.record({
      staffUserId: staff.id,
      action: 'STAFF_LOGIN',
      entityType: 'StaffSession',
      entityId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      staff: this.serializeStaff(staff),
      accessToken: this.tokenService.createAccessToken({
        sub: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        sessionId: session.id,
        type: 'staff_access',
      }),
      refreshToken: refreshToken.token,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const tokenHash = this.tokenService.hashOpaqueToken(dto.refreshToken);
    const session = await this.prisma.staffSession.findUnique({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        staffUser: true,
      },
    });

    if (
      !session ||
      session.status !== StaffSessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'The refresh token is invalid or expired.',
      });
    }

    if (session.staffUser.status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'STAFF_ACCOUNT_NOT_ACTIVE',
        message: 'This staff account is not active.',
      });
    }

    const refreshToken = this.tokenService.createRefreshToken();
    const updatedSession = await this.prisma.staffSession.update({
      where: {
        id: session.id,
      },
      data: {
        refreshTokenHash: refreshToken.tokenHash,
        expiresAt: refreshToken.expiresAt,
      },
    });

    await this.auditLogService.record({
      staffUserId: session.staffUserId,
      action: 'STAFF_TOKEN_REFRESHED',
      entityType: 'StaffSession',
      entityId: updatedSession.id,
    });

    return {
      staff: this.serializeStaff(session.staffUser),
      accessToken: this.tokenService.createAccessToken({
        sub: session.staffUser.id,
        email: session.staffUser.email,
        name: session.staffUser.name,
        role: session.staffUser.role,
        sessionId: session.id,
        type: 'staff_access',
      }),
      refreshToken: refreshToken.token,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  async logout(dto: LogoutDto, staff: AuthenticatedStaff): Promise<{ revoked: boolean }> {
    const where = dto.refreshToken
      ? {
          refreshTokenHash: this.tokenService.hashOpaqueToken(dto.refreshToken),
        }
      : {
          id: staff.sessionId,
        };

    await this.prisma.staffSession.updateMany({
      where: {
        ...where,
        staffUserId: staff.id,
        status: StaffSessionStatus.ACTIVE,
      },
      data: {
        status: StaffSessionStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    await this.auditLogService.record({
      staffUserId: staff.id,
      action: 'STAFF_LOGOUT',
      entityType: 'StaffSession',
      entityId: staff.sessionId,
    });

    return {
      revoked: true,
    };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ requested: boolean }> {
    const staff = await this.prisma.staffUser.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
    });

    if (!staff || staff.status !== StaffStatus.ACTIVE) {
      return {
        requested: true,
      };
    }

    const resetToken = this.tokenService.createPasswordResetToken();
    const storedResetToken = await this.prisma.passwordResetToken.create({
      data: {
        staffUserId: staff.id,
        tokenHash: resetToken.tokenHash,
        expiresAt: resetToken.expiresAt,
      },
    });

    await this.auditLogService.record({
      staffUserId: staff.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'StaffUser',
      entityId: staff.id,
    });

    this.eventPublisher.publish({
      name: 'PasswordResetRequested',
      occurredAt: new Date(),
      passwordResetTokenId: storedResetToken.id,
      staffUserId: staff.id,
      email: staff.email,
      resetToken: resetToken.token,
      expiresAt: resetToken.expiresAt,
    });

    return {
      requested: true,
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<{ reset: boolean }> {
    const tokenHash = this.tokenService.hashOpaqueToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        staffUser: true,
      },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'The password reset token is invalid or expired.',
      });
    }

    const passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.staffUser.update({
        where: {
          id: resetToken.staffUserId,
        },
        data: {
          passwordHash,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      this.prisma.staffSession.updateMany({
        where: {
          staffUserId: resetToken.staffUserId,
          status: StaffSessionStatus.ACTIVE,
        },
        data: {
          status: StaffSessionStatus.REVOKED,
          revokedAt: new Date(),
        },
      }),
    ]);

    await this.auditLogService.record({
      staffUserId: resetToken.staffUserId,
      action: 'PASSWORD_RESET_CONFIRMED',
      entityType: 'StaffUser',
      entityId: resetToken.staffUserId,
    });

    return {
      reset: true,
    };
  }

  async getSessionStaff(staffId: string, sessionId: string): Promise<AuthenticatedStaff> {
    const session = await this.prisma.staffSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        staffUser: true,
      },
    });

    if (
      !session ||
      session.staffUserId !== staffId ||
      session.status !== StaffSessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      session.staffUser.status !== StaffStatus.ACTIVE
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'The staff session is invalid or expired.',
      });
    }

    return {
      id: session.staffUser.id,
      email: session.staffUser.email,
      name: session.staffUser.name,
      role: session.staffUser.role,
      sessionId: session.id,
    };
  }

  async listStaffUsers(): Promise<AuthResponse['staff'][]> {
    const staffUsers = await this.prisma.staffUser.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return staffUsers.map((staff) => this.serializeStaff(staff));
  }

  async findStaffById(id: string): Promise<AuthResponse['staff']> {
    const staff = await this.prisma.staffUser.findUnique({
      where: {
        id,
      },
    });

    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_USER_NOT_FOUND',
        message: 'Staff user was not found.',
      });
    }

    return this.serializeStaff(staff);
  }

  private serializeStaff(staff: {
    id: string;
    email: string;
    name: string;
    role: string;
  }): AuthResponse['staff'] {
    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
    };
  }
}
