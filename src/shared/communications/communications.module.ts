import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DevelopmentSmsProvider } from './development-sms.provider';
import { KavenegarSmsProvider } from './kavenegar-sms.provider';
import { SMS_PROVIDER } from './sms-provider';

@Global()
@Module({
  providers: [
    DevelopmentSmsProvider,
    KavenegarSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevelopmentSmsProvider, KavenegarSmsProvider],
      useFactory: (
        config: ConfigService,
        development: DevelopmentSmsProvider,
        kavenegar: KavenegarSmsProvider,
      ) => {
        const provider = config.get<string>('app.smsProvider', 'development');
        if (provider === 'development') return development;
        if (provider === 'kavenegar') return kavenegar;
        throw new Error(`Unsupported SMS provider: ${provider}`);
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class CommunicationsModule {}
