'use strict';

/**
 * 参考答案阅览室 · Agent 策展模块
 * 挂载 reference-answer-reading-room Skill，提供「AI 初稿 + 编辑把关」能力。
 * - 配置了 LLM_API_KEY 时走真实大模型生成
 * - 未配置时返回结构化演示初稿，便于编辑台走通工作流
 */

const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, 'skills', 'reference-answer-reading-room', 'SKILL.md');
const SKILL_PROMPT = fs.existsSync(SKILL_PATH) ? fs.readFileSync(SKILL_PATH, 'utf8') : '';

const CAT_NAME = {
  daily: '信息食谱', weekly: '参考周刊', monthly: '参考月刊',
  topics: '领域专题', people: '前路人', books: '参考书', calendar: '每日日历',
};
const ICON = {
  daily: '📖', weekly: '📰', monthly: '🗓️', topics: '📂', people: '🧭', books: '📚', calendar: '📅',
};

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

// 在本地内容库里找与 topic 相关的已有素材，供初稿引用
function searchContent(topic) {
  const kw = (topic || '').toLowerCase();
  const hits = [];
  const cats = Object.keys(CAT_NAME);
  for (const cat of cats) {
    const dir = path.join(__dirname, '..', 'content', cat);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      if (raw.toLowerCase().includes(kw)) {
        const { meta } = parseFrontmatter(raw);
        hits.push({ cat, title: meta.title || f, summary: meta.summary || '' });
      }
    }
  }
  return hits.slice(0, 5);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 演示模式：结构化初稿（标注需编辑把关）
function curateDemo({ category = 'daily', topic }) {
  const name = CAT_NAME[category] || '内容';
  const icon = ICON[category] || '✍️';
  const related = searchContent(topic);
  const relatedBlock = related.length
    ? related.map((r) => `- 《${r.title}》（${CAT_NAME[r.cat]}）`).join('\n')
    : '- （暂无本地相关素材，建议补充一手来源）';

  let body = '';
  switch (category) {
    case 'daily':
      body = `核心论点：（用一句话概括本文要传递的主张）

> ==高亮重点句 1==
> ==高亮重点句 2==
> ==高亮重点句 3==

阅读理由：（为什么今天值得读这篇）`;
      break;
    case 'weekly':
      body = `卷首语：（当周主题的一句话）

1. 文章标题 —— 作者 / 分类
   摘要：（2-3 句）

2. 文章标题 —— 作者 / 分类
   摘要：（2-3 句）`;
      break;
    case 'monthly':
      body = `主题导语：（本月刊围绕什么展开）

核心概念：
- 概念 A：一句话解释
- 概念 B：一句话解释

深度文章 / 书单 / 前路人：
- （3-5 项）`;
      break;
    case 'topics':
      body = `导语：（本专题的价值锚点）

1. 条目标题 —— 分类
   一句话摘要：（……）

2. 条目标题 —— 分类
   一句话摘要：（……）`;
      break;
    case 'people':
      body = `身份标签：（1-2 个）

简介：（2-3 句）

核心观点：
- （观点 1）
- （观点 2）
- （观点 3）

值得思考的问题：
- （问题 1）
- （问题 2）
- （问题 3）

代表作 / 语录：
- （……）`;
      break;
    case 'books':
      body = `一句话推荐：（……）

适合阅读时机：（什么状态下读最受益）`;
      break;
    case 'calendar':
      body = `名言：（……）—— 出处

宜：（……）　忌：（……）

历史上的今天：（……）`;
      break;
    default:
      body = `（在此撰写内容正文）`;
  }

  const draft = `---
title: "${topic}"
date: "${today()}"
author: "编辑部"
tags: "${topic}"
summary: "【${name}】${topic} —— AI 初稿，待编辑把关"
---

${icon} ${name} · ${topic}

> ⚠️ 这是 AI 生成的演示初稿（未接入 LLM）。请在下方编辑、补充一手来源与真实摘录后发布。

${body}

---

已知相关素材（供引用）：
${relatedBlock}

编辑笔记：（记录把关修改与来源核验）
`;
  return { draft, mode: 'demo' };
}

// 真实 LLM 模式（OpenAI 兼容）
async function curateWithLLM({ category = 'daily', topic }) {
  const apiKey = process.env.LLM_API_KEY;
  const base = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const name = CAT_NAME[category] || '内容';
  const related = searchContent(topic);
  const relatedText = related.length
    ? '本地可引用素材：\n' + related.map((r) => `- 《${r.title}》（${CAT_NAME[r.cat]}）`).join('\n')
    : '';

  const userPrompt = `请为「参考答案阅览室」生成一篇【${name}】初稿，主题：「${topic}」。
要求：克制、系统、反碎片化；优先经典与一手内容；遵循「有益的/一手的/经典的」三原则。
${relatedText}
请直接输出带 YAML frontmatter（title/date/author/tags/summary）的 Markdown 正文，正文中用 ==重点句== 标注 3-5 处高亮，用 > 引用块解释关键概念。`;

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SKILL_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const draft = json.choices?.[0]?.message?.content || '';
  return { draft, mode: 'llm' };
}

/**
 * 生成策展初稿
 * @returns {Promise<{draft:string, mode:string}>}
 */
async function curate({ category = 'daily', topic, mode = 'auto' }) {
  const useLLM = mode === 'llm' || (mode === 'auto' && process.env.LLM_API_KEY);
  if (useLLM) return curateWithLLM({ category, topic });
  return curateDemo({ category, topic });
}

module.exports = { curate, SKILL_PROMPT };
