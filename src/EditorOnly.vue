<script setup lang="ts">
/**
 * EditorOnly — dual-pane editor with luogu-dev/markdown-palettes toolbar.
 *
 * Toolbar button order, icons and behaviour mirror markdown-palettes
 * (https://github.com/luogu-dev/markdown-palettes) `defaultBtns`:
 *
 *   bold · strikethrough · italic · hr
 *   ─── H1 · H2 · H3 · H4 · H5 · H6 ───
 *   ul · ol
 *   ─── img · link · code · table ───
 *   hide · fullScreen · scrollSync
 *   ─── info
 *
 * Icons come from @fortawesome/free-solid-svg-icons; head levels H1..H6
 * render as a character glyph inside a .eo-btn-glyph to match upstream's
 * `content: 'H'+level` styling.
 *
 * Other features preserved from earlier milestones:
 *   - JetBrains Mono source pane with token highlighting
 *   - Line-number gutter (42px)
 *   - Percentage-based two-way scroll sync (syncing flag prevents loops)
 *   - F9 fullscreen (browser API) is replaced by the toolbar's fullScreen button
 *   - localStorage draft persistence
 *   - Image paste/drop → mock base64 upload → inline ![]() replacement
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faBold,
  faStrikethrough,
  faItalic,
  faMinus,
  faListUl,
  faListOl,
  faImage,
  faLink,
  faCode,
  faTable,
  faEye,
  faEyeSlash,
  faExpandArrowsAlt,
  faLock,
  faLockOpen,
  faInfoCircle,
  faSun,
  faMoon
} from '@fortawesome/free-solid-svg-icons';
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
const scrollSyncEnabled = ref<boolean>(
  (localStorage.getItem('mdf-editor-only:scroll-sync') as string | null) !== 'off'
);
watch(scrollSyncEnabled, (v) => localStorage.setItem('mdf-editor-only:scroll-sync', v ? 'on' : 'off'));

let syncing = false;
function onSourceScroll() {
  const ta = textareaRef.value;
  const ov = overlayRef.value;
  const pv = previewRef.value;
  if (!ta || !ov || !pv) return;
  ov.scrollTop = ta.scrollTop;
  ov.scrollLeft = ta.scrollLeft;
  if (!scrollSyncEnabled.value) return;
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
  if (!scrollSyncEnabled.value) return;
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

function doBold() {
  runOnTextarea((el) => wrapSelection(el, '**', '**', '粗体'));
}
function doItalic() {
  runOnTextarea((el) => wrapSelection(el, '*', '*', '斜体'));
}
function doStrike() {
  runOnTextarea((el) => wrapSelection(el, '~~', '~~', '删除'));
}
function doHr() {
  runOnTextarea((el) => {
    insertText(el, '\n\n---\n\n');
  });
}
function doLink() {
  runOnTextarea(insertLink);
}
function doImage() {
  runOnTextarea(insertImagePrompt);
}
function doCode() {
  runOnTextarea((el) => {
    insertText(el, '\n\n```\ncode\n```\n\n');
  });
}
function doTable() {
  runOnTextarea((el) => {
    insertText(el, '\n\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| A1 | A2 | A3 |\n| B1 | B2 | B3 |\n\n');
  });
}
function doUl() {
  runOnTextarea((el) => toggleLinePrefix(el, '- '));
}
function doOl() {
  runOnTextarea((el) => toggleLinePrefix(el, '1. '));
}

// Apply a heading level to the cursor line. Mirrors markdown-palettes
// btn-header.js: strips any existing `#` prefix up to 7 chars, then prepends
// `#{level} `. If `level` equals the line's current level, toggle it off.
function doHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  runOnTextarea((el) => {
    const pos = el.selectionStart;
    const lineStart = el.value.lastIndexOf('\n', pos - 1) + 1;
    const line = el.value.slice(lineStart).split('\n', 1)[0];
    const m = /^(#{1,6}) /.exec(line);
    const currentLevel = m ? m[1].length : 0;
    let replaced: string;
    if (currentLevel === level) {
      replaced = line.replace(/^#{1,6} /, '');
    } else {
      replaced = '#'.repeat(level) + ' ' + (m ? line.slice(m[1].length + 1) : line);
    }
    el.value = el.value.slice(0, lineStart) + replaced + el.value.slice(lineStart + line.length);
    el.setSelectionRange(lineStart + replaced.length, lineStart + replaced.length);
  });
}

// ── view mode: hide / show preview (luogu markdown-palettes semantics) ─
type ViewMode = 'normal' | 'hide' | 'full';
const viewMode = ref<ViewMode>('normal');
function togglePreviewHidden() {
  viewMode.value = viewMode.value === 'hide' ? 'normal' : 'hide';
}

async function toggleFullscreen() {
  const root = (textareaRef.value?.closest('.editor-only') as HTMLElement | null);
  if (!root) return;
  try {
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    flashToast('浏览器拒绝了全屏请求', 'warn');
  }
}

// ── info modal (about) ────────────────────────────────────────────────
const showInfo = ref(false);
function openInfo() {
  showInfo.value = true;
}
function closeInfo() {
  showInfo.value = false;
}

function scrollToTop() {
  const ta = textareaRef.value;
  ta?.scrollTo({ top: 0 });
}

// ── keyboard shortcuts ────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { e.preventDefault(); doBold(); }
  else if (k === 'i') { e.preventDefault(); doItalic(); }
  else if (k === 'k') { e.preventDefault(); doLink(); }
  else if (k === 's') { e.preventDefault(); scheduleSave(); flashToast('已保存', 'ok'); }
}
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showInfo.value) {
    e.preventDefault();
    closeInfo();
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
  <div class="editor-only" :data-mdf-theme="themeRef" :data-mdf-view="viewMode">
    <!-- toolbar — mirrors luogu-dev/markdown-palettes defaultBtns -->
    <header class="eo-toolbar">
      <button @click="doBold" title="粗体 Ctrl+B" aria-label="粗体">
        <FontAwesomeIcon :icon="faBold" />
      </button>
      <button @click="doStrike" title="删除线" aria-label="删除线">
        <FontAwesomeIcon :icon="faStrikethrough" />
      </button>
      <button @click="doItalic" title="斜体 Ctrl+I" aria-label="斜体">
        <FontAwesomeIcon :icon="faItalic" />
      </button>
      <button @click="doHr" title="水平线" aria-label="水平线">
        <FontAwesomeIcon :icon="faMinus" />
      </button>

      <span class="eo-sep" />

      <button v-for="lv in 6" :key="`h${lv}`" @click="doHeading(lv as 1|2|3|4|5|6)" :title="`${lv} 级标题`" :aria-label="`${lv} 级标题`">
        <span class="eo-btn-glyph">H{{ lv }}</span>
      </button>

      <span class="eo-sep" />

      <button @click="doUl" title="无序列表" aria-label="无序列表">
        <FontAwesomeIcon :icon="faListUl" />
      </button>
      <button @click="doOl" title="有序列表" aria-label="有序列表">
        <FontAwesomeIcon :icon="faListOl" />
      </button>

      <span class="eo-sep" />

      <button @click="doImage" title="图片" aria-label="图片">
        <FontAwesomeIcon :icon="faImage" />
      </button>
      <button @click="doLink" title="链接 Ctrl+K" aria-label="链接">
        <FontAwesomeIcon :icon="faLink" />
      </button>
      <button @click="doCode" title="代码块" aria-label="代码块">
        <FontAwesomeIcon :icon="faCode" />
      </button>
      <button @click="doTable" title="表格" aria-label="表格">
        <FontAwesomeIcon :icon="faTable" />
      </button>

      <span class="eo-sep" />

      <button @click="togglePreviewHidden" :title="viewMode === 'hide' ? '显示预览' : '隐藏预览'" aria-label="切换预览">
        <FontAwesomeIcon :icon="viewMode === 'hide' ? faEye : faEyeSlash" />
      </button>
      <button @click="toggleFullscreen" title="全屏" aria-label="全屏">
        <FontAwesomeIcon :icon="faExpandArrowsAlt" />
      </button>
      <button @click="scrollSyncEnabled = !scrollSyncEnabled" :title="scrollSyncEnabled ? '关闭滚动同步' : '开启滚动同步'" aria-label="切换滚动同步">
        <FontAwesomeIcon :icon="scrollSyncEnabled ? faLock : faLockOpen" />
      </button>

      <span class="eo-sep" />

      <button @click="toggleTheme" :title="`当前主题: ${themeRef}，点击切换`">
        <FontAwesomeIcon :icon="themeRef === 'typora-light' ? faSun : faMoon" />
      </button>
      <button @click="openInfo" title="关于" aria-label="关于">
        <FontAwesomeIcon :icon="faInfoCircle" />
      </button>
    </header>

    <!-- editor body -->
    <main class="eo-body" @drop="onDrop" @dragover.prevent>
      <!-- source pane -->
      <section class="eo-source" v-show="viewMode !== 'full'">
        <div class="eo-gutter" aria-hidden="true">
          <div v-for="n in lineNumbers" :key="n" class="eo-line-no">{{ n }}</div>
        </div>
        <div class="eo-source-stack">
          <pre
            ref="overlayRef"
            class="eo-overlay"
            v-html="highlighted"
          />
          <textarea
            ref="textareaRef"
            class="eo-textarea"
            :value="content"
            spellcheck="false"
            placeholder="在这里输入 Markdown…（Ctrl+B I K，粗体 / 斜体 / 链接）"
            @beforeinput="onBeforeInput"
            @keydown="onKeydown"
            @input="(e) => { content = (e.target as HTMLTextAreaElement).value; scheduleSave(); }"
            @paste="onPaste"
            @scroll="onSourceScroll"
          />
        </div>
      </section>

      <!-- preview pane -->
      <section ref="previewRef" class="eo-preview" :class="{ 'eo-preview--hidden': viewMode === 'hide' }" @scroll="onPreviewScroll">
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
      <span class="eo-tip">{{ scrollSyncEnabled ? '滚动同步 开' : '滚动同步 关' }}</span>
    </footer>

    <!-- info modal -->
    <Transition name="eo-fade">
      <div v-if="showInfo" class="eo-info-mask" @click.self="closeInfo">
        <div class="eo-info" role="dialog" aria-modal="true" aria-label="关于">
          <header class="eo-info-head">
            <strong>VUE-md-Forge</strong>
            <button class="eo-info-close" @click="closeInfo" aria-label="关闭">✕</button>
          </header>
          <div class="eo-info-body">
            <p>
              <strong>VUE-md-Forge</strong> 是一个基于 Vue 3 的 Markdown 编辑器插件，
              工具栏与图标参考
              <a href="https://github.com/luogu-dev/markdown-palettes" target="_blank" rel="noopener">luogu-dev/markdown-palettes</a>。
            </p>
            <p>
              特性：双栏实时预览、字符自动配对、行号、滚动同步、KaTeX 公式、
              代码高亮、CSP-friendly 零 CDN 产物。
            </p>
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
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: var(--mdf-bg-elev, #fff);
  border-bottom: 1px solid var(--mdf-line, #d0d7de);
  flex: 0 0 auto;
  min-height: 38px;
}
.eo-toolbar button {
  font: inherit;
  background: transparent;
  color: var(--mdf-fg, #1f2328);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  min-width: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.eo-toolbar button:hover { background: var(--mdf-hover, #f3f4f6); }
.eo-toolbar button.active { background: var(--mdf-accent-soft, #ddf4ff); color: var(--mdf-accent, #4183c4); }
.eo-toolbar .eo-sep {
  display: inline-block;
  width: 1px;
  height: 18px;
  background: var(--mdf-line, #d0d7de);
  margin: 0 6px;
}
.eo-btn-glyph {
  font-family: var(--mdf-font-sans, system-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.02em;
  min-width: 14px;
}

/* ── preview visibility (luogu semantics) ─────────────────────────── */
.editor-only[data-mdf-view='full'] .eo-source { display: none; }

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

/* hide-preview overrides the .eo-preview display rule above */
.eo-preview--hidden { display: none !important; }

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

/* ── info modal ────────────────────────────────────────────────────── */
.eo-info-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.eo-info {
  background: var(--mdf-pane-bg, #fff);
  color: var(--mdf-fg, #1f2328);
  border-radius: 10px;
  width: min(560px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  font-family: var(--mdf-font-sans, system-ui);
}
.eo-info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--mdf-line, #d0d7de);
  font-size: 14px;
}
.eo-info-close {
  background: transparent;
  border: 0;
  font-size: 16px;
  color: var(--mdf-muted, #6e7781);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.eo-info-close:hover { background: var(--mdf-hover, #f3f4f6); }
.eo-info-body {
  padding: 14px 22px 22px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.7;
}
.eo-info-body p { margin: 0 0 10px; }
.eo-info-body a { color: var(--mdf-accent, #4183c4); }
.eo-fade-enter-from, .eo-fade-leave-to { opacity: 0; }
.eo-fade-enter-active, .eo-fade-leave-active { transition: opacity 0.18s ease; }
</style>