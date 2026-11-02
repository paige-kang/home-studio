/* ---------------- 数据同步 ----------------
 * 本机 localStorage 与服务器快照双向同步：时间较新的一方生效。
 * 开启后每次本地保存会延迟自动同步一次，个人中心可手动触发。
 */
const Sync = {
  busy: false,
  applying: false,
  timer: null,
  retryTimer: null,
  bound: false,
  unsupported: false,
  state: '',
  message: '',

  enabled() {
    const st = Store.state && Store.state.settings;
    return !(st && st.syncOn === false);
  },
  user() {
    const s = typeof Auth !== 'undefined' ? Auth.current() : null;
    return s && s.user ? s.user : '';
  },
  localStamp() {
    const meta = Store.state && Store.state.meta;
    return meta && meta.updatedAt ? meta.updatedAt : '';
  },
  clock() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  },
  setStatus(state, message) {
    this.state = state;
    this.message = message;
    if (typeof updateSyncUI === 'function') updateSyncUI();
  },
  markSynced() {
    if (Store.state.settings) Store.state.settings.syncAt = new Date().toISOString();
    Store.save({ keepTime: true, silent: true });
  },

  apiRoot() {
    let p = location.pathname || '/';
    const m = p.match(/(?:index|login|logout)\.html$/);
    if (m) return p.slice(0, m.index);
    if (!p.endsWith('/')) p += '/';
    return p;
  },
  apiCandidates(rel) {
    const path = String(rel).replace(/^\/+/, '');
    const urls = [this.apiRoot() + path];
    if (this.apiRoot() !== '/') urls.push('/' + path);
    return urls;
  },

  async request(method, body) {
    const user = this.user();
    if (!user) throw new Error('请先登录');
    const urls = this.apiCandidates('api/sync/' + encodeURIComponent(user));
    let lastErr = null;
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i], {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          cache: 'no-store'
        });
        if (res.status === 404 && i < urls.length - 1) continue;
        if (!res.ok) {
          let msg = '服务返回 ' + res.status;
          try { const j = await res.json(); if (j && j.msg) msg = j.msg; } catch (e) { }
          const err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return await res.json();
      } catch (e) {
        if (e.status === 404 && i < urls.length - 1) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('服务不可用');
  },

  async probe() {
    if (location.protocol === 'file:') return { ok: false, reason: 'static' };
    const urls = this.apiCandidates('api/health');
    let reason = 'network';
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i], { cache: 'no-store' });
        if (!res.ok) { reason = res.status === 404 ? 'static' : 'server'; continue; }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('json')) { reason = 'static'; continue; }
        const j = await res.json();
        if (j && j.ok) return { ok: true };
        reason = 'server';
      } catch (e) {
        reason = 'network';
      }
    }
    return { ok: false, reason };
  },

  async sync(opts) {
    opts = opts || {};
    if (this.busy) return { ok: false, msg: '同步进行中' };
    clearTimeout(this.timer);
    this.clearRetry();
    if (opts.force) this.unsupported = false;
    if (this.unsupported) {
      this.setStatus('off', '静态预览不支持同步，请通过 node server.js 访问');
      return { ok: false, msg: '静态预览不支持同步' };
    }
    if (!this.enabled()) {
      if (!opts.silent) toast('数据同步未开启');
      return { ok: false, msg: '未开启' };
    }
    if (!this.user()) {
      if (!opts.silent) toast('请先登录后再同步');
      return { ok: false, msg: '未登录' };
    }
    this.busy = true;
    this.setStatus('syncing', '同步中…');
    try {
      const remote = await this.request('GET');
      if (!remote.exists || !remote.state) {
        await this.request('PUT', { state: Store.state });
        this.markSynced();
        this.setStatus('ok', '已上传本机数据 · ' + this.clock());
        if (!opts.silent) toast('已上传本机数据到云端');
        return { ok: true, dir: 'up' };
      }
      const localAt = Date.parse(this.localStamp()) || 0;
      const remoteAt = Date.parse(remote.updatedAt) || 0;
      if (remoteAt > localAt) {
        this.applyRemote(remote.state, remote.updatedAt);
        this.markSynced();
        this.setStatus('ok', '已拉取云端数据 · ' + this.clock());
        if (!opts.silent) toast('已拉取云端最新数据');
        return { ok: true, dir: 'down' };
      }
      await this.request('PUT', { state: Store.state });
      this.markSynced();
      this.setStatus('ok', '已同步到云端 · ' + this.clock());
      if (!opts.silent) toast('已同步到云端');
      return { ok: true, dir: 'up' };
    } catch (e) {
      const detail = this.reason(e);
      if (e && e.status === 404) this.unsupported = true;
      this.setStatus('error', '同步失败：' + detail);
      if (!this.unsupported) this.scheduleRetry();
      if (!opts.silent) toast('同步失败：' + detail);
      return { ok: false, msg: detail };
    } finally {
      this.busy = false;
    }
  },

  reason(e) {
    if (e && e.status === 404) return '当前页面未启用同步服务，请通过 node server.js 访问';
    const m = e && e.message ? String(e.message) : '';
    if (!m) return '无法连接同步服务';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return '无法连接同步服务，请确认 node server.js 已启动';
    return m;
  },

  clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  },

  scheduleRetry() {
    if (this.retryTimer || !this.enabled() || !this.user()) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.sync({ silent: true });
    }, 20000);
  },

  applyRemote(state, updatedAt) {
    if (!state || typeof state !== 'object') return;
    this.applying = true;
    const wasOff = Store.state.settings && Store.state.settings.syncOn === false;
    const settings = Object.assign({ assistant: false, viewState: {} }, state.settings || {});
    if (wasOff) settings.syncOn = false;
    Store.dataKeys.forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
    state.version = 1;
    state.settings = settings;
    state.meta = Object.assign({}, state.meta, { updatedAt: updatedAt || this.localStamp() || new Date().toISOString() });
    Store.state = state;
    Store.save({ keepTime: true, silent: true });
    this.applying = false;
    if (typeof PAGE !== 'undefined') {
      PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.query = '';
      PAGE.sort = null; PAGE.selected = {}; PAGE.visibleIds = [];
    }
    if (typeof renderCurrent === 'function') renderCurrent();
    if (typeof updateSidebar === 'function') updateSidebar();
    if (typeof syncUserAvatar === 'function') syncUserAvatar();
  },

  onLocalSave(opts) {
    if (opts && opts.silent) return;
    if (!this.enabled() || this.applying) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.sync({ silent: true }); }, 1200);
  },

  async deleteRemote() {
    const user = this.user();
    if (!user) return;
    try { await fetch(this.apiCandidates('api/sync/' + encodeURIComponent(user))[0], { method: 'DELETE' }); } catch (e) { }
  },

  init() {
    if (!this.bound) {
      this.bound = true;
      window.addEventListener('online', () => { if (this.enabled()) this.sync({ silent: true }); });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.enabled() && this.state === 'error') this.sync({ silent: true });
      });
      window.addEventListener('focus', () => {
        if (this.enabled() && this.state === 'error') this.sync({ silent: true });
      });
    }
    if (!this.enabled()) { this.setStatus('off', '未开启，数据只保存在本机'); return; }
    if (!this.user()) { this.setStatus('off', '登录后可同步'); return; }
    this.setStatus('idle', '等待首次同步');
    setTimeout(async () => {
      const probe = await this.probe();
      if (!probe.ok && (probe.reason === 'static' || probe.reason === 'file')) {
        this.unsupported = true;
        this.setStatus('off', '当前为静态预览，同步不可用；请通过 node server.js 访问');
        return;
      }
      this.sync({ silent: true });
    }, 300);
  }
};
