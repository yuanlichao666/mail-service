/**
 * DuckMail 兼容 HTTP API 测试（/health、/domains、/accounts、/token、/messages）
 * 依赖：服务已启动，config/config.yaml 已配置。
 * 运行：npm run test:duckmail
 */
const { loadTestConfig } = require('./load-test-config.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

async function main() {
  const { base, apiKey, domain } = loadTestConfig();
  assert(apiKey, 'duckmailApiKey 不能为空（config 或 MAIL_SERVICE_API_KEY）');

  console.log('[duckmail-api] GET /health');
  let r = await fetch(`${base}/health`);
  assert(r.ok, `health ${r.status}`);
  const health = await r.json();
  assert(health.status === 'ok', 'health.status');

  console.log('[duckmail-api] GET /domains (Bearer)');
  r = await fetch(`${base}/domains`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  let raw = await r.text();
  assert(r.ok, `domains ${r.status} ${raw}`);
  const domRes = JSON.parse(raw);
  const members = domRes['hydra:member'] || [];
  assert(Array.isArray(members), 'hydra:member 应为数组');
  const found = members.some((d) => d.domain === domain && d.isVerified);
  assert(found, `带 Key 的 /domains 应包含已验证域名: ${domain}`);

  const local = `t${Date.now().toString(36)}`;
  const address = `${local}@${domain}`;
  const password = 'TestPass1234!';

  console.log('[duckmail-api] POST /accounts');
  r = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      address,
      password,
      expiresIn: 86400,
    }),
  });
  raw = await r.text();
  assert(r.status === 201 || r.status === 200, `accounts ${r.status} ${raw}`);

  console.log('[duckmail-api] POST /token');
  r = await fetch(`${base}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ address, password }),
  });
  raw = await r.text();
  assert(r.ok, `token ${r.status} ${raw}`);
  const tok = JSON.parse(raw);
  assert(tok.token && typeof tok.token === 'string', '响应应有 token');

  const jwt = tok.token;

  console.log('[duckmail-api] GET /messages');
  r = await fetch(`${base}/messages`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
  });
  assert(r.ok, `messages ${r.status}`);
  const msgList = await r.json();
  const hydra = msgList['hydra:member'] || [];
  assert(Array.isArray(hydra), 'messages hydra:member');

  console.log('[duckmail-api] GET /messages/:id (应 404)');
  r = await fetch(`${base}/messages/00000000-0000-0000-0000-000000000000`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
  });
  assert(r.status === 404, `应 404，实际 ${r.status}`);

  console.log('[duckmail-api] 全部通过');
}

main().catch((e) => {
  console.error('[duckmail-api] 失败:', e.message || e);
  process.exit(1);
});
