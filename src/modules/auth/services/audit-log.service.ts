import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';

type AuditLogInput = {
  staffUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        staffUserId: input.staffUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
