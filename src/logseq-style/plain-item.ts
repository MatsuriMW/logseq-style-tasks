import { Editor } from 'obsidian';

/**
 * Toggle task state on a line without a keyword: add the default keyword
 * instead of doing nothing. Headings, tables, code fences, math blocks,
 * HTML, horizontal rules, checkbox items and frontmatter are left alone.
 */

function inFrontmatter(editor: Editor, n: number): boolean {
  if (editor.getLine(0) !== '---') return false;
  if (n === 0) return true;
  for (let k = 1; k < editor.lineCount(); k++) {
    if (editor.getLine(k) === '---') return n <= k;
  }
  return false;
}

export function canAddKeyword(editor: Editor, n: number, line: string) {
  return !(
    /^\s*(#{1,6}\s|\||```|~~~|\$\$|<)/.test(line) ||
    /^\s*([-*+]\s+)?(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*[-*+]\s+\[.\]/.test(line) ||
    inFrontmatter(editor, n)
  );
}

/** Insert the keyword after any quote prefix and list marker */
export function addKeyword(
  editor: Editor,
  n: number,
  line: string,
  keyword: string,
): void {
  const m = /^(\s*(?:>\s*)*)((?:[-*+]|\d+[.)])(?:\s+|$))?/.exec(line);
  const prefix = (m?.[1] ?? '') + (m?.[2] ?? '');
  if (m?.[2] && !/\s$/.test(m[2])) {
    // "-" with nothing after it
    editor.replaceRange(` ${keyword} `, { line: n, ch: prefix.length });
  } else if (!m?.[2] && !line.trim()) {
    // empty line: start a list item
    editor.replaceRange(`- ${keyword} `, { line: n, ch: prefix.length });
    editor.setCursor({ line: n, ch: prefix.length + keyword.length + 3 });
  } else {
    editor.replaceRange(`${keyword} `, { line: n, ch: prefix.length });
  }
}
