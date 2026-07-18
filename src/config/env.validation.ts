import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  API_PREFIX: z.string().min(1).default('api'),
  API_VERSION: z.string().min(1).default('1'),
  SHOP_NAME: z.string().min(1).default('Example Store'),
  CURRENCY: z.string().min(3).default('IRR'),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  return parsed.data;
}
