/**
 * SmartPaste — convert rich clipboard HTML into Markdown heuristically.
 *
 * Ported from club-web `frontend/src/components/editor/MarkdownEditor.vue` (origin/main @ 4775e46).
 *
 * Heuristics ported verbatim, because they are battle-tested against real-world
 * clipboard payloads in the club-web demo seed:
 *   - DOM walk with tag-based dispatch (h1-h6 / strong / em / ul / ol / pre / code / img / a)
 *   - shell command detection (`looksLikeShellLine` + `collectCommandBlock`) with here-doc support
 *   - inline code merge across broken paragraphs
 *   - list item fragment merge across lines
 *
 * Club-web coupled to `fileApi` and `ElMessage`; both are now injected as callbacks
 * so the plugin stays host-agnostic (zero UI framework dependency).
 */

export interface SmartPasteOptions {
  /** Files extracted from the clipboard's `image/*` items, if any. */
  imageFiles: File[];
  /**
   * Callback to enqueue a remote image. The smart-paste flow then keeps the
   * returned placeholder alive so `ImageImporter` can swap it for a real URL later.
   */
  createImageTask: (input: { file?: File; src?: string; alt: string }) => ImageTask;
}

export interface ImageTask {
  id: string;
  placeholder: string;
  src?: string;
  file?: File;
  alt: string;
}

export interface SmartPasteResult {
  markdown: string;
  imageTasks: ImageTask[];
}

const RICH_HTML_PATTERN = /<(img|h[1-6]|p|div|br|ul|ol|li|blockquote|pre|table|strong|b|em|i|a|code)\b/i;
const CODE_CONTAINER_PATTERN = /\b(code|code-block|codeblock|highlight|hljs|prism|language-|cm-line|monaco|prettyprint)\b/i;
const SHELL_COMMAND_PATTERN =
  /^(cd|git|npm|pnpm|yarn|mvn|java|javac|sudo|su|chown|chmod|cat|export|exec|mkdir|cp|mv|rm|touch|systemctl|service|nginx|docker|docker-compose|psql|createdb|createuser|ssh|scp|rsync|curl|wget|tar|unzip|zip|vim|nano|source|alias|echo|sed|awk|grep)\b/;
