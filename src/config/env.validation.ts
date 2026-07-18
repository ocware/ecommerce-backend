import { z } from 'zod';

const booleanEnvironmentValue = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

const csvAllowlist = (allowedValues: readonly string[], name: string) =>
  z
    .string()
    .min(1)
    .refine((value) => {
      const entries = value.split(',').map((entry) => entry.trim());
      return entries.length > 0 && entries.every((entry) => allowedValues.includes(entry));
    }, `${name} contains an unsupported provider`);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
    PAYMENT_GATEWAYS: csvAllowlist(
      ['DEVELOPMENT', 'MANUAL_BANK_TRANSFER', 'CASH_ON_DELIVERY'],
      'PAYMENT_GATEWAYS',
    ).default('DEVELOPMENT,MANUAL_BANK_TRANSFER,CASH_ON_DELIVERY'),
    SHIPPING_PROVIDERS: csvAllowlist(['LOCAL'], 'SHIPPING_PROVIDERS').default('LOCAL'),
    EMAIL_PROVIDER: z.enum(['development']).default('development'),
    SMS_PROVIDER: z.enum(['development']).default('development'),
    API_PREFIX: z.string().min(1).default('api'),
    API_VERSION: z.string().min(1).default('1'),
    MEDIA_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    MEDIA_LOCAL_ROOT: z.string().min(1).default('storage/media'),
    MEDIA_PUBLIC_BASE_URL: z.string().min(1).default('/media'),
    MEDIA_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    MEDIA_S3_BUCKET: z.string().min(1).optional(),
    MEDIA_S3_REGION: z.string().min(1).default('us-east-1'),
    MEDIA_S3_ENDPOINT: z.string().url().optional(),
    MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    MEDIA_S3_PUBLIC_BASE_URL: z.string().url().optional(),
    MEDIA_S3_FORCE_PATH_STYLE: booleanEnvironmentValue.default(false),
    FEATURE_MEDIA_ENABLED: booleanEnvironmentValue.default(true),
    FEATURE_NOTIFICATIONS_ENABLED: booleanEnvironmentValue.default(true),
    FEATURE_REPORTS_ENABLED: booleanEnvironmentValue.default(true),
  })
  .superRefine((config, context) => {
    if (config.MEDIA_STORAGE_DRIVER !== 's3') return;
    for (const key of [
      'MEDIA_S3_BUCKET',
      'MEDIA_S3_ACCESS_KEY_ID',
      'MEDIA_S3_SECRET_ACCESS_KEY',
      'MEDIA_S3_PUBLIC_BASE_URL',
    ] as const) {
      if (!config[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when MEDIA_STORAGE_DRIVER is s3`,
        });
      }
    }
  });

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  return parsed.data;
}
