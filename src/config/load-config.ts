import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import type { MailServiceConfig } from './config.types';

export function loadMailConfig(): MailServiceConfig {
  const path =
    process.env.CONFIG_PATH ||
    join(process.cwd(), 'config', 'config.yaml');
  if (!existsSync(path)) {
    throw new Error(
      `配置文件不存在: ${path}。请复制 config/config.example.yaml 为 config/config.yaml 并修改。`,
    );
  }
  const raw = readFileSync(path, 'utf8');
  const data = yaml.load(raw) as MailServiceConfig;
  if (!data?.jwtSecret || !data?.domains?.length) {
    throw new Error('配置无效: 至少需要 jwtSecret 与 domains');
  }
  return data;
}
