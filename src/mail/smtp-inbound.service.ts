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
    const log = this.logger;
    this.server = new SMTPServer({
      authOptional: true,
      // 未配置 key/cert 时勿宣告 STARTTLS，否则公网 MTA 升级 TLS 会因自签/无证书触发 bad certificate 并可能拖垮进程
      disabledCommands: ['AUTH', 'STARTTLS'],
      size: 25 * 1024 * 1024,
      onConnect(session, callback) {
        // 公网收信排错：若长时间无此日志，多为 DNS/25 端口/云厂商策略，而非应用层
        log.log(
          `SMTP 入站连接 ${session.remoteAddress ?? 'unknown'} -> :${port}`,
        );
        callback();
      },
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
            this.logger.log(
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

    this.server.on('error', (err: Error & { remoteAddress?: string }) => {
      this.logger.warn(
        `SMTP 会话异常${err.remoteAddress ? ` ${err.remoteAddress}` : ''}: ${err.message}`,
      );
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
