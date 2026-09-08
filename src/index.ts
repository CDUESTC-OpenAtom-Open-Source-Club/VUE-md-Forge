/**
 * vue-md-forge — public package entry.
 *
 * Library consumers import:
 *   import { MdEditor, MarkdownEngine, PairCompleter, ... } from 'vue-md-forge';
 *   import 'vue-md-forge/style.css';
 *
 * `MdEditor` is the recommended Vue 3 component; the core modules are
 * exported separately for users who only need the engine / helpers
 * without rendering an editor.
 */
import type { App } from 'vue';
import MdEditor from './MdEditor.vue';

export { default as MdEditor } from './MdEditor.vue';
export { default as EditorOnly } from './EditorOnly.vue';

export { MarkdownEngine } from './core/MarkdownEngine';
export { PairCompleter, PAIRS, type PairContext, type PairResult } from './core/PairCompleter';
export { sanitizeRenderedMarkdown } from './core/MarkdownSecurity';
export {
  looksLikeRichClipboard,
  htmlToMarkdown,
  type SmartPasteOptions,
  type SmartPasteResult
} from './core/SmartPaste';
export {
  createImageTask,
  ImageImporter,
  dataUrlToFile,
  type UploaderFn,
  type UploaderInput,
  type UploaderResult,
  type ImageImporterOptions
} from './core/ImageImporter';
export { AutoSave, type AutoSaveOptions, type AutoSaveStatus } from './core/AutoSave';
export { highlightMarkdown } from './core/highlight';

export type { Theme, MdEditorProps, MdEditorEmits } from './core/types';

export default {
  install(app: App) {
    app.component('MdEditor', MdEditor);
  }
};
