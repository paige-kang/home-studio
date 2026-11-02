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

// —— 邀请码（内测注册闸门）——
// 环境变量 INVITE_CODES 用逗号分隔；未配置则使用下面的默认列表
const DEFAULT_INVITE_CODES = [
  'HOME2026',      // 拾一自用通用码
  'SHIYI88',       // 拾一亲友
  'HOMESTUDIO',    // 家居工作室
  'XHSFRIEND'      // 小红书好友
];
const INVITE_CODES = (process.env.INVITE_CODES || '')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean)
  .concat(DEFAULT_INVITE_CODES)
  .filter((v, i, a) => a.indexOf(v) === i);
function validInvite(code) {
  code = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!code) return false;
  // 先查落盘的管理员码（优先级高，可禁用/过期）
  try {
    const admin = readAdminData();
    const entry = admin.codes.find(c => c.code === code);
    if (entry) {
      if (entry.enabled === false) return false;
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) return false;
      if (entry.maxUses != null && entry.uses >= entry.maxUses) return false;
      return true;
    }
  } catch (e) { /* 忽略，fallback 到默认列表 */ }
  return INVITE_CODES.includes(code);
}

// —— 管理员后台 ——
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'shiyi@2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(24).toString('hex');
const ADMIN_DATA_FILE = path.join(path.dirname(SYNC_DIR), 'admin.json');
const ADMIN_TOKENS = new Map(); // token → { createdAt }
const ADMIN_TOKEN_TTL = 12 * 3600 * 1000; // 12 小时

function readAdminData() {
  try {
    const raw = fs.readFileSync(ADMIN_DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    if (!d.codes) d.codes = [];
    if (!d.users) d.users = [];
    return d;
  } catch (e) {
    // 首次初始化：把默认邀请码落盘
    const bootstrap = {
      codes: DEFAULT_INVITE_CODES.map(code => ({
        code,
        note: code === 'HOME2026' ? '拾一通用码' : code === 'SHIYI88' ? '亲友' : code === 'HOMESTUDIO' ? '家居工作室' : '小红书好友',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        uses: 0,
        maxUses: null,
        enabled: true,
        source: 'default'
      })),
      users: []
    };
    try {
      fs.mkdirSync(path.dirname(ADMIN_DATA_FILE), { recursive: true });
      fs.writeFileSync(ADMIN_DATA_FILE, JSON.stringify(bootstrap, null, 2));
    } catch (err) { /* 只读文件系统 */ }
    return bootstrap;
  }
}
function writeAdminData(d) {
  try {
    fs.mkdirSync(path.dirname(ADMIN_DATA_FILE), { recursive: true });
    fs.writeFileSync(ADMIN_DATA_FILE, JSON.stringify(d, null, 2));
  } catch (err) { /* 只读文件系统 */ }
}
function generateToken() {
  const t = crypto.randomBytes(16).toString('hex');
  ADMIN_TOKENS.set(t, { createdAt: Date.now() });
  return t;
}
function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'] || String((req.query && req.query.token) || '');
  const info = ADMIN_TOKENS.get(auth);
  if (!auth || !info) return res.status(401).json({ ok: false, msg: '请先登录管理员' });
  if (Date.now() - info.createdAt > ADMIN_TOKEN_TTL) {
    ADMIN_TOKENS.delete(auth);
    return res.status(401).json({ ok: false, msg: '管理员登录已过期，请重新登录' });
  }
  next();
}
function consumeInvite(code, user, email) {
  try {
    const admin = readAdminData();
    const entry = admin.codes.find(c => c.code === code);
    if (entry) entry.uses = (entry.uses || 0) + 1;
    admin.users.push({
      email: String(email || '').toLowerCase(),
      user: String(user || '').trim(),
      inviteUsed: code,
      registeredAt: new Date().toISOString()
    });
    writeAdminData(admin);
  } catch (e) { /* 忽略存储失败 */ }
}

function randomInviteCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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

// 内测邀请码校验
app.post('/api/verify-invite', (req, res) => {
  const invite = String((req.body && req.body.invite) || '').trim();
  if (!invite) return res.status(400).json({ ok: false, msg: '请填写邀请码' });
  if (!validInvite(invite)) return res.status(403).json({ ok: false, msg: '邀请码无效，请联系拾一获取' });
  res.json({ ok: true, msg: '邀请码有效' });
});

