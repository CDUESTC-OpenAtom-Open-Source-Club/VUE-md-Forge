/**
 * Headless probe — verify the editor toolbar aligns with
 * luogu-dev/markdown-palettes (defaultBtns):
 *
 *   bold · strikethrough · italic · hr ─ H1 H2 H3 H4 H5 H6 ─ ul ol ─
 *   img · link · code · table ─ hide · fullScreen · scrollSync ─ ☼ ?
 *
 * Each button's icon is asserted to be a FontAwesome SVG <svg> (not a text
 * glyph, except the six H1..H6 which render as text).
 */
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });

  console.log('▶ open /preview.html');
  await page.goto('http://[::1]:5273/preview.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.eo-toolbar', { timeout: 10000 });

  // ── 1) toolbar button inventory
  const buttons = await page.$$eval('.eo-toolbar > button', (els) =>
    els.map((b, i) => ({
      idx: i + 1,
      title: b.getAttribute('title') || '',
      aria: b.getAttribute('aria-label') || '',
      hasSvg: !!b.querySelector('svg'),
      glyph: b.querySelector('.eo-btn-glyph')?.textContent?.trim() || null
    }))
  );
  console.log(`▶ toolbar buttons: ${ buttons.length }`);
  buttons.forEach((b) => {
    const icon = b.hasSvg ? 'SVG' : (b.glyph ? `text("${b.glyph}")` : '?');
    console.log(`   [${ b.idx }] ${ icon.padEnd(10) } — ${ b.title || b.aria }`);
  });

  // ── 2) assert: 21 buttons (matches luogu markdown-palettes defaultBtns minus dividers)
  if (buttons.length !== 21) {
    console.log(`✗ expected 21 buttons, got ${ buttons.length }`);
    process.exit(2);
  }

  // ── 3) assert: every button has FA svg icon EXCEPT the six H1..H6 (text glyph)
  const textGlyphIdx = buttons
    .map((b, i) => (b.glyph && /^H\d$/.test(b.glyph) ? i : -1))
    .filter((i) => i >= 0);
  console.log(`▶ text-glyph (H1..H6) button indices: ${ textGlyphIdx.join(',') }`);
  if (textGlyphIdx.length !== 6) {
    console.log(`✗ expected 6 H1..H6 text-glyph buttons, got ${ textGlyphIdx.length }`);
    process.exit(2);
  }
  buttons.forEach((b, i) => {
    if (!b.hasSvg && !textGlyphIdx.includes(i)) {
      console.log(`✗ button [${ i + 1 }] "${ b.title }" has neither SVG nor H-glyph`);
      process.exit(2);
    }
  });
  console.log('▶ every non-H button has a FontAwesome SVG icon');

  // ── 4) assert title strings match luogu semantics
  const expectedTitles = [
    '粗体 Ctrl+B',           // 1 bold
    '删除线',                 // 2 strikethrough
    '斜体 Ctrl+I',           // 3 italic
    '水平线',                 // 4 hr
    '1 级标题',               // 5 H1
    '2 级标题',               // 6 H2
    '3 级标题',               // 7 H3
    '4 级标题',               // 8 H4
    '5 级标题',               // 9 H5
    '6 级标题',               // 10 H6
    '无序列表',               // 11 ul
    '有序列表',               // 12 ol
    '图片',                   // 13 img
    '链接 Ctrl+K',           // 14 link
    '代码块',                 // 15 code
    '表格',                   // 16 table
    /预览/,                   // 17 hide
    '全屏',                   // 18 fullScreen
    /滚动同步/,               // 19 scrollSync
    /当前主题/,               // 20 theme toggle
    '关于'                    // 21 info
  ];
  for (let i = 0; i < expectedTitles.length; i += 1) {
    const exp = expectedTitles[i];
    const got = buttons[i].title;
    const ok = typeof exp === 'string' ? got === exp : exp.test(got);
    if (!ok) {
      console.log(`✗ button [${ i + 1 }] title "${ got }" does not match "${ exp }"`);
      process.exit(2);
    }
  }
  console.log('▶ every button title matches luogu semantics');

  // ── 5) functional smoke: H3 button adds "### " prefix
  // Reset textarea to a known single-line content first.
  await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    if (ta) {
      ta.value = 'hello';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 150));
  // Click the H3 button (idx 7 — 1-based, zero-based 6)
  await (await page.$$('.eo-toolbar > button'))[6].click();
  await new Promise((r) => setTimeout(r, 150));
  const afterH3 = await page.evaluate(() => (document.querySelector('.eo-textarea')).value);
  console.log(`▶ after H3 click: ${ JSON.stringify(afterH3) }`);
  if (!afterH3.includes('### hello')) {
    console.log('✗ H3 button did not insert ### prefix');
    process.exit(2);
  }
  // Click H3 again to toggle off
  await (await page.$$('.eo-toolbar > button'))[6].click();
  await new Promise((r) => setTimeout(r, 150));
  const afterToggle = await page.evaluate(() => (document.querySelector('.eo-textarea')).value);
  console.log(`▶ after H3 click (toggle off): ${ JSON.stringify(afterToggle) }`);
  if (afterToggle.includes('### ')) {
    console.log('✗ H3 toggle-off did not strip prefix');
    process.exit(2);
  }

  // ── 6) hide-preview button hides the preview pane
  const hideIdx = 16; // zero-based, button 17
  const beforeHide = await page.evaluate(() => {
    const p = document.querySelector('.eo-preview');
    return p ? getComputedStyle(p).display : 'no-preview-element';
  });
  await (await page.$$('.eo-toolbar > button'))[hideIdx].click();
  await new Promise((r) => setTimeout(r, 200));
  const afterHide = await page.evaluate(() => {
    const p = document.querySelector('.eo-preview');
    return p ? getComputedStyle(p).display : 'no-preview-element';
  });
  console.log(`▶ preview display: before=${ beforeHide } after=${ afterHide }`);
  if (afterHide !== 'none') {
    console.log('✗ hide button did not hide preview pane');
    process.exit(2);
  }
  // Toggle back
  await (await page.$$('.eo-toolbar > button'))[hideIdx].click();
  await new Promise((r) => setTimeout(r, 200));

  // ── 7) info modal opens and lists VUE-md-Forge reference
  const infoIdx = 20; // button 21
  await (await page.$$('.eo-toolbar > button'))[infoIdx].click();
  await new Promise((r) => setTimeout(r, 200));
  const infoState = await page.evaluate(() => {
    const modal = document.querySelector('.eo-info');
    if (!modal) return null;
    const links = Array.from(document.querySelectorAll('.eo-info a')).map((a) => a.href);
    return { open: true, hasMarkdownPalettesRef: links.some((h) => h.includes('markdown-palettes')) };
  });
  console.log('▶ info modal:', JSON.stringify(infoState));
  if (!infoState || !infoState.open || !infoState.hasMarkdownPalettesRef) {
    console.log('✗ info modal missing or no markdown-palettes link');
    process.exit(2);
  }
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  const closedByEsc = (await page.$('.eo-info')) === null;
  console.log('▶ info modal closed by Esc:', closedByEsc);

  // ── 8) theme button still toggles
  const themeIdx = 19; // button 20
  const themeBefore = await page.evaluate(() => document.querySelector('.editor-only')?.getAttribute('data-mdf-theme'));
  await (await page.$$('.eo-toolbar > button'))[themeIdx].click();
  await new Promise((r) => setTimeout(r, 200));
  const themeAfter = await page.evaluate(() => document.querySelector('.editor-only')?.getAttribute('data-mdf-theme'));
  console.log(`▶ theme: ${ themeBefore } → ${ themeAfter }`);
  if (themeBefore === themeAfter) {
    console.log('✗ theme button did not toggle');
    process.exit(2);
  }

  if (errors.length) {
    console.log('▶ console errors:');
    errors.forEach((e) => console.log('   ', e));
  } else {
    console.log('▶ no console errors');
  }

  await browser.close();
  console.log('✅ all probes passed');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });