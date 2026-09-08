/**
 * XSS sanitiser for rendered Markdown HTML.
 *
 * Ported from club-web `frontend/src/utils/markdownSecurity.ts` (origin/main @ 4775e46)
 * with three hardenings:
 *   1. dangerous tag list extended with style/meta/link/noscript/template
 *   2. `target="_blank"` links are forced to carry rel="noopener noreferrer"
 *   3. explicit srcset/formaction/xlink coverage
 *
 * Deliberately NOT relaxed: `data:image/svg+xml` stays rejected. Inline SVG is a
 * well-known script carrier (`<script>`, `onload=`) and allowing it would be a
 * regression against the club-web baseline.
 */

const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'form',
  'style',
  'meta',
  'link',
  'noscript',
  'template'
] as const;

const URL_ATTRS = new Set([
  'href',
  'src',
  'srcset',
  'xlink:href',
  'poster',
  'action',
  'formaction',
  'background',
  'data'
]);

/** https / http / mailto / tel / root-relative / anchor / dot-relative / raster data URL / blob */
const SAFE_URL_PATTERN =
  /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/|blob:|data:image\/(?:png|jpe?g|gif|webp);)/i;

/** Control characters and whitespace used to smuggle `java\nscript:` past naive checks. */
const CONTROL_CHARS = new RegExp('[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]', 'g');

function isSafeUrl(value: string): boolean {
  if (!value) return false;
  const normalized = value.replace(CONTROL_CHARS, '');
  return SAFE_URL_PATTERN.test(normalized);
}

/** Every candidate in a srcset must be safe, otherwise the attribute is dropped. */
function isSafeSrcset(value: string): boolean {
  const candidates = value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates.length > 0 && candidates.every((candidate) => isSafeUrl(candidate));
}

export function sanitizeRenderedMarkdown(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html || '';

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const body = parsed.body;

  // Pass 1 — drop dangerous elements outright.
  body.querySelectorAll(DANGEROUS_TAGS.join(',')).forEach((element) => {
    element.remove();
  });

  // Pass 2 — scrub attributes on everything that survived.
  body.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      // Inline event handlers, in any casing.
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }

      // `javascript:` hidden behind an unusual attribute name.
      if (/^(?:xlink:)?href$/.test(name) && /^javascript:/i.test(value.replace(CONTROL_CHARS, ''))) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (!URL_ATTRS.has(name) || !value) return;

      const safe = name === 'srcset' ? isSafeSrcset(value) : isSafeUrl(value);
      if (!safe) element.removeAttribute(attribute.name);
    });

    // Pass 3 — tab-nabbing protection for links that open a new browsing context.
    if (element.tagName.toLowerCase() === 'a') {
      const target = (element.getAttribute('target') || '').toLowerCase();
      if (target === '_blank') {
        const rel = new Set(
          (element.getAttribute('rel') || '')
            .split(/\s+/)
            .map((token) => token.toLowerCase())
            .filter(Boolean)
        );
        rel.add('noopener');
        rel.add('noreferrer');
        element.setAttribute('rel', Array.from(rel).join(' '));
      }
    }
  });

  return body.innerHTML;
}
