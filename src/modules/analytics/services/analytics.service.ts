import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventName, ConsentSource, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { IngestAnalyticsEventsDto } from '../dto/ingest-analytics-events.dto';
import { RecordConsentDto } from '../dto/record-consent.dto';

const deniedPayloadKeys = new Set([
  'email',
  'phone',
  'name',
  'full_name',
  'address',
  'postal_code',
  'recipient',
]);

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  recordConsent(dto: RecordConsentDto, customerId?: string) {
    return this.prisma.consentRecord.create({
      data: {
        customerId,
        anonymousId: dto.anonymousId,
        analyticsGranted: dto.analyticsGranted,
        marketingGranted: dto.marketingGranted,
        policyVersion: dto.policyVersion,
        source: dto.source ?? ConsentSource.COOKIE_BANNER,
      },
    });
  }

  async ingest(dto: IngestAnalyticsEventsDto) {
    const consent = await this.prisma.consentRecord.findFirst({
      where: { anonymousId: dto.anonymousId },
      orderBy: { createdAt: 'desc' },
    });
    if (!consent?.analyticsGranted) {
      return { accepted: 0, ignored: dto.events.length, reason: 'CONSENT_REQUIRED' };
    }

    const sanitized = dto.events.map((event) => ({
      ...event,
      payload: this.sanitizePayload(event.payload),
    }));
    let accepted = 0;
    for (const event of sanitized) {
      try {
        await this.prisma.analyticsEvent.create({
          data: {
            consentRecordId: consent.id,
            anonymousId: dto.anonymousId,
            sessionId: dto.sessionId,
            name: event.name,
            dedupeKey: event.dedupeKey,
            payload: event.payload as Prisma.InputJsonValue,
            occurredAt: new Date(event.occurredAt),
          },
        });
        accepted += 1;
      } catch (error) {
        if (!this.isUniqueConflict(error)) throw error;
      }
    }
    if (accepted) {
      await this.forwardToGa4(
        dto.anonymousId,
        sanitized.map((event) => ({
          name: event.name.toLowerCase(),
          params: event.payload,
        })),
      );
    }
    return { accepted, ignored: dto.events.length - accepted };
  }

  async recordOperationalPurchase(input: {
    orderId: string;
    customerId?: string | null;
    anonymousId?: string;
    currency: string;
    value: string;
  }) {
    const anonymousId = input.anonymousId ?? `order-${input.orderId}`;
    const payload = {
      transaction_id: input.orderId,
      currency: input.currency,
      value: input.value,
    };
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          customerId: input.customerId,
          anonymousId,
          sessionId: `order-${input.orderId}`,
          name: AnalyticsEventName.PURCHASE,
          dedupeKey: `purchase:${input.orderId}`,
          payload,
          occurredAt: new Date(),
        },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
    }
    const consent = input.customerId
      ? await this.prisma.consentRecord.findFirst({
          where: { customerId: input.customerId, analyticsGranted: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (consent) {
      await this.forwardToGa4(consent.anonymousId, [{ name: 'purchase', params: payload }]);
    }
  }

  async getFunnel(from: Date, to: Date) {
    const groups = await this.prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { occurredAt: { gte: from, lte: to } },
      _count: true,
    });
    const counts = new Map(groups.map((group) => [group.name, group._count]));
    const stages = [
      AnalyticsEventName.VIEW_ITEM,
      AnalyticsEventName.ADD_TO_CART,
      AnalyticsEventName.BEGIN_CHECKOUT,
      AnalyticsEventName.PURCHASE,
    ].map((name) => ({ name, count: counts.get(name) ?? 0 }));
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      stages,
      conversionRate:
        stages[0].count > 0 ? stages[3].count / stages[0].count : 0,
    };
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (deniedPayloadKeys.has(key.toLowerCase())) continue;
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        clean[key] = typeof value === 'string' ? value.slice(0, 500) : value;
      } else if (Array.isArray(value)) {
        clean[key] = value.slice(0, 50).map((item: unknown): unknown =>
          item && typeof item === 'object'
            ? this.sanitizePayload(item as Record<string, unknown>)
            : item,
        );
      } else if (value && typeof value === 'object') {
        clean[key] = this.sanitizePayload(value as Record<string, unknown>);
      }
    }
    return clean;
  }

  private async forwardToGa4(
    clientId: string,
    events: Array<{ name: string; params: Record<string, unknown> }>,
  ) {
    const measurementId = this.config.get<string>('app.ga4MeasurementId');
    const apiSecret = this.config.get<string>('app.ga4ApiSecret');
    if (!measurementId || !apiSecret || !events.length) return;
    const url = new URL('https://www.google-analytics.com/mp/collect');
    url.searchParams.set('measurement_id', measurementId);
    url.searchParams.set('api_secret', apiSecret);
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        non_personalized_ads: true,
        events,
      }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
