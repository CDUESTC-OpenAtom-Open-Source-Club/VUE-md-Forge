/**
 * probe-overlay-all-samples.cjs — 跑遍所有 5 个示例, 报告 overlay vs textarea 字符差异
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5274;
const SAMPLES = ['欢迎示例', 'Shell & 命令', '数学 / KaTeX', '代码对照', '安全净化对照'];

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

  const results = [];
  for (const name of SAMPLES) {
    await page.evaluate((n) => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.trim() === n
      );
      if (btn) btn.click();
    }, name);
    await new Promise((r) => setTimeout(r, 600));
    const data = await page.evaluate(() => {
      const ta = document.querySelector('.eo-textarea');
      const ov = document.querySelector('.eo-overlay');
      return {
        taLen: ta ? ta.value.length : -1,
        ovLen: ov ? ov.textContent.length : -1,
        taEndsNL: ta ? ta.value.endsWith('\n') : false,
        ovEndsNL: ov ? ov.textContent.endsWith('\n') : false,
        ovEndsNLNL: ov ? ov.textContent.endsWith('\n\n') : false,
        ovLast5: ov ? ov.textContent.slice(-5) : '',
        taLast5: ta ? ta.value.slice(-5) : ''
      };
    });
    results.push({ name, ...data });
  }

  console.log('| 示例 | taLen | ovLen | diff | ta末尾\\n | ov末尾\\n\\n |');
  console.log('|------|-------|-------|------|-----------|-----------|');
  for (const r of results) {
    const diff = r.ovLen - r.taLen;
    const flag = diff !== 0 ? ' ✗' : ' ✓';
    console.log(`| ${r.name} | ${r.taLen} | ${r.ovLen} | ${diff}${flag} | ${r.taEndsNL} | ${r.ovEndsNLNL} |`);
    if (diff !== 0) {
      console.log(`   textarea.last5=${JSON.stringify(r.taLast5)}`);
      console.log(`   overlay.last5=${JSON.stringify(r.ovLast5)}`);
    }
  }

  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});