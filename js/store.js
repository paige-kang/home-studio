/* ---------------- 日期工具 ---------------- */
const D = {
  pad: n => String(n).padStart(2, '0'),
  iso(d) { return d.getFullYear() + '-' + D.pad(d.getMonth() + 1) + '-' + D.pad(d.getDate()); },
  today() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; },
  parse(s) { if (!s) return null; const p = String(s).split('-').map(Number); if (p.length < 3 || !p[0]) return null; return new Date(p[0], p[1] - 1, p[2]); },
  add(n) { const d = D.today(); d.setDate(d.getDate() + n); return D.iso(d); },
  addOn(base, n) { const d = D.parse(base) || D.today(); d.setDate(d.getDate() + n); return D.iso(d); },
  diff(a, b) { if (!a || !b) return null; return Math.round((D.parse(b) - D.parse(a)) / 86400000); },
  cn(s) { const d = D.parse(s); if (!d) return '—'; return `${d.getMonth() + 1}月${d.getDate()}日`; },
  cnw(s) { const d = D.parse(s); if (!d) return '—'; return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`; },
  short(s) { const d = D.parse(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : '—'; },
  weekday(s) { const d = D.parse(s); return d ? '周' + '日一二三四五六'[d.getDay()] : ''; },
  weekStart(base) { const d = base instanceof Date ? new Date(base) : (D.parse(base) || D.today()); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d; },
  weekDates(base) { const s = D.weekStart(base); return Array.from({ length: 7 }, (_, i) => D.addOn(D.iso(s), i)); },
  monthKey(s) { return String(s || '').slice(0, 7); },
  money(n) { n = Number(n) || 0; return (n < 0 ? '-¥' : '¥') + Math.abs(n).toLocaleString('zh-CN'); },
  num(n) { n = Number(n) || 0; if (n >= 10000) return (n / 10000).toFixed(1).replace('.0', '') + 'w'; return String(n); },
  uid(p) { return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
};

/* ---------------- 状态色 ---------------- */
const TONES = {
  '灵感': 'sand', '待写脚本': 'blue', '待拍摄': 'sage', '已发布': 'green', '搁置': 'gray',
  '草稿': 'gray', '脚本完成': 'blue', '拍摄完成': 'sage', '修图剪辑': 'violet', '文案定稿': 'blue', '定时发布': 'amber', '数据复盘': 'green',
  '待申请': 'gray', '在路上': 'blue', '已收到': 'sand', '已拍摄': 'violet', '已归还': 'green', '自留': 'green',
  '未借出': 'gray', '已借出': 'amber',
  '待对接': 'blue', '交付中': 'amber', '已交付': 'sage', '已结款': 'green',
  '置换': 'blue', '付费广告': 'amber', '自费': 'gray', '商单': 'violet',
  '爆款拆解': 'amber', '踩坑记录': 'red', '规则技巧': 'blue',
  '高': 'red', '中': 'amber', '低': 'gray',
  '未完成': 'sand', '已完成': 'green',
  '支出': 'red', '收入': 'green',
};
const TRACK_TONE = { '种草': 'sand', '测评': 'sage', '改造': 'blue', '商单': 'violet', '其他': 'gray' };

/* ---------------- 模块定义 ---------------- */
const DIRS = ['软装', '家具测评', '避坑', '改造', '好物分享'];
const STYLES = ['简约白', '原木', '小户型', '备婚家居', '双十一好物', '奶油风', '租房友好'];
const NOTE_STATUS = ['草稿', '脚本完成', '拍摄完成', '修图剪辑', '文案定稿', '定时发布', '数据复盘'];
const TRACKS = ['种草', '测评', '改造', '商单', '其他'];

const SCHEMAS = {
  ideas: {
    key: 'ideas', label: '选题库', desc: '长期灵感池。先存钩子，再决定今天做哪一条。',
    icon: 'i-bulb', statuses: ['灵感', '待写脚本', '待拍摄', '已发布', '搁置'], group: 'status',
    date: 'planDate', title: 'title', sub: 'direction', tag: 'styles', img: 'refImg',
    views: ['board', 'table', 'gallery'], defaultView: 'board',
    table: ['title', 'direction', 'styles', 'status', 'planDate'],
    fields: [
      { k: 'title', t: '选题标题', type: 'text', req: 1, span: 2 },
      { k: 'direction', t: '笔记方向', type: 'select', opts: DIRS },
      { k: 'status', t: '状态', type: 'select', opts: ['灵感', '待写脚本', '待拍摄', '已发布', '搁置'] },
      { k: 'styles', t: '风格标签', type: 'tags', opts: STYLES, span: 2 },
      { k: 'planDate', t: '计划发布日期', type: 'date' },
      { k: 'sceneId', t: '预估拍摄布景', type: 'ref', ref: 'scenes' },
      { k: 'coverIdea', t: '目标封面构思', type: 'textarea', span: 2, ph: '封面大字、构图、色调，越具体越好' },
      { k: 'refLink', t: '参考图链接', type: 'link', span: 2 },
      { k: 'xhsLink', t: '小红书参考笔记', type: 'link', span: 2 },
      { k: 'sampleIds', t: '关联样品', type: 'refs', ref: 'samples', span: 2 },
      { k: 'refImg', t: '参考图', type: 'image', span: 2 },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '选题信息', keys: ['title', 'direction', 'status', 'styles', 'planDate'] },
      { t: '画面与灵感', keys: ['coverIdea', 'refLink', 'xhsLink', 'refImg'] },
      { t: '拍摄与关联', keys: ['sceneId', 'sampleIds', 'note'] }
    ]
  },
  notes: {
    key: 'notes', label: '内容流水线', desc: '一条笔记从草稿走到复盘，卡在哪一步一眼看见。',
    icon: 'i-layers', statuses: NOTE_STATUS, group: 'status',
    date: 'publishDate', title: 'title', sub: 'trackType', tag: 'tags',
    views: ['board', 'table', 'calendar'], defaultView: 'board',
    table: ['title', 'trackType', 'status', 'publishDate', 'exposure', 'likes'],
    template: true,
    fields: [
      { k: 'title', t: '笔记标题', type: 'text', req: 1, span: 2 },
      { k: 'status', t: '进度', type: 'select', opts: NOTE_STATUS },
      { k: 'trackType', t: '笔记类型', type: 'select', opts: TRACKS },
      { k: 'publishDate', t: '发布时间', type: 'date' },
      { k: 'shootDate', t: '拍摄日', type: 'date' },
      { k: 'account', t: '发布账号', type: 'text', ph: '拾一' },
      { k: 'body', t: '正文文案', type: 'textarea', span: 2, ph: '开头别铺垫，直接给结论或场景' },
      { k: 'tags', t: '标签 / hashtag', type: 'text', span: 2, ph: '#出租屋改造 #软装 #梳妆台' },
      { k: 'cover', t: '封面图链接', type: 'image', span: 2 },
      { k: 'assets', t: '配图 / 素材链接', type: 'textarea', span: 2, ph: '一行一个云盘或图床链接' },
      { k: 'video', t: '视频素材链接', type: 'link', span: 2 },
      { k: 'tip', t: '拍摄小贴士（机位 / 灯光）', type: 'textarea', span: 2, ph: '俯拍机位、灯光参数、道具摆放' },
      { k: 'paste', t: '快速录入后台数据', type: 'paste', span: 2 },
      { k: 'exposure', t: '曝光', type: 'number' },
      { k: 'likes', t: '点赞', type: 'number' },
      { k: 'saves', t: '收藏', type: 'number' },
      { k: 'comments', t: '评论亮点', type: 'textarea', span: 2 },
      { k: 'pitfall', t: '踩坑总结', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '基础', keys: ['title', 'trackType', 'status', 'publishDate', 'shootDate', 'account'] },
      { t: '文案与素材', keys: ['body', 'tags', 'cover', 'assets', 'video'] },
      { t: '拍摄备注', keys: ['tip'] },
      { t: '数据复盘', keys: ['paste', 'exposure', 'likes', 'saves', 'comments', 'pitfall'] }
    ]
  },
  samples: {
    key: 'samples', label: '样品软装库', desc: '自费、置换、商单都在这里。归还日期盯紧，别逾期。',
    icon: 'i-sofa', statuses: ['待申请', '在路上', '已收到', '已拍摄', '已归还', '自留'], group: 'status',
    date: 'returnDate', title: 'name', sub: 'category', tag: 'source', img: 'img',
    views: ['board', 'table', 'gallery'], defaultView: 'board',
    table: ['name', 'brand', 'source', 'status', 'loanStatus', 'dueDate', 'returnDate'],
    fields: [
      { k: 'name', t: '物品名称', type: 'text', req: 1, span: 2 },
      { k: 'category', t: '品类', type: 'select', opts: ['家具', '收纳', '香薰', '布艺', '小件', '灯具', '其他'] },
      { k: 'brand', t: '品牌', type: 'text' },
      { k: 'source', t: '来源', type: 'select', opts: ['自费购买', '品牌置换', '商单'] },
      { k: 'status', t: '状态', type: 'select', opts: ['待申请', '在路上', '已收到', '已拍摄', '已归还', '自留'] },
      { k: 'budget', t: '预算 / 价值', type: 'number' },
      { k: 'arriveDate', t: '到货时间', type: 'date' },
      { k: 'returnDate', t: '归还品牌截止', type: 'date' },
      { k: 'link', t: '商品链接', type: 'link', span: 2 },
      { k: 'size', t: '尺寸参数', type: 'text', span: 2, ph: '例：40×32×45cm，坐高 42cm' },
      { k: 'ideaIds', t: '关联选题', type: 'refs', ref: 'ideas', span: 2 },
      { k: 'img', t: '实物图 / 参考图', type: 'image', span: 2 },
      { k: 'loanStatus', t: '借出状态', type: 'select', opts: ['未借出', '已借出', '已归还'] },
      { k: 'borrower', t: '借出对象', type: 'text', ph: '助理 / 摄影师 / 朋友' },
      { k: 'loanDate', t: '借出日期', type: 'date' },
      { k: 'dueDate', t: '预计归还日期', type: 'date' },
      { k: 'returnedDate', t: '实际归还日期', type: 'date' },
      { k: 'loanNote', t: '借出备注', type: 'textarea', span: 2, ph: '借去拍什么、约定怎么还' },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '物品信息', keys: ['name', 'category', 'brand', 'source', 'status', 'budget'] },
      { t: '时间与链接', keys: ['arriveDate', 'returnDate', 'link', 'size'] },
      { t: '借出与归还', keys: ['loanStatus', 'borrower', 'loanDate', 'dueDate', 'returnedDate', 'loanNote'] },
      { t: '关联与图片', keys: ['ideaIds', 'img', 'note'] }
    ]
  },
  scenes: {
    key: 'scenes', label: '布景道具库', desc: '一套布景反复用，换新品也能拍出统一气质。',
    icon: 'i-lamp', statuses: [], group: '',
    date: '', title: 'name', sub: 'style', tag: 'style', img: 'photos',
    views: ['gallery', 'table'], defaultView: 'gallery',
    table: ['name', 'style', 'props', 'lighting', 'camera'],
    fields: [
      { k: 'name', t: '布景名称', type: 'text', req: 1, span: 2 },
      { k: 'style', t: '风格', type: 'select', opts: ['简约白', '原木', '奶油风', '复古', '其他'] },
      { k: 'background', t: '背景', type: 'text', ph: '奶白墙 + 亚麻窗帘' },
      { k: 'table', t: '桌面 / 台面', type: 'text', ph: '原木书桌 + 白色桌旗' },
      { k: 'props', t: '道具清单', type: 'textarea', span: 2, ph: '花瓶、香薰、地毯、桌旗、抱枕…' },
      { k: 'lighting', t: '灯光方案', type: 'textarea', span: 2, ph: '主光 5600K，侧后方补一盏暖光' },
      { k: 'camera', t: '机位 / 参数', type: 'textarea', span: 2, ph: '俯拍 45°，手机主摄，1/60s' },
      { k: 'photos', t: '成片参考图', type: 'image', span: 2 },
      { k: 'sampleIds', t: '适用样品', type: 'refs', ref: 'samples', span: 2 },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '布景信息', keys: ['name', 'style', 'background', 'table'] },
      { t: '道具与光', keys: ['props', 'lighting', 'camera'] },
      { t: '参考与关联', keys: ['photos', 'sampleIds', 'note'] }
    ]
  },
  assets: {
    key: 'assets', label: '素材图库', desc: '线上只存索引，原图放云盘。标好能不能二次复用。',
    icon: 'i-image', statuses: ['封面图', '细节图', '对比图', '花絮图'], group: 'tag',
    date: '', title: 'title', sub: 'tag', tag: 'used', img: 'img',
    views: ['gallery', 'table'], defaultView: 'gallery',
    table: ['title', 'tag', 'noteId', 'used', 'reusable'],
    fields: [
      { k: 'title', t: '素材名称', type: 'text', req: 1, span: 2 },
      { k: 'tag', t: '素材类型', type: 'select', opts: ['封面图', '细节图', '对比图', '花絮图'] },
      { k: 'used', t: '发布状态', type: 'select', opts: ['未发', '已发'] },
      { k: 'reusable', t: '可复用', type: 'select', opts: ['可复用', '仅此一条'] },
      { k: 'noteId', t: '所属笔记', type: 'ref', ref: 'notes' },
      { k: 'link', t: '云盘链接', type: 'link', span: 2 },
      { k: 'img', t: '缩略图链接', type: 'image', span: 2 },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '素材信息', keys: ['title', 'tag', 'used', 'reusable', 'noteId'] },
      { t: '链接', keys: ['link', 'img'] },
      { t: '备注', keys: ['note'] }
    ]
  },
  deals: {
    key: 'deals', label: '商务合作', desc: '置换与付费广告都记清楚：要求、排期、交付、回款。',
    icon: 'i-brief', statuses: ['待对接', '交付中', '已交付', '已结款'], group: 'deliveryStatus',
    date: 'deadline', title: 'brand', sub: 'type', tag: 'type',
    views: ['table', 'board'], defaultView: 'table',
    table: ['brand', 'type', 'deadline', 'deliveryStatus', 'payment', 'contact'],
    fields: [
      { k: 'brand', t: '品牌名称', type: 'text', req: 1, span: 2 },
      { k: 'type', t: '合作类型', type: 'select', opts: ['置换', '付费广告'] },
      { k: 'deliveryStatus', t: '交付状态', type: 'select', opts: ['待对接', '交付中', '已交付', '已结款'] },
      { k: 'contact', t: '对接人', type: 'text' },
      { k: 'contactInfo', t: '联系方式', type: 'text', ph: '微信 / 邮箱' },
      { k: 'deadline', t: '交付截止', type: 'date' },
      { k: 'schedule', t: '排期', type: 'text', ph: '例：10 月底前发布' },
      { k: 'requirement', t: '合作要求', type: 'textarea', span: 2 },
      { k: 'deliverables', t: '交付物', type: 'textarea', span: 2, ph: '1 篇图文 + 3 张精修 + 评论区维护' },
      { k: 'paymentNode', t: '结算节点', type: 'select', opts: ['发布后 7 天', '发布后 30 天', '完工即付', '月结'] },
      { k: 'payment', t: '回款金额', type: 'number' },
      { k: 'contract', t: '合同 / 沟通记录链接', type: 'link', span: 2 },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '品牌与对接', keys: ['brand', 'type', 'deliveryStatus', 'contact', 'contactInfo'] },
      { t: '要求与排期', keys: ['deadline', 'schedule', 'requirement', 'deliverables'] },
      { t: '结算', keys: ['paymentNode', 'payment', 'contract'] },
      { t: '备注', keys: ['note'] }
    ]
  },
  lessons: {
    key: 'lessons', label: '复盘知识库', desc: '爆款拆解、踩坑记录、规则技巧，越写越顺手。',
    icon: 'i-book', statuses: ['爆款拆解', '踩坑记录', '规则技巧'], group: 'type',
    date: 'date', title: 'title', sub: 'type', tag: 'tags', img: 'img',
    views: ['gallery', 'table'], defaultView: 'gallery',
    table: ['title', 'type', 'tags', 'date'],
    fields: [
      { k: 'title', t: '标题', type: 'text', req: 1, span: 2 },
      { k: 'type', t: '类型', type: 'select', opts: ['爆款拆解', '踩坑记录', '规则技巧'] },
      { k: 'date', t: '记录日期', type: 'date' },
      { k: 'tags', t: '关键词', type: 'tags', opts: ['标题', '封面', '流量', '选品', '合规', '拍摄'], span: 2 },
      { k: 'content', t: '内容', type: 'textarea', span: 2, ph: '为什么爆 / 哪里翻车 / 下次怎么做' },
      { k: 'link', t: '参考链接', type: 'link', span: 2 },
      { k: 'img', t: '配图', type: 'image', span: 2 }
    ],
    form: [
      { t: '基本信息', keys: ['title', 'type', 'date', 'tags'] },
      { t: '记录', keys: ['content', 'link', 'img'] }
    ]
  },
  templates: {
    key: 'templates', label: '内容模板库', desc: '把写过的好文案、好标题存成模板，新建笔记一键套用，越写越快。',
    icon: 'i-book', statuses: ['文案模板', '标题模板', '脚本模板', '封面构思'], group: 'type',
    date: 'updatedAt', title: 'title', sub: 'type', tag: 'tags', img: 'img',
    views: ['gallery', 'table'], defaultView: 'gallery',
    table: ['title', 'type', 'trackType', 'useCount', 'updatedAt'],
    fields: [
      { k: 'title', t: '模板名称', type: 'text', req: 1, span: 2, ph: '如：种草类开头模板' },
      { k: 'type', t: '模板类型', type: 'select', opts: ['文案模板', '标题模板', '脚本模板', '封面构思'] },
      { k: 'trackType', t: '适用笔记类型', type: 'select', opts: ['通用', '种草', '测评', '改造', '商单', '其他'] },
      { k: 'tags', t: '标签', type: 'tags', opts: ['开头', '结尾', '种草', '避坑', '清单', '对比', '氛围'], span: 2 },
      { k: 'content', t: '模板内容', type: 'textarea', span: 2, ph: '正文模板，可用 {{产品}} {{价格}} {{场景}} 等占位符，套用时替换' },
      { k: 'tip', t: '使用说明', type: 'textarea', span: 2, ph: '这个模板适合什么场景、怎么用效果好' },
      { k: 'img', t: '参考配图', type: 'image', span: 2 },
      { k: 'useCount', t: '使用次数', type: 'number' }
    ],
    form: [
      { t: '基本信息', keys: ['title', 'type', 'trackType', 'tags'] },
      { t: '模板内容', keys: ['content', 'tip', 'img'] },
      { t: '统计', keys: ['useCount'] }
    ]
  },
  todos: {
    key: 'todos', label: '待办清单', desc: '拍摄、发布、样品、商务，一件一件划掉。',
    icon: 'i-check', statuses: ['未完成', '已完成'], group: 'done',
    date: 'due', title: 'title', sub: 'module',
    views: ['list', 'table'], defaultView: 'list',
    table: ['title', 'module', 'due', 'priority', 'done'],
    fields: [
      { k: 'title', t: '待办内容', type: 'text', req: 1, span: 2 },
      { k: 'module', t: '所属模块', type: 'select', opts: ['拍摄', '发布', '样品', '商务', '采购', '其他'] },
      { k: 'priority', t: '优先级', type: 'select', opts: ['高', '中', '低'] },
      { k: 'due', t: '截止日期', type: 'date' },
      { k: 'done', t: '状态', type: 'select', opts: ['未完成', '已完成'] },
      { k: 'note', t: '备注', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '待办', keys: ['title', 'module', 'priority', 'due', 'done', 'note'] }
    ]
  },
  finance: {
    key: 'finance', label: '收支台账', desc: '买样品、置道具、设备预算，还有收入与结余。',
    icon: 'i-wallet', statuses: ['支出', '收入'], group: 'kind',
    date: 'date', title: 'note', sub: 'category',
    views: ['table'], defaultView: 'table', summary: true,
    table: ['date', 'kind', 'category', 'amount', 'note'],
    fields: [
      { k: 'date', t: '日期', type: 'date' },
      { k: 'kind', t: '类型', type: 'select', opts: ['支出', '收入'] },
      { k: 'category', t: '分类', type: 'select', opts: ['样品', '道具', '软装', '设备', '商单收入', '置换折算', '其他'] },
      { k: 'amount', t: '金额（元）', type: 'number' },
      { k: 'note', t: '说明', type: 'textarea', span: 2 }
    ],
    form: [
      { t: '记录', keys: ['date', 'kind', 'category', 'amount', 'note'] }
    ]
  }
};

/* ---------------- 种子数据 ---------------- */
function buildSeed() {
  const T = D.today(), y = T.getFullYear(), m = T.getMonth() + 1;
  return {
    version: 1,
    settings: { assistant: false, viewState: {} },
    ideas: [
      { id: 'idea-1', title: '出租屋梳妆台｜1000 元内改成奶白氛围角', direction: '改造', styles: ['简约白', '小户型'], status: '已发布', planDate: D.add(-8), sceneId: 'scene-1', sampleIds: ['sample-3', 'sample-6'], coverIdea: '奶白桌面 + 软木板墙，标题压在左下角，留白多一点', refLink: '', xhsLink: 'https://www.xiaohongshu.com', refImg: '', note: '开场直接给改造前后对比，别铺垫。' },
      { id: 'idea-2', title: '梳妆凳五选一｜小户型不占地实测', direction: '家具测评', styles: ['简约白', '小户型'], status: '待拍摄', planDate: D.add(3), sceneId: 'scene-1', sampleIds: ['sample-1', 'sample-2'], coverIdea: '五把凳子排一排，俯拍，中间那把打高光', refLink: '', xhsLink: '', refImg: '', note: '重点拍坐高、占地、收纳，别只拍好看。' },
      { id: 'idea-3', title: '64 粉也能抄的软木板墙布置', direction: '软装', styles: ['简约白', '租房友好'], status: '待写脚本', planDate: D.add(1), sceneId: 'scene-2', sampleIds: ['sample-4'], coverIdea: '整面墙正对机位，右下角放一张小凳', refLink: '', xhsLink: '', refImg: '', note: '给出 300 元内清单，评论区会问链接。' },
      { id: 'idea-4', title: '苹果香薰蜡烛｜桌面氛围感天花板', direction: '好物分享', styles: ['简约白', '奶油风'], status: '已发布', planDate: D.add(-3), sceneId: 'scene-1', sampleIds: ['sample-5'], coverIdea: '逆光拍烛火，背景虚化', refLink: '', xhsLink: '', refImg: '', note: '' },
      { id: 'idea-5', title: '免钉洞洞板｜租房收纳不伤墙', direction: '好物分享', styles: ['小户型', '租房友好'], status: '待拍摄', planDate: D.add(5), sceneId: 'scene-2', sampleIds: ['sample-7'], coverIdea: '墙面正中，洞洞板挂满小物，色系统一', refLink: '', xhsLink: '', refImg: '', note: '强调不打孔、可拆走，租房党最关心。' },
      { id: 'idea-6', title: '卧室台面永不复乱的 5 件收纳', direction: '好物分享', styles: ['小户型'], status: '灵感', planDate: D.add(9), sceneId: 'scene-3', sampleIds: ['sample-3'], coverIdea: '', refLink: '', xhsLink: '', refImg: '', note: '' },
      { id: 'idea-7', title: '原木边几能替代梳妆台吗｜真实体验', direction: '避坑', styles: ['原木', '小户型'], status: '灵感', planDate: '', sceneId: '', sampleIds: [], coverIdea: '', refLink: '', xhsLink: '', refImg: '', note: '从「买了后悔」的角度写，更容易被收藏。' },
      { id: 'idea-8', title: '双十一家居清单｜只买这 6 件', direction: '好物分享', styles: ['双十一好物', '简约白'], status: '待写脚本', planDate: D.add(10), sceneId: 'scene-1', sampleIds: ['sample-4', 'sample-3'], coverIdea: '六宫格拼图，价格标在角落', refLink: '', xhsLink: '', refImg: '', note: '商单合作，需按品牌要求露出 3 件。' }
    ],
    notes: [
      { id: 'note-1', title: '出租屋梳妆台改造｜1000 元内改成奶白氛围角', trackType: '改造', status: '数据复盘', publishDate: D.add(-8), shootDate: D.add(-12), account: '拾一', body: '改造前那张桌子是房东留下的深色贴皮桌，台面永远乱。\n这次只做了三件事：换桌面贴膜、加一面软木板、把光源换暖。\n总花费 968 元，清单在最后。', tags: '#出租屋改造 #梳妆台 #软装 #小户型', cover: '', assets: '', video: '', tip: '俯拍 45°，桌子朝窗，侧后方补一盏暖光台灯，色温 3000K。', exposure: 186000, likes: 1104, saves: 2380, comments: '评论区问得最多的是凳子和软木板链接。', pitfall: '首版封面字太小，前 3 小时点击率偏低，换封面后才起来。', paste: '' },
      { id: 'note-2', title: '苹果香薰蜡烛｜桌面氛围感天花板', trackType: '种草', status: '数据复盘', publishDate: D.add(-3), shootDate: D.add(-5), account: '拾一', body: '不是香水那种冲的甜，是切开苹果瞬间的味道。\n放在梳妆台边上，晚上不开大灯只点它。', tags: '#香薰 #桌面好物 #氛围感', cover: '', assets: '', video: '', tip: '逆光机位，烛火过曝一点点更有氛围。', exposure: 42000, likes: 297, saves: 386, comments: '有人问会不会熏黑墙，已回复。', pitfall: '拍得太暗，细节图不够，评论区要链接找不到图。', paste: '' },
      { id: 'note-3', title: '梳妆凳五选一｜小户型不占地实测', trackType: '测评', status: '修图剪辑', publishDate: D.add(3), shootDate: D.add(1), account: '拾一', body: '', tags: '#梳妆凳 #家具测评 #小户型', cover: '', assets: '', video: '', tip: '五把凳子同机位俯拍，背景统一奶白布。', exposure: 0, likes: 0, saves: 0, comments: '', pitfall: '', paste: '' },
      { id: 'note-4', title: '64 粉也能抄的软木板墙布置', trackType: '种草', status: '脚本完成', publishDate: D.add(1), shootDate: D.add(-1), account: '拾一', body: '软木板不是学生宿舍专属。\n整面墙留白 1/3，小物只放三种颜色。', tags: '#软木板 #墙面布置 #租房', cover: '', assets: '', video: '', tip: '正面平视，镜头抬到 1.4m，避免畸变。', exposure: 0, likes: 0, saves: 0, comments: '', pitfall: '', paste: '' },
      { id: 'note-5', title: '双十一家居清单｜只买这 6 件', trackType: '商单', status: '草稿', publishDate: D.add(10), shootDate: D.add(6), account: '拾一', body: '', tags: '#双十一 #家居清单 #好物分享', cover: '', assets: '', video: '', tip: '六宫格拼图，产品统一摆在奶白桌面上。', exposure: 0, likes: 0, saves: 0, comments: '', pitfall: '', paste: '' },
      { id: 'note-6', title: '免钉洞洞板｜租房收纳不伤墙', trackType: '种草', status: '拍摄完成', publishDate: D.add(5), shootDate: D.add(2), account: '拾一', body: '', tags: '#洞洞板 #租房收纳', cover: '', assets: '', video: '', tip: '墙面正面机位，灯从左侧 45° 打。', exposure: 0, likes: 0, saves: 0, comments: '', pitfall: '', paste: '' }
    ],
    samples: [
      { id: 'sample-1', name: '原木梳妆凳（藤编面）', category: '家具', brand: '木野', source: '品牌置换', status: '已拍摄', budget: 399, arriveDate: D.add(-6), returnDate: D.add(2), link: '', size: '40×32×45cm，坐高 42cm', ideaIds: ['idea-2'], img: '', loanStatus: '已借出', borrower: '助理小鹿', loanDate: D.add(-3), dueDate: D.add(1), returnedDate: '', loanNote: '借去拍梳妆凳五选一，明天必须还回来，之后要寄回品牌。', note: '品牌要求 30 天内寄回，别拖。' },
      { id: 'sample-2', name: '奶白绒面梳妆凳', category: '家具', brand: 'NORHOR', source: '自费购买', status: '已收到', budget: 468, arriveDate: D.add(-2), returnDate: '', link: '', size: '42×34×46cm', ideaIds: ['idea-2'], img: '', loanStatus: '未借出', borrower: '', loanDate: '', dueDate: '', returnedDate: '', loanNote: '', note: '自留款，可长期复用。' },
      { id: 'sample-3', name: '亚克力三层收纳盒', category: '收纳', brand: '懒角落', source: '自费购买', status: '已收到', budget: 129, arriveDate: D.add(-9), returnDate: '', link: '', size: '24×16×30cm', ideaIds: ['idea-1', 'idea-6'], img: '', loanStatus: '已归还', borrower: '拍摄搭子阿鱼', loanDate: D.add(-12), dueDate: D.add(-7), returnedDate: D.add(-6), loanNote: '借去拍台面收纳合集，已完好归还。', note: '台面收纳担当，出镜率高。' },
      { id: 'sample-4', name: '软木板 + 图钉套装', category: '布艺', brand: '得力', source: '自费购买', status: '自留', budget: 89, arriveDate: D.add(-14), returnDate: '', link: '', size: '90×60cm', ideaIds: ['idea-3', 'idea-8'], img: '', loanStatus: '未借出', borrower: '', loanDate: '', dueDate: '', returnedDate: '', loanNote: '', note: '挂在梳妆台右侧，已固定在墙上。' },
      { id: 'sample-5', name: '苹果香薰蜡烛', category: '香薰', brand: '观夏', source: '商单', status: '已拍摄', budget: 260, arriveDate: D.add(-8), returnDate: D.add(6), link: '', size: '200g', ideaIds: ['idea-4'], img: '', loanStatus: '已借出', borrower: '摄影师阿哲', loanDate: D.add(-2), dueDate: D.add(3), returnedDate: '', loanNote: '借去拍烛火逆光花絮，用剩的记得带回来。', note: '商单样品，拍完可自留，需二次露出。' },
      { id: 'sample-6', name: '奶白三斗抽屉柜', category: '家具', brand: '宜家', source: '品牌置换', status: '已归还', budget: 599, arriveDate: D.add(-20), returnDate: D.add(-3), link: '', size: '80×48×76cm', ideaIds: ['idea-1'], img: '', loanStatus: '未借出', borrower: '', loanDate: '', dueDate: '', returnedDate: '', loanNote: '', note: '' },
      { id: 'sample-7', name: '免钉洞洞板 60×80', category: '收纳', brand: '致欧', source: '品牌置换', status: '在路上', budget: 219, arriveDate: D.add(2), returnDate: D.add(12), link: '', size: '60×80cm', ideaIds: ['idea-5'], img: '', loanStatus: '未借出', borrower: '', loanDate: '', dueDate: '', returnedDate: '', loanNote: '', note: '' },
      { id: 'sample-8', name: '焦糖色绒布抱枕', category: '布艺', brand: '至家', source: '自费购买', status: '待申请', budget: 99, arriveDate: '', returnDate: '', link: '', size: '45×45cm', ideaIds: [], img: '', loanStatus: '未借出', borrower: '', loanDate: '', dueDate: '', returnedDate: '', loanNote: '', note: '打算配奶白床品，先加购观察。' }
    ],
    scenes: [
      { id: 'scene-1', name: '奶白梳妆角（俯拍）', style: '简约白', background: '奶白墙 + 亚麻白窗帘', table: '原木书桌 + 米白桌旗', props: '花瓶、香薰蜡烛、亚克力收纳盒、小圆镜', lighting: '主光窗光 5600K，侧后方暖光 3000K 补一盏', camera: '俯拍 45°，手机主摄，1/60s，距桌面 60cm', photos: '', sampleIds: ['sample-1', 'sample-3'], note: '最常用的一套，拍小件也好看。' },
      { id: 'scene-2', name: '软木板墙正面机位', style: '简约白', background: '整面奶白墙，软木板居中偏左', table: '无（站立平视）', props: '软木板、图钉、干花、小卡片', lighting: '左侧 45° 窗光，右侧白卡补光', camera: '平视 1.4m 高度，广角端避免畸变', photos: '', sampleIds: ['sample-4'], note: '拍墙面布置、洞洞板都能复用。' },
      { id: 'scene-3', name: '飘窗自然光小景', style: '奶油风', background: '飘窗 + 白纱帘', table: '窗台铺米白绒布', props: '抱枕、香薰、书、毛毯', lighting: '纯自然光，上午 9-10 点最柔', camera: '侧逆光平视，稍微压暗背景', photos: '', sampleIds: ['sample-8'], note: '' }
    ],
    assets: [
      { id: 'asset-1', title: '梳妆台改造 · 前后对比封面', tag: '封面图', used: '已发', reusable: '仅此一条', noteId: 'note-1', link: '', img: '', note: '第一版封面字太小，已替换。' },
      { id: 'asset-2', title: '软木板墙面细节 3 张', tag: '细节图', used: '未发', reusable: '可复用', noteId: 'note-4', link: '', img: '', note: '可复用到洞洞板笔记。' },
      { id: 'asset-3', title: '梳妆凳五把俯拍对比', tag: '对比图', used: '未发', reusable: '仅此一条', noteId: 'note-3', link: '', img: '', note: '' },
      { id: 'asset-4', title: '香薰烛火逆光花絮', tag: '花絮图', used: '已发', reusable: '可复用', noteId: 'note-2', link: '', img: '', note: '' },
      { id: 'asset-5', title: '洞洞板上墙过程', tag: '细节图', used: '未发', reusable: '可复用', noteId: 'note-6', link: '', img: '', note: '' },
      { id: 'asset-6', title: '双十一清单六宫格', tag: '封面图', used: '未发', reusable: '仅此一条', noteId: 'note-5', link: '', img: '', note: '' }
    ],
    deals: [
      { id: 'deal-1', brand: '木野家居', type: '置换', deliveryStatus: '交付中', contact: '阿雅', contactInfo: '微信 muye_ya', deadline: D.add(4), schedule: '月底前发布', requirement: '图文一篇，需露出梳妆凳与品牌 LOGO，评论区维护 7 天。', deliverables: '1 篇图文 + 5 张精修 + 评论区维护', paymentNode: '发布后 7 天', payment: 0, contract: '', note: '样品需 30 天内寄回，已标在样品库。' },
      { id: 'deal-2', brand: '观夏', type: '付费广告', deliveryStatus: '已交付', contact: 'Lynn', contactInfo: '邮箱 lynn@to summer.cn', deadline: D.add(-2), schedule: '10 月中旬发布', requirement: '香薰蜡烛单品种草，需带专属链接与话题。', deliverables: '1 篇图文 + 3 张氛围图', paymentNode: '发布后 30 天', payment: 1800, contract: '', note: '已发布，回款等到账。' },
      { id: 'deal-3', brand: '致欧', type: '置换', deliveryStatus: '待对接', contact: '小林', contactInfo: '小红书私信', deadline: D.add(9), schedule: '11 月初发布', requirement: '洞洞板租房收纳向，需强调免打孔。', deliverables: '1 篇图文 + 1 条短视频', paymentNode: '月结', payment: 0, contract: '', note: '' },
      { id: 'deal-4', brand: '懒角落', type: '付费广告', deliveryStatus: '已结款', contact: 'Momo', contactInfo: '微信 laijiaoluo', deadline: D.add(-16), schedule: '9 月底发布', requirement: '收纳盒合集，需带 3 件产品。', deliverables: '1 篇图文', paymentNode: '完工即付', payment: 900, contract: '', note: '已回款。' }
    ],
    lessons: [
      { id: 'lesson-1', title: '为什么「出租屋改造」那条能到 18w 曝光', type: '爆款拆解', date: D.add(-7), tags: ['封面', '标题', '流量'], content: '1. 封面是前后对比，信息差一眼可见；\n2. 标题给预算数字，降低决策成本；\n3. 正文第一句直接给结论，没有铺垫；\n4. 评论区问链接 → 补了一条清单笔记，二次引流。', link: '', img: '' },
      { id: 'lesson-2', title: '香薰笔记流量差：拍太暗', type: '踩坑记录', date: D.add(-2), tags: ['拍摄', '流量'], content: '烛火氛围好看，但产品细节全黑。小红书是「先看清再心动」，下次至少补 2 张亮部细节图。', link: '', img: '' },
      { id: 'lesson-3', title: '家居类笔记的合规提醒', type: '规则技巧', date: D.add(-10), tags: ['合规'], content: '不要写「最便宜」「全网最低」；置换必须走平台报备；品牌露出要在正文注明合作。', link: '', img: '' },
      { id: 'lesson-4', title: '选题流量差：原木边几避坑', type: '踩坑记录', date: D.add(-18), tags: ['选品', '流量'], content: '避坑内容要具体到「哪一类人别买」，泛泛而谈没人收藏。', link: '', img: '' },
      { id: 'lesson-5', title: '封面 3 秒法则', type: '规则技巧', date: D.add(-5), tags: ['封面', '标题'], content: '封面只留一个主体 + 一句短标题；字占画面不超过 1/4；色系统一。', link: '', img: '' }
    ],
    templates: [
      { id: 'tpl-1', title: '种草类开头：场景+痛点+解决', type: '文案模板', trackType: '种草', tags: ['开头'], content: '在{{场景}}的时候，是不是总被{{痛点}}困扰？\n试了{{产品}}之后，才发现原来可以这么{{效果}}。\n\n具体怎么做的，我整理在了下面👇', tip: '适合种草类笔记开头，第一句直接戳痛点，别铺垫。', img: '', useCount: 5, updatedAt: D.iso(D.today()) },
      { id: 'tpl-2', title: '测评类结构：结论先行+多维度对比', type: '脚本模板', trackType: '测评', tags: ['对比'], content: '直接说结论：{{推荐款}}最值得入，{{不推荐款}}别买。\n\n对比维度：\n1. {{维度1}}：{{结论1}}\n2. {{维度2}}：{{结论2}}\n3. {{维度3}}：{{结论3}}\n\n最后给选购建议：{{人群}}选{{款}}，{{人群2}}选{{款2}}。', tip: '测评类一定要先给结论，再展开对比，读者没耐心看到最后。', img: '', useCount: 3, updatedAt: D.iso(D.today()) },
      { id: 'tpl-3', title: '改造类开头：前后对比+预算', type: '文案模板', trackType: '改造', tags: ['开头'], content: '花了{{预算}}元，把{{空间}}改成了{{风格}}。\n改造前：{{痛点描述}}\n改造后：{{效果描述}}\n\n清单和步骤都在后面，建议先收藏。', tip: '改造类笔记的流量密码是「前后对比」，封面和开头都要直接给反差。', img: '', useCount: 4, updatedAt: D.iso(D.today()) },
      { id: 'tpl-4', title: '数字型标题模板', type: '标题模板', trackType: '通用', tags: ['清单'], content: '{{数字}}个{{品类}}｜{{人群}}必看，{{结果}}', tip: '数字型标题点击率高，数字尽量具体（如 5 个、300 元内），人群越精准越好。', img: '', useCount: 8, updatedAt: D.iso(D.today()) },
      { id: 'tpl-5', title: '避坑型标题模板', type: '标题模板', trackType: '通用', tags: ['避坑'], content: '买了{{产品}}才知道，{{坑点}}真的别踩', tip: '避坑型标题收藏率高，正文要具体到「哪类人别买」「为什么」。', img: '', useCount: 6, updatedAt: D.iso(D.today()) },
      { id: 'tpl-6', title: '清单类正文结构', type: '文案模板', trackType: '种草', tags: ['清单'], content: '{{品类}}清单｜只推荐这{{数量}}件\n\n1. {{产品1}}：{{一句话推荐理由}}\n2. {{产品2}}：{{一句话推荐理由}}\n3. {{产品3}}：{{一句话推荐理由}}\n\n最后说一句：{{总结建议}}', tip: '清单类笔记适合好物分享，每件产品只写一句话，重点突出。', img: '', useCount: 2, updatedAt: D.iso(D.today()) }
    ],
    todos: [
      { id: 'todo-1', title: '把原木梳妆凳寄回木野（顺丰）', module: '样品', priority: '高', due: D.add(1), done: '未完成', note: '归还截止 2 天后，别忘拍寄回视频。' },
      { id: 'todo-2', title: '补拍梳妆凳坐高对比图', module: '拍摄', priority: '高', due: D.add(0), done: '未完成', note: '五把凳子同一机位。' },
      { id: 'todo-3', title: '软木板笔记文案定稿', module: '发布', priority: '中', due: D.add(1), done: '未完成', note: '' },
      { id: 'todo-4', title: '回致欧的档期确认', module: '商务', priority: '中', due: D.add(2), done: '未完成', note: '' },
      { id: 'todo-5', title: '买 2 个焦糖色抱枕', module: '采购', priority: '低', due: D.add(5), done: '未完成', note: '' },
      { id: 'todo-6', title: '整理上月素材归档', module: '其他', priority: '低', due: D.add(-2), done: '已完成', note: '' }
    ],
    finance: [
      { id: 'fin-1', date: `${y}-${D.pad(m)}-03`, kind: '支出', category: '样品', amount: 468, note: '奶白绒面梳妆凳' },
      { id: 'fin-2', date: `${y}-${D.pad(m)}-05`, kind: '支出', category: '道具', amount: 129, note: '亚克力收纳盒' },
      { id: 'fin-3', date: `${y}-${D.pad(m)}-08`, kind: '支出', category: '软装', amount: 89, note: '软木板 + 图钉' },
      { id: 'fin-4', date: `${y}-${D.pad(m)}-10`, kind: '支出', category: '设备', amount: 199, note: '补光灯支架' },
      { id: 'fin-5', date: `${y}-${D.pad(m)}-12`, kind: '收入', category: '商单收入', amount: 900, note: '懒角落收纳合集' },
      { id: 'fin-6', date: `${y}-${D.pad(m)}-18`, kind: '收入', category: '置换折算', amount: 260, note: '观夏香薰（折算）' },
      { id: 'fin-7', date: `${y}-${D.pad(m)}-22`, kind: '支出', category: '道具', amount: 99, note: '焦糖色抱枕' },
      { id: 'fin-8', date: `${y}-${D.pad(m)}-26`, kind: '支出', category: '软装', amount: 268, note: '亚麻窗帘' }
    ]
  };
}

/* ---------------- 文件下载 ---------------- */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  // 部分浏览器对游离节点不触发下载，必须临时挂到文档上
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { } }, 4000);
}

/* ---------------- Store ---------------- */
const STORE_KEY = 'xhs-home-studio-v1';
const Store = {
  state: null,
  init() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { }
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s && s.version === 1 && Array.isArray(s.ideas)) { this.state = s; }
      } catch (e) { }
    }
    if (!this.state) { this.state = buildSeed(); this.save({ silent: true }); }
    this.state.settings = this.state.settings || { assistant: false, viewState: {} };
    // 兼容旧数据：补齐样品借出字段
    this.list('samples').forEach(s => {
      if (!s.loanStatus) s.loanStatus = '未借出';
    });
    // 兼容旧数据：补齐内容模板库种子（老用户首次升级时注入）
    if (!Array.isArray(this.state.templates)) {
      this.state.templates = buildSeed().templates;
    }
  },
  save(opts) {
    if (!opts || !opts.keepTime) {
      this.state.meta = Object.assign({}, this.state.meta, { updatedAt: new Date().toISOString() });
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { }
    if (typeof Sync !== 'undefined') Sync.onLocalSave(opts);
  },
  list(key) { return this.state[key] || []; },
  find(key, id) { return (this.state[key] || []).find(x => x.id === id) || null; },
  add(key, data) {
    data.id = data.id || D.uid(key.slice(0, 4));
    if (key === 'templates') data.updatedAt = data.updatedAt || D.iso(D.today());
    if (!data.owner && typeof Auth !== 'undefined') {
      const session = Auth.current();
      if (session) data.owner = session.user;
    }
    (this.state[key] = this.state[key] || []).unshift(data);
    this.save(); return data;
  },
  update(key, id, patch) {
    const item = this.find(key, id); if (!item) return null;
    if (key === 'templates') patch.updatedAt = patch.updatedAt || D.iso(D.today());
    Object.assign(item, patch); this.save(); return item;
  },
  remove(key, id) {
    this.state[key] = this.list(key).filter(x => x.id !== id); this.save();
  },
  removeByOwner(user) {
    user = String(user || '').trim();
    if (!user) return 0;
    let removed = 0;
    this.dataKeys.forEach(k => {
      const keep = this.list(k).filter(x => x.owner !== user);
      removed += this.list(k).length - keep.length;
      this.state[k] = keep;
    });
    this.save();
    return removed;
  },
  reset() {
    const settings = this.state && this.state.settings;
    this.state = buildSeed();
    if (settings) this.state.settings = settings;
    this.save();
  },
  dataKeys: ['ideas', 'notes', 'samples', 'scenes', 'assets', 'deals', 'lessons', 'templates', 'finance', 'todos'],
  totalCount() {
    return this.dataKeys.reduce((a, k) => a + this.list(k).length, 0);
  },
  clearAll() {
    this.dataKeys.forEach(k => { this.state[k] = []; });
    this.save();
  },
  exportDocument() {
    try {
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const nameOf = (key, id) => {
        const it = this.find(key, id);
        return it ? (it.title || it.name || it.brand || id) : '';
      };
      const cellText = (schema, item, k) => {
        const f = schema.fields.find(x => x.k === k);
        const v = item[k];
        if (!f) return v == null ? '—' : String(v);
        if (f.type === 'ref') return nameOf(f.ref, v) || '—';
        if (f.type === 'refs') return (v || []).map(id => nameOf(f.ref, id)).filter(Boolean).join('、') || '—';
        if (f.type === 'tags') return (v || []).join('、') || '—';
        if (f.type === 'date') return v ? D.cn(v) : '—';
        if (f.type === 'number') {
          if (['budget', 'payment', 'amount'].includes(k)) return v ? D.money(v) : '—';
          return v ? D.num(v) : '—';
        }
        if (f.type === 'image') return v || '—';
        return v === '' || v == null ? '—' : String(v);
      };

      const now = new Date();
      const stamp = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${D.pad(now.getHours())}:${D.pad(now.getMinutes())}`;
      const account = (typeof Auth !== 'undefined' && Auth.current()) ? (Auth.displayName() || Auth.current().user) : '拾一';
      const total = this.totalCount();

      const overview = `<table><thead><tr><th>模块</th><th>记录数</th><th>说明</th></tr></thead><tbody>` +
        this.dataKeys.map(k => {
          const s = SCHEMAS[k];
          return `<tr><td>${esc(s.label)}</td><td>${this.list(k).length}</td><td>${esc(s.desc)}</td></tr>`;
        }).join('') + `</tbody></table>`;

      const sections = this.dataKeys.map((k, idx) => {
        const s = SCHEMAS[k];
        const items = this.list(k);
        const cols = s.table;
        const head = `<tr>${['序号'].concat(cols.map(c => {
          const f = s.fields.find(x => x.k === c);
          return esc(f ? f.t : c);
        })).map(t => `<th>${t}</th>`).join('')}</tr>`;
        const body = items.length ? items.map((it, i) => `<tr><td>${i + 1}</td>${cols.map(c => `<td>${esc(cellText(s, it, c))}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${cols.length + 1}" class="empty">暂无记录</td></tr>`;
        return `<section>
          <h2>${idx + 1}. ${esc(s.label)}（${items.length} 条）</h2>
          <p class="desc">${esc(s.desc)}</p>
          <table><thead>${head}</thead><tbody>${body}</tbody></table>
        </section>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>拾一 · 家居创作工作台 数据文档</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page{size:A4;margin:1.8cm}
body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#2B2926;font-size:10.5pt;line-height:1.7}
h1{margin:0 0 4px;font-size:22pt;font-weight:600;letter-spacing:1px}
h2{margin:22px 0 4px;font-size:13pt;color:#8A6647;border-bottom:1px solid #E9E4DB;padding-bottom:5px}
.cover{border-bottom:2px solid #A9825F;padding-bottom:14px;margin-bottom:8px}
.eyebrow{font-size:9pt;color:#8B837A;letter-spacing:3px;margin-bottom:6px}
.meta{font-size:9.5pt;color:#8B837A;margin:2px 0}
.meta b{color:#2B2926;font-weight:600}
.desc{margin:0 0 8px;font-size:9pt;color:#8B837A}
table{width:100%;border-collapse:collapse;margin:4px 0 4px;font-size:9pt}
th{background:#F4EDE4;color:#5D574F;font-weight:600;text-align:left;padding:6px 8px;border:1px solid #E9E4DB}
td{padding:5px 8px;border:1px solid #E9E4DB;vertical-align:top;word-break:break-all}
tr:nth-child(even) td{background:#FBFAF7}
.empty{text-align:center;color:#A9A197}
.foot{margin-top:26px;padding-top:10px;border-top:1px solid #E9E4DB;font-size:9pt;color:#A9A197;text-align:center}
</style>
</head>
<body>
<div class="cover">
  <div class="eyebrow">HOME STUDIO · DATA REPORT</div>
  <h1>拾一 · 家居创作工作台</h1>
  <p class="meta"><b>工作台数据文档</b>　账号：<b>${esc(account)}</b></p>
  <p class="meta">导出时间：${stamp}　共 <b>${total}</b> 条记录</p>
</div>
<section>
  <h2>数据概览</h2>
  ${overview}
</section>
${sections}
<div class="foot">由「拾一 · 家居创作工作台」自动生成 · ${stamp}</div>
</body>
</html>`;

      saveBlob(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), '拾一工作台-数据文档-' + D.iso(D.today()) + '.doc');
      return { ok: true, count: total };
    } catch (e) {
      return { ok: false, msg: '导出失败：' + (e && e.message ? e.message : '未知错误') };
    }
  },
  exportBackup() {
    try {
      const account = (typeof Auth !== 'undefined' && Auth.current()) ? (Auth.displayName() || Auth.current().user) : '拾一';
      const payload = {
        app: 'xhs-home-studio',
        version: 1,
        exportedAt: new Date().toISOString(),
        account,
        count: this.totalCount(),
        state: this.state
      };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), '拾一工作台-数据备份-' + D.iso(D.today()) + '.json');
      return { ok: true, count: payload.count };
    } catch (e) {
      return { ok: false, msg: '备份失败：' + (e && e.message ? e.message : '未知错误') };
    }
  },
  inspectBackup(text) {
    try {
      const payload = JSON.parse(String(text));
      const st = payload && payload.state ? payload.state : payload;
      if (!st || typeof st !== 'object') return { ok: false, msg: '备份文件内容为空' };
      const known = this.dataKeys.some(k => Array.isArray(st[k]));
      if (!known) return { ok: false, msg: '这不是本工作台的备份文件' };
      const count = this.dataKeys.reduce((a, k) => a + (Array.isArray(st[k]) ? st[k].length : 0), 0);
      return { ok: true, count };
    } catch (e) {
      return { ok: false, msg: '文件无法解析，请选择 .json 备份文件' };
    }
  },
  importBackup(text) {
    const peek = this.inspectBackup(text);
    if (!peek.ok) return peek;
    try {
      const payload = JSON.parse(String(text));
      const st = payload && payload.state ? payload.state : payload;
      this.dataKeys.forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
      st.settings = Object.assign({ assistant: false, viewState: {} }, st.settings || {});
      st.version = 1;
      this.state = st;
      this.save();
      return { ok: true, count: peek.count };
    } catch (e) {
      return { ok: false, msg: '导入失败：' + (e && e.message ? e.message : '未知错误') };
    }
  }
};

/* ---------------- 提醒引擎 ---------------- */
function getReminders() {
  const list = [], today = D.iso(D.today());
  const push = (o) => list.push(o);

  Store.list('notes').forEach(n => {
    if (n.status === '数据复盘' || !n.publishDate) return;
    const left = D.diff(today, n.publishDate);
    if (left !== null && left <= 4) {
      const level = left < 0 ? 'overdue' : left === 0 ? 'today' : left <= 2 ? 'soon' : 'normal';
      push({ kind: '发布', title: n.title, meta: left < 0 ? `已逾期 ${-left} 天` : left === 0 ? '今天发布' : `${left} 天后发布`, date: n.publishDate, level, route: 'notes', itemId: n.id, tone: 'blue' });
    }
  });
  Store.list('samples').forEach(s => {
    if (s.loanStatus === '已借出' && s.dueDate) {
      const left = D.diff(today, s.dueDate);
      if (left !== null && left <= 5) {
        push({ kind: '借还', title: `${s.name} 应还 ${s.borrower || '借用人'}`, meta: left < 0 ? `借出已逾期 ${-left} 天` : left === 0 ? '今天应还' : `${left} 天后应还`, date: s.dueDate, level: left < 0 ? 'overdue' : left <= 1 ? 'today' : 'soon', route: 'samples', itemId: s.id, tone: 'amber' });
      }
    }
    if (s.returnDate && !['已归还'].includes(s.status)) {
      const left = D.diff(today, s.returnDate);
      if (left !== null && left <= 5) {
        push({ kind: '归还', title: `${s.name} 归还`, meta: left < 0 ? `已逾期 ${-left} 天` : left === 0 ? '今天截止' : `${left} 天后截止`, date: s.returnDate, level: left < 0 ? 'overdue' : left <= 1 ? 'today' : 'soon', route: 'samples', itemId: s.id, tone: 'red' });
      }
    }
    if (s.arriveDate && s.status === '在路上') {
      const left = D.diff(today, s.arriveDate);
      if (left !== null && left <= 3 && left >= 0) {
        push({ kind: '到货', title: `${s.name} 预计到货`, meta: left === 0 ? '今天到货' : `${left} 天后到货`, date: s.arriveDate, level: 'soon', route: 'samples', itemId: s.id, tone: 'sand' });
      }
    }
  });
  Store.list('deals').forEach(d => {
    if (!d.deadline || ['已交付', '已结款'].includes(d.deliveryStatus)) return;
    const left = D.diff(today, d.deadline);
    if (left !== null && left <= 7) {
      push({ kind: '商单', title: `${d.brand} 交付截止`, meta: left < 0 ? `已逾期 ${-left} 天` : left === 0 ? '今天截止' : `${left} 天后截止`, date: d.deadline, level: left < 0 ? 'overdue' : left <= 2 ? 'today' : 'soon', route: 'deals', itemId: d.id, tone: 'violet' });
    }
  });
  Store.list('todos').forEach(t => {
    if (t.done === '已完成' || !t.due) return;
    const left = D.diff(today, t.due);
    if (left !== null && left <= 1) {
      push({ kind: '待办', title: t.title, meta: left < 0 ? `已逾期 ${-left} 天` : left === 0 ? '今天到期' : '明天到期', date: t.due, level: left < 0 ? 'overdue' : 'today', route: 'todos', itemId: t.id, tone: 'sand' });
    }
  });
  const order = { overdue: 0, today: 1, soon: 2, normal: 3 };
  return list.sort((a, b) => (order[a.level] - order[b.level]) || D.diff(today, a.date) - D.diff(today, b.date));
}

/* ---------------- 派生统计 ---------------- */
function weekPublishedCount() {
  const week = D.weekDates();
  return Store.list('notes').filter(n => n.status === '数据复盘' && week.includes(n.publishDate)).length;
}
function monthFinance() {
  const mk = D.monthKey(D.iso(D.today()));
  let income = 0, expense = 0;
  Store.list('finance').forEach(f => {
    if (D.monthKey(f.date) !== mk) return;
    if (f.kind === '收入') income += Number(f.amount) || 0; else expense += Number(f.amount) || 0;
  });
  return { income, expense, net: income - expense };
}
function pipelineCounts() {
  return NOTE_STATUS.map(s => ({ status: s, count: Store.list('notes').filter(n => n.status === s).length }));
}
