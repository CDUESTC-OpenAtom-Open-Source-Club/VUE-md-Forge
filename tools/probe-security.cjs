/**
 * probe-security.cjs — 验证 issue #6 修复 (v0.3.1):
 *   1. 默认 DANGEROUS_TAGS 必须包含 video/audio/source/track
 *   2. `<video>` / `<audio>` / `<source>` / `<track>` 经 sanitizeRenderedMarkdown 后被 strip
 *   3. 已存在的 script/iframe 等仍被 strip (无回归)
 *   4. dangerousTags: [] escape hatch 能关闭 pass 1
 *   5. dangerousTags: 自定义 list 能生效
 *
 * 把 MarkdownSecurity.ts 的核心贴到浏览器侧跑（DOMParser / 浏览器 API）。
 * 不依赖 npm test 框架。
 */
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 5273;

/** 浏览器侧运行的 sanitizer 副本（与 src/core/MarkdownSecurity.ts 同步维护） */
const SANITIZER_SRC = `
const DEFAULT_DANGEROUS_TAGS = [
  'script','iframe','object','embed','base','form',
  'style','meta','link','noscript','template',
  // issue #6: media tags
  'video','audio','source','track'
];
const URL_ATTRS = new Set(['href','src','srcset','xlink:href','poster','action','formaction','background','data']);
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|\\/|\\#|\\.\\/|\\.\\.\\/|blob:|data:image\\/(?:png|jpe?g|gif|webp);)/i;
const CONTROL_CHARS = /[\\u0000-\\u0020\\u00a0\\u1680\\u2000-\\u200f\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]/g;

function isSafeUrl(v) { if (!v) return false; return SAFE_URL_PATTERN.test(v.replace(CONTROL_CHARS, '')); }
function isSafeSrcset(v) {
  const cands = v.split(',').map(p => p.trim().split(/\\s+/)[0]).filter(Boolean);
  return cands.length > 0 && cands.every(isSafeUrl);
}
function sanitize(html, options) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const tags = options && options.dangerousTags !== undefined ? options.dangerousTags : DEFAULT_DANGEROUS_TAGS;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (tags.length > 0) bodySelector = null; // sentinel
  if (tags.length > 0) body.querySelectorAll(tags.join(',')).forEach(e => e.remove());
  body.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const n = attr.name.toLowerCase();
      const v = attr.value.trim();
      if (n.startsWith('on')) { el.removeAttribute(attr.name); return; }
      if (/^(?:xlink:)?href$/.test(n) && /^javascript:/i.test(v.replace(CONTROL_CHARS, ''))) { el.removeAttribute(attr.name); return; }
      if (!URL_ATTRS.has(n) || !v) return;
      const safe = n === 'srcset' ? isSafeSrcset(v) : isSafeUrl(v);
      if (!safe) el.removeAttribute(attr.name);
    });
    if (el.tagName.toLowerCase() === 'a') {
      const target = (el.getAttribute('target') || '').toLowerCase();
      if (target === '_blank') {
        const rel = new Set((el.getAttribute('rel') || '').split(/\\s+/).map(t => t.toLowerCase()).filter(Boolean));
        rel.add('noopener'); rel.add('noreferrer');
        el.setAttribute('rel', Array.from(rel).join(' '));
      }
    }
  });
  return body.innerHTML;
}
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));

  await page.setContent('<!doctype html><html><body><div id="out"></div></body></html>');
  await page.evaluate(SANITIZER_SRC);

  const cases = [
    {
      name: 'default list 包含 video/audio/source/track',
      run: () => {
        const tags = DEFAULT_DANGEROUS_TAGS;
        return ['video', 'audio', 'source', 'track'].every((t) => tags.includes(t));
      },
      expect: true
    },
    {
      name: 'default list 仍包含 script / iframe（无回归）',
      run: () => ['script', 'iframe', 'style', 'object'].every((t) => DEFAULT_DANGEROUS_TAGS.includes(t)),
      expect: true
    },
    {
      name: '<video src=... autoplay muted> 被 strip',
      run: () => !sanitize('<video src="https://x/track.mp4" autoplay muted></video>').includes('<video'),
      expect: true
    },
    {
      name: '<audio> 被 strip',
      run: () => !sanitize('<audio src="https://x/a.mp3"></audio>').includes('<audio'),
      expect: true
    },
    {
      name: '<source> 嵌套在 <picture> 里被 strip',
      run: () => !sanitize('<picture><source srcset="https://x/a.webp"></picture>').includes('<source'),
      expect: true
    },
    {
      name: '<track> 被 strip',
      run: () => !sanitize('<video><track src="https://x/cap.vtt"></video>').includes('<track'),
      expect: true
    },
    {
      name: '<script>alert(1)</script> 仍被 strip',
      run: () => !sanitize('<p>before</p><script>alert(1)</script><p>after</p>').includes('<script'),
      expect: true
    },
    {
      name: 'dangerousTags: [] 关掉 pass 1 — <video> 不再被 strip（escape hatch）',
      run: () => sanitize('<video src="https://x/a.mp4"></video>', { dangerousTags: [] }).includes('<video'),
      expect: true
    },
    {
      name: 'dangerousTags: 自定义 list 只 strip 提供的 tag（video 白名单场景）',
      run: () => {
        const out = sanitize('<video src="https://x/a.mp4"></video><iframe src="https://y"></iframe>', { dangerousTags: ['iframe'] });
        return out.includes('<video') && !out.includes('<iframe');
      },
      expect: true
    },
    {
      name: '空字符串输入返回空字符串',
      run: () => sanitize('') === '',
      expect: true
    },
    {
      name: 'inline event on* 仍被 strip（无回归）',
      run: () => !sanitize('<img src="https://x/a.png" onerror="alert(1)">').includes('onerror'),
      expect: true
    },
    {
      name: 'javascript: href 仍被 strip（无回归）',
      run: () => !sanitize('<a href="javascript:alert(1)">x</a>').includes('javascript:'),
      expect: true
    },
    {
      name: '_blank target 仍被强制 noopener noreferrer（无回归）',
      run: () => {
        const out = sanitize('<a href="https://x/" target="_blank">x</a>');
        const m = out.match(/<a[^>]*>/);
        return m && /rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(m[0]);
      },
      expect: true
    }
  ];

  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    let actual;
    try {
      actual = await page.evaluate(c.run);
    } catch (e) {
      actual = `threw: ${e.message}`;
    }
    const ok = actual === c.expect;
    console.log(`${ok ? '✓' : '✗'} ${c.name}`);
    console.log(`    expect: ${JSON.stringify(c.expect)}, got: ${JSON.stringify(actual)}`);
    if (ok) pass++;
    else fail++;
  }

  await browser.close();
  console.log(`\n=== ${pass} passed, ${fail} failed (${pass + fail} total) ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
