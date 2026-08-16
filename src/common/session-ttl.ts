/** Access JWT lifetime (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Customer sessions slide for 30 days from their most recent activity. */
export const CUSTOMER_SESSION_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Staff sessions use a shorter sliding window because of their privileges. */
export const STAFF_SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Backwards-compatible default for staff/high-privilege sessions. */
export const SESSION_IDLE_TTL_MS = STAFF_SESSION_IDLE_TTL_MS;

/** Skip lastActiveAt writes more often than this to limit DB load. */
export const SESSION_ACTIVITY_TOUCH_THROTTLE_MS = 60 * 1000;

export function sessionIdleExpiresAt(
  from: Date = new Date(),
  ttlMs: number = SESSION_IDLE_TTL_MS,
): Date {
  return new Date(from.getTime() + ttlMs);
}

export function isSessionIdle(
  lastActiveAt: Date,
  now: Date = new Date(),
  ttlMs: number = SESSION_IDLE_TTL_MS,
): boolean {
  return now.getTime() - lastActiveAt.getTime() > ttlMs;
}

export function shouldTouchSessionActivity(lastActiveAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastActiveAt.getTime() >= SESSION_ACTIVITY_TOUCH_THROTTLE_MS;
}
