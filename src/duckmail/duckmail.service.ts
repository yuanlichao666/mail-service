import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { MailServiceConfig, DomainEntry } from '../config/config.types';
import { MailStorageService } from '../mail/mail-storage.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class DuckmailService {
  private readonly logger = new Logger(DuckmailService.name);

  constructor(
    private readonly config: ConfigService<MailServiceConfig>,
    private readonly mailStorage: MailStorageService,
    private readonly jwt: JwtService,
  ) {}

  private get apiKey(): string {
    return this.config.get('duckmailApiKey', { infer: true }) || '';
  }

  private extractBearer(auth?: string): string | undefined {
    if (!auth?.startsWith('Bearer ')) return undefined;
    return auth.slice(7).trim();
  }

  /** GET /domains */
  listDomains(authHeader?: string) {
    const bearer = this.extractBearer(authHeader);
    const domains = this.config.get('domains', { infer: true }) as DomainEntry[];

    if (bearer !== undefined && bearer.length > 0) {
      if (!this.apiKey || bearer !== this.apiKey) {
        throw new UnauthorizedException('DuckMail API Key 无效');
      }
      const member = domains
        .filter((d) => d.isVerified)
        .map((d) => ({
          domain: d.domain,
          isVerified: d.isVerified,
          isActive: d.isActive,
          isPrivate: d.isPrivate,
        }));
      return { 'hydra:member': member };
    }

    const member = domains
      .filter((d) => d.domain && d.isActive && !d.isPrivate)
      .map((d) => ({
        domain: d.domain,
        isVerified: d.isVerified,
        isActive: d.isActive,
        isPrivate: d.isPrivate,
      }));
    return { 'hydra:member': member };
  }

  /** POST /accounts */
  async createAccount(dto: CreateAccountDto, authHeader?: string) {
    const domain = dto.address.split('@')[1]?.toLowerCase();
    if (!domain) {
      throw new BadRequestException('无效邮箱');
    }

    const domains = this.config.get('domains', { infer: true }) as DomainEntry[];
    const entry = domains.find((d) => d.domain.toLowerCase() === domain);
    if (!entry) {
      throw new BadRequestException('域名未在本服务配置中');
    }

    const bearer = this.extractBearer(authHeader);

    if (this.apiKey && bearer === this.apiKey) {
      if (!entry.isVerified) {
        throw new BadRequestException('该域名未验证，不能使用 API Key 模式创建');
      }
    } else if (this.apiKey && bearer && bearer !== this.apiKey) {
      throw new UnauthorizedException('DuckMail API Key 无效');
    } else {
      if (!entry.isActive || entry.isPrivate) {
        throw new BadRequestException('该域名不允许公共注册');
      }
    }

    if (this.mailStorage.hasAccount(dto.address)) {
      throw new ConflictException('邮箱已存在');
    }

    await this.mailStorage.createAccount(
      dto.address,
      dto.password,
      dto.expiresIn,
    );
    return { created: true };
  }

  /** POST /token */
  async issueToken(address: string, password: string) {
    const ok = await this.mailStorage.verifyCredentials(address, password);
    if (!ok) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    const token = this.jwt.sign({
      sub: this.mailStorage.normalizeEmail(address),
      typ: 'mailbox',
    });
    return { token };
  }

  /** GET /messages */
  listMessages(mailbox: string, clientTrace?: string) {
    const rows = this.mailStorage.getMailboxMessages(mailbox);
    // receivedAt：毫秒时间戳，便于客户端按「最新一封」选 OTP，避免登录阶段误用注册邮件里的旧码
    const ids = rows.map((m) => ({
      id: m.id,
      receivedAt: m.receivedAt,
    }));
    // 排错 wrong_email_otp：若邮箱内多封含验证码，客户端可能取了旧 id；看 receivedAt / 顺序
    const summary = rows
      .map(
        (m) =>
          `${m.id.slice(0, 8)}…@${new Date(m.receivedAt).toISOString()} "${truncateSubject(m.subject, 60)}"`,
      )
      .join(' | ');
    const tracePrefix =
      clientTrace && clientTrace.trim().length > 0
        ? `[trace=${truncateSubject(clientTrace, 120)}] `
        : '';
    this.logger.log(
      `${tracePrefix}[GET /messages] mailbox=${mailbox} count=${rows.length}${summary ? ` → ${summary}` : ''}`,
    );
    return { 'hydra:member': ids };
  }

  /** GET /messages/:id */
  getMessage(mailbox: string, id: string, clientTrace?: string) {
    const msg = this.mailStorage.getMessage(mailbox, id);
    if (!msg) {
      throw new NotFoundException('邮件不存在');
    }
    const tracePrefix =
      clientTrace && clientTrace.trim().length > 0
        ? `[trace=${truncateSubject(clientTrace, 120)}] `
        : '';
    this.logger.log(
      `${tracePrefix}[GET /messages/:id] mailbox=${mailbox} id=${id} receivedAt=${new Date(msg.receivedAt).toISOString()} subject="${truncateSubject(msg.subject, 80)}" from=${msg.from.address || '?'}`,
    );
    return {
      id: msg.id,
      from: { address: msg.from.address, ...(msg.from.name ? { name: msg.from.name } : {}) },
      subject: msg.subject,
      intro: msg.intro,
      text: msg.text,
      html: msg.html,
    };
  }
}

function truncateSubject(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
