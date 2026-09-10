/**
 * markdown-it plugin: add LaTeX-native math delimiters `\(...\)` (inline) and
 * `\[...\]` (block) on top of the @vscode/markdown-it-katex defaults `$...$`
 * / `$$...$$`.
 *
 * Strategy: register inline + block rules that match the LaTeX-style
 * delimiters and emit the same token types (`math_inline` / `math_block`) so
 * the existing KaTeX renderer takes over without duplication.
 *
 * Behaviour parity with the upstream rules:
 *   - Inline `\(...\)` is non-greedy; trailing `\)` wins.
 *   - `\\(` and `\\)` are treated as escaped (won't open / close).
 *   - Block `\[...\]` works single-line (`\[ x \]`) and multi-line.
 *   - Inside fenced code blocks and inline code, the block / inline rulers do
 *     not run, so the backslash-backet sequences are left as-is (no false
 *     positives).
 *
 * Added in optimisation Phase 1 — quick-win #4 (md-editor-v3 借鉴).
 */

import type MarkdownIt from 'markdown-it';
// `StateBlock` / `StateInline` live in the `@types/markdown-it` bundle under
// the `MarkdownIt` namespace. With `esModuleInterop`, the namespace merge is
// not always visible to consumers; pulling the types via the dynamic-import
// `import('module').Type` syntax sidesteps that and keeps the import
// type-only (no runtime cost).
type StateBlock = import('markdown-it').StateBlock;
type StateInline = import('markdown-it').StateInline;

const INLINE_OPEN = '\\(';
const INLINE_CLOSE = '\\)';
const BLOCK_OPEN = '\\[';
const BLOCK_CLOSE = '\\]';

/**
 * Inline rule matching `\(...\)`. Emits `math_inline` tokens; the existing
 * @vscode/markdown-it-katex renderer (`math_inline` → `katex.renderToString`
 * with `displayMode = false`) handles rendering.
 */
function inlineMathParen(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== INLINE_OPEN) return false;

  // Find next unescaped `\)`. Walk past `\\)` and `\))` style escapes.
  let pos = start + 2;
  let matchEnd = -1;
  while (true) {
    const idx = state.src.indexOf(INLINE_CLOSE, pos);
    if (idx === -1) break;
    // Count consecutive backslashes immediately before the close marker.
    let esc = 0;
    let p = idx - 1;
    while (p >= 0 && state.src[p] === '\\') {
      esc++;
      p--;
    }
    if (esc % 2 === 0) {
      matchEnd = idx;
      break;
    }
    pos = idx + 1;
  }

  // No closing delimiter found: treat the opener as literal text and continue.
  if (matchEnd === -1) {
    if (!silent) state.pending += INLINE_OPEN;
    state.pos = start + 2;
    return true;
  }

  // Reject empty content (`\(\)`).
  if (matchEnd === start + 2) {
    if (!silent) state.pending += INLINE_OPEN + INLINE_CLOSE;
    state.pos = matchEnd + 2;
    return true;
  }

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = INLINE_OPEN;
    token.content = state.src.slice(start + 2, matchEnd);
  }
  state.pos = matchEnd + 2;
  return true;
}

/**
 * Block rule matching `\[...\]`. Emits `math_block` tokens; the existing
 * @vscode/markdown-it-katex renderer (`math_block` → `katex.renderToString`
 * with `displayMode = true`) handles rendering.
 */
function blockMathBracket(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const maxPos = state.eMarks[startLine];
  const lineText = state.src.slice(startPos, maxPos);

  if (!lineText.startsWith(BLOCK_OPEN)) return false;
  // After `\[` there must be either EOL or whitespace — otherwise it's a
  // LaTeX optional-arg token like `\[[opt]` in some macros.
  if (lineText.length > 2 && !/^\s/.test(lineText[2])) return false;

  // Single-line form: `\[ E = mc^2 \]`.
  if (lineText.trimEnd().endsWith(BLOCK_CLOSE)) {
    const trimmed = lineText.trimEnd();
    const inner = trimmed.slice(2, trimmed.length - 2).trim();
    if (!silent) {
      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = inner;
      token.markup = BLOCK_OPEN;
      token.map = [startLine, startLine + 1];
    }
    state.line = startLine + 1;
    return true;
  }

  // Multi-line form: lines after `\[` until a line that's just `\]`.
  let nextLine = startLine;
  let contentLines: string[] = [];
  let foundEnd = false;
  for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
    const lpos = state.bMarks[nextLine] + state.tShift[nextLine];
    const lmax = state.eMarks[nextLine];
    const ltext = state.src.slice(lpos, lmax);
    if (ltext.trim() === BLOCK_CLOSE) {
      foundEnd = true;
      nextLine++; // consume the closing line
      break;
    }
    contentLines.push(ltext);
  }

  if (!foundEnd) return false;

  const content = contentLines.join('\n').replace(/^\s*\n/, '').replace(/\n\s*$/, '');
  if (!silent) {
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = content;
    token.markup = BLOCK_OPEN;
    token.map = [startLine, nextLine];
  }
  state.line = nextLine;
  return true;
}

/**
 * Plugin entry point. Call this BEFORE the @vscode/markdown-it-katex plugin:
 * the ruler position is `after('escape')` for inline and `after('blockquote')`
 * for block, both registering earlier than the upstream `math_inline` /
 * `math_block` rules — so we win the race for `\(..\)` / `\[..\]` without
 * breaking `$..$` / `$$..$$`.
 */
export function katexDelimiters(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'katex_inline_paren', inlineMathParen);
  md.block.ruler.after('blockquote', 'katex_block_paren', blockMathBracket, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  });
}