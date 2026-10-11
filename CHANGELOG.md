# 更新日志

所有值得注意的版本变更都记录在此文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [未发布]

下一阶段候选（路线图分阶段规划）：

- Phase 2 编辑算法（滚动同步行号锚点二分 + PairCompleter 选区恢复 + i18n）
- Phase 3 markdown-it 插件（任务列表 / 代码折叠 / Admonition / KaTeX delimiter）
- Phase 4 重型 Feature（MdCatalog 大纲 / Mermaid / ECharts / 全屏 / hljs 16 主题）
- Phase 5 架构升级（EventBus / WriteCommand / globalConfig / extendedWhiteList）
- 接 issue（合并 PR 后看仓库是否有人开新 issue）
- Dialog 引擎 Phase 2（provide/inject useDialog + 多对话框 stack + slot 自定义 body + 完整键盘焦点切换）

---

## [0.3.1] - 2026-10-11

issue #6 + issue #5 处理。

### 修复

- **MarkdownSecurity 媒体标签加固**（issue #6）：默认 `DANGEROUS_TAGS` 加入 `video` / `audio` / `source` / `track`。引擎默认 `html: false` 时不可达，但当宿主开启 `html: true` 后，未阻止的 `<video src="..." autoplay muted>` 会作为三方追踪信标 / 带宽消耗者穿透渲染——现在与 pass 2 attribute scrub 一致补齐。`script` / `iframe` 等已有项保持不变。
- **puppeteer 回归 probe**（`tools/probe-security.cjs`）：13 个用例覆盖默认列表成员、`<video>` / `<audio>` / `<source>` / `<track>` strip、`<script>` / `onerror` / `javascript:` / `_blank rel` 无回归、`dangerousTags: []` 关掉 pass 1、`dangerousTags` 自定义白名单 `video` 场景；跑通后 `13 passed, 0 failed`。

### 新增

- **`MarkdownSecurityOptions`**：`sanitizeRenderedMarkdown(html, options?)` 第二个可选参数。
  - `dangerousTags?: readonly string[]` —— 覆盖默认列表，传 `[]` 关闭 pass 1，传自定义 list 收缩 / 扩展。
  - 导出 `DEFAULT_DANGEROUS_TAGS` 给高级消费者做"现有 list + 自家扩展"拼接。
- **GitHub Pages 自动部署**（issue #5）：`.github/workflows/pages.yml` 监听 main push，run `npm ci && npm run build`，upload `dist-demo` 为 Pages artifact，deploy 到 `https://CDUESTC-OpenAtom-Open-Source-Club.github.io/VUE-md-Forge/`。
  - `vite.config.ts` demo 模式新增 `base` 字段，默认 `/VUE-md-Forge/`，可用 `BASE_PATH` 环境变量覆盖（迁库或自部署时）。
  - 启用步骤：仓库 Settings → Pages → Source 选 "GitHub Actions"（首次合并后一次性）。
- **README 在线演示 badge**：顶部加部署后 URL，方便快速试玩。

### 变更

- `src/index.ts` 多导出 `DEFAULT_DANGEROUS_TAGS` 与 `MarkdownSecurityOptions` 类型。
- 版本号 `0.3.0` → `0.3.1`（patch bump：默认行为加固 + 文档 / 部署增量）。

### v0.3.1 新增限制

- Pages 首次启用需在仓库 Settings → Pages 手动设 Source = GitHub Actions，README 已注明。
- `dist-demo/preview.html` 仍引用 Google Fonts CDN；中国大陆访问可能慢，未来 Phase 4 会替换为本地 woff2。
- `dangerousTags` 自定义仅作用于 pass 1（元素剥离）；pass 2 attribute scrub 始终跑（包括 `on*` 与 `javascript:`）。这是有意为之（即便 `dangerousTags: []` 也保留安全 attribute 防线）。

---

## [0.3.0] - 2026-10-11

### 新增

- **本地 .md 文件导入**：工具栏"打开"按钮 + 隐藏文件选择器（accept: `.md` / `.markdown` / `.mdown` / `.mkd` / `text/markdown` / `text/plain`）；拖拽和粘贴自动识别 .md 文本。
- **本地 .md 文件导出**：工具栏"下载"按钮，一键把当前编辑器内容存为 `.md` 文件；UTF-8 编码，无 BOM；默认文件名 `untitled-YYYY-MM-DD-HHmm.md`。
- **多文件合并**：拖入或选择多个 .md 文件时，自动用 `\n\n---\n\n` 分隔符（GFM 主题分隔）拼接为单文档。
- **多文件追溯 banner**：合并时给每个文件加 HTML 注释包裹 `<!-- file: name.md --> ... <!-- /file -->`，源码视图可追溯分片来源，预览中不可见。
- **编码探测**：自动识别 UTF-8（含 BOM）/ UTF-16LE / UTF-16BE / GBK 编码；老 Windows Notepad 另存为 GBK 的中文 markdown 不再乱码。
- **Dialog 引擎雏形**：新增 `<AppDialog>` 组件和 `createDialogService()` API，支持 `confirm()` + `prompt()` 两种模态对话框；主题色跟随 typora-light / typora-dark。替换原来 `importMdAndReplace` 的 `window.confirm()`。

