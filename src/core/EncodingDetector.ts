/**
 * EncodingDetector — light-weight text encoding detection.
 *
 * Strategy (per user spec, v0.3.0):
 *   1. BOM check: UTF-8 (EF BB BF) / UTF-16LE (FF FE) / UTF-16BE (FE FF)
 *   2. Strict UTF-8 validate via `TextDecoder({ fatal: true })`
 *   3. Fallback GBK (covers ~95% of Chinese Windows legacy files)
 *
 * Does NOT recognise Big5 / Shift_JIS / KOI8-R etc. — out of scope for
 * v0.3.0. Heavier detection (chardet-style frequency tables) is left for
 * a future PR if the GBK fallback is found insufficient in practice.
 */

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk';

/**
 * Inspect the leading bytes of `bytes` and return the most likely
 * encoding label. The label can be passed straight to `new TextDecoder(label)`.
 */
export function detectEncoding(bytes: Uint8Array): Encoding {
  // 1. BOM check.
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return 'utf-8';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le';
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be';
  }
  // 2. Strict UTF-8 validation. TextDecoder in fatal mode throws on any
  //    invalid UTF-8 sequence — if it succeeds, the bytes are valid UTF-8.
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch {
    // 3. Fallback. GBK is a superset of GB2312 and decodes gracefully on
    //    non-GBK bytes (each invalid byte becomes U+FFFD), so it's a safe
    //    last-resort pick on a Chinese-locale editor.
    return 'gbk';
  }
}

/**
 * One-shot: detect the encoding of `bytes` and decode the buffer.
 * Throws if the chosen decoder itself fails (rare; only seen on truncated
 * multi-byte sequences at end-of-file, which TextDecoder tolerates by
 * default).
 */
export function decodeWithDetect(bytes: Uint8Array): string {
  return new TextDecoder(detectEncoding(bytes)).decode(bytes);
}