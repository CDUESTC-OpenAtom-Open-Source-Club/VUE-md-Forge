// Type shim for `@vscode/markdown-it-katex` (replaces unmaintained `markdown-it-katex`).
declare module '@vscode/markdown-it-katex' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt, options?: Record<string, unknown>) => void;
  export default plugin;
}
