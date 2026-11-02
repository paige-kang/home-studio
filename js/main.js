/* ---------------- 路由 ---------------- */
const ROUTE_NAMES = {
  dashboard: '首页总览', ideas: '选题库', notes: '内容流水线', assets: '素材图库',
  samples: '样品软装库', scenes: '布景道具库', deals: '商务合作', lessons: '复盘知识库',
  finance: '收支台账', todos: '待办清单', calendar: '日历排期', profile: '个人中心',
  admin: '管理后台'
};

function accountName() {
  return typeof Auth !== 'undefined' ? Auth.displayName() : '拾一';
}

function navigate(route, opts) {
  if (!ROUTE_NAMES[route]) route = 'dashboard';
  if (route !== 'dashboard' && typeof stopDashboardSim === 'function') stopDashboardSim();
  if (route !== 'calendar') PAGE.calDate = null;
  if (PAGE.route !== route) { PAGE.query = ''; PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.sort = null; PAGE.selected = {}; PAGE.visibleIds = []; }
  PAGE.route = route;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.route === route));
  document.querySelectorAll('.mb-item[data-route]').forEach(b => b.classList.toggle('is-active', b.dataset.route === route));
  document.getElementById('pageName').textContent = ROUTE_NAMES[route];
  const views = {
    dashboard: document.getElementById('view-dashboard'),
    page: document.getElementById('view-page'),
    calendar: document.getElementById('view-calendar'),
    profile: document.getElementById('view-profile'),
    admin: document.getElementById('view-admin')
  };
  const target = route === 'dashboard' ? 'dashboard'
    : route === 'calendar' ? 'calendar'
    : route === 'profile' ? 'profile'
    : route === 'admin' ? 'admin' : 'page';
  Object.entries(views).forEach(([k, v]) => v.classList.toggle('is-active', k === target));
  renderCurrent();
  closeBell();
  if (location.hash !== '#/' + route) history.replaceState(null, '', '#/' + route);
  if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCurrent() {
  if (PAGE.route === 'dashboard') renderDashboard();
  else if (PAGE.route === 'calendar') renderCalendarPage();
  else if (PAGE.route === 'profile') renderProfilePage();
  else if (PAGE.route === 'admin') { if (typeof renderAdminPage === 'function') renderAdminPage(); }
  else renderPage(PAGE.route);
}

/* ---------------- 顶栏头像 ---------------- */
function syncUserAvatar() {
  const session = typeof Auth !== 'undefined' ? Auth.current() : null;
  const el = document.getElementById('userAva');
  if (!el) return;
  const user = session ? session.user : '';
  const name = session ? (session.name || session.user) : '拾一';
  const p = typeof Profile !== 'undefined' ? Profile.get(user) : { avatar: '' };
  if (p.avatar && typeof Profile !== 'undefined' && Profile.isImage(p.avatar)) {
    el.classList.add('has-img');
    el.style.background = 'none';
    el.innerHTML = `<img src="${p.avatar}" alt="">`;
    return;
  }
  el.classList.remove('has-img');
  const g = typeof Profile !== 'undefined' ? Profile.grad(p.avatar) : null;
  el.style.background = g ? `linear-gradient(145deg,${g[0]},${g[1]})` : '';
  el.textContent = typeof Profile !== 'undefined' ? Profile.initial(name) : String(name).slice(0, 1);
}

/* ---------------- 模板 ---------------- */
const NOTE_TEMPLATES = [
  {
    name: '好物测评', desc: '开箱 → 使用 → 优缺点 → 适合谁', trackType: '测评',
    title: '好物测评｜', tags: '#家居好物 #测评', tip: '正面 + 45° 两机位，产品占画面 60%。',
    body: '【开箱】\n【用了 7 天后的真实感受】\n【优点】\n【缺点】\n【适合谁 / 不适合谁】\n\n价格与链接：'
  },
  {
    name: '家居改造', desc: '改造前 → 改了什么 → 花费 → 对比', trackType: '改造',
    title: '出租屋改造｜', tags: '#出租屋改造 #软装', tip: '改造前后使用同一机位，对比才成立。',
    body: '【改造前】\n【只做了这几件事】\n【花费清单】\n【改造后】\n\n总花费：'
  },
  {
    name: '避坑分享', desc: '踩过的坑 → 谁别买 → 替代方案', trackType: '测评',
    title: '别再买了｜', tags: '#家居避坑 #装修', tip: '拍问题细节特写，比全景更有说服力。',
    body: '【我踩的坑】\n【哪些人真的别买】\n【更合适的替代方案】\n\n'
  },
  {
    name: '商单 / 置换', desc: '品牌要求、卖点、报备都带上', trackType: '商单',
    title: '品牌合作｜', tags: '#家居好物 #品牌合作', tip: '产品 LOGO 露出，按合同要求机位。',
    body: '【使用场景】\n【产品三个核心卖点】\n【真实使用感受】\n\n#合作备注：'
  }
];

function openTemplateModal() {
  const inner = `<div class="tpl-grid">${NOTE_TEMPLATES.map((t, i) => `
    <button class="tpl-card" data-tpl="${i}">
      <b>${t.name}</b><small>${t.desc}</small>
      <span class="tpl-tags">${badge(t.trackType)} <span class="tag">${esc(t.tags.split(' ')[0])}</span></span>
    </button>`).join('')}
    <button class="tpl-card is-blank" data-tpl="-1"><b>空白笔记</b><small>从零开始写</small></button>
  </div><p class="tpl-hint">模板只预填框架，创建后仍可逐项修改。</p>`;
  openModalHTML('模板新建 · 笔记', inner, '', '');
  document.querySelectorAll('[data-tpl]').forEach(btn => btn.onclick = () => {
    const i = Number(btn.dataset.tpl);
    const preset = { status: '草稿' };
    if (i >= 0) {
      const t = NOTE_TEMPLATES[i];
      Object.assign(preset, { title: t.title, trackType: t.trackType, tags: t.tags, tip: t.tip, body: t.body, publishDate: D.add(2), account: accountName() });
    } else {
      Object.assign(preset, { publishDate: D.add(2), account: accountName() });
    }
    navigate('notes');
    document.getElementById('modalRoot').classList.remove('open');
    document.getElementById('modalRoot').innerHTML = '';
    openForm('notes', null, { preset, onSaved: () => renderCurrent() });
  });
}

/* ---------------- 新建入口 ---------------- */
function quickCreate() {
  if (SCHEMAS[PAGE.route] && !(Store.state.settings.assistant && READONLY.includes(PAGE.route))) {
    openForm(PAGE.route, null, { onSaved: () => renderCurrent() });
  } else if (SCHEMAS[PAGE.route] && Store.state.settings.assistant && READONLY.includes(PAGE.route)) {
    toast('助理模式下当前模块只读');
  } else if (PAGE.route === 'calendar') {
    openForm('notes', null, { preset: { publishDate: D.iso(D.today()), status: '草稿', account: accountName() }, onSaved: () => renderCurrent() });
  } else {
    openTemplateModal();
  }
}

/* ---------------- 某天详情 ---------------- */
function openDayModal(date) {
  const evs = eventsOn(date);
  const inner = `<div class="day-head"><b>${D.cnw(date)}</b><span>${evs.length} 个安排</span></div>
    <div class="day-evs">${evs.length ? evs.map(e => `
      <button class="day-ev" data-act="goto-item" data-route="${e.route}" data-id="${e.id}">
        <span class="badge tone-${e.tone}">${esc(e.kind)}</span>
        <b>${esc(e.title)}</b>
        <svg class="ni"><use href="#i-arrow"/></svg>
      </button>`).join('') : '<div class="empty">这天没有安排，适合拍点素材。</div>'}
    </div>`;
  const foot = `<button class="btn btn-ghost" data-day-add>在这天排一条笔记</button>`;
  openModalHTML(`日程 · ${D.short(date)}`, inner, foot, 'sm');
  document.querySelector('[data-day-add]').onclick = () => {
    document.getElementById('modalRoot').classList.remove('open');
    document.getElementById('modalRoot').innerHTML = '';
    openForm('notes', null, { preset: { publishDate: date, status: '草稿', account: accountName() }, onSaved: () => renderCurrent() });
  };
}

