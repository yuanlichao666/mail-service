import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MailboxJwtGuard } from './guards/mailbox-jwt.guard';
import { DuckmailService } from './duckmail.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { TokenDto } from './dto/token.dto';

@Controller()
export class DuckmailController {
  constructor(private readonly duckmail: DuckmailService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'mail-service' };
  }

  @Get('domains')
  domains(@Headers('authorization') authorization?: string) {
    return this.duckmail.listDomains(authorization);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  async accounts(
    @Body() dto: CreateAccountDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.duckmail.createAccount(dto, authorization);
    return {};
  }

  @Post('token')
  async token(@Body() dto: TokenDto) {
    return this.duckmail.issueToken(dto.address, dto.password);
  }

  @Get('messages')
  @UseGuards(MailboxJwtGuard)
  messages(@Req() req: Request & { mailbox: string }) {
    return this.duckmail.listMessages(req.mailbox);
  }

  @Get('messages/:id')
  @UseGuards(MailboxJwtGuard)
  oneMessage(
    @Req() req: Request & { mailbox: string },
    @Param('id') id: string,
  ) {
    return this.duckmail.getMessage(req.mailbox, id);
  }
}
