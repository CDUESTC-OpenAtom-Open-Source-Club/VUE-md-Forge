/**
 * DomActions — textarea-friendly DOM helpers.
 *
 * These operate on `<textarea>` (not contenteditable) so they're cheap:
 * pure string manipulation with a caret-jump back to the editor.
 */

export interface DomResult {
  value: string;
  caret: number;
  scrollTop: number;
}

export function wrapSelection(
  el: HTMLTextAreaElement,
  before: string,
  after: string = before,
  placeholder: string = ''
): DomResult {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end) || placeholder;
  const value = `${el.value.slice(0, start)}${before}${selected}${after}${el.value.slice(end)}`;
  const caret = start + before.length + selected.length;
  applyValueAndCaret(el, value, caret);
  return { value, caret, scrollTop: el.scrollTop };
}

export function toggleLinePrefix(el: HTMLTextAreaElement, prefix: string): DomResult {
  const { value, selectionStart, selectionEnd } = el;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionEnd);
  const realEnd = lineEnd === -1 ? value.length : lineEnd;
  const segment = value.slice(lineStart, realEnd);
  const allPrefixed = segment.split('\n').every((line) => line.startsWith(prefix));
  const next = allPrefixed
    ? segment.replace(new RegExp(`^${escapeRe(prefix)}`, 'gm'), '')
    : segment
        .split('\n')
        .map((line) => (line ? prefix + line : line))
        .join('\n');
  const out = `${value.slice(0, lineStart)}${next}${value.slice(realEnd)}`;
  const caret = lineStart + next.length;
  applyValueAndCaret(el, out, caret);
  return { value: out, caret, scrollTop: el.scrollTop };
}

export function insertText(el: HTMLTextAreaElement, text: string): DomResult {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
  const caret = start + text.length;
  applyValueAndCaret(el, value, caret);
  return { value, caret, scrollTop: el.scrollTop };
}

export function insertLink(el: HTMLTextAreaElement): DomResult {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end) || '链接文字';
  const url = window.prompt('请输入链接 URL', 'https://') || '';
  if (!url) return { value: el.value, caret: start, scrollTop: el.scrollTop };
  const text = `[${selected}](${url})`;
  const value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
  const caret = start + text.length;
  applyValueAndCaret(el, value, caret);
  return { value, caret, scrollTop: el.scrollTop };
}

export function insertImage(el: HTMLTextAreaElement): DomResult {
  const url = window.prompt('请输入图片 URL', 'https://') || '';
  if (!url) return { value: el.value, caret: el.selectionStart, scrollTop: el.scrollTop };
  const alt = window.prompt('请输入图片描述（可选）', '') || '图片';
  return insertText(el, `![${alt}](${url})`);
}

function applyValueAndCaret(el: HTMLTextAreaElement, value: string, caret: number): void {
  el.value = value;
  // Setting value blows away selection — reapply asynchronously.
  requestAnimationFrame(() => {
    el.setSelectionRange(caret, caret);
  });
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
