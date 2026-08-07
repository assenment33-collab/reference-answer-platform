'use strict';

/**
 * 慢读 Slowread · 在线阅读平台
 * 零依赖 Node http 服务：内容检索 / 全局搜索 / agent 策展接口 / 静态站点
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const BASE = __dirname;
const CONTENT_DIR = path.join(BASE, 'content');
const PUBLIC_DIR = path.join(BASE, 'public');
const PORT = process.env.PORT || 3000;

// 品类元数据（目录 key -> 中文名 + 模块图标）
const CATEGORIES = {
  daily:   { name: '信息食谱', icon: '📖' },
  weekly:  { name: '参考周刊', icon: '📰' },
  monthly: { name: '参考月刊', icon: '🗓️' },
  topics:  { name: '领域专题', icon: '📂' },
  people:  { name: '前路人',   icon: '🧭' },
  books:   { name: '参考书',   icon: '📚' },
  calendar:{ name: '每日日历', icon: '📅' },
};

let INDEX = []; // 全局内容索引

// ---------- 工具 ----------

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

// 解析 markdown 的 frontmatter（简易 YAML：key: value）
function parseFrontmatter(raw) {
  const meta = {};
  let body = raw;
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (m) {
    const fm = m[1];
    body = raw.slice(m[0].length);
    fm.split('\n').forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k) meta[k] = v;
    });
  }
  return { meta, body: body.trim() };
}

function parseTags(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t;
  return t.split(',').map((s) => s.trim()).filter(Boolean);
}

function slugify(s) {
  return s.replace(/[^一-龥a-zA-Z0-9\-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ---------- 索引构建 ----------

function buildIndex() {
  const items = [];
  Object.keys(CATEGORIES).forEach((cat) => {
    const dir = path.join(CONTENT_DIR, cat);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((file) => {
      if (!file.endsWith('.md')) return;
      const raw = readFileSafe(path.join(dir, file));
      if (!raw) return;
      const { meta, body } = parseFrontmatter(raw);
      const slug = file.replace(/\.md$/, '');
      const tags = parseTags(meta.tags);
      items.push({
        id: `${cat}/${slug}`,
        category: cat,
        categoryName: CATEGORIES[cat].name,
        icon: CATEGORIES[cat].icon,
        title: meta.title || slug,
        author: meta.author || '',
        date: meta.date || '',
        tags,
        summary: meta.summary || body.slice(0, 120),
        body,
        file: path.join(dir, file),
      });
    });
  });
  // 按日期倒序（有日期的在前）
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  INDEX = items;
  console.log(`[index] built ${INDEX.length} items across ${Object.keys(CATEGORIES).length} categories`);
}

// ---------- 搜索 ----------

function searchIndex(q) {
  const kw = (q || '').toLowerCase().trim();
  if (!kw) return [];
  const scored = [];
  INDEX.forEach((it) => {
    const hay = `${it.title} ${it.summary} ${it.tags.join(' ')} ${it.author} ${it.body}`.toLowerCase();
    if (!hay.includes(kw)) return;
    let score = 0;
    if (it.title.toLowerCase().includes(kw)) score += 10;
    if (it.tags.some((t) => t.toLowerCase().includes(kw))) score += 5;
    if (it.summary.toLowerCase().includes(kw)) score += 2;
    scored.push({ item: it, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

// ---------- HTTP 辅助 ----------

function sendJSON(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 防目录穿越
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA 兜底：未知非 API 路径回 index.html
    if (!pathname.startsWith('/api/')) filePath = path.join(PUBLIC_DIR, 'index.html');
    else return sendText(res, 404, 'Not found');
  }
  const ext = path.extname(filePath).toLowerCase();
  const data = readFileSafe(filePath);
  if (data == null) return sendText(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { resolve({}); }
    });
  });
}

// ---------- agent 策展（懒加载，避免无 key 时报错） ----------

let agentModule = null;
function getAgent() {
  if (!agentModule) agentModule = require('./agent');
  return agentModule;
}

// ---------- 路由 ----------

async function handleApi(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;

  // 元信息：品类与计数
  if (p === '/api/meta' && req.method === 'GET') {
    const categories = Object.keys(CATEGORIES).map((k) => ({
      key: k,
      name: CATEGORIES[k].name,
      icon: CATEGORIES[k].icon,
      count: INDEX.filter((i) => i.category === k).length,
    }));
    return sendJSON(res, 200, { categories, total: INDEX.length });
  }

  // 内容列表（可按品类 + 关键词过滤）
  if (p === '/api/content' && req.method === 'GET') {
    const cat = q.get('category') || '';
    const kw = (q.get('q') || '').toLowerCase().trim();
    let items = INDEX;
    if (cat && CATEGORIES[cat]) items = items.filter((i) => i.category === cat);
    if (kw) items = items.filter((i) =>
      `${i.title} ${i.summary} ${i.tags.join(' ')} ${i.author}`.toLowerCase().includes(kw));
    const limit = parseInt(q.get('limit') || '50', 10);
    const offset = parseInt(q.get('offset') || '0', 10);
    const page = items.slice(offset, offset + limit).map(({ body, file, ...rest }) => rest);
    return sendJSON(res, 200, { items: page, total: items.length });
  }

  // 内容详情
  if (p.startsWith('/api/content/') && req.method === 'GET') {
    const id = decodeURIComponent(p.slice('/api/content/'.length));
    const [cat] = id.split('/');
    if (!CATEGORIES[cat]) return sendJSON(res, 404, { error: 'unknown category' });
    const item = INDEX.find((i) => i.id === id);
    if (!item) return sendJSON(res, 404, { error: 'not found' });
    return sendJSON(res, 200, { item });
  }

  // 全局搜索
  if (p === '/api/search' && req.method === 'GET') {
    const kw = q.get('q') || '';
    const results = searchIndex(kw).map(({ body, file, ...rest }) => rest);
    return sendJSON(res, 200, { query: kw, results, total: results.length });
  }

  // agent 策展：生成初稿
  if (p === '/api/agent/curate' && req.method === 'POST') {
    const body = await readBody(req);
    const { category, topic, mode } = body;
    if (!topic) return sendJSON(res, 400, { error: 'topic required' });
    try {
      const agent = getAgent();
      const result = await agent.curate({ category: category || 'daily', topic, mode: mode || 'auto' });
      const draft = typeof result === 'string' ? result : result.draft;
      const modeUsed = typeof result === 'string' ? 'demo' : (result.mode || 'demo');
      return sendJSON(res, 200, { draft, mode: modeUsed });
    } catch (e) {
      return sendJSON(res, 500, { error: String(e.message || e) });
    }
  }

  // 发布：编辑把关后写入内容库
  if (p === '/api/content' && req.method === 'POST') {
    const body = await readBody(req);
    const cat = body.category;
    if (!CATEGORIES[cat]) return sendJSON(res, 400, { error: 'invalid category' });
    const md = body.markdown || '';
    if (!md.trim()) return sendJSON(res, 400, { error: 'empty markdown' });
    const { meta } = parseFrontmatter(md);
    const title = meta.title || '未命名';
    const date = meta.date || new Date().toISOString().slice(0, 10);
    const slug = slugify(`${date}-${title}`);
    const filePath = path.join(CONTENT_DIR, cat, `${slug}.md`);
    fs.writeFileSync(filePath, md, 'utf8');
    buildIndex();
    return sendJSON(res, 200, { id: `${cat}/${slug}`, path: filePath });
  }

  return sendJSON(res, 404, { error: 'unknown api' });
}

// ---------- 启动 ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (e) {
    sendJSON(res, 500, { error: String(e.message || e) });
  }
});

buildIndex();
server.listen(PORT, () => {
  console.log(`慢读 Slowread · 平台已启动: http://localhost:${PORT}`);
});