/* ---------------- 提醒铃 ---------------- */
function closeBell() { document.getElementById('bellPop').hidden = true; }
function openBell() {
  const pop = document.getElementById('bellPop');
  const rs = getReminders();
  pop.innerHTML = `<div class="bell-head"><b>提醒</b><span>${rs.length} 项</span></div>
    ${rs.length ? rs.slice(0, 8).map(r => `
      <button class="bell-row" data-act="goto-item" data-route="${r.route}" data-id="${r.itemId}">
        <span class="urgent-dot tone-${r.tone} ${r.level === 'overdue' ? 'is-overdue' : ''}"></span>
        <div><b>${esc(r.title)}</b><small>${esc(r.kind)} · ${esc(r.meta)}</small></div>
      </button>`).join('') : '<div class="bell-empty">暂无提醒</div>'}
    <div class="bell-foot">逾期事项优先处理，别让样品压在手里。</div>`;
  pop.hidden = false;
  const rect = document.getElementById('bellBtn').getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.top = (rect.bottom + 8) + 'px';
  pop.style.left = Math.max(12, Math.min(rect.right - w, window.innerWidth - w - 12)) + 'px';
}

/* ---------------- 全局搜索 ---------------- */
function searchAll(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const out = [];
  Object.values(SCHEMAS).forEach(s => {
    Store.list(s.key).forEach(it => {
      if (JSON.stringify(it).toLowerCase().includes(q)) out.push({ key: s.key, label: s.label, item: it, title: it[s.title] || it.name || it.brand || '未命名' });
    });
  });
  return out.slice(0, 24);
}
function openSearchInputModal() {
  const close = openModalHTML('搜索', `<div class="mobile-search"><svg class="ni"><use href="#i-search"/></svg><input id="mobileSearchInput" type="text" placeholder="搜索选题、样品、笔记…"></div>`, '', 'sm');
  const input = document.getElementById('mobileSearchInput');
  input.focus();
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    if (!q) return;
    close();
    openSearchModal(q);
  });
}

