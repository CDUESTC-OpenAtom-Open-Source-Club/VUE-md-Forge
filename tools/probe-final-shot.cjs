const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5278/preview.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  // 顶部 light 截图
  await page.screenshot({ path: 'report-screenshots/final-light-top.png', clip: { x: 0, y: 50, width: 800, height: 320 } });
  // 滚到中部（代码块）
  await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.scrollTop = 220;
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'report-screenshots/final-light-codeblock.png', clip: { x: 0, y: 50, width: 800, height: 320 } });
  // 切到 dark
  await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.scrollTop = 0;
    const btn = document.querySelector('button[title*="当前主题"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'report-screenshots/final-dark-top.png', clip: { x: 0, y: 50, width: 800, height: 320 } });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });