/**
 * SMTP 入站测试：向当前目标主机的 SMTP 端口投递邮件，再用 JWT 拉取校验。
 * TEST_TARGET=local 测本机；TEST_TARGET=remote 从本机连线上 SMTP（须放行安全组）。
 * 运行：npm run test:smtp:local | test:smtp:remote
 */
const nodemailer = require('nodemailer');
const { loadTestConfig } = require('./load-test-config.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { base, apiKey, domain, smtpHost, smtpPort } = loadTestConfig();
  assert(apiKey, 'duckmailApiKey 不能为空');

  const local = `s${Date.now().toString(36)}`;
  const address = `${local}@${domain}`;
  const password = 'SmtpTestPass1234!';

  console.log('[smtp-inbound] 创建邮箱账户', address);
  let r = await fetch(`${base}/accounts`, {
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
  assert(r.status === 201 || r.status === 200, `accounts ${r.status} ${await r.text()}`);

  r = await fetch(`${base}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ address, password }),
  });
  assert(r.ok, `token ${r.status}`);
  const { token: jwt } = await r.json();

  const subject = 'SMTP inbound test ' + Date.now();
  const textBody = 'Hello from nodemailer test. Code 123456';

  console.log(`[smtp-inbound] SMTP 投递 -> ${smtpHost}:${smtpPort} -> ${address}`);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: false,
    tls: { rejectUnauthorized: false },
    // 无 AUTH（与 smtp-inbound 的 authOptional / AUTH 禁用一致）
  });

  await transporter.sendMail({
    from: '"Tester" <sender@external.test>',
    to: address,
    subject,
    text: textBody,
  });

  let id = null;
  for (let i = 0; i < 40; i++) {
    r = await fetch(`${base}/messages`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
    });
    assert(r.ok, `messages ${r.status}`);
    const body = await r.json();
    const members = body['hydra:member'] || [];
    if (members.length > 0) {
      id = members[0].id;
      break;
    }
    await sleep(250);
  }
  assert(id, '轮询 /messages 后应收到至少一封邮件');

  console.log('[smtp-inbound] GET /messages/:id', id);
  r = await fetch(`${base}/messages/${id}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
  });
  assert(r.ok, `message detail ${r.status}`);
  const msg = await r.json();
  assert(msg.subject === subject, `subject 不匹配: ${msg.subject}`);
  assert(
    String(msg.text || '').includes('123456') ||
      String(msg.intro || '').includes('123456'),
    '正文或 intro 应包含验证码片段',
  );

  console.log('[smtp-inbound] 全部通过');
}

main().catch((e) => {
  console.error('[smtp-inbound] 失败:', e.message || e);
  process.exit(1);
});
