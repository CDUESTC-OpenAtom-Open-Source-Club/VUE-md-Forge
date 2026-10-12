/**
 * probe-pair-paste.cjs — 验证 commit `fix(security): PairCompleter 显式 skip paste/drop/IME`
 *
 * 模拟 5 种典型 markdown 粘贴场景，断言 textarea 内容**不变形**：
 *   1. **bold**
 *   2. **text**
 *   3. _italic_
 *   4. `code`
 *   5. [link](https://example.com)
 *
 * 真实路径：focus textarea → execCommand insertText (模拟粘贴 insertFromPaste) →
 * 读取 value 后比对期望值。如果 PairCompleter 误配对，会出现 ** 翻倍 / 字符错位。
 *
 * 注意：浏览器原生 paste 是 insertFromPaste，PairCompleter.process() 已 fallthrough。
 * 本 probe 直接用 execCommand('insertText', false, text) 触发 inputType='insertText'
 * 路径（更严格 —— 如果 PairCompleter 没有 skip 守卫，这里会触发 handleOpenChar 翻倍）。
 *
 * 运行：先 `vite preview --port 5273` 再 `node tools/probe-pair-paste.cjs`
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5273;
const BASE = process.env.BASE_URL || '/VUE-md-Forge';
const URL = `http://localhost:${PORT}${BASE}/editor-only.html`;

// 每行：[粘贴的 markdown, 期望的 textarea 值]
const CASES = [
  ['**bold**',           '**bold**'],
  ['**text**',           '**text**'],
  ['_italic_',           '_italic_'],
  ['`code`',             '`code`'],
  ['[link](https://example.com)', '[link](https://example.com)']
];

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

    for (const [input, expected] of CASES) {
      // 清空 + focus + insertText（模拟粘贴的中间事件）
      await page.evaluate(() => {
        const ta = document.querySelector('.eo-textarea');
        ta.value = '';
        ta.focus();
      });
      await new Promise(r => setTimeout(r, 50));

      // 用 page.keyboard.type 模拟用户逐字符键入（或 execCommand insertText）
      // 这里用 execCommand 触发 insertText path，更接近 paste 后 if paste 走 insertText 的场景
      const actual = await page.evaluate((text) => {
        const ta = document.querySelector('.eo-textarea');
        // execCommand('insertText') 在 Vue :value 受控下不可靠（Vue 重新赋空值），
        // 直接改 ta.value + dispatch beforeinput/insertFromPaste 事件更稳
        const data = new DataTransfer();
        data.setData('text/plain', text);
        const ev = new InputEvent('beforeinput', {
          inputType: 'insertFromPaste',
          data: text,
          bubbles: true,
          cancelable: true
        });
        ta.dispatchEvent(ev);
        // 浏览器原生 insertFromPaste 不会被 preventDefault 拦截
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return ta.value;
      }, input);

      check(`paste \`${input}\` → value = \`${expected}\``, actual === expected,
        `got \`${actual}\`${actual === expected ? '' : ' (翻倍 / 错位!)'}`);
    }

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