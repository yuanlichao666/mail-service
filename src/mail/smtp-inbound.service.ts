import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { simpleParser } from 'mailparser';
import { SMTPServer, SMTPServerSession } from 'smtp-server';
import type { MailServiceConfig } from '../config/config.types';
import { MailStorageService } from './mail-storage.service';

@Injectable()
export class SmtpInboundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmtpInboundService.name);
  private server: SMTPServer | null = null;

  constructor(
    private readonly config: ConfigService<MailServiceConfig>,
    private readonly mailStorage: MailStorageService,
  ) {}

  onModuleInit() {
    const port = this.config.get('smtpPort', { infer: true }) as number;
    this.server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['AUTH'],
      size: 25 * 1024 * 1024,
      onMailFrom(address, session, callback) {
        callback();
      },
      onRcptTo: (address, session, callback) => {
        const email = this.mailStorage.normalizeEmail(address.address);
        if (this.mailStorage.hasAccount(email)) {
          callback();
        } else {
          callback(
            new Error(
              `550 收件人未在本服务注册: ${email}`,
            ) as NodeJS.ErrnoException,
          );
        }
      },
      onData: (stream, session: SMTPServerSession, callback) => {
        simpleParser(stream)
          .then((parsed) => {
            const rcpt = session.envelope.rcptTo || [];
            const addrs = rcpt.map((r) => r.address);
            this.mailStorage.appendParsedMail(addrs, parsed);
            this.logger.debug(
              `收到邮件 -> ${addrs.join(', ')} 主题: ${parsed.subject || ''}`,
            );
            callback();
          })
          .catch((err) => {
            this.logger.warn(`解析邮件失败: ${err}`);
            callback(err as Error);
          });
      },
    });

    this.server.listen(port, () => {
      this.logger.log(`入站 SMTP 已监听 :${port}`);
    });
  }

  onModuleDestroy() {
    if (this.server) {
      this.server.close(() => {
        this.logger.log('SMTP 已关闭');
      });
    }
  }
}
