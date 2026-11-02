/* 拾一的家居工作台 · 本地服务：静态页面 + 邮箱验证码接口 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const http = require('http');
const express = require('express');
const nodemailer = require('nodemailer');

// Fly.io / Railway / Render 都要求监听 8080；本地开发默认 8771
const IS_CLOUD = !!(process.env.FLY_APP_NAME || process.env.RAILWAY_STATIC_URL || process.env.RENDER);
const PORT = Number(process.env.PORT) || (IS_CLOUD || process.env.NODE_ENV === 'production' ? 8080 : 8771);

// 持久化数据目录：云平台用 /data（需要挂载 Volume），本地用 ./data/sync
const SYNC_DIR = path.resolve(
  process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'sync')
    : (IS_CLOUD
        ? '/data/sync'
        : path.join(__dirname, 'data', 'sync'))
);
const IS_RAILWAY = !!process.env.RAILWAY_STATIC_URL;
console.log(`数据目录：${SYNC_DIR}${IS_RAILWAY ? '（Railway Persistent Volume，服务重启后保留）' : IS_CLOUD ? '（云平台，建议挂载持久卷到 /data）' : ''}`);
const SYNC_LEGACY_RE = /^[A-Za-z0-9_-]{3,32}$/;
const DATA_KEYS = ['ideas', 'notes', 'samples', 'scenes', 'assets', 'deals', 'lessons', 'finance', 'todos'];

const CODE_TTL = 5 * 60 * 1000;        // 验证码 5 分钟有效
const RESEND_COOLDOWN = 60 * 1000;     // 同一邮箱 60 秒内不可重复发送
const MAX_ATTEMPTS = 5;                // 单个验证码最多尝试 5 次
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const smtpUser = (process.env.SMTP_USER || '').trim();
const smtpPass = (process.env.SMTP_PASS || '').trim();
const smtpHost = process.env.SMTP_HOST || 'smtp.qq.com';
const smtpPort = Number(process.env.SMTP_PORT) || 465;
const fromName = process.env.SMTP_FROM_NAME || '拾一的家居工作台';
const configured = !!(smtpUser && smtpPass);

let mailer = null;
let mailerReady = null;

/* 本机无法直连 SMTP 时，可借助系统 HTTP 代理的 CONNECT 隧道（仅监听 127.0.0.1） */
function startSmtpForwarder(proxyUrl, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl);
    const srv = net.createServer(client => {
      const req = http.request({
        host: proxy.hostname,
        port: Number(proxy.port) || 80,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: { Host: `${targetHost}:${targetPort}` },
        agent: false
      });
      req.on('connect', (res, socket) => {
        if (res.statusCode !== 200) { client.destroy(); return; }
        client.pipe(socket).pipe(client);
      });
      req.on('error', () => client.destroy());
      req.end();
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

async function setupMailer() {
  if (!configured) return null;
  let target = { host: smtpHost, port: smtpPort, tls: {} };
  const proxyUrl = process.env.SMTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl && /^https?:\/\//.test(proxyUrl)) {
    try {
      const localPort = await startSmtpForwarder(proxyUrl, smtpHost, smtpPort);
      target = { host: '127.0.0.1', port: localPort, tls: { servername: smtpHost } };
      console.log(`SMTP 经代理 ${proxyUrl} 连接 ${smtpHost}:${smtpPort}`);
    } catch (err) {
      console.error('代理隧道启动失败，改用直连：', err.message);
    }
  }
  mailer = nodemailer.createTransport({
    host: target.host,
    port: target.port,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: target.tls,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  });
  return mailer;
}

function getMailer() {
  if (!mailerReady) mailerReady = setupMailer();
  return mailerReady;
}

/** email -> { code, expiresAt, attempts, sentAt } */
const codes = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of codes) {
    if (now > entry.expiresAt) codes.delete(key);
  }
}, 60 * 1000).unref();

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  if (/^\/(node_modules|data|server\.js|package(-lock)?\.json|\.env)/.test(req.path)) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(path.join(__dirname)));

app.get('/api/status', (req, res) => {
  res.json({ ok: true, mailConfigured: configured, host: smtpHost, port: smtpPort });
});

app.post('/api/send-code', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, msg: '请填写有效的邮箱地址' });
  }
  if (!configured) {
    return res.status(503).json({ ok: false, msg: '邮件服务未配置，请在 .env 中填写 SMTP_USER 与 SMTP_PASS' });
  }
  const prev = codes.get(email);
  if (prev && Date.now() - prev.sentAt < RESEND_COOLDOWN) {
    const wait = Math.ceil((RESEND_COOLDOWN - (Date.now() - prev.sentAt)) / 1000);
    return res.status(429).json({ ok: false, msg: `发送太频繁，请 ${wait} 秒后再试` });
  }

  const code = randomCode();
  codes.set(email, { code, expiresAt: Date.now() + CODE_TTL, attempts: 0, sentAt: Date.now() });

  try {
    const transport = await getMailer();
    await transport.sendMail({
      from: `"${fromName}" <${smtpUser}>`,
      to: email,
      subject: '拾一的工作台 · 邮箱验证码',
      text: `你的验证码是 ${code}，5 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
      html: `<div style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:480px;margin:0 auto;padding:28px;background:#F7F5F1;border:1px solid #E9E4DB;border-radius:14px;color:#2B2926">
        <p style="font-size:13px;color:#8A8378;margin:0 0 14px">拾一的家居工作台</p>
        <h2 style="font-size:18px;margin:0 0 10px">邮箱验证码</h2>
        <p style="font-size:13px;color:#6F6A62;margin:0 0 18px">请把下面的验证码填回注册页面，5 分钟内有效。</p>
        <div style="font-size:30px;letter-spacing:8px;font-weight:700;background:#fff;border:1px solid #E9E4DB;border-radius:12px;padding:16px;text-align:center;color:#A9825F">${code}</div>
        <p style="font-size:12px;color:#8A8378;margin:18px 0 0">如果不是你本人操作，忽略即可；此验证码不会被其他人使用。</p>
      </div>`
    });
  } catch (err) {
    console.error('[send-code] 发信失败:', err.message);
    codes.delete(email);
    return res.status(502).json({ ok: false, msg: '验证码邮件发送失败，请检查 SMTP 配置后重试' });
  }

  res.json({ ok: true, msg: `验证码已发送至 ${email}，5 分钟内有效` });
});

app.post('/api/verify-code', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();
  if (!EMAIL_RE.test(email) || !code) {
    return res.status(400).json({ ok: false, msg: '请填写邮箱和验证码' });
  }
  const entry = codes.get(email);
  if (!entry) return res.status(400).json({ ok: false, msg: '请先获取验证码' });
  if (Date.now() > entry.expiresAt) {
    codes.delete(email);
    return res.status(400).json({ ok: false, msg: '验证码已过期，请重新发送' });
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    codes.delete(email);
    return res.status(429).json({ ok: false, msg: '尝试次数过多，请重新发送验证码' });
  }
  entry.attempts += 1;
  if (entry.code !== code) {
    return res.status(400).json({ ok: false, msg: '验证码不正确，请检查后重试' });
  }
  codes.delete(email);
  res.json({ ok: true });
});

/* ---------------- 数据同步（按账号保存快照） ---------------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'xhs-home-studio', sync: true });
});

function validSyncUser(user) {
  return !!user && user.length <= 64 && !/[\u0000-\u001f\u007f]/.test(user);
}
// 文件名用账号哈希，避免中文、邮箱、符号等账号无法同步，同时杜绝路径穿越
function syncFile(user) {
  return path.join(SYNC_DIR, crypto.createHash('sha1').update(user, 'utf8').digest('hex') + '.json');
}
function legacySyncFile(user) {
  return SYNC_LEGACY_RE.test(user) ? path.join(SYNC_DIR, user + '.json') : '';
}
function syncCount(state) {
  return DATA_KEYS.reduce((a, k) => a + (Array.isArray(state[k]) ? state[k].length : 0), 0);
}
async function readSnapshot(user) {
  const files = [syncFile(user), legacySyncFile(user)].filter(Boolean);
  for (const file of files) {
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return null;
}

app.get('/api/sync/:user', async (req, res) => {
  const user = String(req.params.user || '').trim();
  if (!validSyncUser(user)) return res.status(400).json({ ok: false, msg: '账号格式不支持同步' });
  try {
    const snap = await readSnapshot(user);
    if (!snap) return res.json({ ok: true, exists: false });
    res.json({
      ok: true, exists: true,
      updatedAt: snap.updatedAt || snap.savedAt,
      savedAt: snap.savedAt,
      count: snap.count || syncCount(snap.state || {}),
      state: snap.state
    });
  } catch (err) {
    console.error('[sync] 读取失败:', err.message);
    res.status(500).json({ ok: false, msg: '读取云端数据失败' });
  }
});

app.put('/api/sync/:user', async (req, res) => {
  const user = String(req.params.user || '').trim();
  if (!validSyncUser(user)) return res.status(400).json({ ok: false, msg: '账号格式不支持同步' });
  const state = req.body && req.body.state;
  if (!state || typeof state !== 'object' || !Array.isArray(state.ideas)) {
    return res.status(400).json({ ok: false, msg: '同步数据格式不正确' });
  }
  const updatedAt = String((state.meta && state.meta.updatedAt) || (req.body && req.body.updatedAt) || new Date().toISOString());
  const payload = {
    app: 'xhs-home-studio', version: 1, user, updatedAt,
    savedAt: new Date().toISOString(), count: syncCount(state), state
  };
  try {
    await fs.promises.mkdir(SYNC_DIR, { recursive: true });
    const tmp = syncFile(user) + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(tmp, syncFile(user));
    const legacy = legacySyncFile(user);
    if (legacy) await fs.promises.unlink(legacy).catch(() => { });
    res.json({ ok: true, updatedAt, count: payload.count });
  } catch (err) {
    console.error('[sync] 保存失败:', err.message);
    res.status(500).json({ ok: false, msg: '保存云端数据失败' });
  }
});

app.delete('/api/sync/:user', async (req, res) => {
  const user = String(req.params.user || '').trim();
  if (!validSyncUser(user)) return res.status(400).json({ ok: false, msg: '账号格式不支持同步' });
  try {
    await fs.promises.unlink(syncFile(user)).catch(() => { });
    const legacy = legacySyncFile(user);
    if (legacy) await fs.promises.unlink(legacy).catch(() => { });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[sync] 删除失败:', err.message);
      return res.status(500).json({ ok: false, msg: '删除云端数据失败' });
    }
  }
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务已启动：0.0.0.0:${PORT}`);
  if (!configured) {
    console.log('提示：尚未配置 SMTP，暂时无法发送验证码。请编辑 .env 后重启。');
    return;
  }
  console.log(`发件邮箱：${smtpUser}（${smtpHost}:${smtpPort}）`);
  getMailer()
    .then(transport => transport.verify())
    .then(() => console.log('SMTP 连接校验通过'))
    .catch(err => console.error('SMTP 连接校验失败：', err.message));
});
