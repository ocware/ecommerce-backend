import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { StaffRole, StaffSessionStatus, StaffStatus as PrismaStaffStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  isSessionIdle,
  sessionIdleExpiresAt,
  shouldTouchSessionActivity,
} from '../../../common/session-ttl';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { CreateStaffUserDto } from '../dto/create-staff-user.dto';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { UpdateStaffUserDto } from '../dto/update-staff-user.dto';
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
  private readonly accessTokenExpiresInSeconds = ACCESS_TOKEN_TTL_SECONDS;

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
  ) {
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

    return this.serializeAdminStaff(staff);
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

    const now = new Date();
    const refreshToken = this.tokenService.createRefreshToken();
    const session = await this.prisma.staffSession.create({
      data: {
        staffUserId: staff.id,
        familyId: randomUUID(),
        refreshTokenHash: refreshToken.tokenHash,
        previousRefreshTokenHash: null,
        expiresAt: refreshToken.expiresAt,
        lastActiveAt: now,
      },
    });

    await this.prisma.staffUser.update({
      where: {
        id: staff.id,
      },
      data: {
        lastLoginAt: now,
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
    const now = new Date();

    const currentSession = await this.prisma.staffSession.findUnique({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        staffUser: true,
      },
    });

    if (currentSession) {
      if (
        currentSession.status !== StaffSessionStatus.ACTIVE ||
        currentSession.expiresAt <= now
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'The refresh token is invalid or expired.',
        });
      }

      if (isSessionIdle(currentSession.lastActiveAt, now)) {
        await this.prisma.staffSession.update({
          where: { id: currentSession.id },
          data: {
            status: StaffSessionStatus.EXPIRED,
            revokedAt: now,
            previousRefreshTokenHash: null,
          },
        });
        throw new UnauthorizedException({
          code: 'SESSION_IDLE_EXPIRED',
          message: 'The session expired due to inactivity.',
        });
      }

      if (currentSession.staffUser.status !== StaffStatus.ACTIVE) {
        throw new ForbiddenException({
          code: 'STAFF_ACCOUNT_NOT_ACTIVE',
          message: 'This staff account is not active.',
        });
      }

      const refreshToken = this.tokenService.createRefreshToken();
      const updatedSession = await this.prisma.staffSession.update({
        where: {
          id: currentSession.id,
        },
        data: {
          previousRefreshTokenHash: currentSession.refreshTokenHash,
          refreshTokenHash: refreshToken.tokenHash,
          expiresAt: refreshToken.expiresAt,
          lastActiveAt: now,
        },
      });

      await this.auditLogService.record({
        staffUserId: currentSession.staffUserId,
        action: 'STAFF_TOKEN_REFRESHED',
        entityType: 'StaffSession',
        entityId: updatedSession.id,
      });

      return {
        staff: this.serializeStaff(currentSession.staffUser),
        accessToken: this.tokenService.createAccessToken({
          sub: currentSession.staffUser.id,
          email: currentSession.staffUser.email,
          name: currentSession.staffUser.name,
          role: currentSession.staffUser.role,
          sessionId: currentSession.id,
          type: 'staff_access',
        }),
        refreshToken: refreshToken.token,
        expiresIn: this.accessTokenExpiresInSeconds,
      };
    }

    const reusedSession = await this.prisma.staffSession.findUnique({
      where: {
        previousRefreshTokenHash: tokenHash,
      },
    });

    if (reusedSession) {
      await this.revokeAllStaffSessions(reusedSession.staffUserId);
      await this.auditLogService.record({
        staffUserId: reusedSession.staffUserId,
        action: 'STAFF_REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'StaffSession',
        entityId: reusedSession.id,
        metadata: { familyId: reusedSession.familyId },
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Refresh token reuse was detected. All sessions were revoked.',
      });
    }

    throw new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'The refresh token is invalid or expired.',
    });
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
        previousRefreshTokenHash: null,
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
          previousRefreshTokenHash: null,
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

    const now = new Date();

    if (
      !session ||
      session.staffUserId !== staffId ||
      session.status !== StaffSessionStatus.ACTIVE ||
      session.expiresAt <= now ||
      session.staffUser.status !== StaffStatus.ACTIVE
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'The staff session is invalid or expired.',
      });
    }

    if (isSessionIdle(session.lastActiveAt, now)) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: {
          status: StaffSessionStatus.EXPIRED,
          revokedAt: now,
          previousRefreshTokenHash: null,
        },
      });
      throw new UnauthorizedException({
        code: 'SESSION_IDLE_EXPIRED',
        message: 'The session expired due to inactivity.',
      });
    }

    if (shouldTouchSessionActivity(session.lastActiveAt, now)) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: {
          lastActiveAt: now,
          expiresAt: sessionIdleExpiresAt(now),
        },
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

  async listStaffUsers() {
    const staffUsers = await this.prisma.staffUser.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return staffUsers.map((staff) => this.serializeAdminStaff(staff));
  }

  async findStaffById(id: string) {
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

    return this.serializeAdminStaff(staff);
  }

  async updateStaffUser(id: string, dto: UpdateStaffUserDto, actor: AuthenticatedStaff) {
    const staff = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_USER_NOT_FOUND',
        message: 'Staff user was not found.',
      });
    }
    if (id === actor.id && dto.status && dto.status !== PrismaStaffStatus.ACTIVE) {
      throw new ConflictException({
        code: 'STAFF_CANNOT_DISABLE_SELF',
        message: 'A staff user cannot disable their own active account.',
      });
    }
    const removesActiveOwner =
      staff.role === StaffRole.OWNER &&
      staff.status === PrismaStaffStatus.ACTIVE &&
      (dto.role !== undefined && dto.role !== StaffRole.OWNER ||
        dto.status !== undefined && dto.status !== PrismaStaffStatus.ACTIVE);
    if (removesActiveOwner) {
      const ownerCount = await this.prisma.staffUser.count({
        where: { role: StaffRole.OWNER, status: PrismaStaffStatus.ACTIVE },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER_REQUIRED',
          message: 'At least one active owner account is required.',
        });
      }
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.staffUser.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          role: dto.role,
          status: dto.status,
        },
      });
      if (
        (dto.role && dto.role !== staff.role) ||
        (dto.status && dto.status !== PrismaStaffStatus.ACTIVE)
      ) {
        await transaction.staffSession.updateMany({
          where: { staffUserId: id, status: StaffSessionStatus.ACTIVE },
          data: {
            status: StaffSessionStatus.REVOKED,
            revokedAt: new Date(),
            previousRefreshTokenHash: null,
          },
        });
      }
      return result;
    });
    await this.auditLogService.record({
      staffUserId: actor.id,
      action: 'STAFF_USER_UPDATED',
      entityType: 'StaffUser',
      entityId: id,
      metadata: { role: updated.role, status: updated.status },
    });
    return this.serializeAdminStaff(updated);
  }

  private async revokeAllStaffSessions(staffUserId: string): Promise<void> {
    await this.prisma.staffSession.updateMany({
      where: {
        staffUserId,
        status: StaffSessionStatus.ACTIVE,
      },
      data: {
        status: StaffSessionStatus.REVOKED,
        revokedAt: new Date(),
        previousRefreshTokenHash: null,
      },
    });
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

  private serializeAdminStaff(staff: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...this.serializeStaff(staff),
      status: staff.status,
      lastLoginAt: staff.lastLoginAt,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    };
  }
}
