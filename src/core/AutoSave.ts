/**
 * AutoSave — dual-strategy auto-save state machine.
 *
 * Two failure modes need to be hedged against independently:
 *   - user types fast and then closes the tab inside the debounce window
 *   - user stops typing for a while but the debounce timer never fires
 *     (e.g. browser throttles background tabs)
 *
 * So we run both:
 *   1. 10s debounce on every change
 *   2. 30s interval that re-emits if the content is still dirty
 *
 * Status state machine: idle -> saving -> saved -> idle (after 3s)
 *                                     \-> error -> idle
 */

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions {
  debounceMs?: number;
  intervalMs?: number;
  /** How long the "saved" indicator stays visible before reverting to idle. */
  savedVisibleMs?: number;
  /** Provide the source of truth (current value). */
  getValue: () => string;
  /** Persist the snapshot. Throw to land in the `error` state. */
  persist: (value: string) => Promise<void>;
  /** Status transition hook — UI shows different spinners / colours. */
  onStatus?: (status: AutoSaveStatus) => void;
  /** Called when the state machine detects the page is leaving. */
  onBeforeUnload?: () => boolean;
}

const DEFAULT_DEBOUNCE = 10_000;
const DEFAULT_INTERVAL = 30_000;
const DEFAULT_VISIBLE = 3_000;

export class AutoSave {
  private readonly opts: Required<Omit<AutoSaveOptions, 'onBeforeUnload'>> & {
    onBeforeUnload?: () => boolean;
  };
  private status: AutoSaveStatus = 'idle';
  private lastSaved: string | null = null;
  private debounceHandle: number | null = null;
  private intervalHandle: number | null = null;
  private savedFadeHandle: number | null = null;
  private destroyed = false;
  private readonly beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.status === 'saving' || this.dirty()) {
      if (this.opts.onBeforeUnload && !this.opts.onBeforeUnload()) return;
      e.preventDefault();
      e.returnValue = '';
    }
  };

  constructor(options: AutoSaveOptions) {
    this.opts = {
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE,
      intervalMs: options.intervalMs ?? DEFAULT_INTERVAL,
      savedVisibleMs: options.savedVisibleMs ?? DEFAULT_VISIBLE,
      getValue: options.getValue,
      persist: options.persist,
      onStatus: options.onStatus ?? (() => {}),
      onBeforeUnload: options.onBeforeUnload
    };
  }

  start(): void {
    if (this.intervalHandle !== null || this.destroyed) return;
    this.lastSaved = this.opts.getValue();
    this.intervalHandle = window.setInterval(() => {
      if (this.dirty()) void this.run('interval');
    }, this.opts.intervalMs);
    window.addEventListener('beforeunload', this.beforeUnload);
  }

  stop(): void {
    this.destroyed = true;
    if (this.debounceHandle !== null) {
      window.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.savedFadeHandle !== null) {
      window.clearTimeout(this.savedFadeHandle);
      this.savedFadeHandle = null;
    }
    window.removeEventListener('beforeunload', this.beforeUnload);
  }

  /** Call on every input event. Schedules the debounced save. */
  schedule(): void {
    if (this.destroyed) return;
    if (this.debounceHandle !== null) window.clearTimeout(this.debounceHandle);
    this.debounceHandle = window.setTimeout(() => {
      this.debounceHandle = null;
      void this.run('debounce');
    }, this.opts.debounceMs);
  }

  /** Force a save right now, bypassing debounce / interval. */
  async flush(): Promise<void> {
    if (this.debounceHandle !== null) {
      window.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    await this.run('manual');
  }

  /** Status read for templates (mostly redundant with the onStatus hook). */
  currentStatus(): AutoSaveStatus {
    return this.status;
  }

  dirty(): boolean {
    return this.opts.getValue() !== this.lastSaved;
  }

  private setStatus(next: AutoSaveStatus) {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus(next);
  }

  private async run(origin: 'debounce' | 'interval' | 'manual'): Promise<void> {
    void origin;
    if (this.destroyed) return;
    const value = this.opts.getValue();
    if (value === this.lastSaved) return;
    this.setStatus('saving');
    try {
      await this.opts.persist(value);
      this.lastSaved = value;
      this.setStatus('saved');
      if (this.savedFadeHandle !== null) window.clearTimeout(this.savedFadeHandle);
      this.savedFadeHandle = window.setTimeout(() => {
        this.savedFadeHandle = null;
        if (this.status === 'saved') this.setStatus('idle');
      }, this.opts.savedVisibleMs);
    } catch {
      this.setStatus('error');
      if (this.savedFadeHandle !== null) window.clearTimeout(this.savedFadeHandle);
      this.savedFadeHandle = window.setTimeout(() => {
        this.savedFadeHandle = null;
        if (this.status === 'error') this.setStatus('idle');
      }, this.opts.savedVisibleMs);
    }
  }
}
