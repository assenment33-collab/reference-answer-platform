'use strict';

/**
 * 构建脚本：扫描 content/ 生成 public/manifest.json，并复制 public/ → docs/
 * - manifest.json：供静态部署（GitHub Pages）浏览 / 搜索 / 阅读，内含正文、共读主题、兴趣标签体系
 * - docs/：GitHub Pages 部署目录（main 分支 /docs）
 * 用法：node build.js
 */

const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const CONTENT = path.join(BASE, 'content');
const PUBLIC = path.join(BASE, 'public');
const DOCS = path.join(BASE, 'docs');
const DATA = path.join(BASE, 'data');

const CATS = {
  daily: '信息食谱', weekly: '参考周刊', monthly: '参考月刊',
  topics: '领域专题', people: '前路人', books: '参考书', calendar: '每日日历',
};
const ICON = {
  daily: '📖', weekly: '📰', monthly: '🗓️', topics: '📂', people: '🧭', books: '📚', calendar: '📅',
};

// 兴趣标签体系：标签 -> 命中文档 tags 的关键词（用于个性化推荐匹配）
const INTEREST_TAXONOMY = [
  { key: '思维·决策', icon: '🧠', synonyms: ['决策', '思维', '认知', '逻辑', '理性', '判断', '多元思维', '长期主义', '复利'] },
  { key: '心理·自我', icon: '🌱', synonyms: ['心理', '自我', '个体', '性格', '幸福', '情绪', '心流', '荣格'] },
  { key: '商业·财富', icon: '💡', synonyms: ['财富', '杠杆', '自由', '投资', '商业', '增长', 'AI', '纳瓦尔', '芒格'] },
  { key: '阅读·写作', icon: '✍️', synonyms: ['阅读', '写作', '表达', '书', '笔记', '方法', '沟通', '关系'] },
  { key: '专注·效率', icon: '🎯', synonyms: ['专注', '效率', '深度工作', '心流', '纽波特'] },
  { key: '人物·历史', icon: '🧭', synonyms: ['前路人', '人物', '哲学', '斯多葛', '荣格', '卡尼曼', '芒格', '纳瓦尔'] },
];

function parseFrontmatter(raw) {
  const meta = {};
  let body = raw;
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (m) {
    body = raw.slice(m[0].length);
    m[1].split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i === -1) return;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k) meta[k] = v;
    });
  }
  return { meta, body: body.trim() };
}

const items = [];
Object.keys(CATS).forEach((cat) => {
  const dir = path.join(CONTENT, cat);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((f) => {
    if (!f.endsWith('.md')) return;
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const slug = f.replace(/\.md$/, '');
    items.push({
      id: `${cat}/${slug}`,
      category: cat,
      categoryName: CATS[cat],
      icon: ICON[cat],
      title: meta.title || slug,
      author: meta.author || '',
      date: meta.date || '',
      tags: (meta.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      summary: meta.summary || body.slice(0, 120),
      body,
    });
  });
});
items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const categories = Object.keys(CATS).map((k) => ({
  key: k, name: CATS[k], icon: ICON[k], count: items.filter((i) => i.category === k).length,
}));

// 共读主题（运营预设）
let club = { intro: '', topics: [] };
const clubPath = path.join(DATA, 'reading-club.json');
if (fs.existsSync(clubPath)) {
  try { club = JSON.parse(fs.readFileSync(clubPath, 'utf8')); } catch (e) { /* ignore */ }
}

// 1) 写 public/manifest.json（前端静态回退用）
if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true });
fs.writeFileSync(
  path.join(PUBLIC, 'manifest.json'),
  JSON.stringify({ categories, total: items.length, items, club, interestTaxonomy: INTEREST_TAXONOMY }),
  'utf8'
);
console.log(`[build] manifest.json generated: ${items.length} items, ${club.topics.length} reading-club topics`);

// 2) 复制 public/ -> docs/（GitHub Pages 部署目录）
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
if (fs.existsSync(DOCS)) fs.rmSync(DOCS, { recursive: true, force: true });
copyDir(PUBLIC, DOCS);
console.log(`[build] docs/ deployed: ${DOCS}`);
console.log('[build] done.');