const MARKDOWN_BOUNDARY_PATTERN =
  /^(```|#{1,6}\s|>\s|[-*+]\s+\S|\d+\.\s+\S|!\[|[<\[])/;
const PLACEHOLDER_PREFIX = 'openatom-image-import';

export function looksLikeRichClipboard(event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;

  const hasImage = Array.from(data.items || []).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  );
  if (hasImage) return true;

  const html = data.getData('text/html');
  return Boolean(html && RICH_HTML_PATTERN.test(html));
}

export function htmlToMarkdown(html: string, options: SmartPasteOptions = { imageFiles: [], createImageTask: defaultCreateImageTask }): SmartPasteResult {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const imageTasks: ImageTask[] = [];
  const markdown = normalizeMarkdown(
    mergeBrokenListInlineFragments(
      mergeIsolatedInlineCodeBlocks(
        formatLooseCommandBlocks(
          nodesToMarkdown(
            Array.from(document.body.childNodes),
            { imageFiles: options.imageFiles, imageTasks, createImageTask: options.createImageTask }
          )
        )
      )
    )
  );
  return { markdown, imageTasks };
}

interface NodeCtx {
  imageFiles: File[];
  imageTasks: ImageTask[];
  createImageTask: SmartPasteOptions['createImageTask'];
}

function nodesToMarkdown(nodes: Node[], ctx: NodeCtx): string {
  const parts: string[] = [];
  let commandLines: string[] = [];

  const flushCommandLines = () => {
    if (!commandLines.length) return;
    parts.push(fencedCode(commandLines.join('\n'), 'bash'));
    commandLines = [];
  };

  for (const node of nodes) {
    const codeLine = commandLineFromNode(node);
    if (codeLine !== null) {
      commandLines.push(codeLine);
      continue;
    }

    flushCommandLines();
    parts.push(nodeToMarkdown(node, ctx));
  }

  flushCommandLines();
  return parts.filter(Boolean).join('\n\n');
}

function nodeToMarkdown(node: Node, ctx: NodeCtx): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeInlineText(node.textContent || '');
  }
  if (!(node instanceof HTMLElement)) return '';

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'img') {
    return imageNodeToMarkdown(imageSrcFromElement(node), node.getAttribute('alt') || '图片', ctx);
  }
  if (tag === 'code') {
    const content = (node.textContent || '').trim();
    if (content.includes('\n')) return fencedCode(content, languageFromElement(node));
    return `\`${content}\``;
  }
  if (tag === 'pre' || isCodeContainer(node)) {
    return fencedCode(codeTextFromElement(node), languageFromElement(node));
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((child, index) => {
        const content = normalizeMarkdown(childrenToMarkdown(child, ctx)).replace(/\n+/g, '\n  ');
        return `${tag === 'ol' ? `${index + 1}.` : '-'} ${content}`;
      });
    return `\n\n${items.join('\n')}\n\n`;
  }
  if (tag === 'blockquote') {
    const content = normalizeMarkdown(childrenToMarkdown(node, ctx));
    return `\n\n${content.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
  }
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const content = normalizeMarkdown(childrenToMarkdown(node, ctx));
    return `\n\n${'#'.repeat(level)} ${content}\n\n`;
  }
  if (tag === 'strong' || tag === 'b') {
    const content = normalizeMarkdown(childrenToMarkdown(node, ctx));
    return content ? `**${content}**` : '';
  }
  if (tag === 'em' || tag === 'i') {
    const content = normalizeMarkdown(childrenToMarkdown(node, ctx));
    return content ? `*${content}*` : '';
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const content = normalizeMarkdown(childrenToMarkdown(node, ctx)) || href;
    return href ? `[${content}](${href})` : content;
  }

  const content = childrenToMarkdown(node, ctx);
  if (['p', 'div', 'section', 'article', 'header', 'footer', 'tr'].includes(tag)) {
    return `\n\n${normalizeMarkdown(content)}\n\n`;
  }
  if (['td', 'th'].includes(tag)) {
    return `${normalizeMarkdown(content)} `;
  }
  return content;
}

function childrenToMarkdown(element: Element, ctx: NodeCtx) {
  return nodesToMarkdown(Array.from(element.childNodes), ctx);
}

function commandLineFromNode(node: Node) {
  if (!(node instanceof HTMLElement)) return null;
  const tag = node.tagName.toLowerCase();
  if (!['p', 'div', 'span'].includes(tag)) return null;
  if (node.querySelector('img, table, ul, ol, pre')) return null;
  if (isCodeContainer(node)) return null;

  const text = codeTextFromElement(node);
  const lines = text.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
  if (lines.length !== 1) return null;

  const line = lines[0];
  return looksLikeShellLine(line) ? line : null;
}

function looksLikeShellLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 220) return false;
  if (/[。；,]$/.test(trimmed)) return false;
  if (/^(AI写代码|说明|注意|提示|先使用|将项目|创建|确认|然后|接着|最后)/.test(trimmed)) return false;
  if (/^(#!|\/\/|\$ |>>> |PS>|C:\\|\.\/|\/)/.test(trimmed)) return true;
  if (SHELL_COMMAND_PATTERN.test(trimmed)) return true;
  if (/^(if|then|else|elif|fi|for|while|do|done|case|esac)\b/.test(trimmed)) return true;
  if (/^(EOF|[A-Z_][A-Z0-9_]*=|export\s+[A-Z_])/i.test(trimmed)) return true;
  if (/\\$/.test(trimmed) || /<<['"]?[A-Z0-9_]+['"]?/.test(trimmed)) return true;
  return false;
}

function formatLooseCommandBlocks(markdown: string) {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let index = 0;
  let insideFence = false;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      result.push(line);
      index += 1;
      continue;
    }
    if (!insideFence && looksLikeShellLine(line)) {
      const block = collectCommandBlock(lines, index);
      result.push(fencedCode(block.lines.join('\n'), 'bash').trim());
      index = block.nextIndex;
      continue;
    }
    result.push(line);
    index += 1;
  }
  return result.join('\n');
}

function collectCommandBlock(lines: string[], startIndex: number) {
  const block: string[] = [];
  let index = startIndex;
  let allowContinuation = false;
  let hereDocEnd = '';

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed) break;
    if (shouldSkipLooseCodeLine(trimmed)) {
      index += 1;
      continue;
    }
    const isCommand = looksLikeShellLine(trimmed);
    const isContinuation = allowContinuation && !looksLikeNaturalText(trimmed);
    const isHereDocBody = Boolean(hereDocEnd);
    if (!isCommand && !isContinuation && !isHereDocBody) break;

    block.push(rawLine.trimEnd());

    if (hereDocEnd && trimmed === hereDocEnd) {
      hereDocEnd = '';
      allowContinuation = false;
      index += 1;
      break;
    }
    hereDocEnd = hereDocEnd || extractHereDocEnd(trimmed);
    allowContinuation = Boolean(hereDocEnd) || /\\$/.test(trimmed);
    index += 1;
  }
  return { lines: block, nextIndex: index };
}

function extractHereDocEnd(line: string) {
  const match = line.match(/<<-?\s*['"]?([A-Z0-9_]+)['"]?/);
  return match?.[1] || '';
}

function shouldSkipLooseCodeLine(line: string) {
  return /^AI(?:写代码|生成|提示)/.test(line);
}

function looksLikeNaturalText(line: string) {
  return /[一-龥]/.test(line) && /[，。；：]/.test(line);
}

function mergeIsolatedInlineCodeBlocks(markdown: string) {
  const blocks = markdown.split(/\n{2,}/);
  const merged: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index].trim();
    const previous = merged[merged.length - 1];
    const next = blocks[index + 1]?.trim() || '';

    if (previous && next && isSingleInlineCodeBlock(block) && canMergeInlineCodeWith(previous, next)) {
      merged[merged.length - 1] = `${trimRightForInlineMerge(previous)} ${block} ${trimLeftForInlineMerge(next)}`;
      index += 1;
      continue;
    }
    if (next && isSingleInlineCodeBlock(block) && shouldPrefixInlineCodeToNext(next)) {
      merged.push(`${block} ${trimLeftForInlineMerge(next)}`);
      index += 1;
      continue;
    }
    merged.push(block);
  }
  return merged.join('\n\n');
}

function isSingleInlineCodeBlock(block: string) {
  return /^`[^`\n]{1,80}`$/.test(block.trim());
}

function canMergeInlineCodeWith(previous: string, next: string) {
  if (isMarkdownBoundary(previous) || isMarkdownBoundary(next)) return false;
  if (/^\s*[-*+]\s*$/.test(previous)) return false;
  return true;
}

function shouldPrefixInlineCodeToNext(next: string) {
  const value = next.trim();
  if (isMarkdownBoundary(value)) return false;
  return /^[一-龥A-Za-z0-9]/.test(value);
}

function isMarkdownBoundary(block: string) {
  return MARKDOWN_BOUNDARY_PATTERN.test(block.trim());
}

function trimRightForInlineMerge(value: string) {
  return value.replace(/[ \t]+$/g, '');
}
function trimLeftForInlineMerge(value: string) {
  return value.replace(/^[ \t]+/g, '');
}

function mergeBrokenListInlineFragments(markdown: string) {
  const lines = markdown.split('\n');
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)[-*+]\s*(.*)$/);
    if (!match) {
      result.push(line);
      continue;
    }
    const continuations: string[] = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex];
      if (!nextLine.trim()) break;
      if (/^\s*[-*+]\s+/.test(nextLine)) break;
      if (!/^\s{2,}\S/.test(nextLine)) break;
      continuations.push(nextLine.trim());
      nextIndex += 1;
    }
    if (continuations.length && shouldMergeListFragments(match[2], continuations)) {
      result.push(`${match[1]}- ${normalizeInlineListText([match[2], ...continuations])}`);
      index = nextIndex - 1;
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

function shouldMergeListFragments(firstText: string, fragments: string[]) {
  const items = [firstText, ...fragments].map((item) => item.trim()).filter(Boolean);
  if (!items.length) return false;
  if (items.some((item) => isMarkdownBoundary(item) || item.includes('```'))) return false;
  if (!items.some((item) => isSingleInlineCodeBlock(item))) return false;
  return items.every((item) => item.length <= 120);
}

function normalizeInlineListText(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^`([、,.;；:：])/g, '$1'))
    .join(' ')
    .replace(/\s+([、,.;；:：])/g, '$1')
    .replace(/([（(])\s+/g, '$1')
    .replace(/\s+([）)])/g, '$1');
}

function isCodeContainer(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  const text = codeTextFromElement(element).trim();
  const lines = text.split('\n').filter((line) => line.trim());
  if (['span', 'a', 'strong', 'b', 'em', 'i', 'code'].includes(tag) && lines.length <= 1) return false;
  if (lines.length <= 1 && text.length <= 80 && !looksLikeShellLine(text)) return false;

  const className = element.className ? String(element.className) : '';
  const role = element.getAttribute('role') || '';
  const style = element.getAttribute('style') || '';
  return (
    CODE_CONTAINER_PATTERN.test(className) ||
    CODE_CONTAINER_PATTERN.test(role) ||
    /font-family\s*:\s*[^;]*(monospace|Consolas|Menlo|Monaco|Courier)/i.test(style)
  );
}

function languageFromElement(element: HTMLElement) {
  const className = element.className ? String(element.className) : '';
  const match =
    className.match(/language-([a-z0-9_-]+)/i) || className.match(/lang(?:uage)?-([a-z0-9_-]+)/i);
  if (match?.[1]) return match[1].toLowerCase();
  const text = codeTextFromElement(element);
  return /(^|\n)\s*(cd|git|sudo|chmod|chown|cat|export|exec|systemctl|docker|psql)\b/.test(text)
    ? 'bash'
    : '';
}

function codeTextFromElement(element: HTMLElement) {
  return (element.innerText || element.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function fencedCode(code: string, language = '') {
  const value = code.replace(/```/g, '``\\`').trimEnd();
  if (!value) return '';
  return `\n\n\`\`\`${language}\n${value}\n\`\`\`\n\n`;
}

