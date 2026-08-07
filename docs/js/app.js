'use strict';

// ---------- 静态/后端 双模式支持 ----------
// 优先用 Node 后端 API；若不可用（GitHub Pages 等静态部署），回退到 ./manifest.json。
// 所有请求使用相对路径，兼容 project page 子目录部署（/repo/）。

let MANIFEST = null;
async function loadManifest() {
  if (MANIFEST) return MANIFEST;
  const r = await fetch('./manifest.json');
  MANIFEST = await r.json();
  return MANIFEST;
}

const API = {
  async meta() {
    try {
      const r = await fetch('./api/meta');
      if (r.ok) return r.json();
    } catch (e) {}
    const m = await loadManifest();
    return { categories: m.categories, total: m.total };
  },
  async list({ category = '', q = '', limit = 200, offset = 0 } = {}) {
    try {
      const p = new URLSearchParams({ limit, offset });
      if (category) p.set('category', category);
      if (q) p.set('q', q);
      const r = await fetch('./api/content?' + p.toString());
      if (r.ok) return r.json();
    } catch (e) {}
    const m = await loadManifest();
    let items = m.items;
    if (category) items = items.filter((i) => i.category === category);
    const kw = q.toLowerCase().trim();
    if (kw) items = items.filter((i) =>
      `${i.title} ${i.summary} ${i.tags.join(' ')} ${i.author}`.toLowerCase().includes(kw));
    return { items: items.slice(offset, offset + limit), total: items.length };
  },
  async get(id) {
    try {
      const r = await fetch('./api/content/' + encodeURIComponent(id));
      if (r.ok) return r.json();
    } catch (e) {}
    const m = await loadManifest();
    const item = m.items.find((i) => i.id === id);
    return { item: item || null };
  },
  async search(q) {
    try {
      const r = await fetch('./api/search?q=' + encodeURIComponent(q));
      if (r.ok) return r.json();
    } catch (e) {}
    const m = await loadManifest();
    const kw = (q || '').toLowerCase().trim();
    const results = kw
      ? m.items.filter((i) =>
          `${i.title} ${i.summary} ${i.tags.join(' ')} ${i.author} ${i.body}`.toLowerCase().includes(kw))
      : [];
    return { query: q, results, total: results.length };
  },
  async curate(payload) {
    const r = await fetch('./api/agent/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('需要本地 Node 后端支持策展');
    return r.json();
  },
  async publish(payload) {
    const r = await fetch('./api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('需要本地 Node 后端支持发布');
    return r.json();
  },
};

// ---------- Markdown 渲染 ----------
function preprocess(md) {
  return (md || '').replace(/==(.*?)==/g, '<mark>$1</mark>');
}
function renderMarkdown(md) {
  if (window.marked && typeof window.marked.parse === 'function') {
    return window.marked.parse(preprocess(md));
  }
  return preprocess(md).split('\n').map((l) => l.replace(/</g, '&lt;')).join('<br>');
}

// ---------- 工具 ----------
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function esc(s) {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 个性化推荐 ----------
const Personalization = {
  KEY: 'ra_interests',
  async getInterests() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; }
  },
  async setInterests(arr) {
    localStorage.setItem(this.KEY, JSON.stringify(arr));
  },
  async getTaxonomy() {
    const m = await loadManifest();
    return m.interestTaxonomy || [];
  },
  // 兴趣命中分：sum(该兴趣同义词在 item.tags 中的命中数)
  score(item, interests, taxonomy) {
    if (!interests || !interests.length) return 0;
    let s = 0;
    interests.forEach((name) => {
      const t = taxonomy.find((x) => x.key === name);
      if (!t) return;
      t.synonyms.forEach((syn) => {
        if (item.tags.some((tag) => tag.includes(syn) || syn.includes(tag))) s += 1;
      });
    });
    return s;
  },
  async recommend(items, n = 6) {
    const interests = await this.getInterests();
    if (!interests.length) return items.slice(0, n);
    const taxonomy = await this.getTaxonomy();
    return items
      .map((it) => ({ it, s: this.score(it, interests, taxonomy) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.it.date || '').localeCompare(a.it.date || ''))
      .slice(0, n)
      .map((x) => x.it);
  },
};

// ---------- 共读机制（localStorage，纯静态可演示） ----------
const CoRead = {
  CKEY: 'ra_club_checkins',
  NKEY: 'ra_club_notes',
  _read(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } },
  _write(key, v) { localStorage.setItem(key, JSON.stringify(v)); },
  today() { return new Date().toISOString().slice(0, 10); },
  isChecked(topicId) {
    const c = this._read(this.CKEY);
    return (c[topicId] || []).includes(this.today());
  },
  toggleCheckin(topicId) {
    const c = this._read(this.CKEY);
    const list = c[topicId] || [];
    const today = this.today();
    if (list.includes(today)) c[topicId] = list.filter((d) => d !== today);
    else c[topicId] = [...list, today];
    this._write(this.CKEY, c);
    return this.isChecked(topicId);
  },
  checkinDays(topicId) { return (this._read(this.CKEY)[topicId] || []).length; },
  addNote(topicId, text) {
    const n = this._read(this.NKEY);
    n[topicId] = n[topicId] || [];
    n[topicId].unshift({ text, ts: new Date().toISOString() });
    this._write(this.NKEY, n);
  },
  getNotes(topicId) { return this._read(this.NKEY)[topicId] || []; },
  exportAll() {
    const data = { checkins: this._read(this.CKEY), notes: this._read(this.NKEY), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '我的共读档案.json';
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ---------- 阅读页笔记（按内容 id，localStorage） ----------
const Notes = {
  KEY: 'ra_notes',
  _read() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
  get(id) { return this._read()[id] || ''; },
  set(id, text) { const m = this._read(); m[id] = text; localStorage.setItem(this.KEY, JSON.stringify(m)); },
};

window.API = API;
window.Personalization = Personalization;
window.CoRead = CoRead;
window.Notes = Notes;
window.renderMarkdown = renderMarkdown;
window.toast = toast;
window.esc = esc;
