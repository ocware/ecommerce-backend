import { CartTokenService } from './cart-token.service';

describe('CartTokenService', () => {
  const service = new CartTokenService();

  it('creates opaque guest tokens and stores only a hash', () => {
    const first = service.createGuestToken();
    const second = service.createGuestToken();

    expect(first.token).not.toBe(first.tokenHash);
    expect(first.tokenHash).not.toBe(second.tokenHash);
    expect(service.matches(first.token, first.tokenHash)).toBe(true);
    expect(service.matches(second.token, first.tokenHash)).toBe(false);
  });
});
