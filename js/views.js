/* ---------------- 页面状态 ---------------- */
const PAGE = { route: 'dashboard', query: '', filter: '全部', loanFilter: '全部', view: {}, sort: null, selected: {}, visibleIds: [], calDate: null, calMode: 'month' };
const READONLY = ['ideas', 'deals'];
const LOAN_FILTERS = ['全部', '已借出', '未借出', '已归还'];

function currentView(key) {
  const s = SCHEMAS[key];
  if (!PAGE.view[key]) PAGE.view[key] = (Store.state.settings.viewState && Store.state.settings.viewState[key]) || s.defaultView;
  if (!s.views.includes(PAGE.view[key])) PAGE.view[key] = s.defaultView;
  return PAGE.view[key];
}
function setCurrentView(key, v) {
  PAGE.view[key] = v;
  Store.state.settings.viewState[key] = v;
  Store.save();
}

/* ---------------- 日历事件聚合 ---------------- */
function eventsOn(date) {
  const ev = [];
  Store.list('notes').forEach(n => {
    if (n.publishDate === date) ev.push({ kind: '发布', title: n.title, route: 'notes', id: n.id, tone: TRACK_TONE[n.trackType] || 'sand', sub: n.trackType });
    if (n.shootDate === date) ev.push({ kind: '拍摄', title: n.title, route: 'notes', id: n.id, tone: 'amber' });
  });
  Store.list('samples').forEach(s => {
    if (s.arriveDate === date) ev.push({ kind: '到货', title: s.name, route: 'samples', id: s.id, tone: 'blue' });
    if (s.returnDate === date && s.status !== '已归还') ev.push({ kind: '归还', title: s.name, route: 'samples', id: s.id, tone: 'red' });
    if (s.loanStatus === '已借出' && s.dueDate === date) ev.push({ kind: '借还', title: s.name + (s.borrower ? ' · ' + s.borrower : ''), route: 'samples', id: s.id, tone: 'amber' });
  });
  Store.list('deals').forEach(d => {
    if (d.deadline === date && !['已交付', '已结款'].includes(d.deliveryStatus)) ev.push({ kind: '商单', title: d.brand + ' 交付截止', route: 'deals', id: d.id, tone: 'violet' });
  });
  Store.list('ideas').forEach(i => {
    if (i.planDate === date && i.status !== '已发布') ev.push({ kind: '选题', title: i.title, route: 'ideas', id: i.id, tone: 'sand' });
  });
  return ev;
}

function eventsInWeek(dates) {
  return dates.map(d => ({ date: d, events: eventsOn(d) }));
}

