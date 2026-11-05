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
// 超级管理员账号：南澄 / 2163758133@qq.com
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '南澄';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '2163758133@qq.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '09kang59';
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(24).toString('hex');
const ADMIN_DATA_FILE = path.join(path.dirname(SYNC_DIR), 'admin.json');
const ADMIN_TOKEN_TTL = 12 * 3600 * 1000; // 12 小时

function readAdminData() {
  try {
    const raw = fs.readFileSync(ADMIN_DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    if (!d.codes) d.codes = [];
    if (!d.users) d.users = [];
    if (!d.tokens) d.tokens = [];
    // 清理过期 token
    const now = Date.now();
    d.tokens = d.tokens.filter(t => now - t.createdAt < ADMIN_TOKEN_TTL);
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
      users: [],
      tokens: []
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
    const tmp = ADMIN_DATA_FILE + '.tmp.' + crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
    fs.renameSync(tmp, ADMIN_DATA_FILE);
  } catch (err) { /* 只读文件系统 */ }
}
function generateToken() {
  const t = crypto.randomBytes(16).toString('hex');
  try {
    const admin = readAdminData();
    admin.tokens.push({ token: t, createdAt: Date.now() });
    writeAdminData(admin);
  } catch (e) { /* 忽略存储失败 */ }
  return t;
}
function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'] || String((req.query && req.query.token) || '');
  if (!auth) return res.status(401).json({ ok: false, msg: '请先登录管理员' });
  let admin;
  try { admin = readAdminData(); } catch (e) { return res.status(500).json({ ok: false, msg: '服务异常' }); }
  const entry = admin.tokens.find(t => t.token === auth);
  if (!entry) return res.status(401).json({ ok: false, msg: '请先登录管理员' });
  if (Date.now() - entry.createdAt > ADMIN_TOKEN_TTL) {
    admin.tokens = admin.tokens.filter(t => t.token !== auth);
    try { writeAdminData(admin); } catch (e) {}
    return res.status(401).json({ ok: false, msg: '管理员登录已过期，请重新登录' });
  }
  next();
}
function consumeInvite(code, user, email) {
  try {
    const admin = readAdminData();
    const em = String(email || '').toLowerCase();
    // 防止重复注册
    const existing = (admin.users || []).find(u => u.email === em);
    if (existing) {
      if (existing.disabled) return { ok: false, msg: '该账号已被禁用，请联系管理员' };
      existing.user = String(user || '').trim() || existing.user;
      existing.inviteUsed = existing.inviteUsed || code;
      writeAdminData(admin);
      return { ok: true, user: existing };
    }
    const entry = admin.codes.find(c => c.code === code);
    if (entry) entry.uses = (entry.uses || 0) + 1;
    admin.users.push({
      email: em,
      user: String(user || '').trim(),
      inviteUsed: code,
      registeredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      disabled: false,
      note: ''
    });
    writeAdminData(admin);
    return { ok: true };
  } catch (e) { return { ok: true }; }
}

function isUserDisabled(email) {
  try {
    const admin = readAdminData();
    const em = String(email || '').toLowerCase();
    const u = (admin.users || []).find(x => x.email === em);
    return u && u.disabled;
  } catch (e) { return false; }
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
  res.json({ ok: true, mailConfigured: configured });
});

/* ---------------- 服务端账号体系（跨设备登录） ---------------- */
function passSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPass(pass, salt) { return crypto.scryptSync(String(pass || ''), String(salt || ''), 32).toString('hex'); }
function publicAccount(u) {
  return {
    user: u.user, name: u.name || u.user, email: u.email || '',
    surveyed: !!u.surveyed, survey: u.survey || {}
  };
}
function findAccountInAdmin(id) {
  const key = String(id || '').trim();
  if (!key) return { admin: null, account: null };
  const admin = readAdminData();
  const lower = key.toLowerCase();
  const account = (admin.users || []).find(u =>
    u.user === key || String(u.email || '').toLowerCase() === lower
  ) || null;
  return { admin, account };
}
function inviteValid(admin, code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { ok: false, msg: '请填写邀请码' };
  const entry = (admin.codes || []).find(x => String(x.code).toUpperCase() === c);
  if (!entry) return { ok: false, msg: '邀请码无效' };
  if (entry.enabled === false) return { ok: false, msg: '邀请码已停用' };
  if (entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) return { ok: false, msg: '邀请码已过期' };
  if (entry.maxUses && (entry.uses || 0) >= entry.maxUses) return { ok: false, msg: '邀请码使用次数已达上限' };
  return { ok: true, entry, code: c };
}

