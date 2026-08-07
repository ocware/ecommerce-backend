/** Access JWT lifetime (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Idle window before refresh/access sessions are rejected (7 days). */
export const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Skip lastActiveAt writes more often than this to limit DB load. */
export const SESSION_ACTIVITY_TOUCH_THROTTLE_MS = 60 * 1000;

export function sessionIdleExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_IDLE_TTL_MS);
}

export function isSessionIdle(lastActiveAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastActiveAt.getTime() > SESSION_IDLE_TTL_MS;
}

export function shouldTouchSessionActivity(
  lastActiveAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - lastActiveAt.getTime() >= SESSION_ACTIVITY_TOUCH_THROTTLE_MS;
}
