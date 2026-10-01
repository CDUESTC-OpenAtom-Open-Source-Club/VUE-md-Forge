/**
 * editor-only-main.ts — standalone window for the dual-pane editor.
 *
 * Loads EditorOnly in a full-window layout (no preview hub chrome).
 * Used when the user wants a clean, distraction-free edit window
 * (e.g. opened in a separate browser tab via the demo).
 */
import { createApp } from 'vue';
import EditorOnly from './EditorOnly.vue';
import './styles/themes.css';
import './styles/editor-only.css';
// hljs token 颜色。EditorOnly 右侧渲染区输出 hljs token，
// 没有这份 CSS 时所有 token 颜色一致（视觉与无语言提示代码块无差异）。
// 主题切换由 [data-mdf-theme] 驱动。
import './styles/highlight.css';

const app = createApp(EditorOnly);
app.mount('#app');
