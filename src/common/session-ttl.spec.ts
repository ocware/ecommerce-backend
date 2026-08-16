import {
  CUSTOMER_SESSION_IDLE_TTL_MS,
  isSessionIdle,
  SESSION_IDLE_TTL_MS,
  STAFF_SESSION_IDLE_TTL_MS,
  sessionIdleExpiresAt,
  shouldTouchSessionActivity,
} from './session-ttl';

describe('session-ttl', () => {
  it('treats activity within 7 days as not idle', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const lastActiveAt = new Date(now.getTime() - SESSION_IDLE_TTL_MS + 60_000);
    expect(isSessionIdle(lastActiveAt, now)).toBe(false);
  });

  it('treats activity older than 7 days as idle', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const lastActiveAt = new Date(now.getTime() - SESSION_IDLE_TTL_MS - 1);
    expect(isSessionIdle(lastActiveAt, now)).toBe(true);
  });

  it('slides expiry by the idle window', () => {
    const from = new Date('2026-08-07T12:00:00.000Z');
    expect(sessionIdleExpiresAt(from).getTime()).toBe(from.getTime() + SESSION_IDLE_TTL_MS);
  });

  it('throttles activity touches under 60 seconds', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    expect(shouldTouchSessionActivity(new Date(now.getTime() - 30_000), now)).toBe(false);
    expect(shouldTouchSessionActivity(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  it('uses distinct customer and staff sliding windows', () => {
    expect(CUSTOMER_SESSION_IDLE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(STAFF_SESSION_IDLE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
