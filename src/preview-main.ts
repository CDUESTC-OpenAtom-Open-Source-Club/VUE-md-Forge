import { createApp } from 'vue';
import Preview from './Preview.vue';
import './styles/preview.css';
// hljs token 颜色。EditorOnly / Preview 都会输出 <span class="hljs-*">,
// 必须有这份样式才能让代码块视觉上有区别。主题切换由 [data-mdf-theme] 驱动。
import './styles/highlight.css';

createApp(Preview).mount('#app');
