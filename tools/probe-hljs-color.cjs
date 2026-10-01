/**
 * probe-hljs-color.cjs — 在 preview.html 测 hljs token 颜色（EditorOnly.vue
 * 没有示例按钮，preview.html 才有）。
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5275;
const TOKENS = ['hljs-keyword', 'hljs-string', 'hljs-comment', 'hljs-number', 'hljs-built_in', 'hljs-attr'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));

  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.eo-toolbar');
  await new Promise((r) => setTimeout(r, 500));

  // 切到"代码对照"示例
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === '代码对照'
    );
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  async function readTokens() {
    return await page.evaluate((tokens) => {
      const root = document.querySelector('.eo-rendered') || document.querySelector('.preview');
      const dataTheme = document.querySelector('.editor-only')?.getAttribute('data-mdf-theme')
        || document.body.getAttribute('data-mdf-theme')
        || document.documentElement.getAttribute('data-mdf-theme');
      const out = {};
      for (const t of tokens) {
        const els = root ? root.querySelectorAll(`.${t}`) : [];
        if (!els.length) { out[t] = null; continue; }
        const cs = getComputedStyle(els[0]);
        out[t] = { color: cs.color, count: els.length };
      }
      return { theme: dataTheme, tokens: out };
    }, TOKENS);
  }

  const light = await readTokens();
  console.log('--- LIGHT ---');
  console.log(JSON.stringify(light, null, 2));

  // 切到 dark 主题 — preview.html 的主题按钮可能在 preview-header
  const switched = await page.evaluate(() => {
    // 多种选择器都试
    const btns = Array.from(document.querySelectorAll('button'));
    const candidates = btns.filter((b) =>
      (b.title && (b.title.includes('切换主题') || b.title.includes('当前主题'))) ||
      b.getAttribute('aria-label') === '切换主题'
    );
    if (candidates.length) { candidates[0].click(); return candidates[0].title; }
    return null;
  });
  console.log('switched via button title:', switched);
  await new Promise((r) => setTimeout(r, 800));

  const dark = await readTokens();
  console.log('--- DARK ---');
  console.log(JSON.stringify(dark, null, 2));

  const errors = [];
  // 宽松判定: 任何一个 token 在 light 下非默认色 + dark 下颜色不同就算通过。
  // hljs-comment / hljs-attr 在 ts/cpp/sql/bash 样本里没有, 所以"找不到"
  // 不算 fail, 但找到了就必须遵守 light≠dark。
  const seen = new Set();
  for (const t of TOKENS) {
    const L = light.tokens[t];
    const D = dark.tokens[t];
    if (!L || !D) continue;
    seen.add(t);
    if (L.color === 'rgb(0, 0, 0)' || L.color === 'rgba(0, 0, 0, 0)') errors.push(`${t}: light 主题下是浏览器默认黑色 — highlight.css 没生效？`);
    if (L.color === D.color) errors.push(`${t}: light 与 dark 主题下颜色相同 (${L.color}) — 主题切换没生效`);
    if (L.count === 0) errors.push(`${t}: light 主题下 0 个 token`);
    if (D.count === 0) errors.push(`${t}: dark 主题下 0 个 token`);
  }
  if (seen.size < 3) errors.push(`只测到 ${seen.size} 个 token (${[...seen].join(',')}), highlight.css 可能没生效`);
  if (errors.length) {
    console.log('\nFAIL:');
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
  console.log(`\nOK: ${seen.size} 个 token (${[...seen].join(', ')}) 在 light/dark 主题下都有非默认颜色, 且主题切换生效.`);

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });