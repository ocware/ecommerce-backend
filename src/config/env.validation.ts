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
    PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
    PAYMENT_GATEWAYS: csvAllowlist(
      ['DEVELOPMENT', 'MANUAL_BANK_TRANSFER', 'CASH_ON_DELIVERY', 'ZARINPAL'],
      'PAYMENT_GATEWAYS',
    ).default('DEVELOPMENT,MANUAL_BANK_TRANSFER,CASH_ON_DELIVERY'),
    ZARINPAL_MERCHANT_ID: z.string().uuid().optional(),
    ZARINPAL_SANDBOX: booleanEnvironmentValue.default(false),
    SHIPPING_PROVIDERS: csvAllowlist(['LOCAL'], 'SHIPPING_PROVIDERS').default('LOCAL'),
    EMAIL_PROVIDER: z.enum(['development', 'smtp']).default('development'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_SECURE: booleanEnvironmentValue.default(false),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().email().optional(),
    SMTP_EHLO_NAME: z.string().min(1).optional(),
    SMTP_ALLOW_INVALID_CERTIFICATES: booleanEnvironmentValue.default(false),
    SMS_PROVIDER: z.enum(['development', 'kavenegar']).default('development'),
    KAVENEGAR_API_KEY: z.string().min(1).optional(),
    KAVENEGAR_SENDER: z.string().min(1).optional(),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(120),
    OTP_RETRY_AFTER_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    OTP_DEVELOPMENT_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    GA4_MEASUREMENT_ID: z
      .string()
      .regex(/^G-[A-Z0-9]+$/)
      .optional(),
    GA4_API_SECRET: z.string().min(1).optional(),
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
    if (config.SMS_PROVIDER === 'kavenegar' && !config.KAVENEGAR_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['KAVENEGAR_API_KEY'],
        message: 'KAVENEGAR_API_KEY is required when SMS_PROVIDER is kavenegar',
      });
    }
    if (config.EMAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_FROM'] as const) {
        if (!config[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER is smtp`,
          });
        }
      }
      if (Boolean(config.SMTP_USERNAME) !== Boolean(config.SMTP_PASSWORD)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_PASSWORD'],
          message: 'SMTP_USERNAME and SMTP_PASSWORD must be configured together',
        });
      }
      if (config.NODE_ENV === 'production' && config.SMTP_ALLOW_INVALID_CERTIFICATES) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_ALLOW_INVALID_CERTIFICATES'],
          message: 'Invalid SMTP certificates cannot be allowed in production',
        });
      }
    }
    if (config.PAYMENT_GATEWAYS.split(',').includes('ZARINPAL') && !config.ZARINPAL_MERCHANT_ID) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ZARINPAL_MERCHANT_ID'],
        message: 'ZARINPAL_MERCHANT_ID is required when ZARINPAL is enabled',
      });
    }
    if (config.NODE_ENV === 'production' && config.OTP_DEVELOPMENT_CODE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_DEVELOPMENT_CODE'],
        message: 'OTP_DEVELOPMENT_CODE cannot be configured in production',
      });
    }
    if (Boolean(config.GA4_MEASUREMENT_ID) !== Boolean(config.GA4_API_SECRET)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GA4_API_SECRET'],
        message: 'GA4_MEASUREMENT_ID and GA4_API_SECRET must be configured together',
      });
    }
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
