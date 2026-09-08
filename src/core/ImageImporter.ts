/**
 * ImageImporter — serial image upload queue.
 *
 * Ported from club-web's `processImageImports` / `resolveImageTask` flow.
 * Responsibilities:
 *   1. produce a deterministic placeholder task (`createImageTask`)
 *   2. upload the file (or fetch the remote source) one at a time
 *   3. wait for the consumer to insert the placeholder into its content
 *   4. replace the placeholder with a real `![alt](url)` line on success,
 *      or a `> 图片未导入：xxx` failure block when the upload throws
 *
 * Host-side callbacks (`uploader`, `replacePlaceholder`) keep the plugin
 * free of `fileApi` / `ElMessage` coupling.
 */

import type { ImageTask } from './SmartPaste';

export interface UploaderInput {
  file?: File;
  src?: string;
  /** Caller may inject context (post id, biz type, draft id…). */
  context?: Record<string, unknown>;
}

export interface UploaderResult {
  url: string;
}

export type UploaderFn = (input: UploaderInput) => Promise<UploaderResult>;

export interface ImageImporterOptions {
  /** How many times to poll the model value for the placeholder before giving up. */
  placeholderWaitTries?: number;
  /** Delay between polls in milliseconds. */
  placeholderWaitMs?: number;
}

const DEFAULT_TRIES = 20;
const DEFAULT_WAIT = 50;
const PLACEHOLDER_PREFIX = 'mdf-image-import';

export function createImageTask(input: { file?: File; src?: string; alt: string }): ImageTask {
  const id = `${PLACEHOLDER_PREFIX}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    placeholder: `<!-- ${id} -->\n> 图片正在导入：${input.alt}\n<!-- /${id} -->`,
    src: input.src,
    file: input.file,
    alt: input.alt
  };
}

export class ImageImporter {
  private readonly uploader: UploaderFn;
  private readonly tries: number;
  private readonly wait: number;
  private running = false;
  private queue: ImageTask[] = [];

  constructor(uploader: UploaderFn, options: ImageImporterOptions = {}) {
    this.uploader = uploader;
    this.tries = options.placeholderWaitTries ?? DEFAULT_TRIES;
    this.wait = options.placeholderWaitMs ?? DEFAULT_WAIT;
  }

  enqueue(tasks: ImageTask[]): void {
    if (tasks.length) {
      this.queue.push(...tasks);
      void this.drain();
    }
  }

  async flush(): Promise<void> {
    while (this.running || this.queue.length) {
      await new Promise((resolve) => window.setTimeout(resolve, this.wait));
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const task = this.queue.shift();
        if (!task) continue;
        try {
          const url = await this.resolve(task);
          this.onSuccess(task, `![${task.alt}](${url})`);
        } catch (reason) {
          this.onFailure(
            task,
            `> 图片未导入：${task.alt}。${reason instanceof Error ? reason.message : String(reason) || '导入失败'}。`
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async resolve(task: ImageTask): Promise<string> {
    if (task.file) {
      const { url } = await this.uploader({ file: task.file });
      return url;
    }
    const src = task.src || '';
    if (src.startsWith('data:image/')) {
      const file = await dataUrlToFile(src);
      const { url } = await this.uploader({ file });
      return url;
    }
    const { url } = await this.uploader({ src });
    return url;
  }

  /**
   * Override these two methods in the consumer to wire up the editor's
   * v-model. Both receive the placeholder exactly as it appears in the
   * source markdown so the consumer can do a simple string replace.
   */
  protected onSuccess(task: ImageTask, replacement: string): void {
    void task;
    void replacement;
    throw new Error('ImageImporter.onSuccess must be overridden by the consumer');
  }

  protected onFailure(task: ImageTask, replacement: string): void {
    void task;
    void replacement;
    throw new Error('ImageImporter.onFailure must be overridden by the consumer');
  }
}

export async function dataUrlToFile(dataUrl: string, fileName = 'pasted-image'): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type.split('/')[1] || 'png';
  return new File([blob], `${fileName}-${Date.now()}.${extension}`, {
    type: blob.type || 'image/png'
  });
}
