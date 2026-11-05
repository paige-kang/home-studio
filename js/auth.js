/* 本地演示登录：账号只存在浏览器里，没有后端 */
const AUTH_KEY = 'xhs-home-auth-v1';
const AUTH_ACCOUNTS_KEY = 'xhs-home-accounts-v1';
const AUTH_DEMO = { user: 'shiyi', pass: 'home123', name: '拾一' };
const AUTH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readAccounts() {
  try {
    const list = JSON.parse(localStorage.getItem(AUTH_ACCOUNTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function saveAccounts(list) {
  try { localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
}

/* 与服务端账号体系交互（跨设备登录）。服务不可用时自动回退本地。 */
async function authPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* 非 JSON */ }
  return { ok: r.ok, status: r.status, data };
}

const Auth = {
  read() {
    for (const store of [localStorage, sessionStorage]) {
      try {
        const raw = store.getItem(AUTH_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && s.user) return s;
        }
      } catch (e) { /* 存储不可用时按未登录处理 */ }
    }
    return null;
  },
  current() { return this.read(); },
  findAccount(user) {
    user = String(user || '').trim();
    if (!user) return null;
    if (user === AUTH_DEMO.user) return AUTH_DEMO;
    return readAccounts().find(a => a.user === user) || null;
  },
  validEmail(email) { return AUTH_EMAIL_RE.test(String(email || '').trim()); },
  displayName() {
    const s = this.current();
    return (s && (s.name || s.user)) || '拾一';
  },
  persist(user, name, remember) {
    const session = { user, name: name || user, at: Date.now() };
    try {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
      (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(session));
    } catch (e) { /* 忽略隐私模式下的存储异常 */ }
    return session;
  },
  cacheAccount(acc, pass) {
    if (!acc || !acc.user) return;
    const list = readAccounts();
    const em = String(acc.email || '').toLowerCase();
    let entry = list.find(a => a.user === acc.user)
      || (em ? list.find(a => String(a.email || '').toLowerCase() === em) : null);
    if (!entry) { entry = { user: acc.user }; list.push(entry); }
    entry.user = acc.user;
    entry.name = acc.name || entry.name || acc.user;
    entry.email = acc.email || entry.email || '';
    if (pass) entry.pass = pass;
    entry.surveyed = !!acc.surveyed;
    if (acc.survey) entry.survey = acc.survey;
    saveAccounts(list);
  },
  migrateToServer(acc) {
    if (!acc || !acc.user || !acc.pass) return;
    try {
      authPost('api/auth/register', {
        user: acc.user, pass: acc.pass, name: acc.name, email: acc.email, invite: '', migrate: true
      }).catch(() => { /* 迁移失败不影响本地登录 */ });
    } catch (e) { /* 忽略 */ }
  },
  async login(user, pass, remember) {
    user = String(user || '').trim();
    pass = String(pass || '');
    if (!user || !pass) return { ok: false, msg: '请输入账号和密码' };
    // 1) 服务端统一校验：电脑上注册的账号手机端也能登录
    try {
      const { ok, data } = await authPost('api/auth/login', { user, pass });
      if (ok && data.ok && data.account) {
        this.cacheAccount(data.account, pass);
        return { ok: true, session: this.persist(data.account.user, data.account.name || data.account.user, remember) };
      }
      if (data && data.code === 'BAD_PASS') return { ok: false, msg: '密码不正确，请检查账号和密码' };
      if (data && data.code === 'DISABLED') return { ok: false, msg: data.msg || '该账号已被禁用，请联系管理员' };
      // NO_ACCOUNT / 服务异常 → 继续尝试本地账号
    } catch (e) { /* 服务不可用 → 本地登录 */ }
    // 2) 本地兜底（离线可用）
    const acc = this.findAccount(user);
    if (!acc || acc.pass !== pass) return { ok: false, msg: '账号或密码不正确，可用下方演示账号进入' };
    // 3) 本地账号自动迁移到服务端，之后手机端也能登录
    this.migrateToServer(acc);
    return { ok: true, session: this.persist(acc.user, acc.name, remember) };
  },
  async register(user, pass, name, remember, email, invite) {
    user = String(user || '').trim();
    pass = String(pass || '');
    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();
    invite = String(invite || '').trim().toUpperCase();
    if (user.length < 3) return { ok: false, msg: '账号至少 3 个字符' };
    if (pass.length < 6) return { ok: false, msg: '密码至少 6 位' };
    if (!AUTH_EMAIL_RE.test(email)) return { ok: false, msg: '请填写有效的邮箱地址' };
    // 1) 服务端注册（账号写入云端，手机端可登录）
    try {
      const { ok, data } = await authPost('api/auth/register', { user, pass, name: name || user, email, invite });
      if (ok && data.ok && data.account) {
        this.cacheAccount(data.account, pass);
        return { ok: true, session: this.persist(data.account.user, data.account.name || user, remember) };
      }
      return { ok: false, msg: (data && data.msg) || '注册失败，请稍后再试' };
    } catch (e) {
      // 2) 服务不可用 → 纯本地注册
    }
    if (readAccounts().some(a => String(a.email || '').toLowerCase() === email)) return { ok: false, msg: '这个邮箱已注册过，直接登录即可' };
    if (this.findAccount(user)) return { ok: false, msg: '这个账号已存在，换一个或直接登录' };
    const list = readAccounts();
    list.push({ user, pass, name: name || user, email, surveyed: false });
    saveAccounts(list);
    return { ok: true, session: this.persist(user, name || user, remember) };
  },
  isSurveyed(user) {
    const acc = this.findAccount(user);
    return acc ? !!acc.surveyed : false;
  },
  markSurveyed(user, survey) {
    const list = readAccounts();
    const acc = list.find(a => a.user === user);
    if (acc) {
      acc.surveyed = true;
      acc.survey = survey || {};
      saveAccounts(list);
    }
    // 同步到服务端，换设备也能按偏好匹配热门选题
    try { authPost('api/auth/survey', { user, survey: survey || {} }).catch(() => { }); } catch (e) { /* 忽略 */ }
  },
  getSurvey(user) {
    const acc = this.findAccount(user);
    return acc ? (acc.survey || {}) : {};
  },
  async resetPassword(user, pass) {
    user = String(user || '').trim();
    pass = String(pass || '');
    if (!user || pass.length < 6) return { ok: false, msg: '请填写账号，新密码至少 6 位' };
    if (user === AUTH_DEMO.user) return { ok: false, msg: '演示账号密码固定为 home123，可直接登录' };
    // 1) 服务端重置（跨设备生效）
    try {
      const { ok, data } = await authPost('api/auth/reset', { user, pass });
      if (ok && data.ok) {
        const list = readAccounts();
        const acc = list.find(a => a.user === user);
        if (acc) { acc.pass = pass; saveAccounts(list); }
        return { ok: true };
      }
      if (data && data.code && data.code !== 'NO_ACCOUNT') return { ok: false, msg: data.msg || '重置失败' };
    } catch (e) { /* 服务不可用 → 本地重置 */ }
    // 2) 本地兜底
    const list = readAccounts();
    const acc = list.find(a => a.user === user);
    if (!acc) return { ok: false, msg: '没有找到这个本地账号，先注册一个吧' };
    acc.pass = pass;
    saveAccounts(list);
    return { ok: true };
  },
  logout() {
    try {
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    } catch (e) { /* 忽略 */ }
  },
  canDeregister(user) {
    user = String(user || '').trim();
    if (!user || user === AUTH_DEMO.user) return false;
    return readAccounts().some(a => a.user === user);
  },
  deregister(user) {
    user = String(user || '').trim();
    if (!user) return { ok: false, msg: '未找到要注销的账号' };
    if (user === AUTH_DEMO.user) return { ok: false, msg: '演示账号不可注销' };
    const session = this.current();
    if (session && session.user !== user) return { ok: false, msg: '只能注销当前登录的账号' };
    const list = readAccounts();
    if (!list.some(a => a.user === user)) return { ok: false, msg: '这个账号不存在或已被注销' };
    saveAccounts(list.filter(a => a.user !== user));
    this.logout();
    return { ok: true };
  },
  require() {
    if (this.current()) return true;
    location.replace('login.html');
    return false;
  }
};
