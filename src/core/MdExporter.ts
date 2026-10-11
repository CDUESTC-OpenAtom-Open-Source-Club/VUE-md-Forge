/**
 * MdExporter — save current markdown content as a .md file.
 *
 * Plain UTF-8 Blob → temporary `<a download>` click → revoke.
 * No BOM (most markdown tooling does not tolerate it).
 */

const DEFAULT_NAME_PREFIX = 'untitled';

export interface ExportOptions {
  /** Override the suggested filename (with or without `.md` extension). */
  filename?: string;
  /** Fallback filename prefix when none given. Default 'untitled'. */
  namePrefix?: string;
}

/**
 * Suggest a filename like `untitled-2026-10-11-1432.md` (no seconds; minute
 * resolution is enough to distinguish two saves in a row).
 */
export function suggestFilename(prefix = DEFAULT_NAME_PREFIX): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.md`;
}

/**
 * Ensure the filename ends with `.md`. If the host passes `notes`, we
 * produce `notes.md`; if they pass `notes.txt`, we leave it alone so the
 * host can intentionally export a different extension.
 */
function ensureMdExtension(name: string): string {
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`;
}

/**
 * Trigger a browser download of the markdown text. Returns the filename used.
 */
export function exportMarkdown(text: string, options: ExportOptions = {}): string {
  const filename = ensureMdExtension(options.filename ?? suggestFilename(options.namePrefix));
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox has a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}