/* ---------------- 仪表盘 ---------------- */
function renderDashboard() {
  const t = D.today();
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  document.getElementById('greeting').textContent = `${greet}，${typeof Auth !== 'undefined' ? Auth.displayName() : '拾一'}`;
  document.getElementById('heroDay').textContent = t.getDate();
  document.getElementById('heroMonth').textContent = (t.getMonth() + 1) + ' 月';
  document.getElementById('heroWeek').textContent = D.weekday(D.iso(t));

  const notes = Store.list('notes');
  const ideas = Store.list('ideas');
  const reminders = getReminders();
  const week = D.weekDates();
  const weekPub = notes.filter(n => n.status === '数据复盘' && week.includes(n.publishDate));
  const weekPlan = notes.filter(n => n.status !== '数据复盘' && week.includes(n.publishDate));
  const shooting = ideas.filter(i => i.status === '待拍摄').length + notes.filter(n => ['拍摄完成', '修图剪辑'].includes(n.status)).length;
  const fin = monthFinance();
  const todoOpen = Store.list('todos').filter(x => x.done !== '已完成').length;

  document.getElementById('heroMeta').textContent = `${weekPlan.length} 条待发 · ${todoOpen} 件待办 · 今天 ${eventsOn(D.iso(t)).length} 个安排`;
  document.getElementById('heroStats').innerHTML = `
    <div><b>${notes.filter(n => n.status === '数据复盘').length}</b><span>已发笔记</span></div>
    <div><b>${D.num(notes.reduce((a, n) => a + (Number(n.exposure) || 0), 0))}</b><span>累计曝光</span></div>
    <div><b>${D.num(notes.reduce((a, n) => a + (Number(n.saves) || 0), 0))}</b><span>累计收藏</span></div>`;

  const kpis = [
    { label: '本周待发', value: weekPlan.length, unit: '条', sub: `${weekPub.length} 条已发`, route: 'notes', icon: 'i-layers' },
    { label: '待拍摄', value: shooting, unit: '项', sub: '选题 + 流水线', route: 'ideas', icon: 'i-image' },
    { label: '紧急提醒', value: reminders.filter(r => r.level !== 'normal').length, unit: '项', sub: reminders.filter(r => r.level === 'overdue').length + ' 项逾期', route: 'calendar', warn: reminders.some(r => r.level === 'overdue'), icon: 'i-bell' },
    { label: '本月结余', value: D.money(fin.net), sub: `收 ${D.money(fin.income)} / 支 ${D.money(fin.expense)}`, route: 'finance', bad: fin.net < 0, icon: 'i-wallet' }
  ];
  document.getElementById('kpiRow').innerHTML = kpis.map(k => `
    <button class="kpi card" data-act="goto" data-route="${k.route}">
      <span class="kpi-top">
        <span class="kpi-icon ${k.warn || k.bad ? 'is-warn' : ''}"><svg><use href="#${k.icon}"/></svg></span>
        <span class="kpi-label">${k.label}</span>
      </span>
      <div class="kpi-val ${k.warn || k.bad ? 'is-warn' : ''}">${k.value}<small>${k.unit || ''}</small></div>
      <span class="kpi-sub">${k.sub}</span>
    </button>`).join('');

  // 空数据引导
  document.getElementById('dashOnboard').innerHTML = Store.totalCount() ? '' : `
    <div class="card panel onboard">
      <div>
        <span class="eyebrow">从零开始</span>
        <h2>工作台已清空，先把第一件事放进来</h2>
        <p>示例数据清掉后，这里只留下你自己的记录。建议从一条笔记、一条灵感或一件样品开始。</p>
      </div>
      <div class="onboard-actions">
        <button class="btn btn-primary" data-act="new-note"><svg class="ni"><use href="#i-spark"/></svg>模板新建笔记</button>
        <button class="btn btn-ghost" data-act="new-idea"><svg class="ni"><use href="#i-bulb"/></svg>记一条灵感</button>
        <button class="btn btn-ghost" data-act="new-sample"><svg class="ni"><use href="#i-sofa"/></svg>登记样品</button>
      </div>
    </div>`;

  // 本周排期
  document.getElementById('weekStrip').innerHTML = week.map(d => {
    const evs = eventsOn(d);
    const isToday = d === D.iso(t);
    const isPast = D.diff(d, D.iso(t)) > 0;
    return `<button class="week-day ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}" data-act="day" data-date="${d}">
      <span class="wd-name">${D.weekday(d)}</span>
      <b class="wd-num">${D.parse(d).getDate()}</b>
      <div class="wd-events">${evs.slice(0, 2).map(e => `<span class="ev-dot tone-${e.tone}">${esc(e.kind)}</span>`).join('')}${evs.length > 2 ? `<span class="ev-more">+${evs.length - 2}</span>` : ''}</div>
      ${evs.length ? '' : '<span class="wd-empty">空</span>'}
    </button>`;
  }).join('');

  // 紧急待办
  const urgent = reminders.slice(0, 5);
  document.getElementById('urgentCount').textContent = reminders.length + ' 项';
  document.getElementById('urgentList').innerHTML = urgent.length ? urgent.map(r => `
    <button class="urgent-item" data-act="goto-item" data-route="${r.route}" data-id="${r.itemId}">
      <span class="urgent-dot tone-${r.tone} ${r.level === 'overdue' ? 'is-overdue' : ''}"></span>
      <div class="urgent-main"><b>${esc(r.title)}</b><small>${esc(r.kind)} · ${esc(r.meta)}</small></div>
      <span class="urgent-date">${r.level === 'overdue' ? '逾期' : D.short(r.date)}</span>
    </button>`).join('') : `<div class="empty-soft">没有临期事项，节奏很稳。</div>`;

  // 数据速览
  const published = notes.filter(n => n.status === '数据复盘').sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || '')).slice(0, 3);
  document.getElementById('perfList').innerHTML = published.length ? published.map(n => {
    const max = Math.max(...published.map(x => Number(x.exposure) || 0), 1);
    return `<div class="perf-row" data-act="open" data-key="notes" data-id="${n.id}">
      <div class="perf-top"><b>${esc(n.title)}</b><span>${D.short(n.publishDate)}</span></div>
      <div class="perf-bar"><i style="width:${Math.round((Number(n.exposure) || 0) / max * 100)}%"></i></div>
      <div class="perf-meta"><span>曝光 ${D.num(n.exposure)}</span><span>赞 ${D.num(n.likes)}</span><span>藏 ${D.num(n.saves)}</span>${Number(n.exposure) ? `<span>收藏率 ${((Number(n.saves) || 0) / Number(n.exposure) * 100).toFixed(1)}%</span>` : ''}</div>
    </div>`;
  }).join('') : '<div class="empty-soft">发布后记得回来填数据。</div>';

  // 本周待办 + 灵感速递（含模拟实时）
  renderWeekTodos();
  ensureSimIdeas();
  renderIdeaFeed();

  // 流水线
  const counts = pipelineCounts();
  const total = notes.length || 1;
  document.getElementById('pipelineTotal').textContent = notes.length + ' 条';
  document.getElementById('pipeline').innerHTML = counts.map(c => `
    <div class="pipe-row" data-act="goto" data-route="notes">
      <span class="pipe-label">${esc(c.status)}</span>
      <div class="pipe-bar"><i class="${c.status === '数据复盘' ? 'done' : ''}" style="width:${Math.max(2, c.count / total * 100)}%"></i></div>
      <em>${c.count}</em>
    </div>`).join('');

  // 数据图表
  document.getElementById('chartTrend').innerHTML = renderTrendChart(notes);
  document.getElementById('chartTypes').innerHTML = renderTypeChart(notes);
  document.getElementById('chartSpend').innerHTML = renderSpendChart();

  // 快捷入口
  const quick = [
    { t: '登记样品', s: '归还别忘', icon: 'i-sofa', act: 'new-sample' },
    { t: '加待办', s: '今天的事', icon: 'i-check', act: 'new-todo' },
    { t: '排期日历', s: '看整月', icon: 'i-cal', act: 'goto', route: 'calendar' },
    { t: '收支台账', s: '算清楚', icon: 'i-wallet', act: 'goto', route: 'finance' },
    { t: '素材图库', s: '找图复用', icon: 'i-image', act: 'goto', route: 'assets' },
    { t: '布景道具', s: '一套复用', icon: 'i-lamp', act: 'goto', route: 'scenes' }
  ];
  document.getElementById('quickGrid').innerHTML = quick.map(q => `
    <button class="quick-item" data-act="${q.act}" ${q.route ? `data-route="${q.route}"` : ''}>
      <svg class="ni"><use href="#${q.icon}"/></svg><b>${q.t}</b><small>${q.s}</small>
    </button>`).join('');

  startDashboardSim();
  updateSidebar();
}

/* ---------------- 首页实时模拟 ---------------- */
const SIM_IDEAS = [
  { direction: '改造', title: '15㎡出租屋，只换三样软装就变了', styles: ['低成本', '出租屋'] },
  { direction: '收纳', title: '梳妆台台面无物化，藏进抽屉的 7 件', styles: ['收纳', '动线'] },
  { direction: '香薰', title: '秋冬房间的味道，三支香薰横向对比', styles: ['香薰', '氛围'] },
  { direction: '布景', title: '一块软木板，撑起整面照片墙', styles: ['软木板', '墙面'] },
  { direction: '改造', title: '床头柜换成窄边几，过道宽了 20cm', styles: ['小户型', '动线'] },
  { direction: '测评', title: '五把梳妆凳坐高实测，谁适合久坐', styles: ['测评', '实测'] }
];
const WEEK_DEMO_TODOS = [
  { id: 'sim-wt-1', title: '补拍梳妆凳坐高对比图', module: '拍摄', priority: '高', dueOffset: 0, done: false },
  { id: 'sim-wt-2', title: '软木板笔记文案定稿', module: '发布', priority: '中', dueOffset: 1, done: false },
  { id: 'sim-wt-3', title: '回致欧的档期确认', module: '商务', priority: '中', dueOffset: 2, done: false },
  { id: 'sim-wt-4', title: '把原木梳妆凳寄回木野', module: '样品', priority: '高', dueOffset: -1, done: false },
  { id: 'sim-wt-5', title: '整理本周素材归档', module: '其他', priority: '低', dueOffset: 3, done: true }
];
const DASH_SIM = { extra: [], hot: {}, demoDone: {}, seq: 0, mainTimer: null, hotTimer: null, ideaTimer: null, todoTimer: null };

function timeNow() {
  const d = new Date();
  return `${D.pad(d.getHours())}:${D.pad(d.getMinutes())}:${D.pad(d.getSeconds())}`;
}

