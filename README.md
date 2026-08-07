# 参考答案阅览室 · 在线阅读平台

基于「参考答案阅览室」产品形态搭建的**在线深度阅读社区**。用户打开网页即可浏览、搜索、阅读所有已有品类内容，并获得个性化推荐与每周共读；编辑可在「编辑台」用 agent 策展工作流（AI 初稿 + 编辑把关）生成并发布内容。

> 这是把「参考答案阅览室」WorkBuddy Skill 升级为**可读、可搜、可推荐的产品**：原 Skill 降级为平台内 agent 的策展能力。

## 功能

- 📖 信息食谱 · 📰 参考周刊 · 🗓️ 参考月刊 · 📂 领域专题 · 🧭 前路人 · 📚 参考书 · 📅 每日日历（共 25 篇种子内容）
- 🔎 全局搜索（跨所有品类，标题 / 摘要 / 标签 / 正文）
- 📄 文章阅读（`==高亮==` 黄色高亮、`> 概念卡` 引用块渲染）
- 🎯 **个性化推荐**：用户选择兴趣方向，首页据此重排推荐（`localStorage`，纯静态可用）
- 📚 **共读机制**：每周一个主题 + 引导问题 + 精选阅读，用户可在本机打卡、写共读笔记并导出档案（`localStorage`，纯静态可演示）
- 🤖 编辑台：agent 策展工作流，挂载 `reference-answer-reading-room` Skill（AI 初稿 + 编辑把关）

## 运行（全功能，含 agent 策展与发布）

```bash
node server.js
# 浏览器打开 http://localhost:3000
```

可选环境变量——配置后 agent 生成**真实 LLM 初稿**，否则返回结构化演示初稿：

```bash
LLM_API_KEY=sk-xxx LLM_BASE_URL=https://api.openai.com/v1 LLM_MODEL=gpt-4o-mini node server.js
```

支持任意 OpenAI 兼容接口（如 DeepSeek、通义千问、智谱等），只需改 `LLM_BASE_URL` 与 `LLM_MODEL`。

## 静态部署（GitHub Pages / 任意静态托管）

```bash
node build.js     # 扫描 content/ + data/，生成 public/manifest.json，并复制 public/ → docs/
```

`docs/` 即为可直接部署的静态站点（浏览 / 搜索 / 阅读 / 个性化 / 共读均可离线运行）。

### 部署到 GitHub Pages（project page）

1. 推送本仓库到 `assenment33-collab/reference-answer-platform`
2. 仓库 **Settings → Pages → Source**：选 `main` 分支、`/docs` 目录
3. 访问 `https://assenment33-collab.github.io/reference-answer-platform/`

> 前端全部使用相对路径（`./`），因此无论部署在根路径还是子目录都能正常工作。

## 目录结构

```
reference-answer-platform/
├── server.js                              # 零依赖 Node 服务（内容 API + 搜索 + agent 接口 + 静态）
├── build.js                              # 构建 manifest.json 并复制 public/ → docs/
├── agent/
│   ├── index.js                          # agent 策展模块（LLM / 演示双模式）
│   └── skills/
│       └── reference-answer-reading-room/
│           └── SKILL.md                  # 挂载的 Skill（含 AI 初稿 + 编辑把关工作流）
├── content/                              # 7 个品类的 Markdown 内容源（可搜索/阅读的"已有品类信息"）
│   ├── daily/ weekly/ monthly/ topics/ people/ books/ calendar/
├── data/
│   └── reading-club.json                 # 运营预设的共读主题
├── public/                               # 前端源 + 构建产物 manifest.json
│   ├── index.html browse.html read.html search.html studio.html co-read.html
│   ├── css/style.css  js/app.js
│   └── manifest.json                     # build.js 生成（含正文、共读主题、兴趣标签体系）
└── docs/                                 # build.js 生成，GitHub Pages 部署目录
```

## 内容生产流程（agent 策展）

1. 编辑在「编辑台」选择品类 + 主题 → 调 agent 生成初稿
2. agent 使用 `reference-answer-reading-room` Skill 的提示词，产出带 frontmatter 的结构化 Markdown（含 `==高亮==` 与 `> 概念卡`）
3. 编辑把关：补一手来源、核验事实、调语气
4. 发布入库 → 重建索引 → 用户即可搜索与阅读

## License

MIT