// —— 管理员后台 API ——
app.post('/api/admin/login', (req, res) => {
  const pw = String((req.body && req.body.password) || '');
  if (!pw) return res.status(400).json({ ok: false, msg: '请填写管理员密码' });
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, msg: '密码不正确' });
  res.json({ ok: true, token: generateToken() });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const auth = req.headers['x-admin-token'] || '';
  ADMIN_TOKENS.delete(auth);
  res.json({ ok: true });
});

// 邀请码管理
app.get('/api/admin/invites', requireAdmin, (req, res) => {
  const admin = readAdminData();
  res.json({ ok: true, codes: admin.codes });
});
app.post('/api/admin/invites', requireAdmin, (req, res) => {
  let { code, note, maxUses, expiresAt, count = 1 } = (req.body || {});
  const admin = readAdminData();
  const created = [];
  const n = Math.min(Math.max(Number(count) || 1, 1), 50);
  for (let i = 0; i < n; i++) {
    const c = (code && i === 0) ? code.trim().toUpperCase() : randomInviteCode();
    if (admin.codes.find(x => x.code === c)) {
      return res.status(409).json({ ok: false, msg: `邀请码 ${c} 已存在` });
    }
    const entry = {
      code: c,
      note: note ? String(note) : '',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? String(expiresAt) : null,
      uses: 0,
      maxUses: maxUses != null && maxUses !== '' ? Number(maxUses) : null,
      enabled: true,
      source: 'admin'
    };
    admin.codes.push(entry);
    created.push(entry);
  }
  writeAdminData(admin);
  res.json({ ok: true, codes: created });
});
app.patch('/api/admin/invites/:code', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const entry = admin.codes.find(c => c.code === req.params.code.toUpperCase());
  if (!entry) return res.status(404).json({ ok: false, msg: '邀请码不存在' });
  const b = req.body || {};
  if (b.note != null) entry.note = String(b.note);
  if (b.enabled != null) entry.enabled = !!b.enabled;
  if (b.maxUses != null) entry.maxUses = b.maxUses === '' ? null : Number(b.maxUses);
  if (b.expiresAt != null) entry.expiresAt = b.expiresAt === '' ? null : String(b.expiresAt);
  writeAdminData(admin);
  res.json({ ok: true, code: entry });
});
app.delete('/api/admin/invites/:code', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const before = admin.codes.length;
  admin.codes = admin.codes.filter(c => c.code !== req.params.code.toUpperCase());
  if (admin.codes.length === before) return res.status(404).json({ ok: false, msg: '邀请码不存在' });
  writeAdminData(admin);
  res.json({ ok: true });
});

// 用户管理
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const admin = readAdminData();
  res.json({ ok: true, users: admin.users });
});
app.delete('/api/admin/users/:email', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const before = admin.users.length;
  admin.users = admin.users.filter(u => u.email !== decodeURIComponent(req.params.email).toLowerCase());
  if (admin.users.length === before) return res.status(404).json({ ok: false, msg: '用户不存在' });
  writeAdminData(admin);
  res.json({ ok: true });
});

// 内测邀请码白名单（邮箱白名单，不用邀请码也能注册）
const INVITE_EMAIL_WHITELIST = new Set([
  // 可在此添加允许免邀请码注册的邮箱
]);

function requireInvite(req, res, next) {
  const invite = String((req.body && req.body.invite) || '').trim();
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (INVITE_EMAIL_WHITELIST.has(email)) return next();
  if (!invite) return res.status(403).json({ ok: false, msg: '请先填写邀请码' });
  if (!validInvite(invite)) return res.status(403).json({ ok: false, msg: '邀请码无效，请联系拾一获取' });
  next();
}

app.post('/api/send-code', requireInvite, async (req, res) => {
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

app.post('/api/verify-code', requireInvite, (req, res) => {
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
  // 记录注册消耗 + 用户信息
  try {
    const invite = String((req.body && req.body.invite) || '').trim().toUpperCase();
    const user = String((req.body && req.body.user) || '').trim();
    consumeInvite(invite, user, email);
  } catch (e) { /* 忽略存储失败 */ }
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
