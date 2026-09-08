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

const app = createApp(EditorOnly);
app.mount('#app');
