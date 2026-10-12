/**
 * probe-editor-rows.cjs — 验证 commit `fix(editor): box 上限 60 行 + 删除换行不缩短`
 *
 * 断言：
 *   1. 输入 80 行内容 → textarea clientHeight ≤ 1344px (60 行 × 22px + 24 padding)
 *   2. 输入 80 行后 scrollHeight > clientHeight（触发了内部滚动）
 *   3. 清空 → textarea clientHeight ≈ 464px（min-height 兜底，不缩短）
 *
 * 运行：先 `vite preview --port 5273` 再 `node tools/probe-editor-rows.cjs`
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

    // ── step 1: 初始空内容 ────────────────────────────────────────
    const emptyH = await page.evaluate(() => document.querySelector('.eo-textarea').clientHeight);
    // 注: stack clientHeight 被外层 grid 撑得比 min-height 略大 (~505px),
    // 但只要 >= 464 即证明 min-height 生效（默认 20 行高）。
    check('空内容 textarea clientHeight >= 464px (min-height 兜底 = 默认 20 行)',
      emptyH >= 464, `got ${emptyH}px`);

    // ── step 2: 输入 80 行内容 ─────────────────────────────────────
    // 用 setValue + dispatch input 事件触发 Vue :value 同步
    const eightyLines = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');
    await page.evaluate((val) => {
      const ta = document.querySelector('.eo-textarea');
        ta.value = val;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }, eightyLines);

    // 等 Vue re-render
    await new Promise(r => setTimeout(r, 100));

    const tallMetrics = await page.evaluate(() => {
      const ta = document.querySelector('.eo-textarea');
      return { clientH: ta.clientHeight, scrollH: ta.scrollHeight };
    });
    console.log(`After 80 lines: clientHeight=${tallMetrics.clientH}px, scrollHeight=${tallMetrics.scrollH}px`);

    // 1. clientHeight 锁 60 行 = 1344px（容许 ±2px 像素舍入）
    check('80 行 → textarea clientHeight ≤ 1344px (60 行上限)',
      tallMetrics.clientH <= 1344 + 2, `got ${tallMetrics.clientH}px`);

    // 2. scrollHeight > clientHeight（说明内容确实超出 box，内部滚动激活）
    check('80 行 → scrollHeight > clientHeight (内部滚动已激活)',
      tallMetrics.scrollH > tallMetrics.clientH,
      `scrollH=${tallMetrics.scrollH}, clientH=${tallMetrics.clientH}`);

    // ── step 3: 清空内容 ─────────────────────────────────────────
    await page.evaluate(() => {
      const ta = document.querySelector('.eo-textarea');
      ta.value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 100));

    const clearedH = await page.evaluate(() => document.querySelector('.eo-textarea').clientHeight);
    check('清空 → textarea clientHeight >= 464px (min-height 兜底, 不缩短)',
      clearedH >= 464, `got ${clearedH}px`);

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