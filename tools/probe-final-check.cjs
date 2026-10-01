/**
 * probe-final-check.cjs — 验证修复后:
 * 1. line-height 是否一致
 * 2. 暗色模式下是否还有"重叠渲染"
 * 3. 滚到底是否错位
 * 4. 行号间距与文本间距是否一致
 */
const puppeteer = require('puppeteer-core');
const PORT = process.env.PORT || 5277;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.eo-toolbar');
  await new Promise((r) => setTimeout(r, 800));

  // 测 line-height 一致性
  const lh = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    const overlay = document.querySelector('.eo-overlay');
    const gutter = document.querySelector('.eo-gutter');
    const taStyle = getComputedStyle(ta);
    const ovStyle = getComputedStyle(overlay);
    const gStyle = getComputedStyle(gutter);
    return {
      taLineH: taStyle.lineHeight,
      ovLineH: ovStyle.lineHeight,
      gutterLineH: gStyle.lineHeight,
      taFontSize: taStyle.fontSize,
      gutterFontSize: gStyle.fontSize,
      taPaddingTop: taStyle.paddingTop,
      gutterPaddingTop: gStyle.paddingTop
    };
  });
  console.log('=== light theme line-height check ===');
  console.log(JSON.stringify(lh, null, 2));

  // 测 light 顶部
  await page.screenshot({ path: 'report-screenshots/check-light-top.png', clip: { x: 0, y: 50, width: 800, height: 300 } });

  // 切到 dark 主题
  await page.evaluate(() => {
    const btn = document.querySelector('button[title*="当前主题"]');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  // 测 dark line-height 一致性
  const lhDark = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    const overlay = document.querySelector('.eo-overlay');
    const gutter = document.querySelector('.eo-gutter');
    const taStyle = getComputedStyle(ta);
    const ovStyle = getComputedStyle(overlay);
    const gStyle = getComputedStyle(gutter);
    return {
      taLineH: taStyle.lineHeight,
      ovLineH: ovStyle.lineHeight,
      gutterLineH: gStyle.lineHeight,
      taFontSize: taStyle.fontSize,
      gutterFontSize: gStyle.fontSize,
      taPaddingTop: taStyle.paddingTop,
      gutterPaddingTop: gStyle.paddingTop,
      taColor: taStyle.color,
      ovColor: ovStyle.color,
      theme: document.documentElement.getAttribute('data-mdf-theme') || 'root'
    };
  });
  console.log('=== dark theme line-height check ===');
  console.log(JSON.stringify(lhDark, null, 2));

  // 测 dark 顶部
  await page.screenshot({ path: 'report-screenshots/check-dark-top.png', clip: { x: 0, y: 50, width: 800, height: 300 } });

  // 测 dark 滚到底
  await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.scrollTop = ta.scrollHeight;
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: 'report-screenshots/check-dark-bottom.png', clip: { x: 0, y: 50, width: 800, height: 300 } });

  // 测行号位置 vs 文本位置 (dark)
  const align = await page.evaluate(() => {
    const overlay = document.querySelector('.eo-overlay');
    const gutter = document.querySelector('.eo-gutter');
    const ovText = overlay.textContent;
    // 测 overlay 第一行字符位置
    const r1 = document.createRange();
    r1.setStart(overlay.firstChild, 0);
    r1.setEnd(overlay.firstChild, 1);
    const line1Rect = r1.getBoundingClientRect();

    // 测 overlay 第三行字符位置
    let newlineCount = 0;
    let thirdLineOffset = 0;
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent;
        for (let k = 0; k < txt.length; k++) {
          if (txt[k] === '\n') {
            newlineCount++;
            if (newlineCount === 2) {
              thirdLineOffset = k + 1;
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of node.childNodes) walk(child);
      }
    };
    walk(overlay);
    let thirdLineNode = null, thirdLineCharIdx = 0;
    const findThird = (node) => {
      if (thirdLineNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        let remaining = thirdLineOffset;
        const txt = node.textContent;
        if (remaining < txt.length) {
          thirdLineNode = node;
          thirdLineCharIdx = remaining;
        } else {
          thirdLineOffset -= txt.length;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of node.childNodes) findThird(child);
      }
    };
    findThird(overlay);
    let line3Rect = null;
    if (thirdLineNode) {
      const r3 = document.createRange();
      r3.setStart(thirdLineNode, thirdLineCharIdx);
      r3.setEnd(thirdLineNode, thirdLineCharIdx + 1);
      line3Rect = r3.getBoundingClientRect();
    }

    // gutter 行号位置: 找数字 1 和 3
    const gLines = Array.from(gutter.children);
    return {
      ovLine1Top: line1Rect ? Math.round(line1Rect.top) : null,
      ovLine3Top: line3Rect ? Math.round(line3Rect.top) : null,
      gutterLine1Top: Math.round(gLines[0].getBoundingClientRect().top),
      gutterLine2Top: Math.round(gLines[1].getBoundingClientRect().top),
      gutterLine3Top: Math.round(gLines[2].getBoundingClientRect().top),
      gutterLine4Top: Math.round(gLines[3].getBoundingClientRect().top),
      diff1: line1Rect ? Math.round(line1Rect.top - gLines[0].getBoundingClientRect().top) : null,
      diff3: line3Rect ? Math.round(line3Rect.top - gLines[2].getBoundingClientRect().top) : null
    };
  });
  console.log('=== dark alignment check ===');
  console.log(JSON.stringify(align, null, 2));

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });