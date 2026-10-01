<script setup lang="ts">
/**
 * Preview hub — single view: the public <MdEditor> component.
 *
 * The 5 demo samples double as a smoke test for highlighting, KaTeX,
 * smart paste (shell fences), task lists and XSS sanitisation.
 */
import { onMounted, ref, watch } from 'vue';
import MdEditor from './MdEditor.vue';

type ThemeName = 'typora-light' | 'typora-dark';

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

## 行内公式（4 种 delimiter 都支持）

勾股定理：$a^2 + b^2 = c^2$。
欧拉恒等式：$e^{i\\pi} + 1 = 0$。
LaTeX 风 inline：\\(E = mc^2\\)。
LaTeX 风 inline（多行不行）：\\(e^{i\\pi} + 1 = 0\\)。

## 块级公式（4 种 delimiter 都支持）

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

LaTeX 风块级（多行）：
\\[
\\hat{H}\\psi = E\\psi
\\]

LaTeX 风块级（单行）：
\\[ E = mc^2 \\]
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

const STORAGE_KEY = 'mdf-md-editor:draft';
const THEME_KEY = 'mdf-md-editor:theme';

const content = ref<string>(localStorage.getItem(STORAGE_KEY) ?? SAMPLES[0].text);
const theme = ref<ThemeName>(
  (localStorage.getItem(THEME_KEY) as ThemeName) ?? 'typora-light'
);
const sampleIndex = ref<number>(0);

onMounted(() => {
  if (content.value === '') content.value = SAMPLES[0].text;
});

watch(content, (v) => localStorage.setItem(STORAGE_KEY, v), { flush: 'post' });
watch(theme, (v) => localStorage.setItem(THEME_KEY, v), { flush: 'post' });

function loadSample(index: number) {
  sampleIndex.value = index;
  content.value = SAMPLES[index].text;
  localStorage.setItem(STORAGE_KEY, content.value);
  localStorage.setItem(STORAGE_KEY + ':name', SAMPLES[index].name);
}

function clearAll() {
  content.value = '';
  localStorage.removeItem(STORAGE_KEY);
}

function toggleTheme() {
  theme.value = theme.value === 'typora-light' ? 'typora-dark' : 'typora-light';
}
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
        <button class="ghost" @click="clearAll">清空</button>
        <button class="ghost" @click="toggleTheme">
          {{ theme === 'typora-light' ? '☾ 切深色' : '☀ 切浅色' }}
        </button>
      </div>
    </header>

    <main class="editor-host">
      <MdEditor v-model="content" v-model:theme="theme" />
    </main>
  </div>
</template>

<style scoped>
.editor-host {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
.editor-host :deep(.editor-only) { flex: 1 1 auto; }
</style>
