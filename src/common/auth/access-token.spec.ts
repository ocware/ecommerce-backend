import { extractAccessToken } from './access-token';

describe('extractAccessToken', () => {
  it('prefers a bearer token', () => {
    expect(
      extractAccessToken(
        {
          authorization: 'Bearer header-token',
          cookie: 'session=cookie-token',
        },
        'session',
      ),
    ).toBe('header-token');
  });

  it('reads the access token from the configured session cookie', () => {
    expect(
      extractAccessToken({ cookie: 'theme=dark; session=cookie-token; locale=fa' }, 'session'),
    ).toBe('cookie-token');
  });

  it('does not accept a differently named cookie', () => {
    expect(extractAccessToken({ cookie: 'other=cookie-token' }, 'session')).toBeUndefined();
  });
});
