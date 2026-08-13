import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'session',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.JWT_SECRET,
  zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID,
  zarinpalSandbox: process.env.ZARINPAL_SANDBOX === 'true',
  paymentGateways: (
    process.env.PAYMENT_GATEWAYS ?? 'DEVELOPMENT,MANUAL_BANK_TRANSFER,CASH_ON_DELIVERY'
  )
    .split(',')
    .map((value) => value.trim()),
  shippingProviders: (process.env.SHIPPING_PROVIDERS ?? 'LOCAL')
    .split(',')
    .map((value) => value.trim()),
  emailProvider: process.env.EMAIL_PROVIDER ?? 'development',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUsername: process.env.SMTP_USERNAME,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM,
  smtpEhloName: process.env.SMTP_EHLO_NAME ?? 'silver-gallery.local',
  smtpAllowInvalidCertificates: process.env.SMTP_ALLOW_INVALID_CERTIFICATES === 'true',
  smsProvider: process.env.SMS_PROVIDER ?? 'development',
  kavenegarApiKey: process.env.KAVENEGAR_API_KEY,
  kavenegarSender: process.env.KAVENEGAR_SENDER,
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 120),
  otpRetryAfterSeconds: Number(process.env.OTP_RETRY_AFTER_SECONDS ?? 60),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  otpDevelopmentCode: process.env.OTP_DEVELOPMENT_CODE,
  ga4MeasurementId: process.env.GA4_MEASUREMENT_ID,
  ga4ApiSecret: process.env.GA4_API_SECRET,
  features: {
    media: process.env.FEATURE_MEDIA_ENABLED !== 'false',
    notifications: process.env.FEATURE_NOTIFICATIONS_ENABLED !== 'false',
    reports: process.env.FEATURE_REPORTS_ENABLED !== 'false',
  },
  mediaStorageDriver: process.env.MEDIA_STORAGE_DRIVER ?? 'local',
  mediaLocalRoot: process.env.MEDIA_LOCAL_ROOT ?? 'storage/media',
  mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL ?? '/media',
  mediaMaxUploadBytes: Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  mediaS3Bucket: process.env.MEDIA_S3_BUCKET,
  mediaS3Region: process.env.MEDIA_S3_REGION ?? 'us-east-1',
  mediaS3Endpoint: process.env.MEDIA_S3_ENDPOINT,
  mediaS3AccessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID,
  mediaS3SecretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  mediaS3PublicBaseUrl: process.env.MEDIA_S3_PUBLIC_BASE_URL,
  mediaS3ForcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === 'true',
}));
