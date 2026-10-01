// probe-pair-cn-real.cjs — 真实 input event 模拟, 验证浏览器中文配对
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto('http://localhost:5278/preview.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  // 测试 1: 中文 （ 输入 → 自动补 ） caret 在中间
  const r1 = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.focus();
    ta.value = '';
    ta.setSelectionRange(0, 0);
    const ev = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: '（'
    });
    ta.dispatchEvent(ev);
    return { value: ta.value, caret: ta.selectionStart, prevented: ev.defaultPrevented };
  });
  console.log('Test1 中文（ → 自动补 ）:', JSON.stringify(r1));

  // 测试 2: 中文” skip over
  const r2 = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.focus();
    ta.value = '（）';
    ta.setSelectionRange(1, 1);
    const ev = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: '）'
    });
    ta.dispatchEvent(ev);
    return { value: ta.value, caret: ta.selectionStart, prevented: ev.defaultPrevented };
  });
  console.log('Test2 中文） skip over:', JSON.stringify(r2));

  // 测试 3: 中文” skip over
  const r3 = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.focus();
    ta.value = '“”';
    ta.setSelectionRange(1, 1);
    const ev = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: '”'
    });
    ta.dispatchEvent(ev);
    return { value: ta.value, caret: ta.selectionStart, prevented: ev.defaultPrevented };
  });
  console.log('Test3 中文” skip over:', JSON.stringify(r3));

  // 测试 4: 中文《》 backspace
  const r4 = await page.evaluate(() => {
    const ta = document.querySelector('.eo-textarea');
    ta.focus();
    ta.value = '《》';
    ta.setSelectionRange(1, 1);
    const ev = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'deleteContentBackward'
    });
    ta.dispatchEvent(ev);
    return { value: ta.value, caret: ta.selectionStart, prevented: ev.defaultPrevented };
  });
  console.log('Test4 中文《》 backspace 删除一对:', JSON.stringify(r4));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });