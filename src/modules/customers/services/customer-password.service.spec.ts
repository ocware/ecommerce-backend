import { CustomerPasswordService } from './customer-password.service';

describe('CustomerPasswordService', () => {
  const service = new CustomerPasswordService();

  it('hashes and verifies customer passwords', async () => {
    const hash = await service.hashPassword('correct-password');

    expect(hash).toContain('scrypt:');
    expect(hash).not.toContain('correct-password');
    await expect(service.verifyPassword('correct-password', hash)).resolves.toBe(true);
    await expect(service.verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
