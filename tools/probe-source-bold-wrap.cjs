/**
 * probe-source-bold-wrap.cjs — 验证 commit
 * `fix(editor): source view word-break 修加粗 token 强制换行`
 *
 * 真实 bug：source view 用 `word-break: break-word`（非标准）把 `**` 等 ASCII
 * token 当强制 word break point。当 CJK + `**` 混排时，浏览器在 `**` 后换行，
 * 导致 `基于这个概念...**重要特性**：` 被拆成 2-3 行。
 *
 * 策略改为 `word-break: normal` + `overflow-wrap: break-word` 后：
 * - CJK 长串仍可字符级断行（overflow-wrap 兜底）
 * - 但 `**` 等 ASCII token 不再被当强制 break point，紧邻的 CJK 不再被拆开
 *
 * 本 probe 用一个短 CJK + `**xxx**` + 短 CJK 串（1 行能装下），断言：
 *   1. highlight 函数识别 `**xxx**` → mdf-hl-bold span 存在
 *   2. 整段 Range.getClientRects() 返回 1 个 rect（** 没被强制换行）
 *   3. 整段垂直跨度 ≈ 单行 line-height（22px + 像素舍入）
 *
 * 用 Range API 测真实行布局：overlay 的 scrollHeight 在 absolute+overflow:auto
 * 元素上等于 box 高度（=stack min-height ≈ 505px），不代表内容高度。
 *
 * 如果旧 CSS 把 `**` 当 break point，range 会被拆成 2 个 rects，断言失败。
 *
 * 运行：先 `vite preview --port 5273` 再 `node tools/probe-source-bold-wrap.cjs`
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5273;
const BASE = process.env.BASE_URL || '/VUE-md-Forge';
const URL = `http://localhost:${PORT}${BASE}/editor-only.html`;

// 短到 1 行能装下的 CJK + **bold** + CJK 串。puppeteer 默认 viewport 800x600，
// editor 主区域约 380px 宽，每行 monospace 14.5px ≈ 26 字符 / 行。
// 测试串故意不超过 26 字符，确保 1 行能装下。
const TEST_INPUT = '基于这个概念**重要特性**：写一遍就能到处用';

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

    // 设置 textarea 内容 + 触发 Vue 响应式更新
    await page.evaluate((val) => {
      const ta = document.querySelector('.eo-textarea');
      ta.value = val;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, TEST_INPUT);
    await new Promise(r => setTimeout(r, 250));

    // 检查 highlight token 渲染 + 用 Range.getClientRects() 测行布局
    // （overlay 的 scrollHeight 在 absolute + overflow:auto 元素上等于 box 高度，
    //  不等于内容高度——所以改用 Range API 直接测 token 是否被强制换行）
    const debug = await page.evaluate(() => {
      const overlay = document.querySelector('.eo-overlay');
      const boldSpans = document.querySelectorAll('.eo-overlay .mdf-hl-bold');
      const ta = document.querySelector('.eo-textarea');

      // 测整段（从 overlay 起点到末尾）的 client rects — 几个 rect = 几行
      const fullRange = document.createRange();
      fullRange.selectNodeContents(overlay);
      const fullRects = fullRange.getClientRects();
      const fullRectCount = fullRects.length;
      const firstRect = fullRects[0];
      const lastRect = fullRects[fullRects.length - 1];
      const sameRow = firstRect && lastRect &&
        Math.abs(firstRect.top - lastRect.top) < 2;
      const verticalSpan = firstRect && lastRect ?
        (lastRect.bottom - firstRect.top) : 0;

      // 测 bold span 自身的 rect（确认 **xxx** 自己没被换行）
      const boldRect = boldSpans[0] ? boldSpans[0].getBoundingClientRect() : null;
      const boldRects = boldSpans[0] ? boldSpans[0].getClientRects() : [];

      return {
        taValue: ta.value,
        boldCount: boldSpans.length,
        boldTexts: Array.from(boldSpans).map(s => s.textContent),
        fullRectCount,
        sameRow,
        verticalSpan,
        firstTop: firstRect?.top,
        lastBottom: lastRect?.bottom,
        boldLeft: boldRect?.left,
        boldTop: boldRect?.top,
        boldWidth: boldRect?.width,
        boldHeight: boldRect?.height,
        boldRectCount: boldRects.length
      };
    });

    console.log('Debug:');
    console.log(`  textarea value = "${debug.taValue}"`);
    console.log(`  full range rects count = ${debug.fullRectCount} (1=单行 OK, 2+=被换行 BUG)`);
    console.log(`  first.top=${debug.firstTop}  last.bottom=${debug.lastBottom}  verticalSpan=${debug.verticalSpan}px`);
    console.log(`  same row = ${debug.sameRow}`);
    console.log(`  bold rect count = ${debug.boldRectCount}  width=${debug.boldWidth}px  top=${debug.boldTop}px`);
    console.log(`  mdf-hl-bold count = ${debug.boldCount}`);
    console.log(`  mdf-hl-bold texts = ${JSON.stringify(debug.boldTexts)}`);
    console.log();

    // 1. highlight 函数识别 `**xxx**` → mdf-hl-bold span 存在
    check('overlay 渲染 mdf-hl-bold token (highlight 函数识别 **xxx**)',
      debug.boldCount >= 1, `got ${debug.boldCount} bold spans`);

    // 2. bold span 自己 1 个 rect（**xxx** 没被强制换行 / 拆字）
    //    旧 CSS `word-break: break-word` 会把 `**` 当 word break point，
    //    bold 内部可能拆成 2-3 个 rects。
    check('bold span 自身的 getClientRects() 返回 1 个 rect (**xxx** 没被拆字)',
      debug.boldRectCount === 1, `got ${debug.boldRectCount} rects`);

    // 3. 整段在 1 行内（首尾同一行，垂直跨度 ≤ 1 行 line-height）
    check('整段首尾同行 + 垂直跨度 ≤ 30px (单行 line-height, 不是 2 行)',
      debug.sameRow && debug.verticalSpan !== null && debug.verticalSpan <= 30,
      `sameRow=${debug.sameRow}, verticalSpan=${debug.verticalSpan}px`);

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