import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadMailConfig } from './config/load-config';
import { DuckmailModule } from './duckmail/duckmail.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => loadMailConfig()],
    }),
    MailModule,
    DuckmailModule,
  ],
})
export class AppModule {}
