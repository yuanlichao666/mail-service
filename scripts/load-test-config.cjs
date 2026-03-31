/**
 * 测试目标（二选一，必须明确）：
 * - local：在你当前这台机器上，测「本机运行的 mail-service」（127.0.0.1 + config / .env 端口）
 * - remote：在你当前这台机器上，测「已部署在公网服务器上的服务」（默认 47.253.177.201）
 *
 * 设置方式：环境变量 TEST_TARGET=local | remote（remote 可写为 server）
 * 或使用 npm：npm run test:mail:local / npm run test:mail:remote
 *
 * 兼容：MAIL_SERVICE_USE_LOCAL=1 等价于 TEST_TARGET=local
 *
 * 覆盖项：MAIL_SERVICE_BASE、MAIL_REMOTE_BASE、MAIL_REMOTE_SMTP_HOST、MAIL_REMOTE_SMTP_PORT（remote 默认 SMTP 端口，不设则为 25）、
 * MAIL_SERVICE_HOST_PORT、MAIL_SERVICE_API_KEY、MAIL_TEST_DOMAIN、SMTP_TEST_HOST、SMTP_TEST_PORT、CONFIG_PATH
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** 本地测「线上」时的默认公网入口（HTTP 非 :80，一般为 docker 映射端口） */
const DEFAULT_REMOTE_HTTP_BASE = 'http://47.253.177.201:3001';
const DEFAULT_REMOTE_SMTP_HOST = '47.253.177.201';
/** 从公网测 SMTP 入站：通常只放行标准 25（与容器内 2525 的映射一致）；未开放 2525 时用 25 */
const DEFAULT_REMOTE_SMTP_PORT = 25;

/** 与 docker-compose 中 ${HTTP_PORT:-3000} 对齐：在服务器上跑 test:mail:local 时用宿主机端口 */
function readHttpHostPortFromDotEnv() {
  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return null;
  const m = fs.readFileSync(envFile, 'utf8').match(/^\s*HTTP_PORT\s*=\s*(\d+)/m);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * @returns {'local' | 'remote'}
 */
function resolveTestTarget() {
  const raw = (process.env.TEST_TARGET || '').trim().toLowerCase();
  if (process.env.MAIL_SERVICE_USE_LOCAL === '1') {
    return 'local';
  }
  if (raw === 'local' || raw === 'l') return 'local';
  if (raw === 'remote' || raw === 'server' || raw === 'r') return 'remote';
  throw new Error(
    '必须指定测试目标：在本机测本机服务请设 TEST_TARGET=local；在本机测线上服务请设 TEST_TARGET=remote。\n' +
      '也可直接执行：npm run test:mail:local  或  npm run test:mail:remote',
  );
}

function loadTestConfig() {
  const mode = resolveTestTarget();
  const useLocal = mode === 'local';

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

  const remoteHttpBase =
    (process.env.MAIL_REMOTE_BASE || DEFAULT_REMOTE_HTTP_BASE).replace(
      /\/$/,
      '',
    );
  const remoteSmtpHost =
    process.env.MAIL_REMOTE_SMTP_HOST || DEFAULT_REMOTE_SMTP_HOST;

  const localHttpPort =
    process.env.MAIL_SERVICE_HOST_PORT != null &&
    process.env.MAIL_SERVICE_HOST_PORT !== ''
      ? Number(process.env.MAIL_SERVICE_HOST_PORT)
      : readHttpHostPortFromDotEnv() ?? httpPort;

  let base =
    process.env.MAIL_SERVICE_BASE ||
    (useLocal
      ? `http://127.0.0.1:${localHttpPort}`
      : remoteHttpBase);

  let smtpHost =
    process.env.SMTP_TEST_HOST ||
    (useLocal ? '127.0.0.1' : remoteSmtpHost);

  const remoteSmtpPortDefault =
    process.env.MAIL_REMOTE_SMTP_PORT != null &&
    process.env.MAIL_REMOTE_SMTP_PORT !== ''
      ? Number(process.env.MAIL_REMOTE_SMTP_PORT)
      : DEFAULT_REMOTE_SMTP_PORT;

  let smtpPort = process.env.SMTP_TEST_PORT
    ? Number(process.env.SMTP_TEST_PORT)
    : useLocal
      ? cfgSmtpPort
      : remoteSmtpPortDefault;

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
    testTarget: mode,
  };
}

module.exports = { loadTestConfig, resolveTestTarget };