### 优化

- 无

### 变更

- 版本号 `0.2.0` → `0.3.0`（minor bump：含新增功能）

### 已知限制

- 多文件合并的分隔符是简单 `---`（不带文件名 banner 上方的标题）；如需更醒目的追溯可改 `> **File: name.md**` 形式（待用户反馈）。
- 编码探测不识别 Big5 / Shift_JIS / KOI8-R 等非中文环境编码；如需 chardet 启发式重型识别需另开 PR。
- Dialog 引擎当前用 props 传 service，单对话框模式；后续 Phase 2 会升级为 provide/inject composable + 多对话框 stack + slot 自定义 body。

---

## [0.2.0] - 2026-09-08 → 2026-10-02

PR #1 已合并到 main（merge commit `5c7c2a4`）。本版本跨度大，包含 22 个 commit，按主题分组如下：

### 新增

- **markdown-palettes 风格工具栏**：21 按钮（粗体 / 斜体 / 删除线 / 水平线 / H1-H6 / 有序无序列表 / 图片 / 链接 / 代码 / 表格 / 隐藏预览 / 全屏 / 滚动同步 / 主题 / 关于），图标用 FontAwesome 5。
- **md-editor-v3 风格库入口**：`src/index.ts` 导出 `MdEditor` 公开组件 + 7 个 core 模块 + `install` 插件。
- **KaTeX 多 delimiter 支持**：新增 `\(...\)` / `\[...\]` 两种 LaTeX 原生 delimiter，复用现有 `@vscode/markdown-it-katex`。
- **键盘快捷键**：19 个 markdown 快捷键（Ctrl+B/I/D/S/L/O/U + Ctrl+1-6 + Ctrl+Shift+I/C + Ctrl+Alt+C + Ctrl+Shift+Alt+T），含 `doInlineCode()` 处理 Ctrl+Alt+C 包 `` `...` ``。
- **表格交互式插入**：工具栏"表格"按钮支持 3 个 prompt（行数 / 列数 / 对齐），生成 GFM 表格。
- **行号 gutter + 滚动同步**：gutter 字体统一 14.5px，line-height 22px，与 textarea 像素级对齐；滚动同步使用 `<textarea ref="scrollSyncEnabled">` flag 防 loop。
- **hljs token 着色**：github light + github dark 主题 token 颜色按 `data-mdf-theme` 切换，新增 `src/styles/highlight.css`。
- **中文标点配对**：`PairCompleter` 增加 9 组中文配对（`'' "" （） 【】 《》 「」 『』 〈〉 〖〗`），同时修复 `process()` 中 `handleSkipOver` 从未被调用的旧 bug。

### 修复

- **Issue #2**：`MdEditor` controlled-mode 下空字符串不再误清空，改走 uncontrolled 分支（`MdEditor.vue:53-56` `effectiveModelValue`）。
- **行间距 / 字号 / VSCode 字体栈**：`themes.css` 加 `--mdf-line-h: 22px`，移除 `.editor-only` 局部 21.6px 硬覆盖；preview `<pre>` 切 `Cascadia Code, Consolas, Menlo, monospace` + 14px。
- **标题比例**：H1..H6 按 typographic scale 递减（H6 = 1em = 14.5px，与正文等大），`font-weight: 600`。
- **Shell 多行续行**：包 `` ```bash ```` 围栏代码块，让 hljs bash tokenizer 接管（CommonMark §6.7 `\`+行尾 = hard break 不是 bug）。
- **XSS 净化（security）**：`hljs` `lang` 经 `escapeHtml()` 包裹，防属性注入。
- **Overlay 与 textarea 字符级一致**：移除无条件 `+ '\n'` 拼接，修复 5 个示例最后一行下方多空白行的视觉错位。
- **Gutter 不拉伸**：去掉 gutter 强制 `height: 100%` + `min-height: 100vh`。
- **Gutter 跟随 wrap**：视觉行不增加行号，高度跟 wrap 同步。
- **host 页集成加固**：textarea fallback + 不依赖 localStorage init。
- **行号滚动同步**：gutter 跟随 textarea scroll（修前卡顶部）。
- **行号与文本对齐**：gutter 与 textarea 等字号，行号与文本像素级对齐。
- **删除 STALE 探针**：`tools/probe-public.cjs` + `tools/probe-toolbar.cjs` 在 v0.2 工具栏重写后已失效，删除。

### 变更

- **demo 清理**：删除 Preview 页"清空"按钮 + `clearAll()` 函数（误触风险 + SAMPLES[0] 已有欢迎示例）。
- **版本号**：`0.1.0` → `0.2.0`（minor bump：新增功能 + bugfix）

---

## [0.1.0] - 2026-09-08 前

### 新增

- **项目 bootstrap**：8 个 core 模块（`MarkdownEngine` / `MarkdownSecurity` / `SmartPaste` / `ImageImporter` / `AutoSave` / `PairCompleter` / `DomActions` / `highlight`），双栏 demo 页（`Preview.vue`），公开组件 `MdEditor.vue`，双栏编辑窗口 `EditorOnly.vue`，主题样式 `themes.css`（typora-light + typora-dark），README 详细文档。