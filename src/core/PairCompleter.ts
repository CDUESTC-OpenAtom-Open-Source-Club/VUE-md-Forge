/**
 * PairCompleter — character auto-pairing for the editor.
 *
 * Implemented via `beforeinput` (not execCommand) so it works on every
 * modern browser without `document.execCommand` deprecation warnings.
 *
 * Three independent behaviours:
 *   1. `handleOpenChar` — typing an opening char inserts the pair and
 *      places the caret between them
 *   2. `handleSkipOver`  — when the caret sits immediately before the
 *      matching close char, pressing the close char skips over instead
 *      of doubling
 *   3. `handleBackspace` — backspace inside an empty pair removes both
 *      sides in one keystroke
 *
 * The static PAIRS table is the *whole* contract: anything not in the
 * table is forwarded untouched to the native editor.
 */

export type PairTable = Record<string, string>;

export const PAIRS: PairTable = {
  // ── ASCII ──
  // 同字符配对 (markdown 标记 / smart quote)
  '"': '"',
  "'": "'",
  '`': '`',
  '*': '*',
  '_': '_',
  '~': '~',
  // 异字符配对
  '(': ')',
  '[': ']',
  '{': '}',
  // ── 中文 ──
  // 中文弯引号 (U+201C/D, U+2018/9) —— 注意 opening ≠ closing,
  // 不是 ASCII `"`/`'`, 需要单独列
  '“': '”', // " "
  '‘': '’', // ' '
  // 中文全角括号 —— 用户列出
  '（': '）', // （ ）
  '【': '】', // 【 】
  '《': '》', // 《 》
  // 中文方头 / 双引号（繁体 / 日文常用）
  '「': '」', // 「 」
  '『': '』', // 『 』
  // 中文尖括号 / 六角括号（冷门但偶尔出现）
  '〈': '〉', // 〈 〉
  '〖': '〗'  // 〖 〗
};

const TRIO_PAIR = new Set(['"', "'", '`']);
/** Inside a fenced ``` or inline code, the only pair that still works is `)`. */
const CODE_BLOCK_HINT = /```/;

export interface PairContext {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface PairResult {
  /** New value. */
  value: string;
  /** New caret position. */
  caret: number;
  /** When true, the caller should skip the native input handling. */
  preventDefault: boolean;
}

export class PairCompleter {
  constructor(private readonly pairs: PairTable = PAIRS) {}

  /**
   * Single dispatch — given a `beforeinput`-style payload, decide what
   * to do. `inputType` is one of the standard `InputEvent` values.
   *
   * Decision order matters:
   *   1. closing-char skip-over (e.g. user typed `)` with caret before a `)`)
   *      must be checked BEFORE the generic opening-char insert. The earlier
   *      order let `handleOpenChar` swallow all single-char inputs and return
   *      the value unchanged for any closing char (since PAIRS["]"] is
   *      undefined), making `handleSkipOver` dead code — every "type `)` to
   *      step out of an empty pair" silently fell through to the browser's
   *      native insert and produced `()`→`())`.
   *   2. opening-char insert (single char in PAIRS as a key)
   *   3. backspace
   */
  process(inputType: string, data: string | null, ctx: PairContext): PairResult {
    if (inputType === 'insertText' && data && data.length === 1) {
      // Closing char (the caret sits before a matching close char and the
      // user typed it again) wins over the generic opening insert.
      if (this.isCloseChar(data)) {
        const skip = this.handleSkipOver(data, ctx);
        if (skip.preventDefault) return skip;
      }
      // Opening char: insert both halves and park the caret in the middle.
      return this.handleOpenChar(data, ctx);
    }
    if (inputType === 'deleteContentBackward') {
      return this.handleBackspace(ctx);
    }
    return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };
  }

  /** Opening char or pair character — write both halves and park the caret. */
  handleOpenChar(char: string, ctx: PairContext): PairResult {
    const open = this.pairs[char];
    if (!open) return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };

    // Smart quote: if the same char already appears just before the caret
    // and we're typing the closing one, just skip over.
    if (TRIO_PAIR.has(char) && ctx.value[ctx.selectionStart] === char) {
      return {
        value: ctx.value,
        caret: ctx.selectionStart + 1,
        preventDefault: true
      };
    }

    const before = ctx.value.slice(0, ctx.selectionStart);
    const after = ctx.value.slice(ctx.selectionEnd);
    const inserted = `${char}${open}`;
    const value = `${before}${inserted}${after}`;
    return { value, caret: before.length + 1, preventDefault: true };
  }

  /** Caret is just before a matching close char — move the caret past it. */
  handleSkipOver(char: string, ctx: PairContext): PairResult {
    if (ctx.value[ctx.selectionStart] !== char) {
      return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };
    }
    // Only skip when there is *no* selection; the user is just walking past.
    if (ctx.selectionStart !== ctx.selectionEnd) {
      return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };
    }
    // Don't skip if we'd walk out of a fenced code block. Crude but effective.
    const before = ctx.value.slice(0, ctx.selectionStart);
    if (CODE_BLOCK_HINT.test(before) && !CODE_BLOCK_HINT.test(before.slice(0, -3))) {
      return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };
    }
    return { value: ctx.value, caret: ctx.selectionStart + 1, preventDefault: true };
  }

  /** Caret is between an empty pair (`()`) — remove both halves. */
  handleBackspace(ctx: PairContext): PairResult {
    if (ctx.selectionStart !== ctx.selectionEnd) {
      return { value: ctx.value, caret: ctx.selectionStart, preventDefault: false };
    }
    const caret = ctx.selectionStart;
    if (caret === 0) return { value: ctx.value, caret, preventDefault: false };
    const left = ctx.value[caret - 1];
    const right = ctx.value[caret];
    if (this.pairs[left] === right) {
      const value = ctx.value.slice(0, caret - 1) + ctx.value.slice(caret + 1);
      return { value, caret: caret - 1, preventDefault: true };
    }
    return { value: ctx.value, caret, preventDefault: false };
  }

  private isCloseChar(char: string): boolean {
    return Object.values(this.pairs).includes(char);
  }
}
