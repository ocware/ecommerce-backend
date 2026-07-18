import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.JWT_SECRET,
  shopName: process.env.SHOP_NAME ?? 'Example Store',
  currency: process.env.CURRENCY ?? 'IRR',
}));
