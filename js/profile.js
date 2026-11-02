/* ---------------- 个人中心：头像与界面色系（按账号保存） ---------------- */
const PROFILE_KEY = 'xhs-home-profile-v1';
const THEME_KEY = 'xhs-home-theme-v1';

/* 界面色系：只调整主色与底色，保持整体奶油质感 */
const THEMES = [
  { id: 'default', name: '奶油原木', desc: '原木棕 + 奶油白', sw: ['#F7F5F1', '#C9A582', '#A9825F'] },
  { id: 'mist', name: '莫兰迪灰', desc: '低饱和中性灰', sw: ['#F4F4F5', '#A79E90', '#8D8579'] },
  { id: 'sage', name: '鼠尾草绿', desc: '柔和自然绿', sw: ['#F1F5F1', '#94AF90', '#7C9A7E'] },
  { id: 'ocean', name: '雾霾蓝', desc: '清冷静蓝', sw: ['#F1F4F8', '#8BA4C2', '#6E89AA'] },
  { id: 'clay', name: '陶土暖砂', desc: '温暖陶土橙', sw: ['#F8F2EC', '#D09271', '#B97A5A'] },
  { id: 'rose', name: '玫瑰灰粉', desc: '柔雾玫瑰粉', sw: ['#F8F3F4', '#C9939E', '#B07A84'] }
];

const AVATAR_GRADS = {
  'grad:0': ['#C9A582', '#A9825F'],
  'grad:1': ['#94AF90', '#7C9A7E'],
  'grad:2': ['#8BA4C2', '#6E89AA'],
  'grad:3': ['#D09271', '#B97A5A'],
  'grad:4': ['#C9939E', '#B07A84']
};

function readProfiles() {
  try {
    const o = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) { return {}; }
}
function writeProfiles(o) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(o)); } catch (e) { /* 忽略 */ }
}

const Profile = {
  themes: THEMES,
  grads: AVATAR_GRADS,
  get(user) {
    user = String(user || '').trim();
    const all = readProfiles();
    const p = (user && all[user]) || {};
    return {
      avatar: typeof p.avatar === 'string' ? p.avatar : '',
      theme: THEMES.some(t => t.id === p.theme) ? p.theme : 'default'
    };
  },
  save(user, patch) {
    user = String(user || '').trim();
    if (!user) return;
    const all = readProfiles();
    all[user] = Object.assign({}, all[user], patch || {});
    writeProfiles(all);
    if (patch && patch.theme) this.applyTheme(patch.theme);
  },
  remove(user) {
    user = String(user || '').trim();
    if (!user) return;
    const all = readProfiles();
    if (all[user]) { delete all[user]; writeProfiles(all); }
  },
  themeOf(user) { return this.get(user).theme; },
  applyTheme(id) {
    const ok = THEMES.some(t => t.id === id) ? id : 'default';
    try { document.documentElement.setAttribute('data-theme', ok); } catch (e) { /* 忽略 */ }
    try { localStorage.setItem(THEME_KEY, ok); } catch (e) { /* 忽略 */ }
  },
  applyFor(user) { this.applyTheme(this.themeOf(user)); },
  grad(key) { return AVATAR_GRADS[key] || null; },
  isImage(avatar) { return /^data:image\//.test(String(avatar || '')); },
  initial(name) { return String(name || '拾').trim().slice(0, 1) || '拾'; },
  avatarHTML(user, name, cls) {
    const p = this.get(user);
    const ini = this.initial(name || user);
    const k = cls || 'user-ava';
    if (this.isImage(p.avatar)) {
      return `<span class="${k} has-img"><img src="${p.avatar}" alt=""></span>`;
    }
    const g = this.grad(p.avatar);
    const bg = g ? ` style="background:linear-gradient(145deg,${g[0]},${g[1]})"` : '';
    return `<span class="${k}"${bg}>${esc(ini)}</span>`;
  },
  resizeImage(file, cb) {
    if (!file || !/^image\//.test(file.type || '')) { cb('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { cb('图片超过 8MB，换一张小一点的'); return; }
    const reader = new FileReader();
    reader.onerror = () => cb('读取图片失败');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => cb('图片解析失败，换一张试试');
      img.onload = () => {
        const size = 160, canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        try { cb(null, canvas.toDataURL('image/jpeg', 0.82)); }
        catch (e) { cb('图片处理失败'); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
};