/* ---------------- 移动端全功能导航 ---------------- */
function closeMobileNav() {
  const sheet = document.getElementById('mnavSheet');
  if (sheet) sheet.remove();
}
function openMobileNav() {
  closeMobileNav();
  const groups = [...document.querySelectorAll('.nav-group')].map(g => ({
    label: (g.querySelector('.nav-label') || {}).textContent || '',
    items: [...g.querySelectorAll('.nav-item')].map(n => ({
      route: n.dataset.route,
      label: (n.querySelector('span') || {}).textContent || '',
      count: (n.querySelector('.nav-count') || {}).textContent || ''
    }))
  })).filter(g => g.items.length);
  const sheet = document.createElement('div');
  sheet.id = 'mnavSheet';
  sheet.className = 'mnav-sheet';
  sheet.innerHTML = `<div class="mnav-mask" data-mnav-close></div>
    <div class="mnav-panel">
      <div class="mnav-head"><b>全部功能</b><button class="icon-btn" type="button" data-mnav-close aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
      <div class="mnav-grid">${groups.map((g, gi) => g.items.map(it => `
        <button class="mnav-item${PAGE.route === it.route ? ' is-active' : ''}" type="button" data-mnav-route="${it.route}">
          <span>${esc(it.label)}${it.count ? `<em>${esc(it.count)}</em>` : ''}</span>
          <small>${esc(g.label || (gi === 0 ? '概览' : '功能'))}</small>
        </button>`).join('')).join('')}</div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-mnav-close]')) { closeMobileNav(); return; }
    const item = e.target.closest('[data-mnav-route]');
    if (!item) return;
    closeMobileNav();
    navigate(item.dataset.mnavRoute);
  });
}

function openSearchModal(q) {
  const res = searchAll(q);
  const inner = res.length ? `<div class="search-results">${res.map((r, i) => `
    <button class="search-row" data-res="${i}">
      <span class="soft-pill">${esc(r.label)}</span>
      <b>${esc(r.title)}</b>
      <svg class="ni"><use href="#i-arrow"/></svg>
    </button>`).join('')}</div>` : `<div class="empty">没有找到「${esc(q)}」，换个词试试。</div>`;
  openModalHTML(`搜索 · ${q}`, inner, '', '');
  document.querySelectorAll('[data-res]').forEach(btn => btn.onclick = () => {
    const r = res[Number(btn.dataset.res)];
    navigate(r.key);
    document.getElementById('modalRoot').classList.remove('open');
    document.getElementById('modalRoot').innerHTML = '';
    openForm(r.key, r.item, { readonly: Store.state.settings.assistant && READONLY.includes(r.key), onSaved: () => renderCurrent() });
  });
}

/* ---------------- 拖拽看板 ---------------- */
let dragPayload = null;
let lastDragEnd = 0;
function bindDrag() {
  const body = document.getElementById('pgBody');
  if (!body) return;
  body.querySelectorAll('.bcard').forEach(card => {
    card.ondragstart = e => {
      dragPayload = { key: card.dataset.key, id: card.dataset.id };
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (err) { }
    };
    card.ondragend = () => { card.classList.remove('is-dragging'); dragPayload = null; lastDragEnd = Date.now(); body.querySelectorAll('.board-col').forEach(c => c.classList.remove('is-over')); };
  });
  body.querySelectorAll('.board-col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('is-over'); };
    col.ondragleave = () => col.classList.remove('is-over');
    col.ondrop = e => {
      e.preventDefault(); col.classList.remove('is-over');
      if (!dragPayload) return;
      const schema = SCHEMAS[dragPayload.key];
      if (Store.state.settings.assistant && READONLY.includes(dragPayload.key)) { toast('助理模式下不可修改选题与商务'); return; }
      Store.update(dragPayload.key, dragPayload.id, { [schema.group]: col.dataset.drop });
      toast(`已移动到「${col.dataset.drop}」`);
      const movedKey = dragPayload.key;
      dragPayload = null;
      renderPage(movedKey);
    };
  });
}

/* ---------------- 事件 ---------------- */
function handleAction(el) {
  const act = el.dataset.act;
  const key = el.dataset.key;
  const id = el.dataset.id;
  const readonly = Store.state.settings.assistant && READONLY.includes(key);
  switch (act) {
    case 'goto': navigate(el.dataset.route); break;
    case 'goto-item': navigate(el.dataset.route, { scroll: false }); {
      const item = Store.find(el.dataset.route, el.dataset.id);
      if (item) openForm(el.dataset.route, item, { readonly: Store.state.settings.assistant && READONLY.includes(el.dataset.route), onSaved: () => renderCurrent() });
    } break;
    case 'new': {
      if (readonly) { toast('助理模式下不可新增选题或商务'); break; }
      const schema = SCHEMAS[key];
      const preset = {};
      if (el.dataset.preset && schema.group) preset[schema.group] = el.dataset.preset;
      openForm(key, null, { preset, onSaved: () => renderCurrent() });
    } break;
    case 'edit': {
      if (readonly) { toast('助理模式下不可编辑'); break; }
      openForm(key, Store.find(key, id), { onSaved: () => renderCurrent() });
    } break;
    case 'open': {
      if (Date.now() - lastDragEnd < 300) break;
      if (readonly) { openForm(key, Store.find(key, id), { readonly: true }); break; }
      openForm(key, Store.find(key, id), { onSaved: () => renderCurrent() });
    } break;
    case 'del': {
      if (readonly) { toast('助理模式下不可删除'); break; }
      confirmDialog('删除后不可恢复，确定要删除这一条吗？', '删除').then(ok => {
        if (!ok) return;
        Store.remove(key, id); toast('已删除'); renderCurrent();
      });
    } break;
    case 'view': PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.sort = null; PAGE.selected = {}; setCurrentView(key, el.dataset.view); renderPage(key); break;
    case 'mini-prev':
    case 'mini-next': {
      const a = PAGE.calMini[key] || new Date(D.today());
      PAGE.calMini[key] = new Date(a.getFullYear(), a.getMonth() + (act === 'mini-prev' ? -1 : 1), 1);
      renderPage(key);
    } break;
    case 'new-date': {
      if (readonly) { toast('助理模式下不可新增'); break; }
      const schema = SCHEMAS[key];
      const preset = {}; if (schema.date) preset[schema.date] = el.dataset.date;
      openForm(key, null, { preset, onSaved: () => renderCurrent() });
    } break;
    case 'filter': PAGE.filter = el.dataset.status; PAGE.selected = {}; renderPage(PAGE.route); break;
    case 'select': {
      const sid = el.dataset.id;
      if (PAGE.selected[sid]) delete PAGE.selected[sid]; else PAGE.selected[sid] = true;
      renderPage(key || PAGE.route);
    } break;
    case 'select-all': {
      const ids = PAGE.visibleIds || [];
      const all = ids.length > 0 && ids.every(sid => PAGE.selected[sid]);
      ids.forEach(sid => { if (all) delete PAGE.selected[sid]; else PAGE.selected[sid] = true; });
      renderPage(key || PAGE.route);
    } break;
    case 'batch-clear': PAGE.selected = {}; renderPage(key || PAGE.route); break;
    case 'batch-del': {
      if (readonly) { toast('助理模式下不可批量删除'); break; }
      const ids = Object.keys(PAGE.selected).filter(sid => Store.find(key, sid));
      if (!ids.length) { toast('请先勾选要删除的记录'); break; }
      confirmDialog(`确定删除选中的 ${ids.length} 条记录吗？删除后不可恢复。`, '删除').then(ok => {
        if (!ok) return;
        ids.forEach(sid => Store.remove(key, sid));
        PAGE.selected = {};
        toast(`已删除 ${ids.length} 条记录`);
        renderPage(PAGE.route);
      });
    } break;
    case 'batch-status': {
      if (readonly) { toast('助理模式下不可批量修改'); break; }
      const sel = document.getElementById('batchStatus');
      const status = sel ? sel.value : '';
      if (!status) { toast('请先选择要改成哪个状态'); break; }
      const ids = Object.keys(PAGE.selected).filter(sid => Store.find(key, sid));
      if (!ids.length) { toast('请先勾选要修改的记录'); break; }
      const schema = SCHEMAS[key];
      if (!schema.group) { toast('该模块不支持状态修改'); break; }
      ids.forEach(sid => Store.update(key, sid, { [schema.group]: status }));
      PAGE.selected = {};
      toast(`已把 ${ids.length} 条记录改为「${status}」`);
      renderPage(PAGE.route);
    } break;
    case 'sort': {
      const col = el.dataset.sortby;
      if (PAGE.sort && PAGE.sort.k === col) PAGE.sort.dir = PAGE.sort.dir === 'asc' ? 'desc' : 'asc';
      else PAGE.sort = { k: col, dir: 'asc' };
      renderPage(key || PAGE.route);
    } break;
    case 'loan-filter': PAGE.loanFilter = el.dataset.status; PAGE.selected = {}; renderPage(PAGE.route); break;
    case 'return-sample': {
      const sample = Store.find('samples', id);
      if (!sample) break;
      Store.update('samples', id, { loanStatus: '已归还', returnedDate: D.iso(D.today()) });
      toast(`已登记归还：${sample.name}`);
      renderCurrent();
    } break;
    case 'clearFilter': PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.query = ''; PAGE.selected = {}; renderPage(PAGE.route); break;
    case 'toggle': {
      const item = Store.find(key, id); if (!item) break;
      const schema = SCHEMAS[key];
      Store.update(key, id, { [schema.group]: item[schema.group] === '已完成' ? '未完成' : '已完成' });
      renderCurrent();
    } break;
    case 'template':
    case 'new-note': openTemplateModal(); break;
    case 'day': openDayModal(el.dataset.date); break;
    case 'new-idea': openForm('ideas', null, { onSaved: () => renderCurrent() }); break;
    case 'new-sample': openForm('samples', null, { onSaved: () => renderCurrent() }); break;
    case 'new-todo': openForm('todos', null, { onSaved: () => renderCurrent() }); break;
    case 'm-search': openSearchInputModal(); break;
    case 'm-nav': openMobileNav(); break;
    case 'm-new': quickCreate(); break;
    default: break;
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('a[href]')) return;
  const el = e.target.closest('[data-act]');
  if (el) { handleAction(el); return; }
  const go = e.target.closest('[data-go]');
  if (go) { navigate(go.dataset.go); return; }
  const nav = e.target.closest('.nav-item');
  if (nav) { navigate(nav.dataset.route); return; }
  if (!e.target.closest('#bellPop') && !e.target.closest('#bellBtn')) closeBell();
});

/* ---------------- 启动 ---------------- */
(function init() {
  if (typeof Auth !== 'undefined' && !Auth.require()) return;
  Store.init();
  const t = D.today();
  const session = typeof Auth !== 'undefined' ? Auth.current() : null;
  if (session) {
    document.getElementById('userName').textContent = session.name || session.user;
    if (typeof Profile !== 'undefined') Profile.applyFor(session.user);
  }
  syncUserAvatar();
  document.getElementById('userChip').onclick = () => navigate('profile');
  document.getElementById('todayText').textContent = `${D.cnw(D.iso(t))} · 第 ${Math.ceil((t - new Date(t.getFullYear(), 0, 1)) / 86400000)} 天`;
  document.getElementById('quickNew').onclick = quickCreate;
  document.getElementById('calPrev').onclick = () => {
    const a = calAnchor(), delta = PAGE.calMode === 'month' ? -1 : -7;
    PAGE.calDate = PAGE.calMode === 'month' ? new Date(a.getFullYear(), a.getMonth() + delta, 1) : D.parse(D.addOn(D.iso(a), delta));
    renderCalendarPage();
  };
  document.getElementById('calNext').onclick = () => {
    const a = calAnchor(), delta = PAGE.calMode === 'month' ? 1 : 7;
    PAGE.calDate = PAGE.calMode === 'month' ? new Date(a.getFullYear(), a.getMonth() + delta, 1) : D.parse(D.addOn(D.iso(a), delta));
    renderCalendarPage();
  };
  document.getElementById('calToday').onclick = () => { PAGE.calDate = new Date(D.today()); renderCalendarPage(); };
  document.getElementById('calAdd').onclick = quickCreate;
  document.getElementById('calLabel').ondblclick = () => {
    PAGE.calMode = PAGE.calMode === 'month' ? 'week' : 'month';
    PAGE.calDate = new Date(D.today()); renderCalendarPage();
  };
  document.querySelectorAll('#calSeg button').forEach(btn => btn.onclick = () => {
    PAGE.calMode = btn.dataset.cal;
    document.querySelectorAll('#calSeg button').forEach(b => b.classList.toggle('is-active', b === btn));
    renderCalendarPage();
  });
  document.getElementById('bellBtn').onclick = e => { e.stopPropagation(); const pop = document.getElementById('bellPop'); if (pop.hidden) openBell(); else closeBell(); };
  const gs = document.getElementById('globalSearch');
  gs.addEventListener('keydown', e => {
    if (e.key === 'Enter' && gs.value.trim()) { openSearchModal(gs.value.trim()); gs.value = ''; }
  });
  const msb = document.getElementById('mobileSearchBtn');
  if (msb) msb.onclick = openSearchInputModal;
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('globalSearch');
      if (input) input.focus();
      return;
    }
    if (e.key === 'Escape') { const root = document.getElementById('modalRoot'); if (root.classList.contains('open')) { root.classList.remove('open'); root.innerHTML = ''; } closeBell(); closeMobileNav(); }
  });
  const kbdHint = document.getElementById('searchKbd');
  if (kbdHint) kbdHint.textContent = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
  window.addEventListener('hashchange', () => { const r = location.hash.replace('#/', ''); if (r && r !== PAGE.route && ROUTE_NAMES[r]) navigate(r); });
  window.addEventListener('resize', () => { if (window.innerWidth > 640) closeMobileNav(); });

  const start = location.hash.replace('#/', '');
  navigate(ROUTE_NAMES[start] ? start : 'dashboard', { scroll: false });
  if (typeof Sync !== 'undefined') Sync.init();

  /* 注册 Service Worker，启用 PWA 离线能力 */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // 定时刷新：每分钟对齐日期与提醒
  setInterval(() => {
    if (PAGE.route === 'dashboard') renderDashboard();
    else if (PAGE.route === 'calendar') renderCalendarPage();
    else updateSidebar();
  }, 60000);
})();
