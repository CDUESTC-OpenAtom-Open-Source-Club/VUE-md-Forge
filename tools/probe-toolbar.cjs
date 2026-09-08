/**
 * Headless probe — verify the redesigned toolbar layout and behaviour:
 *   1. Tabs in Preview.vue removed (no 简单预览 / 洛谷式双栏 / 公开组件)
 *   2. New toolbar layout: H0 / H6 / — / B / I / S / √x / @ / 🖼 / </> / ▦ / ❝ / ≡ / 1.≡ / ☑
 *   3. Right side: ‖ / ◫ / ⛶ / theme / ?
 *   4. promote/demote heading buttons work
 *   5. View mode toggle hides/shows the preview pane
 *   6. Help modal opens and lists shortcuts
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

  // 1) Verify tabs are gone
  const tabsHtml = await page.$('.bar .tabs');
  console.log('▶ tabs container present:', !!tabsHtml);

  // 2) Toolbar button inventory
  const buttonInfo = await page.$$eval('.eo-toolbar button', (els) =>
    els.map((b) => ({
      title: b.getAttribute('title') || '',
      label: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24),
      aria: b.getAttribute('aria-label') || ''
    }))
  );
  console.log('▶ toolbar buttons:', buttonInfo.length);
  buttonInfo.forEach((b, i) => console.log(`   [${i + 1}] "${b.label}" — ${b.title}`));

  // 3) Promote / Demote heading
  const ta = await page.$('.eo-textarea');
  if (!ta) { console.log('✗ no textarea'); process.exit(2); }
  await ta.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await ta.type('## middle');
  await new Promise((r) => setTimeout(r, 150));

  // Click "H0" (promote)
  const promoteIdx = await page.$$eval('.eo-toolbar button', (els) =>
    els.findIndex((b) => (b.getAttribute('title') || '').includes('提升'))
  );
  await (await page.$$('.eo-toolbar button'))[promoteIdx].click();
  await new Promise((r) => setTimeout(r, 150));
  const afterPromote = await page.evaluate(() => (document.querySelector('.eo-textarea')).value);
  console.log('▶ after promote:', JSON.stringify(afterPromote));

  // Click "H6" (demote)
  const demoteIdx = await page.$$eval('.eo-toolbar button', (els) =>
    els.findIndex((b) => (b.getAttribute('title') || '').includes('降低'))
  );
  await (await page.$$('.eo-toolbar button'))[demoteIdx].click();
  await new Promise((r) => setTimeout(r, 150));
  const afterDemote = await page.evaluate(() => (document.querySelector('.eo-textarea')).value);
  console.log('▶ after demote:', JSON.stringify(afterDemote));

  // 4) View mode — 仅编辑 should hide preview
  const editIdx = await page.$$eval('.eo-toolbar button', (els) =>
    els.findIndex((b) => (b.getAttribute('title') || '').includes('仅编辑'))
  );
  await (await page.$$('.eo-toolbar button'))[editIdx].click();
  await new Promise((r) => setTimeout(r, 250));
  const viewState = await page.evaluate(() => {
    const root = document.querySelector('.editor-only');
    return {
      view: root?.getAttribute('data-mdf-view'),
      previewHidden: window.getComputedStyle(document.querySelector('.eo-preview')).display === 'none'
    };
  });
  console.log('▶ view after click 仅编辑:', JSON.stringify(viewState));

  // Toggle back to dual
  await (await page.$$('.eo-toolbar button'))[editIdx].click();
  await new Promise((r) => setTimeout(r, 250));
  const viewState2 = await page.evaluate(() => ({
    view: document.querySelector('.editor-only')?.getAttribute('data-mdf-view'),
    previewHidden: window.getComputedStyle(document.querySelector('.eo-preview')).display === 'none'
  }));
  console.log('▶ view after toggle back:', JSON.stringify(viewState2));

  // 5) Help modal
  const helpIdx = await page.$$eval('.eo-toolbar button', (els) =>
    els.findIndex((b) => (b.getAttribute('title') || '').includes('帮助'))
  );
  await (await page.$$('.eo-toolbar button'))[helpIdx].click();
  await new Promise((r) => setTimeout(r, 200));
  const helpVisible = await page.evaluate(() => {
    const modal = document.querySelector('.eo-help');
    if (!modal) return null;
    return {
      present: true,
      shortcutCount: document.querySelectorAll('.eo-help-table tr').length,
      hasEscRow: !!Array.from(document.querySelectorAll('.eo-help-table tr td'))
        .find((td) => td.textContent.includes('Esc'))
    };
  });
  console.log('▶ help modal:', JSON.stringify(helpVisible));
  // Close via Esc
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  const modalGone = await page.$('.eo-help') === null;
  console.log('▶ help modal closed by Esc:', modalGone);

  // 6) Theme button still works
  const themeIdx = await page.$$eval('.eo-toolbar button', (els) =>
    els.findIndex((b) => (b.getAttribute('title') || '').startsWith('当前主题'))
  );
  await (await page.$$('.eo-toolbar button'))[themeIdx].click();
  await new Promise((r) => setTimeout(r, 200));
  const themeAfter = await page.evaluate(() =>
    document.querySelector('.editor-only')?.getAttribute('data-mdf-theme')
  );
  console.log('▶ theme after click:', themeAfter);

  if (errors.length) {
    console.log('▶ errors:');
    errors.forEach((e) => console.log('  ', e));
  } else {
    console.log('▶ no console errors');
  }

  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
