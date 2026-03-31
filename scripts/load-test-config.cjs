/**
 * 测试脚本共用：从 config/config.yaml 读取 duckmailApiKey、首个 domain 等。
 *
 * 默认连线上部署（与 http://47.253.177.201/ 的 Apache :80 无关，DuckMail API 在 :3001）。
 * 测本机：TEST_TARGET=local 或 MAIL_SERVICE_BASE=http://127.0.0.1:3000
 *
 * 覆盖项：MAIL_SERVICE_BASE、MAIL_SERVICE_HOST_PORT（本机测试时覆盖 HTTP 宿主机端口）、
 * MAIL_SERVICE_API_KEY、MAIL_TEST_DOMAIN、SMTP_TEST_HOST、SMTP_TEST_PORT、CONFIG_PATH
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** 线上：容器 HTTP 映射为宿主机 3001 */
const DEFAULT_REMOTE_HTTP_BASE = 'http://47.253.177.201:3001';
const DEFAULT_REMOTE_SMTP_HOST = '47.253.177.201';
/** 线上 SMTP：宿主机 2525/25 均映射到容器入站 SMTP */
const DEFAULT_REMOTE_SMTP_PORT = 2525;

/** 与 docker-compose 中 ${HTTP_PORT:-3000} 对齐：宿主机映射端口，用于在服务器上跑 TEST_TARGET=local */
function readHttpHostPortFromDotEnv() {
  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return null;
  const m = fs.readFileSync(envFile, 'utf8').match(/^\s*HTTP_PORT\s*=\s*(\d+)/m);
  return m ? parseInt(m[1], 10) : null;
}

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

  const localHttpPort =
    process.env.MAIL_SERVICE_HOST_PORT != null &&
    process.env.MAIL_SERVICE_HOST_PORT !== ''
      ? Number(process.env.MAIL_SERVICE_HOST_PORT)
      : readHttpHostPortFromDotEnv() ?? httpPort;

  let base =
    process.env.MAIL_SERVICE_BASE ||
    (useLocal
      ? `http://127.0.0.1:${localHttpPort}`
      : DEFAULT_REMOTE_HTTP_BASE);

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
