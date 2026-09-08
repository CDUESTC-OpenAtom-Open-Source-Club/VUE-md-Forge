# VUE-md-Forge

> **Vue 3 架构下的 Markdown 编辑器插件**
> 目标对标 Typora 的即时渲染（IR）体验，核心特色：**字符自动配对 + 光标居中 + 洛谷式双栏源码预览 + 工具栏对齐 markdown-palettes**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Vue](https://img.shields.io/badge/Vue-3.5+-42b883)
![Vite](https://img.shields.io/badge/Vite-7-646cff)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)
![FontAwesome](https://img.shields.io/badge/FontAwesome-5-528dd7)

---

## 这是什么

VUE-md-Forge 是一个**可作为 npm 包发布、也能独立运行**的 Vue 3 Markdown 编辑器组件。

它不是一个新轮子 —— 它的核心想法是：**在保留富文本编辑器便利性的同时，把所有重量级依赖收回到 npm 本地打包，并解决 `md-editor-v3` 在严格 CSP 环境下被迫关掉代码高亮和数学公式的痛点**。

它从 [CDUESTC-OpenAtom-Open-Source-Club/club-web](https://github.com/CDUESTC-OpenAtom-Open-Source-Club/club-web) 的 `MarkdownEditor.vue` 中继承了经过真实流量验证的 **HTML→Markdown 启发式**（shell 命令自动围栏、here-doc 识别、行内码合并、列表碎片合并、图片占位符），再往上叠加新的字符自动配对、CSP 友好的渲染引擎、双栏源码预览。

工具栏部分对齐 [luogu-dev/markdown-palettes](https://github.com/luogu-dev/markdown-palettes) 的 `defaultBtns`：21 个按钮 + 4 个分隔符，使用 FontAwesome 5 实心图标，H1..H6 用文本字形（与上游 `content: 'H'+level` 一致）。

## 为什么有这个项目

club-web 社团官网当前依赖 `md-editor-v3`，并因为 `md-editor-v3` 引入了：

- unpkg 上的远程脚本/样式/字体加载
- `vue-i18n` runtime compiler 留下的 `new Function` 路径
- 动态 inline CSS

这三件事导致 Nginx 上 **Content-Security-Policy 只能停在 `Report-Only` 模式**，无法上强制策略（详见 club-web CLAUDE.md 的 **P1-4 浏览器安全基线**）。作为副作用，`md-editor-v3` 里的 `no-highlight` 和 `no-katex` 都被置 `true` —— **生产环境根本没有代码高亮和数学公式**。

VUE-md-Forge 是这个痛点的解药：

- `markdown-it` / `highlight.js` / `katex` 全部作为 npm 依赖打入产物，**零远程加载**
- 无 `vue-i18n` runtime compiler，**无 `new Function` 路径**
- 全程不引入需要 `eval` 的动态代码

跑通后会回到 club-web，从 `origin/develop` 切新分支把 `MarkdownEditor.vue` 替换为这个插件，把"为了安全关掉高亮和公式"换成"既安全又有高亮和公式"。

## 特色

### 🔒 CSP 友好
所有依赖本地打包，**可走强制 CSP**。不依赖任何 CDN 资源（unpkg / jsdelivr / cdnjs 全部不在依赖图里）。

### 🧰 工具栏对齐 luogu-dev/markdown-palettes

工具栏的 21 个按钮 + 4 个分隔符**完全复制** [markdown-palettes](https://github.com/luogu-dev/markdown-palettes) 的 `defaultBtns`（项目根目录的 `test/markdown-palettes-master/` 留有上游源码用于本地比对，不入库）：

| # | 按钮 | 图标 | 行为 |
| --- | --- | --- | --- |
| 1 | 加粗 | `faBold` | `**...**`，快捷键 Ctrl+B |
| 2 | 删除线 | `faStrikethrough` | `~~...~~` |
| 3 | 斜体 | `faItalic` | `*...*`，快捷键 Ctrl+I |
| 4 | 水平线 | `faMinus` | `---` |
| 5–10 | 1–6 级标题 | `H1`..`H6` 文本字形 | 当前光标所在行追加 `#{n} ` 前缀；同级别再次点击 toggle 掉前缀 |
| 11 | 无序列表 | `faListUl` | `- ` |
| 12 | 有序列表 | `faListOl` | `1. ` |
| 13 | 图片 | `faImage` | `![alt](url)` |
| 14 | 链接 | `faLink` | `[text](url)`，快捷键 Ctrl+K |
| 15 | 代码块 | `faCode` | ` ``` ` 围栏 |
| 16 | 表格 | `faTable` | 6 行 Markdown 表格模板 |
| 17 | 隐藏/显示预览 | `faEyeSlash` ↔ `faEye` | 切换预览面板（`data-mdf-view="hide"` ↔ `"normal"`） |
| 18 | 全屏 | `faExpandArrowsAlt` | 编辑器全屏（`data-mdf-view="full"` ↔ `"normal"`） |
| 19 | 滚动同步 | `faLockOpen` ↔ `faLock` | 编辑区与预览区同步滚动；偏好持久化到 `localStorage` |
| 20 | 当前主题 | `faSun` ↔ `faMoon` | `typora-light` ↔ `typora-dark` |
| 21 | 关于 | `faInfoCircle` | 弹出说明卡片，含 markdown-palettes 链接；Esc 关闭 |

**已移除**（与 markdown-palettes 不对齐且不再需要）：
- 字符字形按钮（H₀ / H₆ / — / √x / @ / 🖼 / `</>` / ▦ / ❝ / ≡ / 1.≡ / ☑ / ‖ / ◫ / ⛶ / ☀ / ?）
- promote/demote heading（洛谷用 H1..H6 直接覆盖，升降通过重复点击同级别 toggle）
- formula 按钮（KaTeX 不在 toolbar 流程内）
- task list / quote 按钮（不在 `defaultBtns`）
- 自定义 help 模态（被 info 模态 + markdown-palettes 链接取代）
- F9 沉浸模式快捷键（被全屏按钮取代）
- `immersive` ref 与 `setView` 简化逻辑（被 `viewMode: 'normal' | 'hide' | 'full'` 三态取代）

### ⚡ 字符自动配对
基于 `beforeinput` 事件实现（不是 `document.execCommand`），支持：

| 类别 | 开符号 | 行为 |
| --- | --- | --- |
| 圆括号 | `(` `)` | 输入 `(` 自动补 `)`，光标居中 |
| 方括号 | `[` `]` | 同上 |
| 花括号 | `{` `}` | 同上 |
| 双引号 | `"` | 同上 |
| 单引号 | `'` | 同上 |
| 反引号 | `` ` `` | 同上 |
| 星号 | `*` | 同上（不与 markdown 加粗冲突，因为是单字符触发） |
| 下划线 | `_` | 同上 |
| 波浪 | `~` | 同上 |

并实现：
- **跳过模式**：当光标紧贴已存在的右符号时按 `)`，光标移过它，不重复插入
- **成对删除**：Backspace 在 `()` 中间按一次，删除两侧
- **代码块内静默**：`\`` 内的 `` ` `` 不会触发配对

### 📋 智能粘贴 HTML → Markdown
club-web 已经验证过的启发式（来自 `frontend/src/components/editor/MarkdownEditor.vue` origin/main `4775e46`）原样搬过来：

- 剪贴板含 `image/*` 文件时优先走图片导入
- DOMParser 解析 + 递归 walk → Markdown
- 连续 shell 命令自动用 ` ```bash ` 围栏包起（启发：`cd / git / npm / mvn / sudo / docker / ...` 开头）
- here-doc（`<<EOF ... EOF`）识别与合并
- 行内代码被拆碎时合并回一行
- 列表项断行合并

### 🖼️ 图片占位符流程
1. 粘贴 / 拖入图片 → 在源文中插入 `<!-- mdf-image-import-{ts}-{rand} -->\n> 图片正在导入：{alt}\n<!-- /... -->` 占位符
2. 异步调用 `uploader(file)`（宿主注入，默认 mock：FileReader → base64）
3. 上传成功：占位符替换为 `![alt](url)`
4. 上传失败：占位符替换为 `> 图片未导入：{alt}。{reason}。`
5. 串行处理避免并发压垮服务器

### 🛡️ XSS 净化
DOMParser 双遍清洗：

**第一遍**：移除危险标签 `script / iframe / object / embed / base / form / style / meta / link / noscript / template`

**第二遍**：
- 移除 `on*` 事件处理器
- 剥除 `javascript:` 协议（包括被控制字符 `\n \t` 绕过的形式）
- URL 白名单：`https? / mailto / tel / 根相对 / 锚点 / 相对路径 / blob / data:image/(png|jpe?g|gif|webp);`
- **故意不放开** `data:image/svg+xml`（SVG 可内嵌 `<script>` / `onload`）
- `target="_blank"` 强制补 `rel="noopener noreferrer"`
- `srcset` 全部 candidate 都要过白名单

在 `MarkdownEngine.render()` 里自动调用，每次渲染都过一遍。

### 💾 自动保存双策略
| 策略 | 触发 |
| --- | --- |
| 10s debounce | 每次输入后 10s 内没有新输入就保存 |
| 30s 间隔 | 每 30s 兜底，如果内容仍 dirty 就再保存一次 |

状态机：`idle → saving → saved → idle (3s 后)` 或 `→ error → idle (3s 后)`。页面离开 / 关闭前 `beforeunload` 检测 dirty 并弹浏览器确认。父级路由跳转前可调用 `flushSave()` 强制保存。

### 🚫 零 UI 框架
不依赖 Element Plus / Ant Design Vue / Naive UI。通知走自带的 `Notify`（也未实现，先占位）。所有 UI 反馈都由 `core/` 暴露的回调驱动，宿主可以接到自己的 UI 框架里。

## 技术栈

| 类别 | 选型 | 理由 |
| --- | --- | --- |
| 运行时 | Vue 3.5+ Composition API + `<script setup>` + TypeScript 5.8 | 宿主项目用同款 |
| 构建 | Vite 7 | 宿主项目用同款 |
| 包管理 | npm | 与 club-web 一致 |
| Markdown | markdown-it 14 | 维护活跃、插件生态成熟 |
| Math | `@vscode/markdown-it-katex` 1.1+ | 原 `markdown-it-katex ^3` 已停维且与 markdown-it 14 不兼容 |
| Highlight | highlight.js 11 | 仅 core 注册 11 个常用语言，按需懒加载 |
| HTML→MD | turndown 7 | clipboard HTML 反向推导（智能粘贴用） |
| 工具栏图标 | `@fortawesome/free-solid-svg-icons` 5 + `@fortawesome/vue-fontawesome` | 与 markdown-palettes 默认工具栏对齐；增加约 150 KB（gzip 后约 50 KB），仅 `free-solid-svg-icons` 子集按需 tree-shake |
| 字体 | JetBrains Mono + Noto Sans SC | Google Fonts，本地化由 `<link rel="preconnect">` 优化 |

## 快速开始

```bash
# 1. 安装依赖
npm install
# 首次安装会自动拉取 @fortawesome/*，约 +150 KB 解压后体积

# 2. 启动开发服务器
npm run dev
# → http://localhost:5273/preview.html

# 3. 类型检查
npm run typecheck

# 4. 构建库（npm 包用）
npm run build:lib
# → dist/vue-md-forge.{js,cjs,css}

# 5. 工具栏回归探针（可选，需要本地 Chrome）
node tools/probe-palettes.cjs
# → 验证按钮数量、FontAwesome SVG、H3 toggle、hide preview、info modal Esc、theme toggle
```

### 引入为 npm 包（未来 `npm publish` 后）

```ts
import { MdEditor } from 'vue-md-forge';
import 'vue-md-forge/style.css';

export default {
  components: { MdEditor }
};
```

```vue
<MdEditor v-model="content" v-model:theme="'typora-light'" />
```

## 预览页

`npm run dev` 启动后打开 **http://localhost:5273/preview.html**。

### 界面

```
┌──────────────────────────────────────────────────────────────────┐
│ VUE-md-Forge · Vue 3 Markdown 编辑器实时预览                     │
│ 示例: [欢迎示例] [Shell & 命令] [数学 / KaTeX] [代码对照] [安全…] │
├────────────────────────────┬─────────────────────────────────────┤
│ 输入    792字符 · 30行 · 142词 │ 渲染预览   1.85ms · …              │
├────────────────────────────┼─────────────────────────────────────┤
│ # 欢迎使用 VUE-md-Forge    │  # 欢迎使用 VUE-md-Forge            │
│                            │                                     │
│ 这是一个 **Vue 3 Markdown** │  这是一个 Vue 3 Markdown             │
│ 编辑器插件的实时预览，     │  编辑器插件的实时预览…               │
│                            │                                     │
│ ## 特色                    │  ## 特色                            │
│ - 代码高亮                 │  • 代码高亮                          │
│ - 数学公式 $E = mc^2$      │  • 数学公式 $E = mc^2$               │
│ - ...                      │  • ...                              │
│                            │                                     │
└────────────────────────────┴─────────────────────────────────────┘
```

### 5 个示例按钮

| 名称 | 内容 |
| --- | --- |
| **欢迎示例** | 完整介绍 + 表格 + 引用 + 列表 + 代码块 + KaTeX 公式 |
| **Shell & 命令** | 连续 shell 命令 + here-doc + 多行续行 |
| **数学 / KaTeX** | 麦克斯韦方程组、薛定谔方程等 4 个公式 |
| **代码对照** | ts / cpp / sql / bash 4 种语言高亮对比 |
| **安全净化对照** | 6 个 XSS 攻击向量 vs 净化后输出 |

### 可验证点

- 在左侧输入 `(` → 立即变 `()│`，光标居中
- 在 `()` 中间按 Backspace → 一次删两
- 输入 `)` 紧贴 `)` → 跳过，光标右移
- 改字后刷新页面 → 草稿从 `localStorage['mdf-preview-draft']` 恢复
- 切到 `数学 / KaTeX` → 右侧出 4 个公式（2 块级）
- 点工具栏 `H3` → 当前行追加 `### `；再点一下 toggle 掉
- 点 `隐藏预览`（faEyeSlash） → 右侧预览面板 `display: none`；再点（faEye）恢复
- 点 `关于` → 弹出 info 卡片，按 Esc 关闭

## 项目结构

```
VUE-md-Forge/
├── index.html                  # 完整 demo 入口（v0.3 待实现）
├── editor-only.html            # 独立双栏编辑窗口入口 ✅
├── preview.html                # 预览入口（开发用）✅
├── package.json
├── package-lock.json
├── tsconfig.json               # @/* → src/*，严格模式
├── vite.config.ts              # 双模式：demo（默认）/ --mode lib（出包）
├── LICENSE                     # MIT
├── README.md
├── .gitignore                  # 含 test/（不入库，本地比对用）
│
├── tools/                      # 验证与截图工具（puppeteer-core）
│   ├── probe-palettes.cjs      # 工具栏回归探针：21 按钮 / FA SVG / H3 toggle / 隐藏预览 / info Esc / 主题切换
│   └── shoot-screenshots.cjs   # 一次性的报告截图脚本（默认产出 → report-screenshots/，已 gitignore）
│
├── report-screenshots/         # 截图产物，不入库
│
├── test/                       # 本地参考源（luogu-dev/markdown-palettes 解压目录 + zip），不入库
│
└── src/
    ├── main.ts                 # 完整 demo 入口（v0.3 待实现）
    ├── editor-only-main.ts     # 双栏窗口入口 ✅
    ├── preview-main.ts         # 预览入口 ✅
    │
    ├── Preview.vue             # 双栏实时预览页 ✅
    ├── MdEditor.vue            # 公开组件入口（v-model + v-model:theme）✅
    ├── EditorOnly.vue          # 洛谷式双栏 + markdown-palettes 对齐工具栏 ✅
    │
    ├── components/             # 内部组件（v0.3 待实现）
    │   ├── Editor.vue          # IR 即时渲染编辑区
    │   └── Toolbar.vue         # 工具栏抽象（当前在 EditorOnly.vue 内联，v0.3 抽出）
    │
    ├── core/                   # 7 个核心模块（全部已实现）✅
    │   ├── MarkdownEngine.ts   # markdown-it 14 + hljs 11语言 + KaTeX
    │   ├── MarkdownSecurity.ts # XSS 净化（DOMParser 双遍）
    │   ├── SmartPaste.ts       # HTML→MD 启发式（从 club-web 移植）
    │   ├── ImageImporter.ts    # 串行图片上传队列
    │   ├── AutoSave.ts         # 双策略自动保存
    │   ├── PairCompleter.ts    # 字符配对（beforeinput）
    │   └── DomActions.ts       # textarea DOM 操作
    │
    ├── styles/                 # 主题与编辑器样式
    │   ├── editor.css
    │   ├── themes.css          # typora-light / typora-dark
    │   └── highlight-overrides.css
    │
    └── types/
        └── shims.d.ts          # @vscode/markdown-it-katex 类型声明
```

## 核心模块说明

### `MarkdownEngine`

```ts
import { MarkdownEngine } from 'vue-md-forge';

const engine = new MarkdownEngine({ sanitize: true });
const html = engine.render('# Hello\n\n$E=mc^2$');
```

内部流程：
1. `markdown-it` 解析为 token 流
2. fenced code 走 `highlight.highlight()` 11 个本地语言
3. KaTeX 走 `@vscode/markdown-it-katex`
4. heading 自动注入 `id`（用 slug 化的标题文字）
5. 最终 HTML 经过 `sanitizeRenderedMarkdown()` 净化

### `PairCompleter`

```ts
import { PairCompleter } from 'vue-md-forge';

const pair = new PairCompleter();

textarea.addEventListener('beforeinput', (e) => {
  const result = pair.process(e.inputType, e.data, {
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd
  });
  if (result.preventDefault) {
    e.preventDefault();
    textarea.value = result.value;
    textarea.setSelectionRange(result.caret, result.caret);
  }
});
```

### `SmartPaste`

```ts
import { htmlToMarkdown, looksLikeRichClipboard } from 'vue-md-forge';

editor.addEventListener('paste', (e) => {
  if (!looksLikeRichClipboard(e)) return; // 让 plain text 走默认行为
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  const { markdown, imageTasks } = htmlToMarkdown(html, {
    imageFiles: extractImageFiles(e.clipboardData),
    createImageTask: (input) => myImporter.createTask(input)
  });
  insertAtCursor(markdown);
  myImporter.enqueue(imageTasks);
});
```

### `ImageImporter`

```ts
import { ImageImporter } from 'vue-md-forge';

const importer = new ImageImporter(
  async ({ file, src }) => {
    if (file) return { url: await myUploadAPI.upload(file) };
    return { url: await myUploadAPI.importRemote(src!) };
  }
);

class MyImporter extends ImageImporter {
  // Override these two to wire v-model into the editor
  protected onSuccess(task, replacement) {
    this.replaceInModel(task.placeholder, replacement);
  }
  protected onFailure(task, replacement) {
    this.replaceInModel(task.placeholder, replacement);
  }
}
```

### `AutoSave`

```ts
import { AutoSave } from 'vue-md-forge';

const saver = new AutoSave({
  getValue: () => editorContent.value,
  persist: async (text) => {
    await fetch('/api/drafts', { method: 'PUT', body: text });
  },
  onStatus: (status) => ui.showSaveBadge(status),
  debounceMs: 10_000,
  intervalMs: 30_000
});
saver.start();
watch(editorContent, () => saver.schedule());

// 路由跳转前强制保存
await saver.flush();
```

## 当前状态

**v0.2.0 · EditorOnly 洛谷式双栏 + markdown-palettes 对齐工具栏就位**

### 已完成 ✅

- [x] `MarkdownEngine` —— markdown-it 14 + 本地 hljs 11 语言 + KaTeX
- [x] `MarkdownSecurity` —— DOMParser 双遍清洗 + 控制字符绕过检测
- [x] `SmartPaste` —— 从 club-web 完整迁移，503 行
- [x] `ImageImporter` —— 串行队列 + 任务钩子
- [x] `AutoSave` —— 双策略状态机
- [x] `PairCompleter` —— `beforeinput` 配对
- [x] `DomActions` —— textarea 操作工具集
- [x] `Preview.vue` —— 双栏实时预览 + 5 个示例 + localStorage 草稿
- [x] `MdEditor.vue` —— 公开组件入口（`v-model` + `v-model:theme`）
- [x] `EditorOnly.vue` —— 洛谷式双栏（行号 gutter / 双向滚动同步 / JetBrains Mono / 行号 42px 宽）+ markdown-palettes 对齐工具栏（21 按钮 / FA 5 / H1..H6 文本字形）
- [x] `themes.css` —— typora-light（#fafafa / #e1e4e8 / #4183c4）+ typora-dark（#1e1e1e / #2d2d2d / #6cb6ff），CSS 变量驱动
- [x] `highlight-overrides.css` —— 两套 hljs 主题变量，明暗切换不刷 DOM
- [x] Headless Chrome 验证：0 pageerror，KaTeX 渲染，hljs 渲染，示例切换工作，草稿持久化
- [x] `tools/probe-palettes.cjs` —— 工具栏回归探针（按钮计数 / FA SVG / H3 toggle / 隐藏预览 / info Esc / 主题切换 6/6 通过）

### 待完成 ⏳

- [ ] `Editor.vue` —— IR 即时渲染编辑区（contenteditable + turndown）
- [ ] `Toolbar.vue` —— 工具栏抽象组件（当前在 `EditorOnly.vue` 内联，v0.3 抽出复用）
- [ ] `App.vue` —— 完整 demo 7 段（主编辑器 / 主题对比 / 代码+公式 / 图片 / 嵌入 / 字符配对 / 快捷键）
- [ ] `index.ts` —— 库入口导出
- [ ] `npm run build:lib` —— 出 npm 包

## 路线图

| 版本 | 目标 | 状态 |
| --- | --- | --- |
| **v0.1** | core 模块 + 预览页 | ✅ |
| **v0.2** | EditorOnly 洛谷式双栏 + 主题 + markdown-palettes 对齐工具栏 + 公开组件入口 | ✅ 当前 |
| **v0.3** | IR 即时渲染编辑区 + Toolbar 抽象 + 完整 demo（7 段） | ⏳ |
| **v0.4** | `npm run build:lib` 出包 + README 完善 + 单元测试 | ⏳ |
| **v0.5** | 回到 club-web 替换 `md-editor-v3`，解 P1-4 | ⏳ |

## 贡献

提交前：

```bash
npm run typecheck                # vue-tsc --noEmit
npm run dev                      # 浏览器打开 http://localhost:5273/preview.html 验证
node tools/probe-palettes.cjs    # 工具栏回归（可选；需要本地 Chrome）
```

所有 commit 使用 `git commit -s`（DCO 签名）。
PR 描述用中文，但 commit message 用英文（与 club-web 约定一致）。

## 致谢

- [club-web](https://github.com/CDUESTC-OpenAtom-Open-Source-Club/club-web) —— `SmartPaste` 和 `ImageImporter` 的 HTML→MD 启发式与图片占位符流程来自其 `MarkdownEditor.vue`（origin/main `4775e46`）
- [luogu-dev/markdown-palettes](https://github.com/luogu-dev/markdown-palettes) —— 工具栏按钮结构、按钮顺序、FontAwesome 5 图标映射对齐上游 `defaultBtns`
- [FontAwesome](https://fontawesome.com) —— 工具栏图标集（v5 free solid）
- [markdown-it](https://github.com/markdown-it/markdown-it) —— 核心 Markdown 解析器
- [highlight.js](https://highlightjs.org) —— 代码高亮
- [KaTeX](https://katex.org) —— 数学公式渲染
- [@vscode/markdown-it-katex](https://github.com/microsoft/vscode-markdown-it-katex) —— markdown-it 的 KaTeX 插件

## 许可

MIT — 详见 [LICENSE](LICENSE)