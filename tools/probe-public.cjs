/**
 * Headless probe — verify all 3 tabs of /preview.html render, MdEditor v-model
 * propagates typing back to the parent, v-model:theme swaps data-mdf-theme,
 * and CSS variables resolve in both themes.
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
  await page.waitForSelector('.bar .tabs button', { timeout: 10000 });

  const tabs = await page.$$eval('.bar .tabs button', (els) => els.map((e) => e.textContent.trim()));
  console.log('▶ tabs:', JSON.stringify(tabs));
  if (tabs.length !== 3 || !tabs.includes('公开组件')) {
    console.log('✗ expected 3 tabs incl 公开组件');
    process.exit(2);
  }

  // Click 公开组件 tab
  for (const b of await page.$$('.bar .tabs button')) {
    const text = await page.evaluate((el) => el.textContent.trim(), b);
    if (text === '公开组件') { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 500));

  // 1) initial state
  const initial = await page.evaluate(() => {
    const info = document.querySelector('.public-info .muted');
    const themeHost = document.querySelector('[data-mdf-theme]');
    return {
      infoText: info?.textContent?.trim(),
      themeAttr: themeHost?.getAttribute('data-mdf-theme'),
      taCount: document.querySelectorAll('.dual-host textarea').length
    };
  });
  console.log('▶ public pane initial:', JSON.stringify(initial));

  // 2) type into the textarea
  const ta = await page.$('.dual-host textarea');
  if (!ta) { console.log('✗ no textarea'); process.exit(2); }
  await ta.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await ta.type('# v-model round-trip\n\nparent sees this');
  await new Promise((r) => setTimeout(r, 250));

  const afterTyping = await page.evaluate(() => {
    const info = document.querySelector('.public-info .muted');
    return { infoText: info?.textContent?.trim() };
  });
  console.log('▶ after typing:', JSON.stringify(afterTyping));
  // Pull "字数 N" out of the public info bar; compare with the initial count.
  const initialCount = Number((initial.infoText || '').match(/字数 (\d+)/)?.[1] || 0);
  const afterCount = Number((afterTyping.infoText || '').match(/字数 (\d+)/)?.[1] || 0);
  const vModelOk = afterCount > initialCount && (afterTyping.infoText || '').includes('主题 typora-light');
  console.log(`▶ v-model propagates content (${initialCount} → ${afterCount} chars):`, vModelOk);

  // 3) toggle theme via the samples bar button (切深色 / 切浅色)
  const themeBtnHandle = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('.samples button')).find((b) => /切深色|切浅色/.test(b.textContent))
  );
  if (!themeBtnHandle) { console.log('✗ no theme button'); process.exit(2); }
  await themeBtnHandle.click();
  await new Promise((r) => setTimeout(r, 400));

  const afterTheme = await page.evaluate(() => {
    const themeHost = document.querySelector('[data-mdf-theme]');
    const bg = themeHost ? getComputedStyle(themeHost).getPropertyValue('--mdf-bg').trim() : '';
    const fg = themeHost ? getComputedStyle(themeHost).getPropertyValue('--mdf-fg').trim() : '';
    const info = document.querySelector('.public-info .muted');
    return { themeAttr: themeHost?.getAttribute('data-mdf-theme'), bg, fg, infoText: info?.textContent?.trim() };
  });
  console.log('▶ after theme toggle:', JSON.stringify(afterTheme));
  const themeSwapOk = afterTheme.themeAttr === 'typora-dark' && /typora-dark/.test(afterTheme.infoText || '');
  console.log('▶ v-model:theme updates data-mdf-theme:', themeSwapOk);

  // 4) toggle back to verify both directions
  const themeBtnHandle2 = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('.samples button')).find((b) => /切深色|切浅色/.test(b.textContent))
  );
  await themeBtnHandle2.click();
  await new Promise((r) => setTimeout(r, 300));
  const afterTheme2 = await page.evaluate(() =>
    document.querySelector('[data-mdf-theme]')?.getAttribute('data-mdf-theme')
  );
  console.log('▶ toggle back to:', afterTheme2);

  // 5) other tabs still work
  for (const name of ['洛谷式双栏', '简单预览']) {
    for (const b of await page.$$('.bar .tabs button')) {
      const text = await page.evaluate((el) => el.textContent.trim(), b);
      if (text === name) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 400));
    const ok = await page.evaluate((tabName) => {
      if (tabName === '洛谷式双栏') return !!document.querySelector('.dual-host > div');
      return !!document.querySelector('.split textarea');
    }, name);
    console.log(`▶ tab ${name}: ok=${ok}`);
  }

  // 6) load a sample into public pane and confirm round-trip
  for (const b of await page.$$('.bar .tabs button')) {
    const text = await page.evaluate((el) => el.textContent.trim(), b);
    if (text === '公开组件') { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 400));
  for (const b of await page.$$('.samples button')) {
    const text = await page.evaluate((el) => el.textContent.trim(), b);
    if (text === '数学 / KaTeX') { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 400));
  const kaTeXPreview = await page.evaluate(() => {
    const rendered = document.querySelector('.dual-host .katex, .dual-host [data-mdf-theme] .katex');
    return {
      hasKatex: !!document.querySelector('.dual-host .katex'),
      infoText: document.querySelector('.public-info .muted')?.textContent?.trim()
    };
  });
  console.log('▶ after loading KaTeX sample into public pane:', JSON.stringify(kaTeXPreview));

  if (errors.length > 0) {
    console.log('▶ errors:');
    errors.forEach((e) => console.log('  ', e));
  } else {
    console.log('▶ no console errors');
  }

  await browser.close();
  console.log('done');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