// 登录：跨设备统一校验
app.post('/api/auth/login', (req, res) => {
  const user = String((req.body && req.body.user) || '').trim();
  const pass = String((req.body && req.body.pass) || '');
  if (!user || !pass) return res.status(400).json({ ok: false, code: 'EMPTY', msg: '请输入账号和密码' });
  let found;
  try { found = findAccountInAdmin(user); } catch (e) { return res.status(500).json({ ok: false, code: 'SERVER', msg: '服务异常' }); }
  const acc = found.account;
  if (!acc || !acc.passHash) return res.status(404).json({ ok: false, code: 'NO_ACCOUNT', msg: '该账号尚未开启云端登录' });
  if (acc.disabled) return res.status(403).json({ ok: false, code: 'DISABLED', msg: '该账号已被禁用，请联系管理员' });
  if (acc.passHash !== hashPass(pass, acc.salt)) return res.status(401).json({ ok: false, code: 'BAD_PASS', msg: '密码不正确，请检查后重试' });
  res.json({ ok: true, account: publicAccount(acc) });
});

// 注册 / 老账号迁移（邮箱已在管理员名单或邀请码有效即可）
app.post('/api/auth/register', (req, res) => {
  const body = req.body || {};
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const invite = String(body.invite || '').trim().toUpperCase();
  if (!user || user.length < 3) return res.status(400).json({ ok: false, code: 'INVALID', msg: '账号至少 3 个字符' });
  if (!pass || pass.length < 6) return res.status(400).json({ ok: false, code: 'INVALID', msg: '密码至少 6 位' });
  let admin;
  try { admin = readAdminData(); } catch (e) { return res.status(500).json({ ok: false, code: 'SERVER', msg: '服务异常' }); }
  const byUser = (admin.users || []).find(u => u.user === user);
  const byEmail = email ? (admin.users || []).find(u => String(u.email || '').toLowerCase() === email) : null;
  const existing = byUser || byEmail;
  if (existing) {
    if (existing.disabled) return res.status(403).json({ ok: false, code: 'DISABLED', msg: '该账号已被禁用，请联系管理员' });
    if (existing.passHash) return res.status(409).json({ ok: false, code: 'EXISTS', msg: '这个账号已在云端注册，直接登录即可' });
    if (byUser && !byEmail) {
      // 同名新账号且没有任何邮箱登记记录：需要邀请码
      const v = inviteValid(admin, invite);
      if (!v.ok) return res.status(403).json({ ok: false, code: 'INVITE', msg: v.msg });
    }
    // 迁移老账号：补上密码
    existing.user = user || existing.user;
    existing.name = name || existing.name || existing.user;
    existing.email = existing.email || email;
    existing.salt = passSalt();
    existing.passHash = hashPass(pass, existing.salt);
    existing.updatedAt = new Date().toISOString();
    writeAdminData(admin);
    return res.json({ ok: true, migrated: true, account: publicAccount(existing) });
  }
  // 老账号迁移：本地已有账号首次联网登录时补建云端记录（body.migrate=true）
  const isMigration = body.migrate === true;
  const v = inviteValid(admin, invite);
  if (!v.ok && !isMigration) return res.status(403).json({ ok: false, code: 'INVITE', msg: v.msg });
  const entry = {
    email, user, name: name || user, inviteUsed: v.ok ? invite : 'migrated',
    registeredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    disabled: false, note: isMigration && !v.ok ? '本地账号迁移' : '', surveyed: false, survey: {},
    salt: passSalt()
  };
  entry.passHash = hashPass(pass, entry.salt);
  admin.users.push(entry);
  if (v.ok && v.entry) v.entry.uses = (v.entry.uses || 0) + 1;
  writeAdminData(admin);
  res.json({ ok: true, account: publicAccount(entry) });
});

// 重置密码（跨设备生效）
app.post('/api/auth/reset', (req, res) => {
  const user = String((req.body && req.body.user) || '').trim();
  const pass = String((req.body && req.body.pass) || '');
  if (!user || pass.length < 6) return res.status(400).json({ ok: false, code: 'INVALID', msg: '请填写账号，新密码至少 6 位' });
  let found;
  try { found = findAccountInAdmin(user); } catch (e) { return res.status(500).json({ ok: false, code: 'SERVER', msg: '服务异常' }); }
  const acc = found.account;
  if (!acc) return res.status(404).json({ ok: false, code: 'NO_ACCOUNT', msg: '没有找到这个账号' });
  acc.salt = passSalt();
  acc.passHash = hashPass(pass, acc.salt);
  acc.updatedAt = new Date().toISOString();
  writeAdminData(found.admin);
  res.json({ ok: true });
});

// 调研偏好同步（让任何设备都能拿到选题匹配依据）
app.post('/api/auth/survey', (req, res) => {
  const user = String((req.body && req.body.user) || '').trim();
  const survey = (req.body && req.body.survey) || {};
  if (!user) return res.status(400).json({ ok: false, msg: '缺少账号' });
  let found;
  try { found = findAccountInAdmin(user); } catch (e) { return res.status(500).json({ ok: false, msg: '服务异常' }); }
  const acc = found.account;
  if (!acc) return res.status(404).json({ ok: false, msg: '账号不存在' });
  acc.surveyed = true;
  acc.survey = typeof survey === 'object' ? survey : {};
  acc.surveyAt = new Date().toISOString();
  writeAdminData(found.admin);
  res.json({ ok: true });
});

