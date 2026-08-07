'use strict';

/**
 * 慢读 Slowread · 运营者采编 Agent
 *
 * 这是产品「背后」的采编引擎，面向运营者（你），不面向读者。
 * 职责：把「一个主题」变成一篇符合「参考阅览室」调性的、结构完整、可直接发布的文章。
 *  - 配置了 LLM_API_KEY：调真实大模型，结合运营者提供的「研究简报」写出完整初稿
 *  - 未配置：返回与正式文章同结构的「富骨架」，供运营者填实
 *
 * 读者前端（GitHub Pages）只消费 content/ 产出的 manifest，不直接接触本模块。
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

// 在本地内容库里找与 topic 相关的已有素材，供初稿引用（避免重复 + 形成知识网络）
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

function slugify(s) {
  return (s || '').toString().toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// 每个品类的「富骨架」：结构完整，运营者填实即可成为正式文章
function skeleton(category, topic) {
  const name = CAT_NAME[category] || '内容';
  const icon = ICON[category] || '✍️';
  switch (category) {
    case 'daily':
      return `核心论点：（用一句话概括本文要传递的主张——克制、有锋芒）

> ==高亮重点句 1==
> ==高亮重点句 2==

（正文 2-4 段：展开论点，引用一手来源或经典，避免泛泛而谈）

> **概念卡（可选）**：用 > 引用块解释一个关键概念，帮助读者跨过认知门槛。

## 深入一点
（再往下一层：一个反直觉的点、一个具体例子、或一个常见误读）

## 今日可做的练习
（给读者一个今天就能做的小行动，让阅读变成改变）

---
阅读理由：（为什么今天值得读这篇）
相关：《参考书/前路人/专题》（互相链接，形成知识网络）`;
    case 'books':
      return `==一句话定位：用一句话说清这本书不可替代的价值。==

## 它回应的真问题
（读者在什么困境下需要这本书？它解决什么真问题，而非它讲了什么。）

## 核心框架
**1. ...** （核心论点/模型，逐条展开，每条配 1-2 句说明）
**2. ...**
**3. ...**

> ==金句或关键判断（用 ==高亮== 标注 1-3 处）==

## 金句
- （原文摘录 1）
- （原文摘录 2）

## 适合谁读
- （人群 1）
- （人群 2）

## 延伸阅读
- 《相关书/文章》（品类）`;
    case 'people':
      return `身份标签：（1-2 个，如「心理学家 / 集体无意识提出者」）

简介：（2-3 句，他是谁、为何值得被放进「前路人」）

核心观点：
- ==（观点 1，可高亮）==
- （观点 2）
- （观点 3）

值得思考的问题：
- （问题 1）
- （问题 2）
- （问题 3）

## 今天如何借用他
（一段：读者今天就能从他身上拿走的、可操作的一件事）

代表作 / 语录：
- 《...》
- 「...」`;
    case 'topics':
      return `导语：（本专题的价值锚点——它帮读者解决什么）

1. 《条目标题》—— 分类 / 角度
   （2-3 句：这条为什么重要、核心方法或观点是什么）

2. 《条目标题》—— 分类 / 角度
   （2-3 句）

3. 《条目标题》—— 分类 / 角度
   （2-3 句）

## 本周练习
（一个本周就能做的小行动，呼应专题主题）

---
延伸：（相关书/前路人/信息食谱）`;
    case 'weekly':
      return `卷首语：（当周主题的一句话，点出为什么这四周值得一起读）

1. 《文章标题》—— 作者 / 分类
   摘要：（2-3 句）

2. 《文章标题》—— 作者 / 分类
   摘要：（2-3 句）

3. 《文章标题》—— 作者 / 分类
   摘要：（2-3 句）

4. 《文章标题》—— 作者 / 分类
   摘要：（2-3 句）

## 编辑的话
（一段：这期想提醒读者什么，不是总结而是多一层视角）

---
延伸：（相关书/专题）`;
    case 'monthly':
      return `主题导语：（本月刊围绕什么展开，为什么是现在）

核心概念：
- **概念 A**：一句话解释
- **概念 B**：一句话解释

深度文章 / 书单 / 前路人：
- 书单：《...》《...》
- 前路人：...
- 方法：...

## 30 天行动蓝图
- 第 1 周：...
- 第 2 周：...
- 第 3 周：...
- 第 4 周：...

---
延伸：（相关专题/参考书）`;
    case 'calendar':
      return `名言：（一句话）—— 出处

宜：（今天适合做的事）　忌：（今天宜避的事）

历史上的今天：（一件与主题相关的小事，或留白）

> ==今日一思==（一句给读者的提醒）`;
    default:
      return `（在此按上方对应品类的结构撰写正文）`;
  }
}

// 演示模式：返回与正式文章同结构的富骨架（标注待填）
function curateDemo({ category = 'daily', topic }) {
  const name = CAT_NAME[category] || '内容';
  const icon = ICON[category] || '✍️';
  const related = searchContent(topic);
  const relatedBlock = related.length
    ? related.map((r) => `- 《${r.title}》（${CAT_NAME[r.cat]}）`).join('\n')
    : '- （暂无本地相关素材，建议补充一手来源）';

  const draft = `---
title: "${topic}"
date: "${today()}"
author: "编辑部"
tags: "${topic},${name}"
summary: "【${name}】${topic} —— AI 富骨架初稿，待编辑填实后发布"
---

${icon} ${name} · ${topic}

> ⚠️ 这是 AI 生成的「富骨架」初稿（未接入 LLM）。请按下方结构填实内容（补一手来源、真实摘录与你的判断），使其成为一篇完整文章后再发布。

${skeleton(category, topic)}

---

已知相关素材（供引用，形成知识网络）：
${relatedBlock}

编辑笔记：（记录把关修改与来源核验）
`;
  return { draft, mode: 'demo', skeleton: true };
}

// 真实 LLM 模式（OpenAI 兼容）：结合运营者「研究简报」写出完整文章
async function curateWithLLM({ category = 'daily', topic, brief }) {
  const apiKey = process.env.LLM_API_KEY;
  const base = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const name = CAT_NAME[category] || '内容';
  const related = searchContent(topic);
  const relatedText = related.length
    ? '本地可引用素材（请自然融入，形成知识网络）：\n' + related.map((r) => `- 《${r.title}》（${CAT_NAME[r.cat]}）`).join('\n')
    : '';
  const briefText = brief
    ? `运营者提供的研究简报（请基于这些一手信息撰写，不要编造事实）：\n${brief}\n`
    : '';

  const userPrompt = `请为「慢读 Slowread」撰写一篇【${name}】正式文章，主题：「${topic}」。

要求：
- 克制、系统、反碎片化；优先经典与一手内容；遵循「有益的 / 一手的 / 经典的」三原则。
- 这是给读者的完整阅读内容，不是提纲。请写出有信息量、有观点、有例子、可直接发布的全文（建议 700-1200 字，参考书/前路人可更长）。
- 正文用 Markdown：用 ==重点句== 标注 3-5 处高亮；用 > 引用块解释关键概念（概念卡）。
- 结尾附「相关」链接，引用本地素材（如有）。
- 不要出现「本文」「我们将」等元叙述，直接呈现内容。

${relatedText}
${briefText}
请直接输出带 YAML frontmatter（title / date / author / tags / summary）的 Markdown 全文。`;

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SKILL_PROMPT || '你是慢读 Slowread的资深编辑。' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
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
async function curate({ category = 'daily', topic, brief, mode = 'auto' }) {
  const useLLM = mode === 'llm' || (mode === 'auto' && process.env.LLM_API_KEY);
  if (useLLM) return curateWithLLM({ category, topic, brief });
  return curateDemo({ category, topic });
}

/**
 * 把生成的草稿写入 content/<category>/ 目录，文件名按标题 slug。
 * @returns {string} 写入的文件路径
 */
function saveDraft({ category = 'daily', draft }) {
  const { meta, body } = parseFrontmatter(draft);
  const dir = path.join(__dirname, '..', 'content', category);
  fs.mkdirSync(dir, { recursive: true });
  const base = slugify(meta.title || 'untitled');
  const file = path.join(dir, `${base}.md`);
  fs.writeFileSync(file, draft.trim() + '\n', 'utf8');
  return file;
}

module.exports = { curate, saveDraft, SKILL_PROMPT, CAT_NAME, ICON, slugify };
