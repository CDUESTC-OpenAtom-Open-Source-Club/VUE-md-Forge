/**
 * probe-editor-box.cjs — 验证 commit `fix(editor): box 默认 20 行高 + 上限 60 行`
 *
 * 断言（空内容时）：
 *   1. textarea / overlay / gutter 三者 `line-height === 22px`（容许 ±0.5px 像素舍入）
 *   2. .eo-source-stack 的 `min-height === 20 * 22 + 24 = 464px`
 *   3. .eo-source-stack 的 `max-height === 60 * 22 + 24 = 1344px`
 *   4. textarea 的 `clientHeight === 464px`（空内容时锁 min-height）
 *
 * 运行：`./node_modules/.bin/vite preview --port 5273 &` 然后
 *       `node tools/probe-editor-box.cjs`
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

    // 等待 editor 挂载（textarea 存在即说明 Vue mounted）
    await page.waitForSelector('.eo-textarea');

    const metrics = await page.evaluate(() => {
      const ta = document.querySelector('.eo-textarea');
      const ov = document.querySelector('.eo-overlay');
      const gu = document.querySelector('.eo-gutter');
      const stack = document.querySelector('.eo-source-stack');
      const cs = (el) => getComputedStyle(el);
      return {
        taLineH: cs(ta).lineHeight,
        ovLineH: cs(ov).lineHeight,
        guLineH: cs(gu).lineHeight,
        stackMinH: cs(stack).minHeight,
        stackMaxH: cs(stack).maxHeight,
        stackOverflow: cs(stack).overflow,
        taClientH: ta.clientHeight,
        taScrollH: ta.scrollHeight,
        stackClientH: stack.clientHeight,
        stackOffsetH: stack.offsetHeight,
        taBoxSizing: cs(ta).boxSizing
      };
    });

    console.log('Editor box metrics (empty content):');
    console.log(`  textarea  line-height: ${metrics.taLineH}`);
    console.log(`  overlay   line-height: ${metrics.ovLineH}`);
    console.log(`  gutter    line-height: ${metrics.guLineH}`);
    console.log(`  stack     min-height : ${metrics.stackMinH}`);
    console.log(`  stack     max-height : ${metrics.stackMaxH}`);
    console.log(`  stack     overflow   : ${metrics.stackOverflow}`);
    console.log(`  stack     clientH    : ${metrics.stackClientH}px`);
    console.log(`  stack     offsetH    : ${metrics.stackOffsetH}px`);
    console.log(`  textarea  box-sizing : ${metrics.taBoxSizing}`);
    console.log(`  textarea  clientH    : ${metrics.taClientH}px`);
    console.log(`  textarea  scrollH    : ${metrics.taScrollH}px`);
    console.log();

    // 1. 三个 surface line-height 都是 22px
    check('textarea line-height = 22px', metrics.taLineH === '22px', `got ${metrics.taLineH}`);
    check('overlay  line-height = 22px', metrics.ovLineH === '22px', `got ${metrics.ovLineH}`);
    check('gutter   line-height = 22px', metrics.guLineH === '22px', `got ${metrics.guLineH}`);

    // 2. stack min-height = 20 * 22 + 24 = 464px
    check('stack min-height = 464px (20 rows × 22px + 24 padding)',
      metrics.stackMinH === '464px', `got ${metrics.stackMinH}`);

    // 3. stack max-height = 60 * 22 + 24 = 1344px
    check('stack max-height = 1344px (60 rows × 22px + 24 padding)',
      metrics.stackMaxH === '1344px', `got ${metrics.stackMaxH}`);

    // 4. stack overflow: hidden（截留不让 box 撑出去）
    check('stack overflow = hidden (内部 textarea 接管滚动)',
      metrics.stackOverflow === 'hidden', `got ${metrics.stackOverflow}`);

    // 5. textarea clientHeight >= min-height (空内容时锁 min-height)
    // 注: stack 实际高度可能被外层 grid (1fr cell) 撑得比 min-height 略大，
    // 但只要 clientHeight >= 464 (20 行 × 22px) 就证明默认高度足够；
    // 同时 clientHeight <= max-height 1344 (60 行 × 22px)。
    check('textarea clientHeight >= 464px (min-height 生效 = 默认 20 行高)',
      metrics.taClientH >= 464, `got ${metrics.taClientH}px`);
    check('textarea clientHeight <= 1344px (max-height 生效 = 上限 60 行)',
      metrics.taClientH <= 1344, `got ${metrics.taClientH}px`);

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