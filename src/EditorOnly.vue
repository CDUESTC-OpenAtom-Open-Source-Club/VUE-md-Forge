<script setup lang="ts">
/**
 * EditorOnly — dual-pane editor for the v0.2 milestone.
 *
 * Layout:
 *   ┌── toolbar ────────────────────────────────────────────────────┐
 *   │ H1 H2 H3 │ B I S │ link img code quote list 1. formula │ 沉浸│
 *   ├── gutter ──┬── textarea + pre overlay ──┬── preview ────────┤
 *   │  1  2  3   │  source markdown (coloured) │  rendered HTML    │
 *   │  4  5  6   │  with transparent text      │                   │
 *   ├── status bar ────────────────────────────────────────────────┤
 *   │ chars · lines · 🟢 1.85ms · F9 沉浸                          │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Key features:
 *   - JetBrains Mono source pane with token highlighting
 *   - Line-number gutter (42px)
 *   - Percentage-based two-way scroll sync (syncing flag prevents loops)
 *   - View modes: dual (default), edit-only, preview-only
 *   - F9 fullscreen (browser API); 仅编辑 / 仅预览 are CSS-only
 *   - Help modal with keyboard shortcut reference
 *   - Shortcuts: Ctrl+B / I / K / 1/2/3 / 0 / S
 *   - Image paste/drop → mock base64 upload → inline ![]() replacement
 *   - Draft persisted to localStorage
 *   - Toast for paste result
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { MarkdownEngine } from '@/core/MarkdownEngine';
import { PairCompleter } from '@/core/PairCompleter';
import { highlightMarkdown } from '@/core/highlight';
import '@/styles/themes.css';
import {
  wrapSelection,
  toggleLinePrefix,
  insertText,
  insertLink,
  insertImage as insertImagePrompt
} from '@/core/DomActions';

const engine = new MarkdownEngine();
const pair = new PairCompleter();

const STORAGE_KEY = 'mdf-editor-only:draft';
const WARN_CHARS = 10_000;

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    initial?: string;
    theme?: 'typora-light' | 'typora-dark';
  }>(),
  { modelValue: undefined, initial: undefined, theme: 'typora-light' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:theme', value: 'typora-light' | 'typora-dark'): void;
}>();

// `content` is the live editor state. When `modelValue` is provided, the parent
// is the source of truth (controlled mode). Otherwise the component is the
// source of truth and falls back to `initial` then localStorage.
const internal = ref<string>(props.modelValue ?? props.initial ?? localStorage.getItem(STORAGE_KEY) ?? '');
const controlled = computed(() => props.modelValue !== undefined);
const content = computed<string>({
  get: () => (controlled.value ? (props.modelValue as string) : internal.value),
  set: (v) => {
    if (controlled.value) emit('update:modelValue', v);
    else internal.value = v;
  }
});

const themeRef = ref<'typora-light' | 'typora-dark'>(props.theme);

watch(
  () => props.theme,
  (next) => {
    if (next && next !== themeRef.value) themeRef.value = next;
  }
);

function setTheme(next: 'typora-light' | 'typora-dark') {
  themeRef.value = next;
  emit('update:theme', next);
}

function toggleTheme() {
  setTheme(themeRef.value === 'typora-light' ? 'typora-dark' : 'typora-light');
}
const showOverlay = ref(true);
const renderMs = ref(0);
const toast = ref<{ id: number; text: string; tone: 'ok' | 'warn' | 'info' } | null>(null);
const isPulsing = ref(false);

const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');
const overlayRef = useTemplateRef<HTMLElement>('overlayRef');
const previewRef = useTemplateRef<HTMLElement>('previewRef');

const stats = computed(() => {
  const text = content.value;
  return {
    chars: text.length,
    lines: text.length === 0 ? 0 : text.split('\n').length,
    words: (text.match(/\S+/g) || []).length,
    warning: text.length > WARN_CHARS
  };
});

const lineNumbers = computed(() => Array.from({ length: stats.value.lines }, (_, i) => i + 1));

const highlighted = computed(() => {
  // append a trailing space so the last line is rendered by the overlay
  return highlightMarkdown(content.value) + '\n';
});

const renderedHtml = computed(() => {
  const t0 = performance.now();
  const html = engine.render(content.value);
  renderMs.value = +(performance.now() - t0).toFixed(2);
  return html;
});

let pulseTimer: number | null = null;
watch([renderMs, content], () => {
  isPulsing.value = true;
  if (pulseTimer !== null) window.clearTimeout(pulseTimer);
  pulseTimer = window.setTimeout(() => (isPulsing.value = false), 400);
});

let saveTimer: number | null = null;
function scheduleSave() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, content.value), 400);
}

// ── character auto-pair ───────────────────────────────────────────────
function onBeforeInput(e: Event) {
  const ev = e as InputEvent;
  const el = e.target as HTMLTextAreaElement;
  const result = pair.process(ev.inputType, ev.data ?? '', {
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd
  });
  if (result.preventDefault) {
    ev.preventDefault();
    el.value = result.value;
    el.setSelectionRange(result.caret, result.caret);
    content.value = el.value;
    scheduleSave();
  }
}

// ── two-way scroll sync (percentage based, syncing flag) ──────────────
let syncing = false;
function onSourceScroll() {
  const ta = textareaRef.value;
  const ov = overlayRef.value;
  const pv = previewRef.value;
  if (!ta || !ov || !pv) return;
  // Lock overlay to textarea scroll.
  ov.scrollTop = ta.scrollTop;
  ov.scrollLeft = ta.scrollLeft;
  // Push percentage to preview.
  if (syncing) {
    syncing = false;
    return;
  }
  const max = ta.scrollHeight - ta.clientHeight;
  if (max <= 0) return;
  const ratio = ta.scrollTop / max;
  syncing = true;
  const previewMax = pv.scrollHeight - pv.clientHeight;
  pv.scrollTop = previewMax * ratio;
}
function onPreviewScroll() {
  const ta = textareaRef.value;
  const pv = previewRef.value;
  if (!ta || !pv) return;
  if (syncing) {
    syncing = false;
    return;
  }
  const max = pv.scrollHeight - pv.clientHeight;
  if (max <= 0) return;
  const ratio = pv.scrollTop / max;
  syncing = true;
  const sourceMax = ta.scrollHeight - ta.clientHeight;
  ta.scrollTop = sourceMax * ratio;
}

// ── toolbar actions ───────────────────────────────────────────────────
function runOnTextarea(fn: (el: HTMLTextAreaElement) => void) {
  const el = textareaRef.value;
  if (!el) return;
  fn(el);
  content.value = el.value;
  el.focus();
  scheduleSave();
}

function doWrap(before: string, after: string, placeholder = '') {
  runOnTextarea((el) => wrapSelection(el, before, after, placeholder));
}
function doHeading(level: 1 | 2 | 3) {
  runOnTextarea((el) => toggleLinePrefix(el, '#'.repeat(level) + ' '));
}
function doBold() { doWrap('**', '**', '粗体'); }
function doItalic() { doWrap('*', '*', '斜体'); }
function doStrike() { doWrap('~~', '~~', '删除'); }
function doCode() {
  runOnTextarea((el) => {
    const sel = el.value.slice(el.selectionStart, el.selectionEnd);
    if (sel.includes('\n') || sel.length === 0) {
      // Multi-line or empty → block code.
      insertText(el, '\n```\n' + (sel || 'code') + '\n```\n');
    } else {
      // Single-line → inline code.
      wrapSelection(el, '`', '`', 'code');
    }
  });
}
function doQuote() { runOnTextarea((el) => toggleLinePrefix(el, '> ')); }
function doUl() { runOnTextarea((el) => toggleLinePrefix(el, '- ')); }
function doOl() { runOnTextarea((el) => toggleLinePrefix(el, '1. ')); }
function doTaskList() {
  runOnTextarea((el) => toggleLinePrefix(el, '- [ ] '));
}
function doLink() { runOnTextarea(insertLink); }
function doImage() {
  runOnTextarea(insertImagePrompt);
}
function doFormula() {
  runOnTextarea((el) => {
    const sel = el.value.slice(el.selectionStart, el.selectionEnd) || 'E = mc^2';
    insertText(el, `$${sel}$`);
  });
}
function doHr() {
  runOnTextarea((el) => {
    insertText(el, '\n\n---\n\n');
  });
}
function doTable() {
  runOnTextarea((el) => {
    insertText(el, '\n\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| A1 | A2 | A3 |\n| B1 | B2 | B3 |\n\n');
  });
}
// Promote: H3 → H2 → H1 → remove prefix. Demote: H0 (no heading) → H1 → ... → H6.
function doPromoteHeading() {
  runOnTextarea((el) => {
    const pos = el.selectionStart;
    const lineStart = el.value.lastIndexOf('\n', pos - 1) + 1;
    const line = el.value.slice(lineStart).split('\n', 1)[0];
    const m = /^(#{1,6})\s/.exec(line);
    if (!m) return;
    const hashes = m[1];
    if (hashes.length === 1) {
      // Remove the H1 prefix entirely.
      const replaced = line.replace(/^#\s/, '');
      el.value = el.value.slice(0, lineStart) + replaced + el.value.slice(lineStart + line.length);
    } else {
      const replaced = '#'.repeat(hashes.length - 1) + ' ' + line.slice(hashes.length + 1);
      el.value = el.value.slice(0, lineStart) + replaced + el.value.slice(lineStart + line.length);
    }
    el.setSelectionRange(lineStart, lineStart);
  });
}
function doDemoteHeading() {
  runOnTextarea((el) => {
    const pos = el.selectionStart;
    const lineStart = el.value.lastIndexOf('\n', pos - 1) + 1;
    const line = el.value.slice(lineStart).split('\n', 1)[0];
    const m = /^(#{1,6})\s/.exec(line);
    let replaced: string;
    if (!m) {
      replaced = '# ' + line;
    } else if (m[1].length >= 6) {
      return; // already H6, no further demote
    } else {
      replaced = '#'.repeat(m[1].length + 1) + ' ' + line.slice(m[1].length + 1);
    }
    el.value = el.value.slice(0, lineStart) + replaced + el.value.slice(lineStart + line.length);
    el.setSelectionRange(lineStart, lineStart);
  });
}
function scrollToTop() {
  const ta = textareaRef.value;
  ta?.scrollTo({ top: 0 });
}

// ── view mode (仅编辑 / 仅预览 / 全屏 / 双栏) ──────────────────────
type ViewMode = 'dual' | 'edit' | 'preview';
const view = ref<ViewMode>((localStorage.getItem('mdf-editor-only:view') as ViewMode) || 'dual');
watch(view, (v) => localStorage.setItem('mdf-editor-only:view', v));
function setView(mode: ViewMode) {
  view.value = mode;
}

// F9 / 全屏 button — request real browser fullscreen on the editor root.
async function toggleFullscreen() {
  const root = (textareaRef.value?.closest('.editor-only') as HTMLElement | null);
  if (!root) return;
  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    flashToast('浏览器拒绝了全屏请求', 'warn');
  }
}

// ── help modal ────────────────────────────────────────────────────────────
const showHelp = ref(false);
function openHelp() { showHelp.value = true; }
function closeHelp() { showHelp.value = false; }
function onHelpKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeHelp();
}

// ── keyboard shortcuts ────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { e.preventDefault(); doBold(); }
  else if (k === 'i') { e.preventDefault(); doItalic(); }
  else if (k === 'k') { e.preventDefault(); doLink(); }
  else if (k === '1') { e.preventDefault(); doHeading(1); }
  else if (k === '2') { e.preventDefault(); doHeading(2); }
  else if (k === '3') { e.preventDefault(); doHeading(3); }
  else if (k === '0') { e.preventDefault(); doHeading(1); /* fallback */ }
  else if (k === 's') { e.preventDefault(); scheduleSave(); flashToast('已保存', 'ok'); }
  else if (k === '/') { e.preventDefault(); openHelp(); }
}
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'F9') {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.key === 'Escape' && showHelp.value) {
    e.preventDefault();
    closeHelp();
  }
}