/* ---------------- 每个用户独立的 App 图标 / 名称 ---------------- */
let sharpLib = null;
try { sharpLib = require('sharp'); } catch (e) { sharpLib = null; }
const ICON_PALETTES = [
  ['#D8B894', '#9B7656'], ['#B7C9D8', '#5F7D96'], ['#E3C6C8', '#A96B70'],
  ['#C7D6BC', '#6E8B5E'], ['#D9C9E0', '#7D6A96'], ['#E9D3B4', '#B08A55'],
  ['#BBD8D4', '#4F8C86'], ['#DDCBBC', '#8E735C']
];
function xmlEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iconInitial(name) {
  const chars = Array.from(String(name || '').trim());
  return chars.length ? chars[0] : '拾';
}
function paletteFor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) % 997;
  return ICON_PALETTES[h % ICON_PALETTES.length];
}
function iconSvg(name, size) {
  const [c1, c2] = paletteFor(name);
  const initial = xmlEsc(iconInitial(name));
  const fs = size >= 512 ? 150 : 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g fill="#fff" opacity="0.9" transform="translate(256 128) scale(0.42)">
    <path d="M -120 30 L -60 -30 L 0 -90 L 60 -30 L 120 30 L 120 120 L -120 120 Z"
          fill="none" stroke="#fff" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="-26" y="34" width="52" height="86" rx="6" fill="#fff"/>
  </g>
  <text x="256" y="360" text-anchor="middle" font-family="-apple-system,'PingFang SC','Noto Sans CJK SC','Helvetica Neue',sans-serif"
        font-weight="700" font-size="${fs}" fill="#fff">${initial}</text>
</svg>`;
}
const ICON_CACHE = new Map();
async function iconPng(name, size) {
  const key = name + '|' + size;
  if (ICON_CACHE.has(key)) return ICON_CACHE.get(key);
  if (!sharpLib) return null;
  const buf = await sharpLib(Buffer.from(iconSvg(name, size))).png().toBuffer();
  ICON_CACHE.set(key, buf);
  return buf;
}
app.get('/api/icon/:name/:size', async (req, res) => {
  const name = String(req.params.name || '').trim().slice(0, 12);
  let size = parseInt(req.params.size, 10);
  if (![192, 512].includes(size)) size = 192;
  try {
    const png = await iconPng(name, size);
    if (!png) return res.redirect('/icons/icon-' + size + '.png');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (err) {
    res.redirect('/icons/icon-' + size + '.png');
  }
});
app.get('/api/manifest/:name', (req, res) => {
  const name = String(req.params.name || '').trim().slice(0, 12) || '我的';
  const enc = encodeURIComponent(name);
  res.type('application/manifest+json').json({
    name: `${name}的工作台`,
    short_name: name,
    description: `${name}的小红书创作中控台：选题、样品、拍摄、发布、复盘。`,
    start_url: '/index.html',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F7F5F1',
    theme_color: '#B58C6B',
    lang: 'zh-CN',
    icons: [
      { src: `/api/icon/${enc}/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/api/icon/${enc}/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/api/icon/${enc}/512`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  });
});

// —— 热门选题推荐 ——
const TRENDING_IDEAS = [
  // 家居好物
  { domain: '家居好物', title: '2026 最值得入的 10 件家居好物', hot: 98, tags: ['好物推荐', '家居'], style: '种草推荐' },
  { domain: '家居好物', title: '出租屋 500 元软装改造全记录', hot: 87, tags: ['出租屋', '改造'], style: '改造分享' },
  { domain: '家居好物', title: '拼多多 9.9 包邮的家居神器测评', hot: 76, tags: ['平价', '测评'], style: '好物测评' },
  { domain: '家居好物', title: '宜家隐藏款好物｜不买后悔系列', hot: 92, tags: ['宜家', '好物'], style: '种草推荐' },
  { domain: '家居好物', title: '小户型收纳｜空间翻倍的秘密', hot: 81, tags: ['收纳', '小户型'], style: '教程干货' },
  // 美妆护肤
  { domain: '美妆护肤', title: '早 C 晚 A 一个月真实对比', hot: 95, tags: ['护肤', '早C晚A'], style: '好物测评' },
  { domain: '美妆护肤', title: '油皮亲妈底妆｜持妆 12 小时实测', hot: 88, tags: ['底妆', '油皮'], style: '好物测评' },
  { domain: '美妆护肤', title: '国货美妆崛起｜这些不输大牌', hot: 79, tags: ['国货', '美妆'], style: '种草推荐' },
  { domain: '美妆护肤', title: '换季烂脸急救指南', hot: 84, tags: ['换季', '护肤'], style: '教程干货' },
  // 穿搭时尚
  { domain: '穿搭时尚', title: '秋冬通勤穿搭｜一周不重样', hot: 90, tags: ['通勤', '秋冬'], style: '种草推荐' },
  { domain: '穿搭时尚', title: '微胖女生显瘦穿搭公式', hot: 93, tags: ['微胖', '显瘦'], style: '教程干货' },
  { domain: '穿搭时尚', title: '平价穿出高级感｜配色技巧', hot: 77, tags: ['配色', '平价'], style: '教程干货' },
  // 美食探店
  { domain: '美食探店', title: '本地人私藏的 10 家苍蝇馆子', hot: 91, tags: ['探店', '苍蝇馆子'], style: 'Vlog日常' },
  { domain: '美食探店', title: '空气炸锅食谱｜懒人必备', hot: 86, tags: ['空气炸锅', '食谱'], style: '教程干货' },
  { domain: '美食探店', title: '咖啡店打卡｜氛围感出片指南', hot: 74, tags: ['咖啡', '打卡'], style: 'Vlog日常' },
  // 数码科技
  { domain: '数码科技', title: '2026 年度手机推荐｜各价位段', hot: 89, tags: ['手机', '推荐'], style: '好物测评' },
  { domain: '数码科技', title: 'iPhone 隐藏技巧｜效率翻倍', hot: 82, tags: ['iPhone', '技巧'], style: '教程干货' },
  { domain: '数码科技', title: '百元好物｜提升幸福感的数码配件', hot: 78, tags: ['配件', '平价'], style: '种草推荐' },
  // 母婴亲子
  { domain: '母婴亲子', title: '新手妈妈必囤清单｜不踩雷', hot: 94, tags: ['待产包', '清单'], style: '种草推荐' },
  { domain: '母婴亲子', title: '宝宝辅食添加全攻略', hot: 83, tags: ['辅食', '攻略'], style: '教程干货' },
  { domain: '母婴亲子', title: '带娃出行必备好物', hot: 75, tags: ['出行', '好物'], style: '种草推荐' },
  // 萌宠日常
  { domain: '萌宠日常', title: '猫咪化毛膏测评｜哪款最有效', hot: 80, tags: ['猫咪', '测评'], style: '好物测评' },
  { domain: '萌宠日常', title: '狗狗新手养狗指南', hot: 77, tags: ['狗狗', '新手'], style: '教程干货' },
  { domain: '萌宠日常', title: '宠物用品平价替代', hot: 72, tags: ['平价', '用品'], style: '种草推荐' },
  // 旅行攻略
  { domain: '旅行攻略', title: '小众旅行地｜人少景美', hot: 85, tags: ['小众', '攻略'], style: 'Vlog日常' },
  { domain: '旅行攻略', title: '穷游攻略｜2000 元玩遍某城', hot: 79, tags: ['穷游', '攻略'], style: '教程干货' },
  { domain: '旅行攻略', title: '旅行拍照姿势｜出片率 100%', hot: 88, tags: ['拍照', '姿势'], style: '教程干货' },
  // 健身运动
  { domain: '健身运动', title: '居家健身｜30 天塑形计划', hot: 86, tags: ['居家', '塑形'], style: '教程干货' },
  { domain: '健身运动', title: '减脂餐食谱｜好吃不胖', hot: 90, tags: ['减脂餐', '食谱'], style: '教程干货' },
  { domain: '健身运动', title: '马甲线养成记｜每天 10 分钟', hot: 81, tags: ['马甲线', '教程'], style: '教程干货' },
  // 读书学习
  { domain: '读书学习', title: '2026 年度书单｜改变认知的 10 本书', hot: 78, tags: ['书单', '推荐'], style: '知识科普' },
  { domain: '读书学习', title: '高效学习法｜学霸都在用', hot: 74, tags: ['学习方法', '高效'], style: '教程干货' },
  { domain: '读书学习', title: '读书笔记模板｜这样读书记得牢', hot: 71, tags: ['笔记', '模板'], style: '教程干货' },
];

app.get('/api/trending', (req, res) => {
  const domain = String(req.query.domain || '').trim();
  const style = String(req.query.style || '').trim();
  let list = [...TRENDING_IDEAS];
  if (domain) list = list.filter(i => i.domain === domain);
  if (style) list = list.filter(i => i.style === style);
  list.sort((a, b) => b.hot - a.hot);
  res.json({ ok: true, items: list.slice(0, 30) });
});

// 内测邀请码校验
app.post('/api/verify-invite', (req, res) => {
  const invite = String((req.body && req.body.invite) || '').trim();
  if (!invite) return res.status(400).json({ ok: false, msg: '请填写邀请码' });
  if (!validInvite(invite)) return res.status(403).json({ ok: false, msg: '邀请码无效，请联系拾一获取' });
  res.json({ ok: true, msg: '邀请码有效' });
});

// —— 管理员后台 API ——
function adminStats(admin) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayUsers = (admin.users || []).filter(u => (u.createdAt || '').slice(0, 10) === today).length;
  const enabledCodes = (admin.codes || []).filter(c => c.enabled).length;
  const usedCodes = (admin.codes || []).filter(c => c.uses > 0).length;
  const activeUsers = (admin.users || []).filter(u => !u.disabled).length;
  return {
    totalUsers: (admin.users || []).length,
    activeUsers,
    disabledUsers: (admin.users || []).filter(u => u.disabled).length,
    todayNewUsers: todayUsers,
    totalCodes: (admin.codes || []).length,
    enabledCodes,
    usedCodes,
    availableCodes: (admin.codes || []).filter(c => c.enabled && (!c.maxUses || c.uses < c.maxUses)).length,
  };
}

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const admin = readAdminData();
  res.json({ ok: true, stats: adminStats(admin) });
});

app.post('/api/admin/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const pw = String((req.body && req.body.password) || '');
  const identity = username || email;
  if (!identity) return res.status(400).json({ ok: false, msg: '请填写管理员账号' });
  if (!pw) return res.status(400).json({ ok: false, msg: '请填写管理员密码' });
  // 用户名（南澄）或邮箱（2163758133@qq.com）均可登录
  const matchId = identity === ADMIN_USERNAME || identity === ADMIN_EMAIL || identity.toLowerCase() === ADMIN_EMAIL;
  if (!matchId || pw !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, msg: '账号或密码不正确' });
  res.json({ ok: true, token: generateToken(), username: ADMIN_USERNAME, email: ADMIN_EMAIL });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const auth = req.headers['x-admin-token'] || '';
  try {
    const admin = readAdminData();
    admin.tokens = admin.tokens.filter(t => t.token !== auth);
    writeAdminData(admin);
  } catch (e) { /* 忽略 */ }
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
  let users = admin.users || [];
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q) users = users.filter(u => u.email.toLowerCase().includes(q) || (u.note || '').toLowerCase().includes(q));
  res.json({ ok: true, users });
});
app.patch('/api/admin/users/:email', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const u = (admin.users || []).find(x => x.email === email);
  if (!u) return res.status(404).json({ ok: false, msg: '用户不存在' });
  const b = req.body || {};
  if (b.disabled != null) u.disabled = !!b.disabled;
  if (b.note != null) u.note = String(b.note);
  writeAdminData(admin);
  res.json({ ok: true, user: u });
});
app.delete('/api/admin/users/:email', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const before = admin.users.length;
  admin.users = admin.users.filter(u => u.email !== decodeURIComponent(req.params.email).toLowerCase());
  if (admin.users.length === before) return res.status(404).json({ ok: false, msg: '用户不存在' });
  writeAdminData(admin);
  res.json({ ok: true });
});

// 导出 CSV
app.get('/api/admin/export/:kind', requireAdmin, (req, res) => {
  const admin = readAdminData();
  const kind = req.params.kind;
  let rows = [], header = '';
  if (kind === 'users') {
    header = '邮箱,昵称,注册时间,邀请码,状态,备注';
    rows = (admin.users || []).map(u => [
      u.email, (u.note || '').replace(/,/g, '，'),
      u.createdAt || '', u.invite || '',
      u.disabled ? '已禁用' : '正常', (u.note || '').replace(/,/g, '，')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  } else if (kind === 'invites') {
    header = '邀请码,备注,创建时间,过期时间,使用次数,最大次数,启用,来源';
    rows = (admin.codes || []).map(c => [
      c.code, (c.note || '').replace(/,/g, '，'),
      c.createdAt || '', c.expiresAt || '',
      c.uses || 0, c.maxUses ?? '',
      c.enabled ? '是' : '否', c.source || 'admin'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  } else {
    return res.status(404).json({ ok: false, msg: '未知导出类型' });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${Date.now()}.csv"`);
  res.send('\uFEFF' + header + '\n' + rows.join('\n'));
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
  // 检查账号是否被禁用
  if (isUserDisabled(email)) {
    return res.status(403).json({ ok: false, msg: '该账号已被禁用，请联系管理员' });
  }
  // 记录注册消耗 + 用户信息
  try {
    const invite = String((req.body && req.body.invite) || '').trim().toUpperCase();
    const user = String((req.body && req.body.user) || '').trim();
    const r = consumeInvite(invite, user, email);
    if (r && r.ok === false) return res.status(403).json({ ok: false, msg: r.msg });
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

function requireSync(req, res, next) {
  const headerUser = String(req.headers['x-sync-user'] || '').trim();
  const paramUser = String(req.params.user || '').trim();
  if (!headerUser || headerUser !== paramUser) {
    return res.status(401).json({ ok: false, msg: '未授权的同步请求' });
  }
  // x-sync-at: 前端登录时间戳（毫秒），允许 30 天内有效
  const at = Number(req.headers['x-sync-at']);
  if (!at || isNaN(at) || Date.now() - at > 30 * 24 * 3600 * 1000 || at > Date.now() + 60 * 1000) {
    return res.status(401).json({ ok: false, msg: '同步会话已过期，请重新登录' });
  }
  next();
}

app.get('/api/sync/:user', requireSync, async (req, res) => {
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

app.put('/api/sync/:user', requireSync, async (req, res) => {
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

app.delete('/api/sync/:user', requireSync, async (req, res) => {
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
