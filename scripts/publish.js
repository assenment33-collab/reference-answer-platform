#!/usr/bin/env node
'use strict';

/**
 * 慢读 Slowread · 运营者发布 CLI
 *
 * 用法：
 *   # 让 Agent 采编一篇新内容并发布（需 LLM_API_KEY 走真实生成；否则生成富骨架）
 *   node scripts/publish.js --category daily --topic "如何与焦虑共处" [--brief "研究简报..."]
 *
 *   # 运营者已写好一篇 markdown，直接发布
 *   node scripts/publish.js --file ./drafts/my-article.md --category topics
 *
 *   # 只生成不推送（本地预览用）
 *   node scripts/publish.js --category daily --topic "..." --dry
 *
 * 流程：生成/接收草稿 → 写入 content/<category>/ → 构建 docs/（manifest）→ git 提交 → 推送（GitHub Pages 自动更新）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const agent = require(path.join(ROOT, 'agent', 'index.js'));

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      if (v !== true) i++;
      a[k] = v;
    }
  }
  return a;
}

function run(cmd) {
  console.log('  $ ' + cmd);
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
}

async function main() {
  const args = parseArgs(process.argv);
  const category = args.category;
  if (!category || !agent.CAT_NAME[category]) {
    console.error('✗ 请指定合法的 --category：' + Object.keys(agent.CAT_NAME).join(', '));
    process.exit(1);
  }

  let draftFile;
  let modeLabel;

  if (args.file) {
    // 直接发布已写好的稿
    const src = path.resolve(args.file);
    if (!fs.existsSync(src)) { console.error('✗ 文件不存在：' + src); process.exit(1); }
    const raw = fs.readFileSync(src, 'utf8');
    const outDir = path.join(ROOT, 'content', category);
    fs.mkdirSync(outDir, { recursive: true });
    const { meta } = agent.parseFrontmatter ? agent.parseFrontmatter(raw) : { meta: {} };
    const base = agent.slugify(meta.title || path.basename(src, '.md'));
    draftFile = path.join(outDir, base + '.md');
    fs.copyFileSync(src, draftFile);
    modeLabel = '直接发布已写稿';
  } else {
    if (!args.topic) { console.error('✗ 未指定 --topic（或直接用 --file 指定稿件）'); process.exit(1); }
    console.log(`\n▶ 采编中：品类=${agent.CAT_NAME[category]}  主题="${args.topic}"`);
    const { draft, mode } = await agent.curate({ category, topic: args.topic, brief: args.brief });
    draftFile = agent.saveDraft({ category, draft });
    modeLabel = mode === 'llm' ? 'LLM 真实生成' : '富骨架（未配置 LLM_API_KEY）';
  }

  console.log(`  ✓ 已写入：${path.relative(ROOT, draftFile)}`);
  console.log(`  模式：${modeLabel}`);

  if (args.dry) {
    console.log('\n⏭  --dry：跳过构建与推送。本地内容已更新，可运行 `node server.js` 预览。');
    return;
  }

  // 构建静态站点（生成 docs/manifest.json 等）
  console.log('\n▶ 构建静态站点（docs/）');
  run('node build.js');

  // 提交并推送
  console.log('\n▶ 提交并推送到 GitHub');
  const msg = `publish(${category}): ${args.topic || path.basename(draftFile)}`;
  run('git add -A');
  try {
    run(`git commit -q -m "${msg}"`);
  } catch (e) {
    console.log('  （无变更可提交，跳过）');
  }
  run('git push origin main');

  console.log('\n✅ 发布完成。GitHub Pages 将在 1-3 分钟内自动更新。');
  console.log('   站点：https://assenment33-collab.github.io/reference-answer-platform/');
}

main().catch((e) => {
  console.error('✗ 发布失败：', e.message);
  process.exit(1);
});