function imageNodeToMarkdown(src: string, alt: string, ctx: NodeCtx): string {
  const safeAlt = safeImageAlt(alt);

  if (ctx.imageFiles.length) {
    const file = ctx.imageFiles.shift();
    if (file) {
      const task = ctx.createImageTask({ file, alt: safeAlt });
      ctx.imageTasks.push(task);
      return `\n\n${task.placeholder}\n\n`;
    }
  }
  if (!src) return createFailedImageText(safeAlt, '未读取到图片地址');
  if (shouldUseClipboardFileForImage(src)) {
    return createFailedImageText(safeAlt, '该图片只存在于剪贴板临时地址中');
  }
  const task = ctx.createImageTask({ src, alt: safeAlt });
  ctx.imageTasks.push(task);
  return `\n\n${task.placeholder}\n\n`;
}

function defaultCreateImageTask(input: { file?: File; src?: string; alt: string }): ImageTask {
  const id = `${PLACEHOLDER_PREFIX}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    placeholder: `<!-- ${id} -->\n> 图片正在导入：${input.alt}\n<!-- /${id} -->`,
    src: input.src,
    file: input.file,
    alt: input.alt
  };
}

function createFailedImageText(alt: string, reason: string) {
  return `> 图片未导入：${alt}。${reason}。`;
}

function shouldUseClipboardFileForImage(src: string) {
  if (!src) return true;
  if (/^(blob:|file:|cid:|webkit-fake-url:)/i.test(src)) return true;
  if (/^https?:\/\//i.test(src) || src.startsWith('/')) return false;
  return true;
}

function imageSrcFromElement(element: HTMLElement) {
  const candidates = [
    element.getAttribute('src'),
    element.getAttribute('data-src'),
    element.getAttribute('data-original'),
    element.getAttribute('data-actualsrc'),
    element.getAttribute('data-lazy-src'),
    element.getAttribute('data-url'),
    element.getAttribute('data-image-src'),
    firstSrcsetUrl(element.getAttribute('srcset') || element.getAttribute('data-srcset'))
  ];
  return candidates
    .map((value) => (value || '').trim())
    .find((value) => value && !isTransparentPlaceholder(value)) || '';
}

function firstSrcsetUrl(srcset: string | null) {
  if (!srcset) return '';
  const first = srcset.split(',')[0]?.trim();
  return first?.split(/\s+/)[0] || '';
}

function isTransparentPlaceholder(src: string) {
  return /^(about:blank|data:image\/gif;base64,R0lGODlhAQABAIAAAAAAAP)/i.test(src);
}

function safeImageAlt(value: string) {
  return normalizeInlineText(value).replace(/[[\]()]/g, '') || '图片';
}

function normalizeInlineText(value: string) {
  return value.replace(/ /g, ' ').replace(/[ \t\r\n]+/g, ' ');
}

function normalizeMarkdown(value: string) {
  return value
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
