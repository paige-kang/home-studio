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
  login(user, pass, remember) {
    user = String(user || '').trim();
    pass = String(pass || '');
    if (!user || !pass) return { ok: false, msg: '请输入账号和密码' };
    const acc = this.findAccount(user);
    if (!acc || acc.pass !== pass) return { ok: false, msg: '账号或密码不正确，可用下方演示账号进入' };
    return { ok: true, session: this.persist(acc.user, acc.name, remember) };
  },
  register(user, pass, name, remember, email) {
    user = String(user || '').trim();
    pass = String(pass || '');
    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();
    if (user.length < 3) return { ok: false, msg: '账号至少 3 个字符' };
    if (pass.length < 6) return { ok: false, msg: '密码至少 6 位' };
    if (!AUTH_EMAIL_RE.test(email)) return { ok: false, msg: '请填写有效的邮箱地址' };
    if (readAccounts().some(a => String(a.email || '').toLowerCase() === email)) return { ok: false, msg: '这个邮箱已注册过，直接登录即可' };
    if (this.findAccount(user)) return { ok: false, msg: '这个账号已存在，换一个或直接登录' };
    const list = readAccounts();
    list.push({ user, pass, name: name || user, email });
    saveAccounts(list);
    return { ok: true, session: this.persist(user, name || user, remember) };
  },
  resetPassword(user, pass) {
    user = String(user || '').trim();
    pass = String(pass || '');
    if (!user || pass.length < 6) return { ok: false, msg: '请填写账号，新密码至少 6 位' };
    if (user === AUTH_DEMO.user) return { ok: false, msg: '演示账号密码固定为 home123，可直接登录' };
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
