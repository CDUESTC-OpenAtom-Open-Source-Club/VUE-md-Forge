/**
 * TableBuilder — interactive GFM table construction.
 *
 * Adapted from markdown-palettes' btn-table.js (Phase-1 quick-win #3). The
 * upstream shows a `Dialog` with three form fields (rows / cols / alignment).
 * Here we use sequential `window.prompt` calls (Phase-1 placeholder) — the
 * full Dialog engine is quick-win #2 and will replace this seamlessly.
 *
 * Output format follows GFM:
 *   | 列1 | 列2 | 列3 |
 *   | :--- | :---: | ---: |
 *   | A1 | A2 | A3 |
 *   | B1 | B2 | B3 |
 *
 * Alignment tokens (single source of truth — keep in sync with the renderer):
 *   left   → :---
 *   center → :---:
 *   right  → ---:
 */

export type TableAlignment = 'left' | 'center' | 'right';

export interface TableSpec {
  rows: number;
  cols: number;
  align: TableAlignment;
}

export const TABLE_LIMITS: {
  rows: { min: number; max: number; default: number };
  cols: { min: number; max: number; default: number };
} = {
  rows: { min: 2, max: 20, default: 3 },
  cols: { min: 1, max: 10, default: 3 }
};

const ALIGN_TOKENS: Record<TableAlignment, string> = {
  left: ':---',
  center: ':---:',
  right: '---:'
};

/** Clamp a user-entered value into the supported table dimension range. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeAlign(raw: string | null): TableAlignment {
  if (raw === null) return 'left';
  const v = raw.trim().toLowerCase();
  if (v === 'center' || v === 'centre' || v === 'c') return 'center';
  if (v === 'right' || v === 'r') return 'right';
  return 'left';
}

/**
 * Sequential-prompt UX (Phase-1 placeholder). Three prompts in order:
 *   1. 行数 (rows) — including header row
 *   2. 列数 (cols)
 *   3. 对齐方式 (left / center / right)
 *
 * Returns null if the user cancels any prompt. Cancel-on-first-prompt is the
 * only way to abort the whole flow.
 */
export function promptTableSpec(): TableSpec | null {
  const rowsRaw = window.prompt(
    `行数（含表头 · 范围 ${TABLE_LIMITS.rows.min}-${TABLE_LIMITS.rows.max}）`,
    String(TABLE_LIMITS.rows.default)
  );
  if (rowsRaw === null) return null;
  const rows = clampInt(rowsRaw, TABLE_LIMITS.rows.default, TABLE_LIMITS.rows.min, TABLE_LIMITS.rows.max);

  const colsRaw = window.prompt(
    `列数（范围 ${TABLE_LIMITS.cols.min}-${TABLE_LIMITS.cols.max}）`,
    String(TABLE_LIMITS.cols.default)
  );
  if (colsRaw === null) return null;
  const cols = clampInt(colsRaw, TABLE_LIMITS.cols.default, TABLE_LIMITS.cols.min, TABLE_LIMITS.cols.max);

  const alignRaw = window.prompt('对齐方式（left / center / right）', 'left');
  if (alignRaw === null) return null;
  const align = normalizeAlign(alignRaw);

  return { rows, cols, align };
}

/**
 * Build the GFM table markdown body from a spec.
 *
 * Default placeholder content uses `列N` for headers and `R{row}C{col}` for
 * data cells — matches upstream markdown-palettes convention so the user
 * can immediately see what to edit.
 */
export function buildTable(spec: TableSpec): string {
  const { rows, cols, align } = spec;
  const sep = ALIGN_TOKENS[align];
  const headerCells = Array.from({ length: cols }, (_, c) => `列${c + 1}`).join(' | ');
  const sepCells = Array.from({ length: cols }, () => sep).join(' | ');
  const dataLines: string[] = [];
  for (let r = 1; r < rows; r++) {
    const cells = Array.from({ length: cols }, (_, c) => `R${r}C${c + 1}`).join(' | ');
    dataLines.push(`| ${cells} |`);
  }
  return `| ${headerCells} |\n| ${sepCells} |\n${dataLines.join('\n')}\n`;
}

/** Convenience: prompt + build, returning `null` if the user cancels. */
export function promptAndBuildTable(): string | null {
  const spec = promptTableSpec();
  if (!spec) return null;
  return buildTable(spec);
}