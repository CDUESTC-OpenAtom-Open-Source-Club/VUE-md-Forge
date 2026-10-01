/**
 * MarkdownEngine — markdown-it wrapper with local highlight.js + KaTeX + auto sanitisation.
 *
 * Why local? Club-web's main branch currently disables `highlight` and `katex`
 * (no-highlight / no-katex) to avoid the unpkg CDN reachability the CSP report
 * flags. Bundling them as npm deps means zero remote loads and zero `unsafe-eval`.
 */

import MarkdownIt from 'markdown-it';
// `@vscode/markdown-it-katex` is the maintained fork; the original
// `markdown-it-katex` ^3 is unmaintained and incompatible with markdown-it 14.
import katex from '@vscode/markdown-it-katex';
import 'katex/dist/katex.min.css';
// Local LaTeX-native delimiter plugin (`\(..\)` / `\[..\]`). Must register
// BEFORE `@vscode/markdown-it-katex` so we win the rule race; both emit
// `math_inline` / `math_block` tokens and share the upstream renderer.
import { katexDelimiters } from './markdownIt/katexDelimiters';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import sql from 'highlight.js/lib/languages/sql';
import { sanitizeRenderedMarkdown } from './MarkdownSecurity';

const REGISTERED = new Set<string>();
function ensureLanguage(name: string, definition: unknown): void {
  if (REGISTERED.has(name)) return;
  if (typeof definition !== 'function') {
    throw new Error(`hljs language '${name}' is not a function (got ${typeof definition})`);
  }
  hljs.registerLanguage(name, definition as never);
  REGISTERED.add(name);
}

let bootstrapped = false;
function bootstrapHighlight(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  ensureLanguage('javascript', javascript);
  ensureLanguage('typescript', typescript);
  ensureLanguage('python', python);
  ensureLanguage('bash', bash);
  ensureLanguage('xml', xml);
  ensureLanguage('html', xml);
  ensureLanguage('css', css);
  ensureLanguage('json', json);
  ensureLanguage('cpp', cpp);
  ensureLanguage('c', cpp);
  ensureLanguage('java', java);
  ensureLanguage('go', go);
  ensureLanguage('sql', sql);
}

export interface MarkdownEngineOptions {
  /** Apply XSS sanitisation on every render (default true). */
  sanitize?: boolean;
  /** Break on single linebreaks like GitHub does. */
  breaks?: boolean;
  /** Pre-rendered HTML hook for extra plugins. */
  html?: boolean;
}

export class MarkdownEngine {
  private readonly md: MarkdownIt;
  private readonly sanitize: boolean;

  constructor(options: MarkdownEngineOptions = {}) {
    bootstrapHighlight();
    this.sanitize = options.sanitize ?? true;
    this.md = new MarkdownIt({
      html: options.html ?? false,
      linkify: true,
      typographer: false,
      breaks: options.breaks ?? false,
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs"><code class="language-${lang}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
          } catch {
            /* fall through */
          }
        }
        return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
      }
    });
    this.md.use(katexDelimiters);
    this.md.use(katex);
    // Headings get auto-ids so anchor links work.
    this.md.use((md) => {
      const defaultRender = md.renderer.rules.heading_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
      md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const next = tokens[idx + 1];
        if (next && next.type === 'inline' && next.content) {
          const id = slugify(next.content);
          token.attrSet('id', id);
        }
        return defaultRender(tokens, idx, options, env, self);
      };
    });
  }

  render(markdown: string): string {
    const html = this.md.render(markdown || '');
    return this.sanitize ? sanitizeRenderedMarkdown(html) : html;
  }

  renderInline(markdown: string): string {
    const html = this.md.renderInline(markdown || '');
    return this.sanitize ? sanitizeRenderedMarkdown(html) : html;
  }

  /** Get the raw markdown-it instance for advanced customisation. */
  raw(): MarkdownIt {
    return this.md;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[一-龥]/g, (ch) => ch) // keep CJK as-is; browsers handle it
    .replace(/[^一-龥a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}
