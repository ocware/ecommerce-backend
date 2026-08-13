type AuthenticationHeaders = {
  authorization?: string;
  cookie?: string;
};

export function extractAccessToken(
  headers: AuthenticationHeaders,
  sessionCookieName: string,
): string | undefined {
  const [type, bearerToken] = headers.authorization?.split(' ') ?? [];
  if (type === 'Bearer' && bearerToken) return bearerToken;

  for (const entry of headers.cookie?.split(';') ?? []) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex < 0) continue;

    const name = entry.slice(0, separatorIndex).trim();
    if (name !== sessionCookieName) continue;

    const value = entry.slice(separatorIndex + 1).trim();
    if (!value) return undefined;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}