// ── paste / drop image (mock base64) ─────────────────────────────────
function flashToast(text: string, tone: 'ok' | 'warn' | 'info' = 'info') {
  const id = Date.now();
  toast.value = { id, text, tone };
  window.setTimeout(() => {
    if (toast.value && toast.value.id === id) toast.value = null;
  }, 3000);
}
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
async function uploadMock(file: File): Promise<string> {
  // Default mock uploader: embed as data URL. Host sites can replace this.
  return fileToDataUrl(file);
}
async function handleImageFiles(files: File[]) {
  const el = textareaRef.value;
  if (!el || !files.length) return;
  let ok = 0;
  for (const file of files) {
    try {
      const url = await uploadMock(file);
      const alt = file.name.replace(/\.[^.]+$/, '');
      runOnTextarea((e) => insertText(e, `![${alt}](${url})`));
      ok += 1;
    } catch {
      /* ignore individual failures */
    }
  }
  flashToast(ok ? `已导入 ${ok} 张图片` : '图片导入失败', ok ? 'ok' : 'warn');
}
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (!files.length) return;
  e.preventDefault();
  void handleImageFiles(files);
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  const files: File[] = [];
  for (const f of Array.from(e.dataTransfer?.files ?? [])) {
    if (f.type.startsWith('image/')) files.push(f);
  }
  if (files.length) void handleImageFiles(files);
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  if (pulseTimer !== null) window.clearTimeout(pulseTimer);
});

