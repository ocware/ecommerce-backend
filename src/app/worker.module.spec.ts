import { Test } from '@nestjs/testing';

describe('WorkerModule', () => {
  it('resolves the complete background worker dependency graph', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { WorkerModule } = await import('./worker.module');
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
