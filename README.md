# 慢读 Slowread · 在线深度阅读产品

一个**完整的在线深度阅读产品**（不是 demo、不是 skill 演示）。读者打开网页即可浏览、搜索、阅读全品类内容，并获得个性化推荐与每周共读。

背后的内容，由**运营者通过 Agent 持续采编**——这是产品的「内容引擎」，面向运营者（产品的主人），不面向读者。你给 Agent 一个主题（可附联网研究简报），它产出符合「参考阅览室」调性的完整文章，发布后前端即时更新、读者立即可读可搜。

> 一句话定位：**前端是给读者的产品，Agent 是给你（运营者）的采编中台。** 持续输入时新信息，产品才有生命力。

## 读者在前端能做什么

- 📖 信息食谱 · 📰 参考周刊 · 🗓️ 参考月刊 · 📂 领域专题 · 🧭 前路人 · 📚 参考书 · 📅 每日日历（**27 篇完整文章**，持续增加）
- 🔎 全局搜索（跨所有品类：标题 / 摘要 / 标签 / 正文）
- 📄 文章阅读（`==高亮==` 黄色重点、`> 概念卡` 概念解释块）
- 🆕 **最新上架**流：越新的内容越靠前，体现「Agent 持续更新」
- 🎯 **个性化推荐**：读者选兴趣方向，首页据此重排（localStorage，纯静态可用）
- 📚 **共读机制**：每周一个主题 + 引导问题 + 精选阅读，本机打卡 / 写笔记 / 导出档案

## 运营者如何用 Agent 持续喂内容

`scripts/publish.js` 一条命令走完「生成 → 入库 → 构建 → 推送」闭环：

```bash
# 让 Agent 联网采编一篇并发布（配置 LLM_API_KEY 走真实生成；否则生成富骨架供填写）
node scripts/publish.js --category daily --topic "如何与焦虑共处" --brief "（可粘贴一手研究素材）"

# 或：运营者已写好 Markdown，直接发布
node scripts/publish.js --file ./drafts/my-article.md --category topics

# 只本地预览、不推送
node scripts/publish.js --category daily --topic "..." --dry
```

流程：写入 `content/<品类>/` → 构建 `docs/`（manifest）→ `git` 提交 → 推送 `main` → **GitHub Pages 自动更新**，读者即时可见。

接入真实 LLM（让初稿真正可用）：在运行环境设置 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`（OpenAI 兼容，支持 DeepSeek、通义、智谱等）。

> 运营者专属后台：`/studio.html`（读者看不到入口，仅页脚一个低调链接）。生成与发布需在本地 `node server.js`。

## 本地全功能运行

```bash
node server.js          # http://localhost:3000 （内容 API + 搜索 + agent 接口 + 静态）
```

## 静态部署（GitHub Pages / 任意托管）

```bash
node build.js           # 扫描 content/ + data/ → 生成 docs/manifest.json → 复制 public/ → docs/
```

`docs/` 即部署目录（浏览 / 搜索 / 阅读 / 个性化 / 共读均可离线运行）。

### 部署到 GitHub Pages

1. 推送到 `assenment33-collab/reference-answer-platform`
2. **Settings → Pages → Source**：`main` 分支、`/docs` 目录
3. 访问 `https://assenment33-collab.github.io/reference-answer-platform/`

> 前端全部使用相对路径（`./`），根路径或子目录部署均正常。

## 目录结构

```
reference-answer-platform/
├── server.js                  # 零依赖 Node 服务（内容 API + 搜索 + agent 接口 + 静态）
├── build.js                  # 构建 manifest.json 并复制 public/ → docs/
├── scripts/
│   └── publish.js            # 运营者发布 CLI（生成→入库→构建→提交→推送 闭环）
├── agent/
│   ├── index.js              # 运营者采编 Agent（LLM / 富骨架 双模式）
│   └── skills/
│       └── reference-answer-reading-room/
│           └── SKILL.md      # 挂载的 Skill（含完整文章结构与采编工作流）
├── content/                  # 7 品类 Markdown 内容源（即"已有品类信息"）
│   └── daily/ weekly/ monthly/ topics/ people/ books/ calendar/
├── data/
│   └── reading-club.json     # 共读主题配置
├── public/                   # 前端源（index/browse/read/search/co-read/studio）
│   └── manifest.json         # build.js 生成（含正文、共读主题、兴趣标签体系）
└── docs/                     # build.js 生成，GitHub Pages 部署目录
```

## License

MIT