function weekTodoSet() {
  const todayIso = D.iso(D.today());
  const week = D.weekDates();
  const all = Store.list('todos');
  const inWeek = all.filter(x => x.due && week.includes(x.due));
  if (inWeek.length) {
    const open = inWeek.filter(x => x.done !== '已完成').sort((a, b) => a.due.localeCompare(b.due));
    const done = inWeek.filter(x => x.done === '已完成');
    return { items: [...open, ...done].slice(0, 5), total: inWeek.length, doneCount: done.length, demo: false };
  }
  if (all.length) return { items: [], total: 0, doneCount: 0, demo: false };
  const demoItems = WEEK_DEMO_TODOS.map(x => ({ ...x, due: D.addOn(todayIso, x.dueOffset), done: x.done || !!DASH_SIM.demoDone[x.id] }));
  const open = demoItems.filter(x => !x.done);
  const done = demoItems.filter(x => x.done);
  return { items: [...open, ...done].slice(0, 5), total: demoItems.length, doneCount: done.length, demo: true };
}

function renderWeekTodos() {
  const { items, total, doneCount, demo } = weekTodoSet();
  document.getElementById('todoWeekPill').textContent = `${doneCount} / ${total}`;
  const pct = total ? Math.round(doneCount / total * 100) : 0;
  document.getElementById('todoProgressBar').style.width = pct + '%';
  document.getElementById('todoProgressText').textContent = pct + '%';
  const todayIso = D.iso(D.today());
  document.getElementById('weekTodoList').innerHTML = items.length ? items.map(x => {
    const left = D.diff(todayIso, x.due);
    const dueLabel = left < 0 ? `逾期 ${-left} 天` : left === 0 ? '今天' : left === 1 ? '明天' : D.weekday(x.due);
    const tone = x.priority === '高' ? 'red' : x.priority === '中' ? 'amber' : 'gray';
    const done = x.done === '已完成';
    const attrs = demo ? '' : ` data-act="toggle" data-key="todos" data-id="${x.id}"`;
    return `<${demo ? 'div' : 'button'} class="wt-row ${done ? 'is-done' : ''}"${attrs}>
      <span class="wt-check"><svg><use href="#i-check"/></svg></span>
      <div class="wt-main"><b>${esc(x.title)}</b><small class="${left < 0 && !done ? 'is-red' : ''}">${esc(x.module || '待办')} · ${dueLabel}${demo ? ' · 模拟' : ''}</small></div>
      <span class="wt-pri tone-${tone}">${esc(x.priority || '中')}</span>
    </${demo ? 'div' : 'button'}>`;
  }).join('') : '<div class="empty-soft">本周还没有待办，去加一件。</div>';
}

function seedHot(id) {
  let h = 0;
  for (const c of String(id)) h += c.charCodeAt(0);
  DASH_SIM.hot[id] = 8 + (h % 19);
  return DASH_SIM.hot[id];
}

function renderIdeaFeed() {
  const ideas = Store.list('ideas');
  const base = ideas.filter(i => ['灵感', '待写脚本'].includes(i.status)).slice(0, 4);
  const room = Math.max(0, 4 - base.length);
  const feed = [...DASH_SIM.extra.slice(0, room), ...base].slice(0, 4);
  const host = document.getElementById('ideaFeed');
  if (!feed.length) { host.innerHTML = '<div class="empty-soft">灵感池空了，去逛逛别人的家。</div>'; return; }
  host.innerHTML = feed.map(i => {
    const hot = DASH_SIM.hot[i.id] || seedHot(i.id);
    const attrs = i.sim ? '' : ` data-act="open" data-key="ideas" data-id="${i.id}"`;
    return `<div class="feed-row${i.sim ? ' is-new' : ''}"${attrs}>
      <div class="feed-tag">${badge(i.direction)}</div>
      <div class="feed-main"><b>${esc(i.title)}</b><small>${(i.styles || []).slice(0, 2).map(s => esc(s)).join(' · ') || '未加风格标签'}${i.planDate ? ' · 计划 ' + D.short(i.planDate) : ''}${i.sim ? ' · 模拟推送' : ''}</small></div>
      <em class="feed-hot" data-hot="${i.id}">热度 ${hot}</em>
      <span class="feed-status">${badge(i.status)}</span>
    </div>`;
  }).join('');
}

function ensureSimIdeas() {
  const base = Store.list('ideas').filter(i => ['灵感', '待写脚本'].includes(i.status));
  if (!base.length && !DASH_SIM.extra.length) {
    DASH_SIM.extra = SIM_IDEAS.slice(0, 2).map((x, i) => ({ ...x, id: 'sim-idea-' + i, sim: true, status: '灵感', planDate: '' }));
  }
}

function simTickClock() {
  const a = document.getElementById('todoSync');
  const b = document.getElementById('feedSync');
  if (a) a.textContent = '同步于 ' + timeNow();
  if (b) b.textContent = '更新于 ' + timeNow();
}

function simTickHot() {
  document.querySelectorAll('#ideaFeed .feed-hot').forEach(el => {
    const id = el.dataset.hot;
    const next = (DASH_SIM.hot[id] || seedHot(id)) + 1 + Math.floor(Math.random() * 3);
    DASH_SIM.hot[id] = next;
    el.textContent = '热度 ' + next;
    el.classList.add('is-bump');
    setTimeout(() => el.classList.remove('is-bump'), 600);
  });
}

function simNextIdea() {
  const realCount = Store.list('ideas').filter(i => ['灵感', '待写脚本'].includes(i.status)).slice(0, 4).length;
  const cap = 4 - realCount;
  if (cap <= 0) return;
  const src = SIM_IDEAS[DASH_SIM.seq % SIM_IDEAS.length];
  DASH_SIM.seq += 1;
  DASH_SIM.extra = [{ ...src, id: 'sim-idea-' + DASH_SIM.seq + '-' + Date.now().toString(36), sim: true, status: '灵感', planDate: '' }, ...DASH_SIM.extra].slice(0, cap);
  renderIdeaFeed();
}

function simAdvanceDemoTodo() {
  if (!weekTodoSet().demo) return;
  const waiting = WEEK_DEMO_TODOS.filter(x => !x.done && !DASH_SIM.demoDone[x.id]);
  if (!waiting.length) return;
  DASH_SIM.demoDone[waiting[Math.floor(Math.random() * waiting.length)].id] = true;
  renderWeekTodos();
}

function startDashboardSim() {
  stopDashboardSim();
  simTickClock();
  const guard = fn => () => { if (PAGE.route !== 'dashboard') { stopDashboardSim(); return; } fn(); };
  DASH_SIM.mainTimer = setInterval(guard(simTickClock), 1000);
  DASH_SIM.hotTimer = setInterval(guard(simTickHot), 4000);
  DASH_SIM.ideaTimer = setInterval(guard(simNextIdea), 15000);
  DASH_SIM.todoTimer = setInterval(guard(simAdvanceDemoTodo), 22000);
}

function stopDashboardSim() {
  ['mainTimer', 'hotTimer', 'ideaTimer', 'todoTimer'].forEach(k => {
    if (DASH_SIM[k]) { clearInterval(DASH_SIM[k]); DASH_SIM[k] = null; }
  });
}

