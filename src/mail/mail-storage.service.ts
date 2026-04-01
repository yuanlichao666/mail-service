import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { AddressObject, ParsedMail } from 'mailparser';

export interface StoredMessage {
  id: string;
  accountAddress: string;
  from: { address: string; name?: string };
  subject: string;
  intro: string;
  text: string;
  html: string | string[];
  receivedAt: number;
}

interface AccountRecord {
  address: string;
  passwordHash: string;
  expiresAt: number;
}

@Injectable()
export class MailStorageService {
  private readonly logger = new Logger(MailStorageService.name);
  private accounts = new Map<string, AccountRecord>();
  private messages = new Map<string, StoredMessage[]>();

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async createAccount(
    address: string,
    password: string,
    expiresInSec?: number,
  ): Promise<void> {
    const key = this.normalizeEmail(address);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt =
      expiresInSec && expiresInSec > 0
        ? Date.now() + expiresInSec * 1000
        : 0;
    this.accounts.set(key, { address: key, passwordHash, expiresAt });
    if (!this.messages.has(key)) {
      this.messages.set(key, []);
    }
  }

  hasAccount(address: string): boolean {
    const key = this.normalizeEmail(address);
    const acc = this.accounts.get(key);
    if (!acc) return false;
    if (acc.expiresAt > 0 && Date.now() > acc.expiresAt) {
      return false;
    }
    return true;
  }

  async verifyCredentials(
    address: string,
    password: string,
  ): Promise<boolean> {
    const key = this.normalizeEmail(address);
    const acc = this.accounts.get(key);
    if (!acc) return false;
    if (acc.expiresAt > 0 && Date.now() > acc.expiresAt) {
      return false;
    }
    return bcrypt.compare(password, acc.passwordHash);
  }

  appendParsedMail(
    toAddresses: string[],
    parsed: ParsedMail,
  ): void {
    const fromAddr = this.extractFrom(parsed);
    const subject = parsed.subject || '';
    const text = parsed.text || '';
    const htmlRaw = parsed.html;
    let html: string | string[];
    if (typeof htmlRaw === 'string') {
      html = htmlRaw;
    } else if (htmlRaw === false || htmlRaw == null) {
      html = '';
    } else {
      html = '';
    }
    const intro = (text || subject).slice(0, 200);

    for (const rawTo of toAddresses) {
      const to = this.normalizeEmail(rawTo);
      if (!this.hasAccount(to)) continue;
      const list = this.messages.get(to) || [];
      const msg: StoredMessage = {
        id: randomUUID(),
        accountAddress: to,
        from: fromAddr,
        subject,
        intro,
        text,
        html,
        receivedAt: Date.now(),
      };
      list.push(msg);
      this.messages.set(to, list);
      this.logger.log(
        `[SMTP 入库] to=${to} id=${msg.id} receivedAt=${new Date(msg.receivedAt).toISOString()} from=${fromAddr.address || '?'} subject=${truncateLog(subject, 100)}`,
      );
      const bodyLog = bodyForSmtpLog(msg);
      this.logger.log(`[SMTP 正文] id=${msg.id} to=${to} ${bodyLog}`);
    }
  }

  /** 供读信 API 与排错日志使用（按入库顺序，即时间序） */
  getMailboxMessages(mailbox: string): readonly StoredMessage[] {
    const key = this.normalizeEmail(mailbox);
    return this.messages.get(key) || [];
  }

  private extractFrom(parsed: ParsedMail): { address: string; name?: string } {
    const from = parsed.from;
    if (!from) {
      return { address: '' };
    }
    if (Array.isArray(from)) {
      const first = from[0] as AddressObject | undefined;
      return this.addrObj(first);
    }
    return this.addrObj(from as AddressObject);
  }

  private addrObj(o?: AddressObject): { address: string; name?: string } {
    if (!o?.value?.length) {
      return { address: '' };
    }
    const v = o.value[0];
    return {
      address: (v.address || '').toLowerCase(),
      name: v.name,
    };
  }

  listMessageIds(mailbox: string): { id: string }[] {
    const list = this.getMailboxMessages(mailbox);
    return list.map((m) => ({ id: m.id }));
  }

  getMessage(mailbox: string, id: string): StoredMessage | undefined {
    const list = this.getMailboxMessages(mailbox);
    return list.find((m) => m.id === id);
  }
}

function truncateLog(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** 入库日志用：优先纯文本，否则 HTML，再否则 intro；统一截断避免撑爆日志 */
function bodyForSmtpLog(msg: StoredMessage): string {
  const t = msg.text?.trim();
  if (t) return truncateLog(t, 3000);
  const h = msg.html;
  if (typeof h === 'string' && h.trim()) return truncateLog(h, 3000);
  return truncateLog(msg.intro, 500) || '(empty)';
}
