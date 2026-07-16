import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies passwords without storing plaintext', async () => {
    const hash = await service.hashPassword('correct-password');

    expect(hash).toContain('scrypt:');
    expect(hash).not.toContain('correct-password');
    await expect(service.verifyPassword('correct-password', hash)).resolves.toBe(true);
    await expect(service.verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
