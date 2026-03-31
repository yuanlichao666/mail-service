import { Module } from '@nestjs/common';
import { MailStorageService } from './mail-storage.service';
import { SmtpInboundService } from './smtp-inbound.service';

@Module({
  providers: [MailStorageService, SmtpInboundService],
  exports: [MailStorageService],
})
export class MailModule {}
