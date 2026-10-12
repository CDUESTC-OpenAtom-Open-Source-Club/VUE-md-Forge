/**
 * probe-pre-wrap.cjs — 验证 commit `fix(editor): preview <pre> 不折行`
 *
 * 断言：
 *   1. preview 渲染的 <pre> 元素 computed `white-space === 'pre'`（强制不折行）
 *   2. <pre> 的 `overflow === 'auto'`（长行出横向滚动条）
 *   3. 输入无空格长字符串到 source → preview <pre> 的 scrollWidth > clientWidth
 *      （确实需要横向滚动，确认没被字符级断行）
 *
 * 运行：先 `vite preview --port 5273` 再 `node tools/probe-pre-wrap.cjs`
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5273;
const BASE = process.env.BASE_URL || '/VUE-md-Forge';
const URL = `http://localhost:${PORT}${BASE}/editor-only.html`;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  let passed = 0, failed = 0;

  function check(name, ok, detail) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else    { failed++; console.log(`  ✗ ${name} — ${detail}`); }
  }

  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.eo-textarea');

    // 输入 fenced code block + 长无空格字符串
    const longNoSpace = 'a'.repeat(200);
    const src = '```bash\n' + longNoSpace + '\n```\n';
    await page.evaluate((val) => {
      const ta = document.querySelector('.eo-textarea');
      ta.value = val;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, src);
    await new Promise(r => setTimeout(r, 200));

    // 等 Vue 重渲染 preview
    await page.waitForSelector('.eo-rendered pre', { timeout: 3000 });

    const preMetrics = await page.evaluate(() => {
      const pre = document.querySelector('.eo-rendered pre');
      const cs = getComputedStyle(pre);
      // 测量 textContent 长度（应该 ≈ 200 'a' 字符）
      const textContent = pre.textContent.replace(/[\s\n]/g, '');
      return {
        whiteSpace: cs.whiteSpace,
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        clientWidth: pre.clientWidth,
        scrollWidth: pre.scrollWidth,
        textContentLen: textContent.length
      };
    });

    console.log('Preview <pre> metrics:');
    console.log(`  white-space : ${preMetrics.whiteSpace}`);
    console.log(`  overflow    : ${preMetrics.overflow}`);
    console.log(`  overflow-x  : ${preMetrics.overflowX}`);
    console.log(`  clientWidth : ${preMetrics.clientWidth}px`);
    console.log(`  scrollWidth : ${preMetrics.scrollWidth}px`);
    console.log(`  text length : ${preMetrics.textContentLen} chars (期望 200)`);
    console.log();

    // 1. white-space: pre（强制不折行）
    check('preview <pre> white-space = pre (强制不折行)',
      preMetrics.whiteSpace === 'pre', `got ${preMetrics.whiteSpace}`);

    // 2. overflow: auto / overflow-x: auto / scroll
    const overflowOk = ['auto', 'scroll'].includes(preMetrics.overflow) ||
                       ['auto', 'scroll'].includes(preMetrics.overflowX);
    check('preview <pre> overflow 允许滚动',
      overflowOk, `overflow=${preMetrics.overflow}, overflow-x=${preMetrics.overflowX}`);

    // 3. scrollWidth > clientWidth（确实需要横向滚动 — 没有被字符级断行）
    check('preview <pre> scrollWidth > clientWidth (长行未字符断行)',
      preMetrics.scrollWidth > preMetrics.clientWidth,
      `scrollW=${preMetrics.scrollWidth}, clientW=${preMetrics.clientWidth}`);

    // 4. 文本长度仍 ≈ 200（没有被折行截断 / 替换）
    check('preview <pre> 文本长度 ≈ 200 (内容完整)',
      Math.abs(preMetrics.textContentLen - 200) <= 2, `got ${preMetrics.textContentLen}`);

    console.log();
    console.log(`${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (e) {
    console.error('probe failed:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();