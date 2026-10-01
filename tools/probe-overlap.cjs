/**
 * probe-overlap.cjs — 直接测 overlay 内每行字符 vs gutter 每行行号的实际 top
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

  await page.screenshot({ path: 'report-screenshots/fix-line-h-22.png', clip: { x: 0, y: 50, width: 800, height: 350 } });

  const data = await page.evaluate(() => {
    const overlay = document.querySelector('.eo-overlay');
    const gutter = document.querySelector('.eo-gutter');
    overlay.scrollTop = 0; gutter.scrollTop = 0;

    // 找 overlay 内每个文本行的第一个字符位置
    const ovLines = [];
    let lineIdx = 0;
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.length > 0 && lineIdx < 30) {
          const r = document.createRange();
          r.setStart(node, 0);
          r.setEnd(node, 1);
          const rect = r.getBoundingClientRect();
          // 只记录每行第一次出现
          if (ovLines.length === 0 || ovLines[ovLines.length - 1].lineIdx !== lineIdx) {
            ovLines.push({ lineIdx, top: Math.round(rect.top * 100) / 100 });
          }
          lineIdx++;
          // 跳过剩余字符, 直到换行符
          for (let k = 0; k < node.textContent.length; k++) {
            if (node.textContent[k] === '\n') {
              // 不要提前 break, 因为可能有连续 \n
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of node.childNodes) walk(child);
        // BR 后面 lineIdx 也要增加
        if (node.tagName === 'BR') lineIdx++;
      }
    };
    walk(overlay);

    const gLines = [];
    for (let i = 0; i < Math.min(30, gutter.children.length); i++) {
      gLines.push({ lineIdx: i, top: Math.round(gutter.children[i].getBoundingClientRect().top * 100) / 100 });
    }

    // 计算每个 line 的差值
    const diffs = [];
    for (let i = 0; i < Math.min(30, ovLines.length, gLines.length); i++) {
      diffs.push({
        line: i + 1,
        ovTop: ovLines[i].top,
        gTop: gLines[i].top,
        diff: Math.round((ovLines[i].top - gLines[i].top) * 100) / 100
      });
    }

    // 测 line-height
    const ovCs = getComputedStyle(overlay);
    const gCs = getComputedStyle(gutter);

    return {
      overlayLineHeight: ovCs.lineHeight,
      gutterLineHeight: gCs.lineHeight,
      overlayFontSize: ovCs.fontSize,
      gutterFontSize: gCs.fontSize,
      diffs
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });