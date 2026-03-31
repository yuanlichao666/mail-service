import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class MailboxJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('需要邮箱 JWT');
    }
    const token = auth.slice(7).trim();
    try {
      const payload = this.jwt.verify(token) as { sub: string; typ?: string };
      if (payload.typ !== 'mailbox' || !payload.sub) {
        throw new UnauthorizedException('无效的邮箱令牌');
      }
      (req as Request & { mailbox: string }).mailbox = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('无效的邮箱令牌');
    }
  }
}
