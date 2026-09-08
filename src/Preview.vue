<script setup lang="ts">
/**
 * Live preview — two panes:
 *   left:  textarea (with character auto-pairing)
 *   right: live Markdown render (highlight.js + KaTeX + sanitiser)
 *
 * Sample texts are pre-loaded so the first paint already has content
 * to compare against. Switching sample / typing updates the preview
 * immediately.
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { MarkdownEngine } from '@/core/MarkdownEngine';
import { PairCompleter } from '@/core/PairCompleter';

const engine = new MarkdownEngine();
const pair = new PairCompleter();

const SAMPLES: Array<{ name: string; text: string }> = [
  {
    name: '欢迎示例',
    text: `# 欢迎使用 VUE-md-Forge

这是一个 **Vue 3 Markdown 编辑器插件**的实时预览，左边编辑、右边即时渲染。

## 特色

- 代码高亮（[highlight.js](https://highlightjs.org)）
- 数学公式（KaTeX）  $E = mc^2$
- 字符自动配对：试着输入 \`(\`、\`[\`、\`{\`、\`"\`、\`'\`、\`*\`、\`_\`、\`~\`、\`\\\`
- XSS 净化：粘贴 HTML 自动转 Markdown
- 草稿自动保存到 localStorage

## 代码示例

\`\`\`ts
import { ref } from 'vue';

const count = ref(0);
const add = () => count.value++;
\`\`\`

\`\`\`python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

## 公式

块级：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## 表格

| 模块 | 来源 | 体积 |
| --- | --- | --- |
| MarkdownEngine | 新增 | 12 KB |
| PairCompleter | 新增 | 4 KB |
| SmartPaste | 从 club-web 移植 | 16 KB |

## 引用

> 把别人优秀的设计消化一遍，剩下值得留下的，
> 是社区里真实跑过的逻辑。

## 列表

1. 第一步：在左边编辑
2. 第二步：右边实时看效果
3. 第三步：上方的"示例"按钮可一键切换
`
  },
  {
    name: 'Shell & 命令',
    text: `# Shell 命令测试

下面这些会触发 SmartPaste 的 shell 围栏启发：

cd /var/log
tail -f nginx/access.log
grep " 500 " app.log | head

# here-doc
cat > config.yaml <<EOF
server:
  port: 8080
  host: 0.0.0.0
EOF

# 多行续行
docker run -d \\
  --name web \\
  -p 80:80 \\
  -v /data:/usr/share/nginx/html \\
  nginx:alpine
`
  },
  {
    name: '数学 / KaTeX',
    text: `# KaTeX 测试

## 行内公式

勾股定理：$a^2 + b^2 = c^2$。
欧拉恒等式：$e^{i\\pi} + 1 = 0$。

## 块级公式

$$
\\begin{aligned}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\cdot \\mathbf{B} &= 0 \\\\
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{aligned}
$$

$$
\\hat{H}\\psi = E\\psi
$$
`
  },
  {
    name: '代码对照',
    text: `# 多语言代码高亮

\`\`\`javascript
const fib = (n) => {
  const [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
};
\`\`\`

\`\`\`cpp
#include <iostream>
int main() {
  std::cout << "hello, forge" << std::endl;
  return 0;
}
\`\`\`

\`\`\`sql
SELECT u.id, u.name, COUNT(p.id) AS posts
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id
ORDER BY posts DESC
LIMIT 10;
\`\`\`

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "processing $f"
done
\`\`\`
`
  },
  {
    name: '安全净化对照',
    text: `# XSS 净化演示

> 右边显示的是经过 \`MarkdownSecurity\` 净化后的 HTML。
> 危险标签 / 事件处理器 / javascript: 都会被剥掉。

\`\`\`html
<script>alert('xss')<\/script>

<a href="javascript:alert(1)" onclick="steal()">点我</a>

<a href="https://example.com" target="_blank">新窗口链接</a>

<img src="data:image/svg+xml,<svg/onload=alert(1)>" />

<img src="data:image/png;base64,iVBORw0K..." />
\`\`\`
`
  }
];

const STORAGE_KEY = 'mdf-preview-draft';

const content = ref<string>(localStorage.getItem(STORAGE_KEY) ?? SAMPLES[0].text);
const sampleIndex = ref<number>(0);
const renderMs = ref<number>(0);

const renderedHtml = computed(() => {
  const t0 = performance.now();
  const html = engine.render(content.value);
  renderMs.value = +(performance.now() - t0).toFixed(2);
  return html;
});

let saveHandle: number | null = null;
function scheduleSave() {
  if (saveHandle !== null) window.clearTimeout(saveHandle);
  saveHandle = window.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, content.value);
  }, 400);
}

function onInput() {
  scheduleSave();
}

function onBeforeInput(e: Event) {
  const ev = e as InputEvent;
  const el = e.target as HTMLTextAreaElement;
  const data = ev.data ?? '';
  const result = pair.process(ev.inputType, data, {
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd
  });
  if (result.preventDefault) {
    ev.preventDefault();
    el.value = result.value;
    el.setSelectionRange(result.caret, result.caret);
    content.value = el.value;
    scheduleSave();
  }
}

function loadSample(index: number) {
  sampleIndex.value = index;
  content.value = SAMPLES[index].text;
  localStorage.setItem(STORAGE_KEY, content.value);
}

function clearAll() {
  content.value = '';
  localStorage.removeItem(STORAGE_KEY);
}

onMounted(() => {
  // Restore the last sample name if it matches.
  const lastName = localStorage.getItem(STORAGE_KEY + ':name');
  const idx = SAMPLES.findIndex((s) => s.name === lastName);
  if (idx >= 0) sampleIndex.value = idx;
});
onBeforeUnmount(() => {
  if (saveHandle !== null) window.clearTimeout(saveHandle);
  localStorage.setItem(STORAGE_KEY + ':name', SAMPLES[sampleIndex.value]?.name ?? '');
});

const stats = computed(() => {
  const text = content.value;
  const lines = text.split('\n').length;
  const chars = text.length;
  const words = (text.match(/\S+/g) || []).length;
  return { chars, lines, words };
});
</script>

<template>
  <div class="layout">
    <header class="bar">
      <div class="title">
        <strong>VUE-md-Forge</strong>
        <span class="muted">· Vue 3 Markdown 编辑器实时预览</span>
      </div>
      <div class="samples">
        <span class="muted">示例：</span>
        <button
          v-for="(s, i) in SAMPLES"
          :key="s.name"
          :class="{ active: i === sampleIndex }"
          @click="loadSample(i)"
        >
          {{ s.name }}
        </button>
        <button class="danger" @click="clearAll">清空</button>
      </div>
    </header>

    <main class="split">
      <section class="pane">
        <div class="pane-head">
          <span>输入</span>
          <span class="meta">{{ stats.chars }} 字符 · {{ stats.lines }} 行 · {{ stats.words }} 词</span>
        </div>
        <textarea
          v-model="content"
          @input="onInput"
          @beforeinput="onBeforeInput"
          spellcheck="false"
          placeholder="在这里输入 Markdown…"
        />
      </section>

      <section class="pane">
        <div class="pane-head">
          <span>渲染预览</span>
          <span class="meta">{{ renderMs }} ms · 字符配对 + KaTeX + hljs + XSS 净化</span>
        </div>
        <div class="preview" v-html="renderedHtml" />
      </section>
    </main>
  </div>
</template>
