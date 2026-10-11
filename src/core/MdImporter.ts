/**
 * MdImporter — open local .md / .markdown / .mdown / .mkd / text files.
 *
 * Mirrors the SmartPaste / ImageImporter pattern: the module only deals
 * with reading + classification + multi-file merge. The host wires up
 * the content setter and confirmation gate.
 *
 * Pipeline:
 *   File[] → classifyFile (md/image/other) → reject non-md / oversized
 *           → readFileAsText (encoding-detected, UTF-8/GBK) →
 *             mergeMarkdownFiles (single=as-is, multi=`\n\n---\n\n`)
 */

import { decodeWithDetect } from './EncodingDetector';

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;
const ACCEPT_MIME = /^text\/(markdown|plain)/;

export interface MdFileInput {
  name: string;
  text: string;
}

export interface MdImportError {
  name: string;
  reason: string;
}

export interface MdImportResult {
  contents: MdFileInput[];
  rejected: MdImportError[];
}

export type FileKind = 'md' | 'image' | 'other';

/**
 * Quick classification used by drop/paste handlers to fan out into
 * the existing image pipeline vs. the new md pipeline.
 */
export function classifyFile(file: File): FileKind {
  if (file.type.startsWith('image/')) return 'image';
  if (ACCEPT_MIME.test(file.type)) return 'md';
  if (MD_EXT.test(file.name)) return 'md';
  return 'other';
}

/**
 * Read a file as text, picking the encoding via {@link detectEncoding}.
 * Pipeline: `File.arrayBuffer()` → `Uint8Array` → `decodeWithDetect`.
 * Throws if `arrayBuffer()` itself fails (FileReader-level error). On
 * invalid bytes the chosen decoder silently substitutes U+FFFD rather
 * than throwing.
 */
export function readFileAsText(file: File): Promise<string> {
  return file.arrayBuffer().then((buf) => decodeWithDetect(new Uint8Array(buf)));
}

/**
 * Validate + read a batch of files into a structured result.
 * The host decides what to do with `rejected` (toast / ignore / etc).
 */
export async function importMdFiles(files: File[]): Promise<MdImportResult> {
  const result: MdImportResult = { contents: [], rejected: [] };
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      result.rejected.push({
        name: f.name,
        reason: `文件过大 (${(f.size / 1024 / 1024).toFixed(1)} MB > 5 MB)`
      });
      continue;
    }
    const kind = classifyFile(f);
    if (kind !== 'md') {
      result.rejected.push({
        name: f.name,
        reason: `不支持的文件类型 (${f.type || 'unknown'})`
      });
      continue;
    }
    try {
      const text = await readFileAsText(f);
      result.contents.push({ name: f.name, text });
    } catch (e) {
      result.rejected.push({
        name: f.name,
        reason: `读取失败: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }
  return result;
}

/**
 * Combine multiple md contents into one document.
 * Single file: as-is. Multi-file: trim trailing whitespace, join with
 * GFM theme break `\n\n---\n\n` (no banner / heading — keeps content clean).
 */
export function mergeMarkdownFiles(contents: MdFileInput[]): string {
  if (contents.length === 0) return '';
  if (contents.length === 1) return contents[0].text;
  return contents.map((c) => c.text.trimEnd()).join('\n\n---\n\n');
}