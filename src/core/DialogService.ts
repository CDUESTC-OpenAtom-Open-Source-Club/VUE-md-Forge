/**
 * DialogService — modal confirm / prompt dialogs with a Vue render target.
 *
 * Per user spec (v0.3.0):
 *   - Two APIs only: `confirm()` + `prompt()`. No provide/inject, no stack.
 *   - Communication via a single reactive `current` state that a host-side
 *     `<AppDialog>` component renders.
 *   - Single dialog at a time (queue = single).
 *
 * Keyboard (handled by AppDialog, not here): ESC = cancel, Enter on confirm
 * dialog = confirm, Enter in prompt input = submit.
 *
 * Styling (handled by AppDialog): typora-light/dark aware via mdf-* CSS
 * variables.
 *
 * v0.4+ candidates (NOT in v0.3.0 scope): provide/inject composable,
 * stack of multiple dialogs, slot-based custom body, full keyboard focus
 * trap. See PLAN 「Phase 2 Dialog 引擎」.
 */

import { reactive } from 'vue';

export type DialogKind = 'confirm' | 'prompt';
export type DialogTone = 'info' | 'warn' | 'danger';

export interface DialogOptions {
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
}

export interface PromptOptions extends DialogOptions {
  defaultValue?: string;
  placeholder?: string;
}

interface BaseDialog {
  id: number;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: DialogTone;
  resolve: (v: unknown) => void;
}

interface ConfirmDialogState extends BaseDialog {
  kind: 'confirm';
}

interface PromptDialogState extends BaseDialog {
  kind: 'prompt';
  defaultValue: string;
  placeholder: string;
}

export type DialogState = ConfirmDialogState | PromptDialogState;

export interface DialogService {
  /** Show a confirm dialog. Returns true if the user confirms, false on cancel. */
  confirm(title: string, message: string, opts?: DialogOptions): Promise<boolean>;
  /** Show a prompt dialog. Returns the trimmed string, or null on cancel. */
  prompt(title: string, message: string, opts?: PromptOptions): Promise<string | null>;
  /** Reactive current dialog — read by `<AppDialog>`. */
  readonly current: DialogState | null;
  /** Internal — `<AppDialog>` calls this when a button is clicked / ESC. */
  close(result: boolean | string | null): void;
}

export function createDialogService(): DialogService {
  const state = reactive<{ current: DialogState | null }>({ current: null });
  let nextId = 1;

  return {
    confirm(title, message, opts = {}) {
      return new Promise<boolean>((resolve) => {
        state.current = {
          id: nextId++,
          kind: 'confirm',
          title,
          message,
          confirmText: opts.confirmText ?? '确定',
          cancelText: opts.cancelText ?? '取消',
          tone: opts.tone ?? 'info',
          resolve: resolve as (v: unknown) => void
        };
      });
    },
    prompt(title, message, opts = {}) {
      return new Promise<string | null>((resolve) => {
        state.current = {
          id: nextId++,
          kind: 'prompt',
          title,
          message,
          confirmText: opts.confirmText ?? '确定',
          cancelText: opts.cancelText ?? '取消',
          tone: opts.tone ?? 'info',
          defaultValue: opts.defaultValue ?? '',
          placeholder: opts.placeholder ?? '',
          resolve: resolve as (v: unknown) => void
        };
      });
    },
    get current() {
      return state.current;
    },
    close(result) {
      const d = state.current;
      if (!d) return;
      state.current = null;
      if (d.kind === 'confirm') {
        d.resolve(typeof result === 'boolean' ? result : false);
      } else {
        d.resolve(typeof result === 'string' ? result : null);
      }
    }
  };
}