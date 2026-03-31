import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { MailServiceConfig } from '../config/config.types';
import { MailModule } from '../mail/mail.module';
import { DuckmailController } from './duckmail.controller';
import { DuckmailService } from './duckmail.service';
import { MailboxJwtGuard } from './guards/mailbox-jwt.guard';

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<MailServiceConfig>) => ({
        secret: config.getOrThrow('jwtSecret'),
        signOptions: {
          expiresIn: config.get('jwtExpiresIn') || '7d',
        },
      }),
    }),
  ],
  controllers: [DuckmailController],
  providers: [DuckmailService, MailboxJwtGuard],
})
export class DuckmailModule {}
