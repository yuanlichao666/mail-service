/**
 * 测试脚本共用：从 config/config.yaml 读取 duckmailApiKey、首个 domain 等。
 *
 * 默认连线上部署（与 http://47.253.177.201/ 的 Apache :80 无关，DuckMail API 在 :3001）。
 * 测本机：TEST_TARGET=local 或 MAIL_SERVICE_BASE=http://127.0.0.1:3000
 *
 * 覆盖项：MAIL_SERVICE_BASE、MAIL_SERVICE_API_KEY、MAIL_TEST_DOMAIN、
 * SMTP_TEST_HOST、SMTP_TEST_PORT、CONFIG_PATH
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** 线上：容器 HTTP 映射为宿主机 3001 */
const DEFAULT_REMOTE_HTTP_BASE = 'http://47.253.177.201:3001';
const DEFAULT_REMOTE_SMTP_HOST = '47.253.177.201';
/** 线上 SMTP：宿主机 2525/25 均映射到容器入站 SMTP */
const DEFAULT_REMOTE_SMTP_PORT = 2525;

function loadTestConfig() {
  const configPath =
    process.env.CONFIG_PATH ||
    path.join(process.cwd(), 'config', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `缺少配置文件: ${configPath}。请执行: cp config/config.example.yaml config/config.yaml`,
    );
  }
  const c = yaml.load(fs.readFileSync(configPath, 'utf8'));
  const httpPort = c.httpPort ?? 3000;
  const cfgSmtpPort = c.smtpPort ?? 2525;

  const useLocal =
    process.env.TEST_TARGET === 'local' ||
    process.env.MAIL_SERVICE_USE_LOCAL === '1';

  let base =
    process.env.MAIL_SERVICE_BASE ||
    (useLocal ? `http://127.0.0.1:${httpPort}` : DEFAULT_REMOTE_HTTP_BASE);

  let smtpHost =
    process.env.SMTP_TEST_HOST ||
    (useLocal ? '127.0.0.1' : DEFAULT_REMOTE_SMTP_HOST);

  let smtpPort = process.env.SMTP_TEST_PORT
    ? Number(process.env.SMTP_TEST_PORT)
    : useLocal
      ? cfgSmtpPort
      : DEFAULT_REMOTE_SMTP_PORT;

  const apiKey =
    process.env.MAIL_SERVICE_API_KEY || c.duckmailApiKey || '';
  const domain =
    process.env.MAIL_TEST_DOMAIN || c.domains?.[0]?.domain;
  if (!domain) {
    throw new Error('config.yaml 中 domains 不能为空');
  }
  return {
    base: base.replace(/\/$/, ''),
    apiKey,
    domain,
    smtpHost,
    smtpPort,
  };
}

module.exports = { loadTestConfig };