/* ---------------- 首页图表 ---------------- */
const VIZ_COLORS = { '种草': 'var(--accent)', '测评': 'var(--sage)', '改造': 'var(--accent-1)', '商单': 'var(--accent-deep)', '其他': 'var(--faint)' };

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * p;
}

function renderTrendChart(notes) {
  const pts = notes.filter(n => n.publishDate && Number(n.exposure) > 0)
    .sort((a, b) => a.publishDate.localeCompare(b.publishDate)).slice(-6);
  if (pts.length < 2) return '<div class="empty-soft">已发笔记填满 2 条曝光数据后，这里会自动画出走势。</div>';
  const W = 440, H = 200, L = 42, R = 14, T = 16, B = 32;
  const max = niceMax(Math.max(...pts.map(n => Number(n.exposure) || 0)));
  const iw = W - L - R, ih = H - T - B;
  const x = i => L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1));
  const y = v => T + ih * (1 - v / max);
  const line = pts.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(n.exposure)).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${T + ih} L${x(0).toFixed(1)},${T + ih} Z`;
  const grid = [0, .5, 1].map(g => {
    const gy = (T + ih * (1 - g)).toFixed(1);
    return `<line x1="${L}" y1="${gy}" x2="${W - R}" y2="${gy}" class="viz-grid-line"/>
      <text x="${L - 8}" y="${Number(gy) + 3}" text-anchor="end" class="viz-axis-label">${D.num(max * g)}</text>`;
  }).join('');
  const dots = pts.map((n, i) => `<circle class="viz-dot" cx="${x(i).toFixed(1)}" cy="${y(Number(n.exposure)).toFixed(1)}" r="3.6"><title>${esc(n.title)}｜曝光 ${D.num(n.exposure)}</title></circle>`).join('');
  const labels = pts.map((n, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="viz-axis-label">${D.short(n.publishDate)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="viz-svg" role="img" aria-label="最近已发笔记曝光走势">
    <defs><linearGradient id="vizTrendFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="viz-stop-a"/><stop offset="1" class="viz-stop-b"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#vizTrendFill)"/>
    <path d="${line}" class="viz-line" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${labels}
  </svg>
  <div class="viz-legend"><i class="viz-key"></i>曝光<span class="viz-legend-note">近 ${pts.length} 条已发笔记</span></div>`;
}

function renderTypeChart(notes) {
  const total = notes.length;
  if (!total) return '<div class="empty-soft">还没有笔记，先建一条。</div>';
  const groups = TRACKS.map(t => ({ t, n: notes.filter(x => x.trackType === t).length })).filter(g => g.n);
  const C = 2 * Math.PI * 52;
  let acc = 0;
  const arcs = groups.map(g => {
    const len = g.n / total * C;
    const seg = `<circle cx="100" cy="100" r="52" fill="none" style="stroke:${VIZ_COLORS[g.t] || 'var(--faint)'}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(g.t)} ${g.n} 篇</title></circle>`;
    acc += len;
    return seg;
  }).join('');
  const legend = groups.map(g => `<div class="donut-item"><i style="background:${VIZ_COLORS[g.t] || 'var(--faint)'}"></i><span>${esc(g.t)}</span><em>${g.n}</em><small>${Math.round(g.n / total * 100)}%</small></div>`).join('');
  return `<div class="donut-wrap">
    <div class="donut-box"><svg viewBox="0 0 200 200" class="donut-svg" role="img" aria-label="笔记类型分布">${arcs}<text x="100" y="96" text-anchor="middle" class="donut-total">${total}</text><text x="100" y="116" text-anchor="middle" class="donut-unit">篇笔记</text></svg></div>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

function renderSpendChart() {
  const mk = D.monthKey(D.iso(D.today()));
  const list = Store.list('finance').filter(f => f.kind === '支出' && D.monthKey(f.date) === mk);
  if (!list.length) return '<div class="empty-soft">本月还没有支出记录。</div>';
  const by = {};
  list.forEach(f => { by[f.category] = (by[f.category] || 0) + (Number(f.amount) || 0); });
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(r => r[1]), 1);
  const palette = ['var(--accent)', 'var(--accent-1)', 'var(--accent-2)', 'var(--accent-deep)', 'var(--sage)', 'var(--faint)'];
  return `<div class="spend-total"><span>本月支出合计</span><b>${D.money(rows.reduce((a, r) => a + r[1], 0))}</b></div>
    <div class="spend-list">${rows.map((r, i) => `<div class="spend-row">
      <span class="spend-label">${esc(r[0])}</span>
      <div class="spend-bar"><i style="width:${Math.max(3, r[1] / max * 100)}%;background:${palette[i % palette.length]}"></i></div>
      <b class="spend-amt">${D.money(r[1])}</b>
    </div>`).join('')}</div>`;
}

/* ---------------- 通用模块页面 ---------------- */
const NEW_LABELS = { ideas: '选题', notes: '笔记', samples: '样品', scenes: '布景', assets: '素材', deals: '合作', lessons: '复盘', finance: '记录', todos: '待办' };

function renderPage(key) {
  const s = SCHEMAS[key];
  const readonly = Store.state.settings.assistant && READONLY.includes(key);
  const items = Store.list(key);

  document.getElementById('pgTitle').textContent = s.label;
  document.getElementById('pgDesc').textContent = s.desc;
  document.getElementById('pgActions').innerHTML = `
    ${readonly ? '<span class="soft-pill">助理模式 · 只读</span>' : ''}
    ${s.template && !readonly ? `<button class="btn btn-ghost" data-act="template"><svg class="ni"><use href="#i-spark"/></svg>模板新建</button>` : ''}
    ${!readonly ? `<button class="btn btn-primary" data-act="new" data-key="${key}"><svg class="ni"><use href="#i-plus"/></svg>新建${NEW_LABELS[key] || ''}</button>` : ''}`;

  // 汇总区
  const summary = document.getElementById('pgSummary');
  if (s.summary) summary.innerHTML = renderFinanceSummary();
  else if (key === 'samples') summary.innerHTML = renderLoanSummary();
  else summary.innerHTML = '';

  const view = currentView(key);
  const statuses = s.statuses || [];
  const filterChips = statuses.length && ['board', 'table', 'gallery', 'list'].includes(view)
    ? `<div class="filter-chips">${['全部', ...statuses].map(st => `<button class="chip ${PAGE.filter === st ? 'is-active' : ''}" data-act="filter" data-status="${esc(st)}">${esc(st)}</button>`).join('')}</div>` : '';
  const loanChips = key === 'samples' && ['board', 'table', 'gallery', 'list'].includes(view)
    ? `<div class="filter-chips loan-chips"><span class="chip-label">借出</span>${LOAN_FILTERS.map(st => `<button class="chip ${PAGE.loanFilter === st ? 'is-active' : ''}" data-act="loan-filter" data-status="${esc(st)}">${esc(st)}</button>`).join('')}</div>` : '';

  document.getElementById('pgToolbar').innerHTML = `
    ${s.views.length > 1 ? renderViewSwitcher(s, view) : ''}
    <label class="search-box"><svg><use href="#i-search"/></svg><input id="pageSearch" type="text" placeholder="搜索${s.label}" value="${esc(PAGE.query)}"></label>
    ${filterChips}
    ${loanChips}
    <span class="count-note" id="countNote"></span>`;

  const list = filterItems(key, items);
  document.getElementById('countNote').textContent = `共 ${items.length} 条 · 显示 ${list.length}`;
  const body = document.getElementById('pgBody');
  if (!items.length) {
    body.innerHTML = `<div class="empty-lg"><span class="empty-icon"><svg><use href="#i-layers"/></svg></span><b>${esc(s.label)}还是空的</b><p>${esc(s.desc)}</p>${readonly ? '' : `<button class="btn btn-soft" data-act="new" data-key="${key}"><svg class="ni"><use href="#i-plus"/></svg>新建第一条</button>`}</div>`;
    return;
  }
  if (!list.length) {
    body.innerHTML = `<div class="empty-lg"><span class="empty-icon"><svg><use href="#i-search"/></svg></span><b>没有匹配的记录</b><p>换个关键词或清空筛选试试。</p><button class="btn btn-ghost" data-act="clearFilter">清空筛选</button></div>`;
    return;
  }
  const sorted = view === 'table' ? (PAGE.sort ? sortItems(key, list, PAGE.sort) : list) : list;
  PAGE.visibleIds = view === 'table' ? sorted.map(it => it.id) : [];
  if (view === 'board') body.innerHTML = renderBoard(s, list, readonly);
  else if (view === 'table') {
    const selCount = sorted.filter(it => PAGE.selected[it.id]).length;
    body.innerHTML = (readonly ? '' : renderBatchBar(s, selCount)) + renderTable(s, sorted, PAGE.sort, readonly);
  }
  else if (view === 'gallery') body.innerHTML = renderGallery(s, list);
  else if (view === 'list') body.innerHTML = renderList(s, list);
  else if (view === 'calendar') body.innerHTML = renderCollectionCalendar(s, list);
  else body.innerHTML = renderBoard(s, list, readonly);

  const searchInput = document.getElementById('pageSearch');
  if (searchInput) {
    searchInput.oninput = e => {
      PAGE.query = e.target.value;
      PAGE.selected = {};
      const pos = e.target.selectionStart;
      renderPage(key);
      const ni = document.getElementById('pageSearch');
      if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
    };
  }
  bindDrag();
  updateSidebar();
}

/* ---------------- 表格批量操作条 ---------------- */
function renderBatchBar(schema, selCount) {
  const statuses = schema.statuses || [];
  const off = selCount ? '' : ' disabled';
  return `<div class="batch-bar${selCount ? ' is-active' : ''}">
    <span class="batch-count">已选 <b>${selCount}</b> 条</span>
    ${statuses.length ? `<span class="batch-group"><select id="batchStatus" class="batch-select"${off}><option value="">批量改状态…</option>${statuses.map(st => `<option value="${esc(st)}">${esc(st)}</option>`).join('')}</select><button class="btn btn-soft btn-xs" data-act="batch-status" data-key="${schema.key}"${off}>应用</button></span>` : ''}
    <button class="btn btn-danger btn-xs" data-act="batch-del" data-key="${schema.key}"${off}>删除所选</button>
    <button class="btn btn-ghost btn-xs" data-act="batch-clear" data-key="${schema.key}"${off}>取消选择</button>
    <span class="batch-tip">勾选表格左侧方框后可批量操作</span>
  </div>`;
}

function filterItems(key, items) {
  let list = items;
  const s = SCHEMAS[key];
  if (PAGE.filter !== '全部' && s.statuses && s.statuses.includes(PAGE.filter)) {
    list = list.filter(i => i[s.group] === PAGE.filter);
  }
  if (key === 'samples' && PAGE.loanFilter !== '全部') {
    list = list.filter(i => (i.loanStatus || '未借出') === PAGE.loanFilter);
  }
  if (PAGE.query.trim()) {
    const q = PAGE.query.trim().toLowerCase();
    list = list.filter(i => JSON.stringify(i).toLowerCase().includes(q));
  }
  return list;
}

function sortItems(key, items, sort) {
  const schema = SCHEMAS[key];
  const f = fieldOf(schema, sort.k);
  const dir = sort.dir === 'desc' ? -1 : 1;
  const valOf = it => {
    if (!f) return it[sort.k] == null ? '' : it[sort.k];
    if (f.type === 'number') return Number(it[f.k]) || 0;
    const v = fieldValue(schema, it, f.k);
    return v == null ? '' : v;
  };
  return items.slice().sort((a, b) => {
    const va = valOf(a), vb = valOf(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    // 空值统一排在后面
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    return String(va).localeCompare(String(vb), 'zh') * dir;
  });
}

/* ---------------- 集合内的日历视图 ---------------- */
PAGE.calMini = {};
function renderCollectionCalendar(schema, items) {
  const key = schema.key;
  if (!PAGE.calMini[key]) PAGE.calMini[key] = new Date(D.today());
  const anchor = PAGE.calMini[key];
  const year = anchor.getFullYear(), month = anchor.getMonth();
  const dated = items.filter(i => i[schema.date]);
  const undated = items.length - dated.length;
  const first = new Date(year, month, 1);
  const start = D.weekStart(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = D.addOn(D.iso(start), i);
    const dt = D.parse(d);
    const evs = dated.filter(it => it[schema.date] === d);
    cells.push(`<div class="mini-cell ${dt.getMonth() !== month ? 'is-other' : ''} ${d === D.iso(D.today()) ? 'is-today' : ''}" data-act="new-date" data-key="${key}" data-date="${d}">
      <span class="mini-num">${dt.getDate()}</span>
      <div class="mini-evs">${evs.slice(0, 2).map(it => `<button class="mini-ev" data-act="open" data-key="${key}" data-id="${it.id}" title="${esc(it[schema.title])}">${esc(it[schema.title]).slice(0, 7)}</button>`).join('')}${evs.length > 2 ? `<span class="mini-more">+${evs.length - 2}</span>` : ''}</div>
    </div>`);
  }
  return `<div class="card mini-cal">
    <div class="mini-head">
      <button class="icon-btn" data-act="mini-prev" data-key="${key}"><svg><use href="#i-left"/></svg></button>
      <b>${year} 年 ${month + 1} 月</b>
      <button class="icon-btn" data-act="mini-next" data-key="${key}"><svg><use href="#i-right"/></svg></button>
      <span class="mini-note">按${esc(fieldOf(schema, schema.date) ? fieldOf(schema, schema.date).t : '日期')}排列${undated ? `，另有 ${undated} 条无日期未显示` : ''}</span>
    </div>
    <div class="cal-weekhead">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(w => `<span>${w}</span>`).join('')}</div>
    <div class="mini-grid">${cells.join('')}</div>
  </div>`;
}

/* ---------------- 样品借出汇总 ---------------- */
function renderLoanSummary() {
  const today = D.iso(D.today());
  const all = Store.list('samples');
  const out = all.filter(s => s.loanStatus === '已借出');
  const soon = out.filter(s => s.dueDate && D.diff(today, s.dueDate) >= 0 && D.diff(today, s.dueDate) <= 3);
  const overdue = out.filter(s => s.dueDate && D.diff(today, s.dueDate) < 0);
  const rows = out.map(s => {
    const left = s.dueDate ? D.diff(today, s.dueDate) : null;
    const meta = left === null ? `借出 ${D.cn(s.loanDate)}` : left < 0 ? `已逾期 ${-left} 天` : left === 0 ? '今天应还' : `${left} 天后应还`;
    const tone = left === null ? '' : left < 0 ? 'is-over' : left <= 3 ? 'is-soon' : '';
    return `<div class="loan-row">
      <button class="loan-name" data-act="open" data-key="samples" data-id="${esc(s.id)}">${esc(s.name)}</button>
      <span class="loan-who">${esc(s.borrower || '未填借用人')}</span>
      <span class="loan-date">借 ${D.short(s.loanDate)} → 应还 ${D.short(s.dueDate)}</span>
      <span class="loan-left ${tone}">${meta}</span>
      <button class="btn btn-soft btn-xs" data-act="return-sample" data-id="${esc(s.id)}">登记归还</button>
    </div>`;
  }).join('');
  return `<div class="loan-summary card">
    <div class="loan-stats">
      <div class="loan-stat"><span>借出中</span><b>${out.length} 件</b></div>
      <div class="loan-stat"><span>3 天内应还</span><b class="warn">${soon.length} 件</b></div>
      <div class="loan-stat"><span>已逾期</span><b class="danger">${overdue.length} 件</b></div>
      <div class="loan-stat"><span>已归还记录</span><b>${all.filter(s => s.loanStatus === '已归还').length} 件</b></div>
    </div>
    ${out.length ? `<div class="loan-list"><div class="loan-head"><b>借出中明细</b><span>到期自动进入首页紧急待办与提醒铃</span></div>${rows}</div>` : `<p class="loan-empty">当前没有借出中的样品。在样品表单「借出与归还」里填上借用人即可开始追踪。</p>`}
  </div>`;
}

/* ---------------- 财务汇总 ---------------- */
function renderFinanceSummary() {
  const fin = monthFinance();
  const monthLabel = D.parse(D.iso(D.today()).slice(0, 7) + '-01');
  const deals = Store.list('deals');
  const pending = deals.filter(d => d.deliveryStatus !== '已结款' && Number(d.payment) > 0).reduce((a, d) => a + Number(d.payment), 0);
  const max = Math.max(fin.income, fin.expense, 1);
  return `<div class="fin-summary card">
    <div class="fin-stat"><span>${monthLabel.getMonth() + 1} 月收入</span><b class="income">${D.money(fin.income)}</b></div>
    <div class="fin-stat"><span>${monthLabel.getMonth() + 1} 月支出</span><b class="expense">${D.money(fin.expense)}</b></div>
    <div class="fin-stat"><span>本月结余</span><b>${D.money(fin.net)}</b></div>
    <div class="fin-stat"><span>待回款</span><b>${D.money(pending)}</b></div>
    <div class="fin-bars">
      <div class="fin-bar-row"><i></i><div class="fb"><b style="width:${Math.round(fin.income / max * 100)}%" class="income"></b></div><span>收</span></div>
      <div class="fin-bar-row"><i></i><div class="fb"><b style="width:${Math.round(fin.expense / max * 100)}%" class="expense"></b></div><span>支</span></div>
    </div>
  </div>`;
}

/* ---------------- 日历页 ---------------- */
function calAnchor() {
  if (!PAGE.calDate) PAGE.calDate = new Date(D.today());
  return PAGE.calDate;
}
function renderCalendarPage() {
  const anchor = calAnchor();
  const t = D.today();
  const month = anchor.getMonth(), year = anchor.getFullYear();
  document.querySelectorAll('#calSeg button').forEach(b => b.classList.toggle('is-active', b.dataset.cal === PAGE.calMode));
  document.getElementById('calLabel').textContent = PAGE.calMode === 'month'
    ? `${year} 年 ${month + 1} 月`
    : `${D.cnw(D.iso(D.weekStart(anchor)))} 起`;

  document.getElementById('calLegend').innerHTML = [
    { k: '种草笔记', tone: 'sand' }, { k: '测评笔记', tone: 'sage' }, { k: '改造笔记', tone: 'blue' }, { k: '商单', tone: 'violet' }, { k: '拍摄', tone: 'amber' }, { k: '到货', tone: 'blue' }, { k: '归还', tone: 'red' }
  ].map(l => `<span class="legend-item"><i class="tone-${l.tone}"></i>${l.k}</span>`).join('') + `
    <span class="legend-note">点击日期查看当天全部安排</span>`;

  const card = document.getElementById('calCard');
  if (PAGE.calMode === 'month') {
    const first = new Date(year, month, 1);
    const start = D.weekStart(D.iso(first));
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = D.addOn(D.iso(start), i);
      const dt = D.parse(d);
      const other = dt.getMonth() !== month;
      const evs = eventsOn(d);
      const isToday = d === D.iso(t);
      cells.push(`<div class="cal-cell ${other ? 'is-other' : ''} ${isToday ? 'is-today' : ''}" data-act="day" data-date="${d}">
        <span class="cal-num">${dt.getDate()}${isToday ? '<em>今天</em>' : ''}</span>
        <div class="cal-events">${evs.slice(0, 3).map(e => `<span class="cal-ev tone-${e.tone}" title="${esc(e.title)}"><i></i>${esc(e.kind)}·${esc(e.title).slice(0, 8)}</span>`).join('')}${evs.length > 3 ? `<span class="cal-more">还有 ${evs.length - 3} 项</span>` : ''}</div>
      </div>`);
    }
    card.innerHTML = `<div class="cal-weekhead">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(w => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells.join('')}</div>`;
  } else {
    const week = D.weekDates(anchor);
    card.innerHTML = `<div class="week-view">${week.map(d => {
      const evs = eventsOn(d);
      return `<div class="week-col ${d === D.iso(t) ? 'is-today' : ''}" data-act="day" data-date="${d}">
        <div class="week-col-head"><span>${D.weekday(d)}</span><b>${D.short(d)}</b></div>
        <div class="week-col-body">${evs.length ? evs.map(e => `<span class="cal-ev tone-${e.tone}"><i></i>${esc(e.kind)} · ${esc(e.title)}</span>`).join('') : '<span class="week-empty">空</span>'}</div>
      </div>`;
    }).join('')}</div>`;
  }
}

/* ---------------- 侧栏 ---------------- */
function updateSidebar() {
  const week = D.weekDates();
  const done = weekPublishedCount();
  document.getElementById('sideGoal').textContent = `${done} / 3`;
  document.getElementById('sideGoalBar').style.width = Math.min(100, done / 3 * 100) + '%';
  document.getElementById('sideGoalHint').textContent = done >= 3 ? '本周目标完成，保持这个节奏。' : `还差 ${3 - done} 条，别断更。`;
  const counts = {
    ideas: Store.list('ideas').filter(i => i.status !== '已发布').length,
    notes: Store.list('notes').filter(n => n.status !== '数据复盘').length,
    samples: Store.list('samples').filter(s => !['已归还', '自留'].includes(s.status)).length,
    deals: Store.list('deals').filter(d => d.deliveryStatus !== '已结款').length,
    todos: Store.list('todos').filter(x => x.done !== '已完成').length
  };
  document.querySelectorAll('[data-count]').forEach(el => {
    const v = counts[el.dataset.count] || 0;
    el.textContent = v ? v : '';
  });
  const bell = document.getElementById('bellCount');
  const rs = getReminders();
  bell.textContent = rs.length;
  bell.style.display = rs.length ? 'grid' : 'none';
  const asst = document.getElementById('assistantSwitch');
  if (asst) asst.classList.toggle('is-on', Store.state.settings.assistant);
}

/* ---------------- 同步状态 ---------------- */
function updateSyncUI() {
  if (typeof Sync === 'undefined') return;
  const sw = document.getElementById('syncSwitch');
  const el = document.getElementById('syncState');
  if (sw) sw.classList.toggle('is-on', Sync.enabled());
  if (!el) return;
  el.className = 'sync-state' + (Sync.state ? ' is-' + Sync.state : '');
  el.textContent = Sync.message || (Sync.enabled() ? '等待同步' : '未开启，数据只保存在本机');
}

/* ---------------- 个人中心 ---------------- */
function renderProfilePage() {
  const body = document.getElementById('profileBody');
  if (!body) return;
  const session = typeof Auth !== 'undefined' ? Auth.current() : null;
  if (!session) { body.innerHTML = '<div class="empty">请先登录后查看个人中心。</div>'; return; }
  const user = session.user;
  const name = session.name || session.user;
  const acc = typeof Auth !== 'undefined' ? Auth.findAccount(user) : null;
  const p = typeof Profile !== 'undefined' ? Profile.get(user) : { avatar: '', theme: 'default' };
  const isDemo = typeof AUTH_DEMO !== 'undefined' ? user === AUTH_DEMO.user : user === 'shiyi';
  const cur = THEMES.find(t => t.id === p.theme) || THEMES[0];
  const ini = Profile.initial(name);

  const themeCards = THEMES.map(t => `
    <button class="theme-card${t.id === p.theme ? ' is-active' : ''}" data-theme-id="${t.id}">
      <span class="theme-swatch" style="background:${t.sw[0]}"><i style="background:${t.sw[1]}"></i><i style="background:${t.sw[2]}"></i></span>
      <b>${esc(t.name)}</b><small>${esc(t.desc)}</small>
      <span class="theme-check">✓</span>
    </button>`).join('');

  const gradCards = Object.keys(Profile.grads).map(k => {
    const g = Profile.grads[k];
    return `<button class="ava-preset" data-avatar="${k}" style="background:linear-gradient(145deg,${g[0]},${g[1]})">${esc(ini)}</button>`;
  }).join('');

  body.innerHTML = `
    <div class="card profile-hero">
      <div class="profile-avatar">
        ${Profile.avatarHTML(user, name, 'avatar-xl')}
        <label class="avatar-edit" for="avatarFile" title="上传新头像">换</label>
        <input type="file" id="avatarFile" accept="image/*" hidden>
      </div>
      <div class="profile-info">
        <h2>${esc(name)}</h2>
        <div class="profile-tags">
          <span class="soft-pill">@${esc(user)}</span>
          ${isDemo ? '<span class="badge tone-sand">演示账号</span>' : '<span class="badge tone-green">本地账号</span>'}
          ${acc && acc.email ? `<span class="soft-pill">${esc(acc.email)}</span>` : ''}
        </div>
        <p class="profile-sub">头像与色系只保存在本机，并且只对当前账号生效。</p>
      </div>
      <div class="profile-hero-actions"><a class="btn btn-ghost" href="logout.html">退出登录</a></div>
    </div>

    <div class="card panel profile-section">
      <div class="panel-head"><div><h2>更换头像</h2><p class="panel-sub">上传一张图片，或直接用一套配色。</p></div></div>
      <div class="avatar-row">
        <div class="avatar-presets">${gradCards}</div>
        <div class="avatar-tools">
          <label class="btn btn-soft" for="avatarFile"><svg class="ni"><use href="#i-image"/></svg>上传本地图片</label>
          <button class="btn btn-ghost" id="avatarReset">恢复默认</button>
        </div>
      </div>
      <p class="profile-hint" id="avatarHint">支持 JPG / PNG，会自动裁剪成正方形并压缩，建议选 1MB 以内的图。</p>
    </div>

    <div class="card panel profile-section">
      <div class="panel-head"><div><h2>界面色系</h2><p class="panel-sub">当前：${esc(cur.name)} · ${esc(cur.desc)}</p></div></div>
      <div class="theme-grid">${themeCards}</div>
      <p class="profile-hint">切换后立即生效，下次登录会自动沿用。</p>
    </div>

    <div class="card panel profile-section">
      <div class="panel-head"><div><h2>账号信息</h2><p class="panel-sub">账号资料随本机保存</p></div></div>
      <div class="info-grid">
        <div><span>账号</span><b>${esc(user)}</b></div>
        <div><span>昵称</span><b>${esc(name)}</b></div>
        <div><span>邮箱</span><b>${esc(acc && acc.email ? acc.email : '—')}</b></div>
        <div><span>账号类型</span><b>${isDemo ? '演示账号' : '本地注册'}</b></div>
      </div>
      ${isDemo
        ? '<p class="profile-hint">演示账号用于体验，不能注销；头像与色系可以自由更换。</p>'
        : '<p class="profile-hint">需要彻底清除账号与数据？可在退出登录页选择「注销账号并删除我的数据」。</p>'}
    </div>

    <div class="card panel profile-section">
      <div class="panel-head"><div><h2>数据与工具</h2><p class="panel-sub">同步、备份、演示数据与只读模式</p></div></div>
      <div class="assistant-toggle">
        <div><strong>助理模式</strong><small>开启后选题与商务仅可查看，避免误改</small></div>
        <button class="switch${Store.state.settings.assistant ? ' is-on' : ''}" id="assistantSwitch" type="button" aria-label="助理模式"><i></i></button>
      </div>
      <div class="assistant-toggle">
        <div><strong>数据同步</strong><small>自动同步到本机服务，换浏览器登录同一账号可恢复</small></div>
        <button class="switch${typeof Sync !== 'undefined' && Sync.enabled() ? ' is-on' : ''}" id="syncSwitch" type="button" aria-label="数据同步"><i></i></button>
      </div>
      <p class="sync-state" id="syncState"></p>
      <div class="tool-actions">
        <button class="btn btn-soft" id="exportBtn"><svg class="ni"><use href="#i-download"/></svg>导出文档</button>
        <button class="btn btn-soft" id="backupBtn"><svg class="ni"><use href="#i-download"/></svg>备份 JSON</button>
        <label class="btn btn-ghost" for="importFile"><svg class="ni"><use href="#i-layers"/></svg>导入备份</label>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
        <button class="btn btn-ghost" id="resetBtn">恢复示例</button>
        <button class="btn btn-danger" id="clearBtn"><svg class="ni"><use href="#i-trash"/></svg>清除示例数据</button>
        <button class="btn btn-soft" id="syncNow">立即同步</button>
      </div>
      <p class="profile-hint">导出文档用于查看归档，备份 JSON 用于换机或恢复；导入备份会覆盖当前数据，数据同步会覆盖云端快照，操作前建议先备份。同步依赖本机 Node 服务，需通过 node server.js 访问（默认 localhost:8771），静态预览下不可用。</p>
    </div>`;

  bindProfileEvents(user, name);
}

function bindProfileEvents(user, name) {
  document.querySelectorAll('#view-profile [data-theme-id]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.themeId;
      Profile.save(user, { theme: id });
      renderProfilePage();
      toast('已切换色系：' + ((THEMES.find(t => t.id === id) || {}).name || id));
    };
  });
  document.querySelectorAll('#view-profile [data-avatar]').forEach(btn => {
    btn.onclick = () => {
      Profile.save(user, { avatar: btn.dataset.avatar });
      renderProfilePage(); syncUserAvatar();
      toast('头像已更新');
    };
  });
  const file = document.getElementById('avatarFile');
  if (file) file.onchange = () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const hint = document.getElementById('avatarHint');
    if (hint) { hint.textContent = '正在处理图片…'; hint.classList.remove('is-error'); }
    Profile.resizeImage(f, (err, dataUrl) => {
      if (err) {
        if (hint) { hint.textContent = err; hint.classList.add('is-error'); }
        return;
      }
      Profile.save(user, { avatar: dataUrl });
      renderProfilePage(); syncUserAvatar();
      toast('头像已更新');
    });
  };
  const reset = document.getElementById('avatarReset');
  if (reset) reset.onclick = () => {
    Profile.save(user, { avatar: '' });
    renderProfilePage(); syncUserAvatar();
    toast('已恢复默认头像');
  };

  const asst = document.getElementById('assistantSwitch');
  if (asst) asst.onclick = () => {
    Store.state.settings.assistant = !Store.state.settings.assistant;
    Store.save();
    asst.classList.toggle('is-on', Store.state.settings.assistant);
    toast(Store.state.settings.assistant ? '助理模式已开启：选题与商务只读' : '助理模式已关闭');
  };

  const syncSwitch = document.getElementById('syncSwitch');
  if (syncSwitch) syncSwitch.onclick = async () => {
    Store.state.settings.syncOn = !Sync.enabled();
    Store.save();
    if (Sync.enabled()) {
      toast('数据同步已开启');
      const res = await Sync.sync({ silent: true, force: true });
      toast(res.ok ? '数据已同步' : (res.msg || '同步失败，请稍后重试'));
    } else {
      Sync.clearRetry();
      Sync.setStatus('off', '未开启，数据只保存在本机');
      toast('数据同步已关闭');
    }
  };
  const syncNow = document.getElementById('syncNow');
  if (syncNow) syncNow.onclick = () => Sync.sync({ force: true });
  updateSyncUI();

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.onclick = () => {
    const res = Store.exportDocument();
    if (res && res.ok) toast(`已导出文档（${res.count} 条数据）`);
    else toast((res && res.msg) || '导出失败，请稍后重试');
  };

  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) backupBtn.onclick = () => {
    const res = Store.exportBackup();
    if (res && res.ok) toast(`已备份 ${res.count} 条数据（.json）`);
    else toast((res && res.msg) || '备份失败，请稍后重试');
  };

  const importFile = document.getElementById('importFile');
  if (importFile) importFile.onchange = () => {
    const f = importFile.files && importFile.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const peek = Store.inspectBackup(reader.result);
      if (!peek.ok) { importFile.value = ''; toast(peek.msg || '备份文件无法识别'); return; }
      const ok = await confirmDialog(`将用备份中的 ${peek.count} 条记录覆盖当前全部数据，确定导入吗？`, '导入并覆盖');
      if (!ok) { importFile.value = ''; return; }
      const res = Store.importBackup(reader.result);
      importFile.value = '';
      if (!res.ok) { toast(res.msg || '导入失败'); return; }
      PAGE.view = {}; PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.query = ''; PAGE.sort = null; PAGE.selected = {}; PAGE.visibleIds = [];
      toast(`已导入 ${res.count} 条数据`);
      renderProfilePage();
      updateSidebar();
    };
    reader.onerror = () => { importFile.value = ''; toast('文件读取失败，请重试'); };
    reader.readAsText(f, 'utf-8');
  };

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.onclick = async () => {
    if (await confirmDialog('恢复示例数据会覆盖当前所有记录，确定吗？', '恢复示例')) {
      Store.reset();
      PAGE.view = {}; PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.query = ''; PAGE.sort = null; PAGE.selected = {}; PAGE.visibleIds = [];
      toast('已恢复示例数据');
      renderProfilePage();
      updateSidebar();
    }
  };

  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.onclick = async () => {
    const total = Store.totalCount();
    if (!total) { toast('当前没有可清除的数据'); return; }
    if (await confirmDialog(`将清除全部 ${total} 条记录（助理模式与视图偏好保留）。建议先导出备份，确定继续吗？`, '清除数据')) {
      Store.clearAll();
      PAGE.view = {}; PAGE.filter = '全部'; PAGE.loanFilter = '全部'; PAGE.query = ''; PAGE.sort = null; PAGE.selected = {}; PAGE.visibleIds = [];
      toast('已清除全部数据，可以从零开始');
      navigate('dashboard');
    }
  };
}
