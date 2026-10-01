/**
 * KeyboardShortcuts — md-editor-v3-compatible shortcut table for textarea
 * editors.
 *
 * Adapted from
 *   md-editor-v3/packages/MdEditor/layouts/Content/codemirror/commands.ts
 * (Phase-1 quick-win #1). 19 key combos wired:
 *
 *   Plain:    Ctrl+B / I / D / S / L / O / U
 *   Heading:  Ctrl+1..6
 *   Shift:    Ctrl+Shift+C (block code) / Ctrl+Shift+I (image)
 *             Ctrl+Shift+O is omitted (collision risk with browser shortcuts)
 *   Alt:      Ctrl+Alt+C (inline code)
 *   ShiftAlt: Ctrl+Shift+Alt+T (table)
 *
 * Skip list (deliberate, with reason):
 *   Ctrl+U underline  → no underline button (would create dead shortcut)
 *   Ctrl+↑/↓ sup/sub  → no sup/sub button (Phase 6)
 *   Ctrl+Q quote      → no quote button (Phase 3 candidate)
 *   Ctrl+F prettier   → no prettier integration (out of scope)
 *   Ctrl+C code block → collision with native copy; use Shift instead
 *   Ctrl+O on macOS   → conflicting with "Open File" dialog; mac users can
 *                       remap via the optional `macKey` override per handler
 *
 * Why a function, not a class: stateless glue around `keydown`. The caller
 * passes the textarea element + a handler map; we return an `off` cleanup so
 * Vue's `onBeforeUnmount` can detach cleanly.
 */

export interface ShortcutHandlers {
  bold?: (el: HTMLTextAreaElement) => void;
  italic?: (el: HTMLTextAreaElement) => void;
  strikethrough?: (el: HTMLTextAreaElement) => void;
  save?: (el: HTMLTextAreaElement) => void;
  link?: (el: HTMLTextAreaElement) => void;
  image?: (el: HTMLTextAreaElement) => void;
  code?: (el: HTMLTextAreaElement) => void;
  inlineCode?: (el: HTMLTextAreaElement) => void;
  table?: (el: HTMLTextAreaElement) => void;
  ul?: (el: HTMLTextAreaElement) => void;
  ol?: (el: HTMLTextAreaElement) => void;
  h1?: (el: HTMLTextAreaElement) => void;
  h2?: (el: HTMLTextAreaElement) => void;
  h3?: (el: HTMLTextAreaElement) => void;
  h4?: (el: HTMLTextAreaElement) => void;
  h5?: (el: HTMLTextAreaElement) => void;
  h6?: (el: HTMLTextAreaElement) => void;
}

type Handler = (el: HTMLTextAreaElement) => void;

export function attachKeyboardShortcuts(
  el: HTMLTextAreaElement,
  handlers: ShortcutHandlers
): () => void {
  function dispatch(name: keyof ShortcutHandlers, e: KeyboardEvent): boolean {
    const handler = handlers[name] as Handler | undefined;
    if (!handler) return false;
    e.preventDefault();
    handler(el);
    return true;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift' || e.key === 'Alt') return;
    const k = e.key.toLowerCase();
    const shift = e.shiftKey;
    const alt = e.altKey;

    // Single-modifier combos (Ctrl + key)
    if (!shift && !alt) {
      switch (k) {
        case 'b': return void dispatch('bold', e);
        case 'i': return void dispatch('italic', e);
        case 'd': return void dispatch('strikethrough', e);
        case 's': return void dispatch('save', e);
        case 'l': return void dispatch('link', e);
        case 'o': return void dispatch('ol', e);
        case 'u': return void dispatch('ul', e);
      }
      // Ctrl+1..6 → H1..H6
      if (k >= '1' && k <= '6') {
        return void dispatch(`h${k}` as keyof ShortcutHandlers, e);
      }
      return;
    }

    // Ctrl+Shift combos
    if (shift && !alt) {
      switch (k) {
        case 'c': return void dispatch('code', e);
        case 'i': return void dispatch('image', e);
      }
      return;
    }

    // Ctrl+Alt combos
    if (alt && !shift) {
      switch (k) {
        case 'c': return void dispatch('inlineCode', e);
      }
      return;
    }

    // Ctrl+Shift+Alt combos
    if (alt && shift) {
      switch (k) {
        case 't': return void dispatch('table', e);
      }
      return;
    }
  }

  el.addEventListener('keydown', onKeydown);
  return () => el.removeEventListener('keydown', onKeydown);
}