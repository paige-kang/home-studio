/* ---------------- 基础工具 ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toneOf(v) { return TONES[v] || 'gray'; }
function badge(v) { return v ? `<span class="badge tone-${toneOf(v)}">${esc(v)}</span>` : ''; }
function isURL(v) { return /^https?:\/\//i.test(String(v || '')); }
function refName(key, id) {
  const it = Store.find(key, id);
  if (!it) return '';
  return it.title || it.name || it.brand || id;
}
function fieldOf(schema, k) { return schema.fields.find(f => f.k === k); }
function fieldValue(schema, item, k) {
  const f = fieldOf(schema, k); if (!f) return item[k];
  if (f.type === 'ref') return refName(f.ref, item[k]);
  if (f.type === 'refs') return (item[k] || []).map(id => refName(f.ref, id)).filter(Boolean).join('、');
  if (f.type === 'tags') return (item[k] || []).join('、');
  return item[k];
}
function fmtCell(f, item) {
  if (!f) return '';
  const v = item[f.k];
  if (f.type === 'date') return v ? `${D.short(v)} <small class="cell-sub">${D.weekday(v)}</small>` : '<span class="cell-empty">—</span>';
  if (f.type === 'select') return badge(v);
  if (f.type === 'number') {
    if (['budget', 'payment', 'amount'].includes(f.k)) return v ? D.money(v) : '<span class="cell-empty">—</span>';
    return v ? D.num(v) : '<span class="cell-empty">—</span>';
  }
  if (f.type === 'link') return isURL(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener" class="ext-link">链接<svg class="i-mini"><use href="#i-external"/></svg></a>` : '<span class="cell-empty">—</span>';
  if (f.type === 'ref') return esc(refName(f.ref, v)) || '<span class="cell-empty">—</span>';
  if (f.type === 'refs') return (v || []).length ? (v || []).map(id => `<span class="tag">${esc(refName(f.ref, id))}</span>`).join('') : '<span class="cell-empty">—</span>';
  if (f.type === 'tags') return (v || []).length ? (v || []).map(t => `<span class="tag">${esc(t)}</span>`).join('') : '<span class="cell-empty">—</span>';
  if (f.type === 'image') { const ok = isURL(v) || (typeof v === 'string' && v.startsWith('data:')); return ok ? `<img class="cell-thumb" src="${esc(v)}" alt="">` : '<span class="cell-empty">—</span>'; }
  if (f.type === 'textarea') return `<span class="cell-text" title="${esc(v)}">${esc(v || '—')}</span>`;
  return esc(v || '—');
}

/* ---------------- 复制 ---------------- */
function copyText(text, done) {
  const ok = () => { if (typeof done === 'function') done(); };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(ta);
      if (copied) ok(); else toast('复制失败，请手动选择文案');
    } catch (e) { toast('复制失败，请手动选择文案'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(fallback);
  } else fallback();
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- Modal ---------------- */
function openModalHTML(title, inner, foot, size) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-mask"></div><div class="modal ${size || ''}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close><svg><use href="#i-x"/></svg></button></div>
      <div class="modal-body">${inner}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  root.classList.add('open');
  const close = () => { root.classList.remove('open'); root.innerHTML = ''; };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.modal-mask').onclick = close;
  return close;
}
function confirmDialog(text, okText) {
  return new Promise(resolve => {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-mask"></div><div class="modal sm">
      <div class="modal-head"><h3>请确认</h3><button class="icon-btn" data-close><svg><use href="#i-x"/></svg></button></div>
      <div class="modal-body"><p class="confirm-text">${esc(text)}</p></div>
      <div class="modal-foot"><button class="btn btn-ghost" data-no>取消</button><button class="btn btn-primary" data-yes>${esc(okText || '确认')}</button></div>
    </div>`;
    root.classList.add('open');
    const done = v => { root.classList.remove('open'); root.innerHTML = ''; resolve(v); };
    root.querySelector('[data-close]').onclick = () => done(false);
    root.querySelector('.modal-mask').onclick = () => done(false);
    root.querySelector('[data-no]').onclick = () => done(false);
    root.querySelector('[data-yes]').onclick = () => done(true);
  });
}

/* ---------------- 表单 ---------------- */
function defaultsFor(schema) {
  const d = {};
  schema.fields.forEach(f => {
    if (f.type === 'refs' || f.type === 'tags') d[f.k] = [];
    if (f.type === 'number') d[f.k] = 0;
  });
  if (schema.group) {
    const gf = fieldOf(schema, schema.group);
    if (gf && gf.opts) d[schema.group] = gf.opts[0];
  }
  if (schema.key === 'notes') { d.account = typeof Auth !== 'undefined' ? Auth.displayName() : '拾一'; }
  if (schema.key === 'samples') { d.loanStatus = '未借出'; }
  if (schema.key === 'finance' || schema.key === 'todos' || schema.key === 'lessons') { d.date = d.date || D.iso(D.today()); if (schema.key === 'todos') d.due = D.iso(D.today()); }
  return d;
}

function fieldHTML(f, value, schemaKey) {
  const v = value == null ? '' : value;
  const span = f.span === 2 ? ' span2' : '';
  const req = f.req ? ' <span class="req">*</span>' : '';
  let inner = '';
  if (f.type === 'textarea' || f.type === 'paste') {
    inner = `<textarea data-fk="${f.k}" rows="${f.type === 'paste' ? 3 : 4}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
    if (f.type === 'paste') inner += `<span class="hint">直接粘贴小红书后台数据，例如「曝光 18.6w 点赞 1104 收藏 2380」，保存时自动识别。</span>`;
  } else if (f.type === 'select') {
    inner = `<select data-fk="${f.k}">${(f.opts || []).map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else if (f.type === 'number') {
    inner = `<input type="number" data-fk="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '0')}">`;
  } else if (f.type === 'date') {
    inner = `<input type="date" data-fk="${f.k}" value="${esc(v)}">`;
  } else if (f.type === 'link') {
    inner = `<div class="link-row"><input type="text" data-fk="${f.k}" value="${esc(v)}" placeholder="https://"><a class="ext-link" data-open-link target="_blank" rel="noopener" hidden>打开<svg class="i-mini"><use href="#i-external"/></svg></a></div>`;
  } else if (f.type === 'image') {
    const isBase64 = typeof v === 'string' && v.startsWith('data:');
    const showImg = isURL(v) || isBase64;
    inner = `<div class="image-field">
      <input type="text" data-fk="${f.k}" value="${esc(v)}" placeholder="图片链接，或点右侧本地上传">
      <label class="img-upload-btn" title="从本地上传图片">
        <svg class="ni"><use href="#i-image"/></svg>上传
        <input type="file" accept="image/*" data-img-upload hidden>
      </label>
      <img class="img-preview ${showImg ? 'show' : ''}" data-preview src="${esc(showImg ? v : '')}" alt="">
    </div>`;
  } else if (f.type === 'tags') {
    const selected = Array.isArray(v) ? v : (v ? String(v).split(/[，,、]/).filter(Boolean) : []);
    inner = `<div class="tag-editor" data-fk="${f.k}">
      ${(f.opts || []).map(o => `<button type="button" class="chip ${selected.includes(o) ? 'is-active' : ''}" data-tag="${esc(o)}">${esc(o)}</button>`).join('')}
      <input type="text" class="tag-extra" data-extra placeholder="自定义，逗号分隔" value="${esc(selected.filter(x => !(f.opts || []).includes(x)).join('，'))}">
    </div>`;
  } else if (f.type === 'refs') {
    const selected = Array.isArray(v) ? v : [];
    const items = Store.list(f.ref);
    inner = `<div class="ref-chips" data-fk="${f.k}">${items.length ? items.map(it => `<button type="button" class="chip ${selected.includes(it.id) ? 'is-active' : ''}" data-refid="${it.id}">${esc(it.title || it.name || it.brand)}</button>`).join('') : '<span class="hint">暂无可关联内容</span>'}</div>`;
  } else if (f.type === 'ref') {
    const items = Store.list(f.ref);
    inner = `<select data-fk="${f.k}"><option value="">不关联</option>${items.map(it => `<option value="${it.id}" ${v === it.id ? 'selected' : ''}>${esc(it.title || it.name || it.brand)}</option>`).join('')}</select>`;
  } else {
    inner = `<input type="text" data-fk="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}">`;
  }
  return `<div class="field${span}" data-field="${f.k}"><label>${esc(f.t)}${req}</label>${inner}</div>`;
}

function openForm(key, item, opts) {
  opts = opts || {};
  const schema = SCHEMAS[key];
  const isEdit = !!item;
  const ro = !!opts.readonly;
  const data = isEdit ? JSON.parse(JSON.stringify(item)) : Object.assign(defaultsFor(schema), opts.preset || {});
  let inner = schema.form.map(sec => `<div class="form-sec">${esc(sec.t)}</div><div class="form-grid">${sec.keys.map(k => { const f = fieldOf(schema, k); return f ? fieldHTML(f, data[k], key) : ''; }).join('')}</div>`).join('');

  // 内容流水线：套用模板
  if (key === 'notes' && !ro) {
    const tpls = Store.list('templates').filter(t => t.type === '文案模板' || t.type === '脚本模板' || t.type === '标题模板');
    const tplOpts = tpls.length
      ? tpls.map(t => `<option value="${t.id}">${esc(t.title)}（${t.type}）</option>`).join('')
      : '<option value="">暂无模板，先去模板库创建</option>';
    inner = `<div class="tpl-apply-bar">
      <label>📝 套用内容模板</label>
      <div class="tpl-apply-row">
        <select id="tplSelect"><option value="">选择一个模板…</option>${tplOpts}</select>
        <button type="button" class="btn btn-soft" id="tplApplyBtn">套用</button>
        <a class="tpl-link" href="#/templates" target="_blank">去模板库 →</a>
      </div>
    </div>` + inner;
  }
  const foot = ro
    ? '<button class="btn btn-ghost" data-cancel>关闭</button>'
    : `${isEdit ? '<button class="btn btn-danger left" data-del>删除</button>' : ''}<button class="btn btn-ghost" data-cancel>取消</button><button class="btn btn-primary" data-save>${isEdit ? '保存修改' : '创建'}</button>`;
  const close = openModalHTML(`${ro ? '查看' : isEdit ? '编辑' : '新建'} · ${schema.label}`, inner, foot, 'lg');
  const root = document.getElementById('modalRoot');
  const modal = root.querySelector('.modal');

  if (ro) {
    modal.querySelectorAll('input,select,textarea,[data-tag],[data-refid]').forEach(el => { el.disabled = true; });
    modal.querySelectorAll('.modal-body').forEach(el => el.classList.add('is-readonly'));
  }

  // 链接、图片小交互
  modal.querySelectorAll('[data-field]').forEach(fd => {
    const fk = fd.dataset.field;
    const f = fieldOf(schema, fk);
    if (f.type === 'link') {
      const inp = fd.querySelector('input'), link = fd.querySelector('[data-open-link]');
      const sync = () => { if (isURL(inp.value)) { link.href = inp.value; link.hidden = false; } else link.hidden = true; };
      inp.addEventListener('input', sync); sync();
    }
    if (f.type === 'image') {
      const inp = fd.querySelector('input[type="text"]'), prev = fd.querySelector('[data-preview]');
      const upload = fd.querySelector('[data-img-upload]');
      const sync = () => { const v = inp.value; const ok = isURL(v) || v.startsWith('data:'); if (ok) { prev.src = v; prev.classList.add('show'); } else prev.classList.remove('show'); };
      inp.addEventListener('input', sync); sync();
      upload.addEventListener('change', () => {
        const file = upload.files && upload.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { toast('图片请小于 4MB'); upload.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => { inp.value = reader.result; sync(); toast('图片已上传'); };
        reader.onerror = () => { toast('图片读取失败'); };
        reader.readAsDataURL(file);
      });
    }
  });
  // 标签 / 关联切换
  modal.querySelectorAll('[data-tag]').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('is-active')));
  modal.querySelectorAll('[data-refid]').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('is-active')));

  // 套用模板
  const tplApplyBtn = document.getElementById('tplApplyBtn');
  if (tplApplyBtn) {
    tplApplyBtn.onclick = () => {
      const sel = document.getElementById('tplSelect');
      const tplId = sel.value;
      if (!tplId) { toast('请先选择一个模板'); return; }
      const tpl = Store.list('templates').find(t => t.id === tplId);
      if (!tpl) return;
      // 文案模板/脚本模板 → body；标题模板 → title
      const bodyField = modal.querySelector('[data-field="body"] textarea');
      const titleField = modal.querySelector('[data-field="title"] input');
      if (tpl.type === '标题模板') {
        if (titleField) { titleField.value = tpl.content; titleField.dispatchEvent(new Event('input')); }
        toast('已套用标题模板');
      } else {
        if (bodyField) { bodyField.value = tpl.content; bodyField.dispatchEvent(new Event('input')); }
        toast('已套用模板到正文');
      }
      // 更新使用次数
      tpl.useCount = (Number(tpl.useCount) || 0) + 1;
      tpl.updatedAt = D.iso(D.today());
      Store.update('templates', tpl.id, tpl);
    };
  }

  const collect = () => {
    const out = {};
    schema.fields.forEach(f => {
      const holder = modal.querySelector(`[data-field="${f.k}"]`); if (!holder) return;
      if (f.type === 'tags') {
        const picked = [...holder.querySelectorAll('[data-tag].is-active')].map(b => b.dataset.tag);
        const extra = holder.querySelector('[data-extra]');
        const more = extra ? extra.value.split(/[，,、]/).map(s => s.trim()).filter(Boolean) : [];
        out[f.k] = [...new Set([...picked, ...more])];
      } else if (f.type === 'refs') {
        out[f.k] = [...holder.querySelectorAll('[data-refid].is-active')].map(b => b.dataset.refid);
      } else {
        const inp = holder.querySelector('[data-fk]');
        if (!inp) return;
        out[f.k] = f.type === 'number' ? (Number(inp.value) || 0) : inp.value.trim();
      }
    });
    return out;
  };

  // 笔记一键复制：标题 + 正文 + 标签
  if (schema.key === 'notes') {
    const bodyEl = modal.querySelector('.modal-body');
    const bar = document.createElement('div');
    bar.className = 'form-copybar';
    bar.innerHTML = `<span class="form-copybar-text">标题、正文、标签按发布格式拼接</span><button class="btn btn-soft btn-xs" type="button" data-copy>复制文案</button>`;
    bodyEl.insertBefore(bar, bodyEl.firstChild);
    bar.querySelector('[data-copy]').onclick = () => {
      const out = collect();
      const parts = [out.title, out.body, out.tags].filter(v => String(v || '').trim());
      if (!parts.length) { toast('还没有可复制的文案'); return; }
      copyText(parts.join('\n\n'), () => toast('文案已复制，可直接粘贴到小红书'));
    };
  }

  modal.querySelector('[data-cancel]').onclick = close;
  const saveBtn = modal.querySelector('[data-save]');
  if (saveBtn) saveBtn.onclick = () => {
    const out = collect();
    const reqField = schema.fields.find(f => f.req);
    if (reqField && !String(out[reqField.k] || '').trim()) { toast(`请填写${reqField.t}`); return; }
    if (schema.key === 'notes' && out.paste) {
      const parsed = parsePastedMetrics(out.paste);
      if (parsed.exposure != null) out.exposure = parsed.exposure;
      if (parsed.likes != null) out.likes = parsed.likes;
      if (parsed.saves != null) out.saves = parsed.saves;
      if (Object.keys(parsed).length) toast('已识别后台数据');
    }
    if (schema.key === 'samples') {
      if (!out.loanStatus) out.loanStatus = '未借出';
      const today = D.iso(D.today());
      if (out.loanStatus === '已借出') {
        if (!out.loanDate) out.loanDate = today;
        if (!out.dueDate) out.dueDate = D.addOn(out.loanDate, 7);
      }
      if (out.loanStatus === '已归还' && !out.returnedDate) out.returnedDate = today;
    }
    if (isEdit) Store.update(key, item.id, out); else Store.add(key, out);
    close();
    if (typeof opts.onSaved === 'function') opts.onSaved();
    toast(isEdit ? '已保存' : '已创建');
  };
  const delBtn = modal.querySelector('[data-del]');
  if (delBtn) delBtn.onclick = async () => {
    close();
    if (await confirmDialog('删除后不可恢复，确定要删除这一条吗？', '删除')) {
      Store.remove(key, item.id);
      toast('已删除');
      if (typeof opts.onSaved === 'function') opts.onSaved();
    }
  };
}

function parsePastedMetrics(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const grab = (labels) => {
    for (const label of labels) {
      const m = t.match(new RegExp(label + '\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*(万|w|W)?'));
      if (m) return Math.round(Number(m[1]) * (m[2] ? 10000 : 1));
    }
    return null;
  };
  const out = {};
  const e = grab(['曝光', '阅读', '浏览量']); if (e != null) out.exposure = e;
  const l = grab(['点赞', '赞']); if (l != null) out.likes = l;
  const s = grab(['收藏']); if (s != null) out.saves = s;
  return out;
}

/* ---------------- 卡片 / 看板 / 表格 / 图库 ---------------- */
function cardThumb(item, schema) {
  const src = schema.img ? item[schema.img] : '';
  if (isURL(src) || (typeof src === 'string' && src.startsWith('data:'))) return `<img class="bcard-thumb" src="${esc(src)}" alt="">`;
  const ch = String(item[schema.title] || '拾').slice(0, 1);
  return `<span class="bcard-thumb grad-${hashOf(item.id)}">${esc(ch)}</span>`;
}
function hashOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 6; return h + 1; }

function cardExtra(schema, item) {
  if (schema.key === 'samples' && item.loanStatus === '已借出') {
    const left = item.dueDate ? D.diff(D.iso(D.today()), item.dueDate) : null;
    const txt = left === null ? '借出中' : left < 0 ? `借出逾期 ${-left} 天` : left === 0 ? '今天应还' : `${left} 天后应还`;
    return `<span class="mini-warn">${txt}${item.borrower ? ' · ' + esc(item.borrower) : ''}</span>`;
  }
  if (schema.key === 'samples' && item.returnDate && item.status !== '已归还') {
    const left = D.diff(D.iso(D.today()), item.returnDate);
    if (left !== null && left <= 5) return `<span class="mini-warn">归还${left < 0 ? '逾期' : left === 0 ? '今天' : ' ' + left + ' 天'}</span>`;
  }
  if (schema.key === 'notes' && item.publishDate) return `<span>${D.short(item.publishDate)} 发布</span>`;
  if (schema.key === 'ideas' && item.planDate) return `<span>计划 ${D.short(item.planDate)}</span>`;
  if (schema.key === 'deals' && item.deadline) return `<span>截止 ${D.short(item.deadline)}</span>`;
  if (schema.key === 'samples' && item.budget) return `<span>${D.money(item.budget)}</span>`;
  if (schema.key === 'assets' && item.noteId) return `<span>↳ ${esc(refName('notes', item.noteId))}</span>`;
  if (schema.key === 'ideas' && (isURL(item.xhsLink) || isURL(item.refLink))) return `<a class="ext-link" href="${esc(isURL(item.xhsLink) ? item.xhsLink : item.refLink)}" target="_blank" rel="noopener">参考<svg class="i-mini"><use href="#i-external"/></svg></a>`;
  if (schema.key === 'templates') {
    const cnt = Number(item.useCount) || 0;
    return `<span class="mini-tag">使用 ${cnt} 次</span>`;
  }
  return '';
}

function renderBoardCard(schema, item) {
  const tags = (schema.tag && Array.isArray(item[schema.tag])) ? item[schema.tag].slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('') : '';
  const sub = schema.sub ? fieldValue(schema, item, schema.sub) : '';
  return `<article class="bcard" draggable="true" data-act="open" data-key="${schema.key}" data-id="${item.id}">
    <div class="bcard-head">${cardThumb(item, schema)}
      <div class="bcard-title-wrap"><h4>${esc(item[schema.title] || '未命名')}</h4>${sub ? `<span class="bcard-sub">${esc(sub)}</span>` : ''}</div>
    </div>
    ${tags ? `<div class="bcard-tags">${tags}</div>` : ''}
    <div class="bcard-foot">${badge(item[schema.group] || '')}${cardExtra(schema, item)}</div>
  </article>`;
}

function renderBoard(schema, items, readonly) {
  const statuses = schema.statuses || [];
  return `<div class="board" data-board="${schema.key}">` + statuses.map(st => {
    const list = items.filter(i => i[schema.group] === st);
    return `<div class="board-col" data-drop="${esc(st)}" data-key="${schema.key}">
      <div class="board-col-head"><span class="badge dot-badge tone-${toneOf(st)}">${esc(st)}</span><em>${list.length}</em></div>
      <div class="board-cards">${list.map(i => renderBoardCard(schema, i)).join('') || '<div class="board-empty">拖到这里</div>'}</div>
      ${readonly ? '' : `<button class="board-add" data-act="new" data-key="${schema.key}" data-preset="${esc(st)}"><svg class="i-mini"><use href="#i-plus"/></svg>新建</button>`}
    </div>`;
  }).join('') + '</div>';
}

function renderTable(schema, items, sort, readonly) {
  const cols = schema.table || [];
  const selectable = !readonly;
  const allSelected = selectable && items.length > 0 && items.every(it => PAGE.selected[it.id]);
  const checkHead = selectable
    ? `<th class="th-check"><button class="select-box${allSelected ? ' is-on' : ''}" type="button" data-act="select-all" data-key="${schema.key}" title="全选当前列表" aria-label="全选"><svg><use href="#i-check"/></svg></button></th>`
    : '';
  const head = cols.map(k => {
    const f = fieldOf(schema, k);
    const active = sort && sort.k === k;
    const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
    return `<th class="th-sort${active ? ' is-sorted' : ''}" data-act="sort" data-key="${schema.key}" data-sortby="${k}" title="点击按此列排序">${esc(f ? f.t : k)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('');
  const rows = items.map(it => {
    const sel = !!PAGE.selected[it.id];
    return `<tr class="${sel ? 'is-selected' : ''}" data-act="open" data-key="${schema.key}" data-id="${it.id}">
      ${selectable ? `<td class="td-check"><button class="select-box${sel ? ' is-on' : ''}" type="button" data-act="select" data-key="${schema.key}" data-id="${it.id}" title="选择" aria-label="选择该行"><svg><use href="#i-check"/></svg></button></td>` : ''}
      ${cols.map(k => `<td>${fmtCell(fieldOf(schema, k), it)}</td>`).join('')}
      <td class="row-actions">${readonly
        ? `<button class="icon-btn xs" data-act="open" data-key="${schema.key}" data-id="${it.id}" title="查看详情"><svg><use href="#i-eye"/></svg></button>`
        : `<button class="icon-btn xs" data-act="edit" data-key="${schema.key}" data-id="${it.id}" title="编辑"><svg><use href="#i-edit"/></svg></button><button class="icon-btn xs danger" data-act="del" data-key="${schema.key}" data-id="${it.id}" title="删除"><svg><use href="#i-trash"/></svg></button>`}</td>
    </tr>`;
  }).join('');
  const colCount = cols.length + 1 + (selectable ? 1 : 0);
  return `<div class="table-wrap card"><table class="tbl"><thead><tr>${checkHead}${head}<th class="th-actions">操作</th></tr></thead><tbody>${rows || `<tr><td colspan="${colCount}"><div class="empty">还没有记录</div></td></tr>`}</tbody></table></div>`;
}

function renderGallery(schema, items) {
  return `<div class="gallery">` + items.map(it => {
    const src = schema.img ? it[schema.img] : '';
    const sub = schema.sub ? fieldValue(schema, it, schema.sub) : '';
    const tags = schema.tag ? (Array.isArray(it[schema.tag]) ? it[schema.tag] : [it[schema.tag]]).filter(Boolean).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('') : '';
    const imgOk = isURL(src) || (typeof src === 'string' && src.startsWith('data:'));
    const img = imgOk
      ? `<img src="${esc(src)}" alt="">`
      : `<div class="gimg-fallback grad-${hashOf(it.id)}"><b>${esc(String(it[schema.title] || '拾').slice(0, 1))}</b><small>${esc(schema.label)}</small></div>`;
    return `<article class="gcard" data-act="open" data-key="${schema.key}" data-id="${it.id}">
      <div class="gcard-img">${img}${schema.statuses && it[schema.group] ? `<span class="gcard-badge">${badge(it[schema.group])}</span>` : ''}</div>
      <div class="gcard-body">
        <h4>${esc(it[schema.title] || '未命名')}</h4>
        <div class="gcard-meta">${sub ? `<span>${esc(sub)}</span>` : ''}${tags}</div>
        ${cardExtra(schema, it) ? `<div class="gcard-foot">${cardExtra(schema, it)}</div>` : ''}
      </div>
    </article>`;
  }).join('') + (items.length ? '' : '<div class="empty" style="grid-column:1/-1">还没有记录</div>') + `</div>`;
}

function renderList(schema, items) {
  const groups = schema.statuses || [];
  return groups.map(g => {
    const list = items.filter(i => i[schema.group] === g);
    if (g === '已完成' && !list.length) return '';
    return `<div class="todo-group card">
      <div class="todo-group-head"><b>${esc(g)}</b><em>${list.length}</em></div>
      <div class="todo-rows">${list.map(it => `
        <div class="todo-row ${it[schema.group] === '已完成' ? 'is-done' : ''}">
          <button class="todo-check" data-act="toggle" data-key="${schema.key}" data-id="${it.id}" aria-label="切换完成"><svg><use href="#i-check"/></svg></button>
          <div class="todo-main" data-act="open" data-key="${schema.key}" data-id="${it.id}">
            <b>${esc(it.title)}</b>
            <div class="todo-meta">${it.module ? `<span class="tag">${esc(it.module)}</span>` : ''}${it.due ? `<span class="${D.diff(D.iso(D.today()), it.due) < 0 && it[schema.group] !== '已完成' ? 'overdue-text' : ''}">${D.short(it.due)} · ${D.weekday(it.due)}</span>` : ''}</div>
          </div>
          ${it.priority ? badge(it.priority) : ''}
          <button class="icon-btn xs" data-act="edit" data-key="${schema.key}" data-id="${it.id}" title="编辑"><svg><use href="#i-edit"/></svg></button>
        </div>`).join('') || '<div class="empty">暂无</div>'}
      </div>
    </div>`;
  }).join('');
}

function renderViewSwitcher(schema, current) {
  const labels = { board: '看板', table: '表格', gallery: '图库', list: '清单', calendar: '日历' };
  const icons = { board: 'i-board', table: 'i-table', gallery: 'i-gallery', list: 'i-list', calendar: 'i-cal' };
  return `<div class="seg" data-switch="${schema.key}">${schema.views.map(v => `<button class="${v === current ? 'is-active' : ''}" data-act="view" data-key="${schema.key}" data-view="${v}"><svg><use href="#${icons[v]}"/></svg>${labels[v]}</button>`).join('')}</div>`;
}
