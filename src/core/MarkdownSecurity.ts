/**
 * XSS sanitiser for rendered Markdown HTML.
 *
 * Ported from club-web `frontend/src/utils/markdownSecurity.ts` (origin/main @ 4775e46)
 * with three hardenings:
 *   1. dangerous tag list extended with style/meta/link/noscript/template
 *   2. `target="_blank"` links are forced to carry rel="noopener noreferrer"
 *   3. explicit srcset/formaction/xlink coverage
 *
 * v0.3.1 hardening (issue #6): media tags (`video` / `audio` / `source` /
 * `track`) added to the default block list. With the engine default
 * `html: false` this is unreachable, but for hosts that opt-in to raw
 * HTML rendering a `<video src="..." autoplay muted>` would otherwise
 * survive sanitisation and act as a third-party tracking beacon /
 * unwanted bandwidth consumer. The list is exposed via
 * {@link MarkdownSecurityOptions.dangerousTags} so advanced consumers
 * can override (e.g. whitelist `video` for a controlled video-hosting
 * use case).
 *
 * Deliberately NOT relaxed: `data:image/svg+xml` stays rejected. Inline SVG is a
 * well-known script carrier (`<script>`, `onload=`) and allowing it would be a
 * regression against the club-web baseline.
 */

const DEFAULT_DANGEROUS_TAGS = [
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
  'template',
  // issue #6: strip media tags so `<video>` / `<audio>` (and their
  // `<source>` / `<track>` children) cannot autoplay + beacon through
  // raw-HTML rendering.
  'video',
  'audio',
  'source',
  'track'
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
  /^(https?:|mailto:|tel:|\/|\#|\.\/|\.\.\/|blob:|data:image\/(?:png|jpe?g|gif|webp);)/i;

/** Control characters and whitespace used to smuggle `java\nscript:` past naive checks. */
const CONTROL_CHARS = /[\u0000- \u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

export interface MarkdownSecurityOptions {
  /**
   * Override the dangerous-tag block list used in pass 1 (element strip).
   *
   * - Omit / leave undefined → use {@link DEFAULT_DANGEROUS_TAGS}.
   * - Pass an explicit array → that list is used verbatim. Use this to
   *   *narrow* the block list (e.g. omit `video` to whitelist media) or
   *   *extend* it (e.g. add a custom element type).
   * - Pass an empty array → skip the element-strip pass entirely (use
   *   with care; the attribute pass still runs).
   *
   * Read-only arrays of strings are accepted.
   */
  dangerousTags?: readonly string[];
}

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

export function sanitizeRenderedMarkdown(
  html: string,
  options?: MarkdownSecurityOptions
): string {
  if (!html || typeof DOMParser === 'undefined') return html || '';

  const dangerousTags = options?.dangerousTags ?? DEFAULT_DANGEROUS_TAGS;

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const body = parsed.body;

  // Pass 1 — drop dangerous elements outright (skipped when caller passes []).
  if (dangerousTags.length > 0) {
    body.querySelectorAll(dangerousTags.join(',')).forEach((element) => {
      element.remove();
    });
  }

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

export { DEFAULT_DANGEROUS_TAGS };