defineExpose({ scrollToTop });
</script>

<template>
  <div class="editor-only" :data-mdf-theme="themeRef" :data-mdf-view="view">
    <!-- toolbar -->
    <header class="eo-toolbar">
      <div class="eo-group eo-group--heading">
        <button @click="doPromoteHeading" title="标题提升一级（H6 → H1）" aria-label="标题提升一级">
          <span class="eo-btn-label">H<sub>0</sub></span>
        </button>
        <button @click="doDemoteHeading" title="标题降低一级（H0 → H6）" aria-label="标题降低一级">
          <span class="eo-btn-label">H<sub>6</sub></span>
        </button>
      </div>
      <div class="eo-sep" />
      <div class="eo-group">
        <button @click="doHr" title="水平线" aria-label="水平线"><span class="eo-btn-glyph">—</span></button>
      </div>
      <div class="eo-sep" />
      <div class="eo-group">
        <button @click="doBold" title="粗体 Ctrl+B"><strong>B</strong></button>
        <button @click="doItalic" title="斜体 Ctrl+I"><em>I</em></button>
        <button @click="doStrike" title="删除线"><s>S</s></button>
      </div>
      <div class="eo-sep" />
      <div class="eo-group">
        <button @click="doFormula" title="数学公式（行内 $...$ / 块级 $$...$$）" aria-label="数学公式">
          <span class="eo-btn-glyph">√<span class="eo-btn-sub">x</span></span>
        </button>
      </div>
      <div class="eo-sep" />
      <div class="eo-group">
        <button @click="doLink" title="链接 Ctrl+K" aria-label="链接">
          <span class="eo-btn-glyph">@</span>
        </button>
        <button @click="doImage" title="图片" aria-label="图片">
          <span class="eo-btn-glyph">🖼</span>
        </button>
        <button @click="doCode" title="代码（行内 ` / 块 ```）" aria-label="代码">
          <span class="eo-btn-glyph">&lt;/&gt;</span>
        </button>
        <button @click="doTable" title="表格" aria-label="表格">
          <span class="eo-btn-glyph">▦</span>
        </button>
        <button @click="doQuote" title="引用" aria-label="引用">
          <span class="eo-btn-glyph">❝</span>
        </button>
        <button @click="doUl" title="无序列表" aria-label="无序列表">
          <span class="eo-btn-glyph">≡</span>
        </button>
        <button @click="doOl" title="有序列表" aria-label="有序列表">
          <span class="eo-btn-glyph">1.≡</span>
        </button>
        <button @click="doTaskList" title="任务列表" aria-label="任务列表">
          <span class="eo-btn-glyph">☑</span>
        </button>
      </div>
      <div class="eo-spacer" />
      <div class="eo-group eo-group--view">
        <button
          :class="{ active: view === 'edit' }"
          @click="setView(view === 'edit' ? 'dual' : 'edit')"
          title="仅编辑"
          aria-label="仅编辑"
        >
          <span class="eo-btn-glyph">‖</span>
        </button>
        <button
          :class="{ active: view === 'preview' }"
          @click="setView(view === 'preview' ? 'dual' : 'preview')"
          title="仅预览"
          aria-label="仅预览"
        >
          <span class="eo-btn-glyph">◫</span>
        </button>
        <button @click="toggleFullscreen" title="全屏 F9" aria-label="全屏">
          <span class="eo-btn-glyph">⛶</span>
        </button>
        <div class="eo-sep" />
        <button @click="toggleTheme" :title="`当前主题: ${themeRef}，点击切换`">
          {{ themeRef === 'typora-light' ? '☀' : '☾' }}
        </button>
        <button @click="openHelp" title="帮助 Ctrl+/" aria-label="帮助">
          <span class="eo-btn-glyph">?</span>
        </button>
      </div>
    </header>

    <!-- editor body -->
    <main class="eo-body" @drop="onDrop" @dragover.prevent>
      <!-- source pane -->
      <section class="eo-source">
        <div class="eo-gutter" aria-hidden="true">
          <div v-for="n in lineNumbers" :key="n" class="eo-line-no">{{ n }}</div>
        </div>
        <div class="eo-source-stack">
          <pre
            ref="overlayRef"
            class="eo-overlay"
            :class="{ hidden: !showOverlay }"
            v-html="highlighted"
          />
          <textarea
            ref="textareaRef"
            class="eo-textarea"
            :value="content"
            spellcheck="false"
            placeholder="在这里输入 Markdown…（F9 全屏 / Ctrl+B I K 1 2 3 / Ctrl+/ 帮助）"
            @beforeinput="onBeforeInput"
            @keydown="onKeydown"
            @input="(e) => { content = (e.target as HTMLTextAreaElement).value; scheduleSave(); }"
            @paste="onPaste"
            @scroll="onSourceScroll"
          />
        </div>
      </section>

      <!-- preview pane -->
      <section ref="previewRef" class="eo-preview" @scroll="onPreviewScroll">
        <div class="eo-rendered" v-html="renderedHtml" />
      </section>
    </main>

    <!-- status bar -->
    <footer class="eo-status">
      <span :class="['eo-chars', { warn: stats.warning }]">{{ stats.chars }} 字符</span>
      <span class="eo-sep-dot">·</span>
      <span>{{ stats.lines }} 行</span>
      <span class="eo-sep-dot">·</span>
      <span>{{ stats.words }} 词</span>
      <span class="eo-sep-dot">·</span>
      <span :class="['eo-pulse', { active: isPulsing }]">
        <span class="dot" /> 同步 {{ renderMs }} ms
      </span>
      <span class="eo-spacer" />
      <button class="eo-link" @click="scrollToTop" title="回到顶部">回到顶部 ↑</button>
      <span class="eo-sep-dot">·</span>
      <span class="eo-tip">F9 全屏</span>
    </footer>

    <!-- help modal -->
    <Transition name="eo-fade">
      <div v-if="showHelp" class="eo-help-mask" @click.self="closeHelp" @keydown="onHelpKeydown">
        <div class="eo-help" role="dialog" aria-modal="true" aria-label="帮助">
          <header class="eo-help-head">
            <strong>VUE-md-Forge 帮助</strong>
            <button class="eo-help-close" @click="closeHelp" aria-label="关闭">✕</button>
          </header>
          <div class="eo-help-body">
            <section>
              <h3>键盘快捷键</h3>
              <table class="eo-help-table">
                <tr><td><kbd>Ctrl</kbd>+<kbd>B</kbd></td><td>粗体</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>I</kbd></td><td>斜体</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>链接</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd></td><td>H1 / H2 / H3</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>立即保存草稿</td></tr>
                <tr><td><kbd>F9</kbd></td><td>浏览器全屏</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>/</kbd></td><td>打开 / 关闭本帮助</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>关闭弹层</td></tr>
              </table>
            </section>
            <section>
              <h3>字符自动配对</h3>
              <p>输入 <code>(</code> <code>[</code> <code>{</code> <code>"</code> <code>'</code>
                <code>\`</code> <code>*</code> <code>_</code> <code>~</code> 会自动闭合光标；
                选区非空时直接包裹；再按一次同字符会跳过闭合。</p>
            </section>
            <section>
              <h3>图片粘贴</h3>
              <p>从剪贴板粘贴图片或拖拽文件到编辑器，会以内联 <code>![](data:…)</code>
                形式插入（演示用 base64 mock，可替换为真实上传接口）。</p>
            </section>
            <section>
              <h3>视图模式</h3>
              <p>工具栏右侧 <kbd>‖</kbd> 仅编辑 / <kbd>◫</kbd> 仅预览，<kbd>⛶</kbd> 触发浏览器全屏。
                草稿自动保存到 localStorage，刷新不丢。</p>
            </section>
          </div>
        </div>
      </div>
    </Transition>

    <!-- toast -->
    <Transition name="eo-toast">
      <div v-if="toast" :key="toast.id" :class="['eo-toast', `tone-${toast.tone}`]">
        {{ toast.text }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.editor-only {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdf-bg, #fafafa);
  color: var(--mdf-fg, #1f2328);
  font-family: var(--mdf-font-sans, 'Noto Sans SC', system-ui, sans-serif);
}

/* ── toolbar ────────────────────────────────────────────────────────── */
.eo-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--mdf-bg-elev, #fff);
  border-bottom: 1px solid var(--mdf-line, #d0d7de);
  flex: 0 0 auto;
  min-height: 38px;
}
.eo-group { display: flex; gap: 2px; }
.eo-sep { width: 1px; height: 18px; background: var(--mdf-line, #d0d7de); margin: 0 6px; }
.eo-spacer { flex: 1 1 auto; }
.eo-toolbar button {
  font: inherit;
  font-size: 12px;
  background: transparent;
  color: var(--mdf-fg, #1f2328);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  min-width: 28px;
}
.eo-toolbar button:hover { background: var(--mdf-hover, #f3f4f6); }
.eo-toolbar button.active { background: var(--mdf-accent-soft, #ddf4ff); color: var(--mdf-accent, #4183c4); }
.eo-toolbar code { font-family: var(--mdf-font-mono, 'JetBrains Mono', monospace); font-size: 11px; }

/* toolbar button labels / glyphs */
.eo-btn-label {
  font-family: var(--mdf-font-sans, system-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.eo-btn-label sub {
  font-size: 9px;
  font-weight: 500;
  vertical-align: -2px;
  opacity: 0.7;
}
.eo-btn-glyph {
  font-family: var(--mdf-font-sans, system-ui);
  font-size: 14px;
  line-height: 1;
  display: inline-block;
  min-width: 14px;
}
.eo-btn-sub { font-size: 10px; opacity: 0.7; vertical-align: 1px; }

/* view mode — switch the body grid; nothing else */
.editor-only[data-mdf-view='dual'] .eo-body { grid-template-columns: 1fr 1fr; }
.editor-only[data-mdf-view='edit'] .eo-body { grid-template-columns: 1fr; }
.editor-only[data-mdf-view='edit'] .eo-preview { display: none; }
.editor-only[data-mdf-view='preview'] .eo-body { grid-template-columns: 1fr; }
.editor-only[data-mdf-view='preview'] .eo-source { display: none; }

/* ── body / panes ───────────────────────────────────────────────────── */
.eo-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--mdf-line, #d0d7de);
  flex: 1 1 auto;
  min-height: 0;
  transition: grid-template-columns 0.18s ease;
}
.eo-source, .eo-preview {
  background: var(--mdf-pane-bg, #fff);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.eo-source { display: grid; grid-template-columns: 42px 1fr; }
.eo-gutter {
  background: var(--mdf-gutter-bg, #f6f8fa);
  border-right: 1px solid var(--mdf-line, #d0d7de);
  padding: 12px 4px;
  font-family: var(--mdf-font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--mdf-muted, #6e7781);
  text-align: right;
  user-select: none;
  overflow: hidden;
}
.eo-line-no { white-space: nowrap; }

.eo-source-stack {
  position: relative;
  min-height: 0;
  display: flex;
}
.eo-overlay, .eo-textarea {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 14px;
  font-family: var(--mdf-font-mono, 'JetBrains Mono', monospace);
  font-size: 13.5px;
  line-height: 1.6;
  letter-spacing: 0;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  overflow: auto;
}
.eo-overlay {
  pointer-events: none;
  color: var(--mdf-fg, #1f2328);
  z-index: 1;
}
.eo-overlay.hidden { display: none; }
.eo-textarea {
  color: transparent;
  caret-color: var(--mdf-fg, #1f2328);
  z-index: 2;
  background: transparent;
}
.eo-textarea::placeholder { color: var(--mdf-muted, #6e7781); opacity: 0.6; }

/* highlight token classes */
:deep(.mdf-hl-code-block) { color: var(--mdf-overlay-codeblock, #6e7781); background: var(--mdf-overlay-codeblock-bg, #f6f8fa); border-radius: 3px; padding: 1px 2px; }
:deep(.mdf-hl-code) { color: var(--mdf-overlay-code-text, #cf222e); background: var(--mdf-overlay-code-bg, rgba(207, 34, 46, 0.08)); border-radius: 3px; padding: 1px 2px; }
:deep(.mdf-hl-math) { color: var(--mdf-overlay-math, #cf222e); }
:deep(.mdf-hl-bold) { color: var(--mdf-overlay-bold, #1f2328); font-weight: 600; }
:deep(.mdf-hl-italic) { color: var(--mdf-overlay-italic, #5a3e9a); font-style: italic; }
:deep(.mdf-hl-heading) { color: var(--mdf-overlay-heading, #4183c4); font-weight: 600; }
:deep(.mdf-hl-link) { color: var(--mdf-overlay-link, #1f6feb); text-decoration: underline; }
:deep(.mdf-hl-quote) { color: var(--mdf-overlay-quote, #6e7781); font-style: italic; }
:deep(.mdf-hl-hr) { color: var(--mdf-overlay-hr, #d0d7de); }
:deep(.mdf-hl-list) { color: var(--mdf-overlay-list, #4183c4); font-weight: 600; }

/* ── preview pane ──────────────────────────────────────────────────── */
.eo-preview {
  overflow: auto;
  padding: 14px 18px;
}
.eo-rendered {
  font-size: 14.5px;
  line-height: 1.7;
}
.eo-rendered :deep(h1) { font-size: 1.6em; border-bottom: 1px solid var(--mdf-line, #d0d7de); padding-bottom: 0.25em; margin: 1em 0 0.5em; }
.eo-rendered :deep(h2) { font-size: 1.3em; margin: 1em 0 0.4em; }
.eo-rendered :deep(h3) { font-size: 1.1em; }
.eo-rendered :deep(p) { margin: 0.5em 0; }
.eo-rendered :deep(a) { color: var(--mdf-accent, #4183c4); text-decoration: none; }
.eo-rendered :deep(a:hover) { text-decoration: underline; }
.eo-rendered :deep(code) { font-family: var(--mdf-font-mono); background: var(--mdf-code-bg, #f6f8fa); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
.eo-rendered :deep(pre) { background: var(--mdf-code-bg, #f6f8fa); border: 1px solid var(--mdf-line, #d0d7de); border-radius: 6px; padding: 12px 14px; overflow: auto; font-size: 12.5px; }
.eo-rendered :deep(table) { border-collapse: collapse; margin: 0.8em 0; width: 100%; }
.eo-rendered :deep(th), .eo-rendered :deep(td) { border: 1px solid var(--mdf-line, #d0d7de); padding: 6px 10px; text-align: left; }
.eo-rendered :deep(th) { background: var(--mdf-code-bg, #f6f8fa); }
.eo-rendered :deep(tr:nth-child(even) td) { background: #fafbfc; }
.eo-rendered :deep(blockquote) { margin: 0.8em 0; padding: 4px 12px; border-left: 3px solid var(--mdf-accent, #4183c4); color: var(--mdf-muted, #6e7781); background: #f6f8fa; border-radius: 0 4px 4px 0; }
.eo-rendered :deep(.katex) { font-size: 1.05em; }

/* ── status bar ────────────────────────────────────────────────────── */
.eo-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  font-size: 11.5px;
  color: var(--mdf-muted, #6e7781);
  background: var(--mdf-bg-elev, #fff);
  border-top: 1px solid var(--mdf-line, #d0d7de);
  font-family: var(--mdf-font-mono, 'JetBrains Mono', monospace);
  min-height: 26px;
}
.eo-sep-dot { color: var(--mdf-line, #d0d7de); }
.eo-chars.warn { color: #cf222e; font-weight: 600; }
.eo-pulse { display: inline-flex; align-items: center; gap: 4px; }
.eo-pulse .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #2da44e;
  display: inline-block;
  transition: transform 0.2s ease;
}
.eo-pulse.active .dot { animation: eo-pulse-anim 0.4s ease-out; }
@keyframes eo-pulse-anim {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(45, 164, 78, 0.6); }
  60% { transform: scale(1.3); box-shadow: 0 0 0 6px rgba(45, 164, 78, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(45, 164, 78, 0); }
}
.eo-link {
  font: inherit; background: transparent; border: 0; color: var(--mdf-accent, #4183c4);
  cursor: pointer; padding: 0; font-family: inherit;
}
.eo-link:hover { text-decoration: underline; }
.eo-tip { color: var(--mdf-muted, #6e7781); }

/* ── immersive ─────────────────────────────────────────────────────── */
/* (removed; view-only modes via data-mdf-view attribute) */

/* ── toast ─────────────────────────────────────────────────────────── */
.eo-toast {
  position: fixed;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2328;
  color: #fff;
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: 16px;
  z-index: 99;
  font-family: var(--mdf-font-sans, 'Noto Sans SC', system-ui, sans-serif);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
.eo-toast.tone-ok { background: #1a7f37; }
.eo-toast.tone-warn { background: #bf8700; }
.eo-toast.tone-info { background: #1f2328; }
.eo-toast-enter-from, .eo-toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.eo-toast-enter-active, .eo-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }

/* ── help modal ────────────────────────────────────────────────────── */
.eo-help-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.eo-help {
  background: var(--mdf-pane-bg, #fff);
  color: var(--mdf-fg, #1f2328);
  border-radius: 10px;
  width: min(680px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  font-family: var(--mdf-font-sans, system-ui);
}
.eo-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--mdf-line, #d0d7de);
  font-size: 14px;
}
.eo-help-close {
  background: transparent;
  border: 0;
  font-size: 16px;
  color: var(--mdf-muted, #6e7781);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.eo-help-close:hover { background: var(--mdf-hover, #f3f4f6); }
.eo-help-body {
  padding: 14px 22px 22px;
  overflow: auto;
}
.eo-help-body section { margin-bottom: 18px; }
.eo-help-body h3 {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mdf-accent, #4183c4);
  margin: 0 0 8px;
  letter-spacing: 0.02em;
}
.eo-help-body p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--mdf-fg, #1f2328);
}
.eo-help-body code {
  font-family: var(--mdf-font-mono, monospace);
  font-size: 11.5px;
  background: var(--mdf-code-bg, #f6f8fa);
  padding: 1px 5px;
  border-radius: 3px;
}
.eo-help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.eo-help-table td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--mdf-line, #d0d7de);
}
.eo-help-table td:first-child {
  width: 220px;
  white-space: nowrap;
}
.eo-help-table kbd {
  font: inherit;
  font-family: var(--mdf-font-mono, monospace);
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--mdf-line, #d0d7de);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--mdf-code-bg, #f6f8fa);
  margin: 0 1px;
}
.eo-fade-enter-from, .eo-fade-leave-to { opacity: 0; }
.eo-fade-enter-active, .eo-fade-leave-active { transition: opacity 0.18s ease; }
</style>
