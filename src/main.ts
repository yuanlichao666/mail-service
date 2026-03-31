import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { MailServiceConfig } from './config/config.types';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const config = app.get(ConfigService<MailServiceConfig>);
  const port = config.get('httpPort', { infer: true }) ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HTTP (DuckMail API) 监听 http://0.0.0.0:${port}`);
}

bootstrap();
