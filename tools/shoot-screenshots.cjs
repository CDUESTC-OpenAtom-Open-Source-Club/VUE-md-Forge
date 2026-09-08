/**
 * shoot-screenshots.cjs — capture 3 screenshots for the assignment report:
 *  1) preview.html with the "公开组件" demo (light)
 *  2) editor-only.html (light) — Luogu-style dual pane
 *  3) editor-only.html (dark) — same, toggled
 *
 * Output: report-screenshots/{demo-overview,editor-light,editor-dark}.png
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const outDir = path.join(__dirname, '..', 'report-screenshots');
  const shoot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('saved', file);
  };

  // ── 1) demo overview (preview.html) — public <MdEditor> wrapper ──
  console.log('▶ preview.html');
  await page.goto('http://localhost:5273/preview.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.eo-textarea', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  // Load the KaTeX sample so the demo shows formulas.
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.samples button'));
    const k = btns.find((b) => /数学/.test(b.textContent || ''));
    k && k.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await shoot('01-demo-overview');

  // ── 2) editor-only light ──
  console.log('▶ editor-only light');
  await page.goto('http://localhost:5273/editor-only.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.eo-textarea', { timeout: 10000 });
  // Load KaTeX sample via a contenteditable probe
  await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    if (!ta) return;
    const sample = `# KaTeX 公式预览

行内：勾股定理 $a^2 + b^2 = c^2$，欧拉恒等式 $e^{i\\pi} + 1 = 0$。

块级：

$$
\\begin{aligned}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial \\mathbf{t}}
\\end{aligned}
$$

$$
\\hat{H}\\psi = E\\psi
$$

## 代码高亮

\`\`\`ts
import { ref } from 'vue';
const count = ref(0);
\`\`\`

\`\`\`python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`
`;
    const proto = Object.getPrototypeOf(ta);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(ta, sample);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 900));
  await shoot('02-editor-light');

  // ── 3) editor-only dark ──
  console.log('▶ editor-only dark');
  // Click the theme toggle (sun/moon icon button — last group, first btn)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.eo-toolbar button'));
    // The toggle is the one whose title starts with "当前主题"
    const themeBtn = btns.find((b) => /当前主题/.test(b.getAttribute('title') || ''));
    themeBtn && themeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await shoot('03-editor-dark');

  await browser.close();
  console.log('done');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });