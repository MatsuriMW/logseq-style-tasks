/**
 * "todos:" parent block. A list item that only says "todos:" turns its
 * direct children into tasks: a child without a keyword or checkbox is read
 * as TODO, and the keyword is written into the line the first time its state
 * changes. Grandchildren are not affected.
 *
 * - todos:
 *   - write the report      ← TODO
 *   - DOING review the PR   ← keeps its own keyword
 */

const HEAD =
  /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+(?:\*\*)?todos(?:\*\*)?\s*(?:[:：]|$)/i;
const ITEM = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)(.*)$/;
// A bold time stamp such as **07:37** may sit between the marker and the text
const TIME_STAMP = /^\*\*\d{1,2}[:：]\d{2}\*\*\s*/;
const MARKER_WITH_TIME =
  /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+(?:\*\*\d{1,2}[:：]\d{2}\*\*\s*)?)/;
// Log lines written under a task by other tools are not tasks
const NOT_A_TASK = /^(?:⏱|🔗|💬|📸|🤖|-{3,}\s*$)/u;

let enabled = true;

export function setTodosParentBlock(value: boolean): void {
  enabled = value;
}

const width = (line: string) =>
  (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;

function startsWithKeyword(text: string, keywords: string[]): boolean {
  const word = /^(\S+)(?=\s|$)/.exec(text)?.[1];
  return !!word && keywords.includes(word.toUpperCase());
}

/** Whether the text after a list marker would become an implicit TODO */
function isPlainEntry(rest: string, keywords: string[]): boolean {
  const text = rest.replace(TIME_STAMP, '');
  return (
    !!text.trim() &&
    !/^\[.\](\s|$)/.test(text) &&
    !startsWithKeyword(text, keywords) &&
    !NOT_A_TASK.test(text)
  );
}

/** Insert TODO after the list marker (and time stamp, if any) */
export function withTodo(line: string, keyword = 'TODO'): string {
  return line.replace(MARKER_WITH_TIME, `$1${keyword} `);
}

/**
 * Whether line n is a plain direct child of a "todos:" item.
 * getLine returns undefined past the end of the document.
 */
export function isTodosChild(
  getLine: (n: number) => string | undefined,
  n: number,
  keywords: string[],
): boolean {
  if (!enabled) return false;
  const line = getLine(n);
  const m = ITEM.exec(line ?? '');
  if (!line || !m || !isPlainEntry(m[2], keywords)) return false;
  const w = width(line);
  for (let j = n - 1; j >= 0; j--) {
    const prev = getLine(j);
    if (typeof prev !== 'string' || !prev.trim() || !ITEM.test(prev)) continue;
    if (width(prev) >= w) continue;
    return HEAD.test(prev);
  }
  return false;
}

/**
 * Rewrite the lines of a file so that the plain children of every "todos:"
 * item carry an explicit TODO. Line count and positions are unchanged.
 */
export function applyTodosParent(
  lines: string[],
  keywords: string[],
): string[] {
  if (!enabled || !lines.some((l) => HEAD.test(l))) return lines;
  const out = lines.slice();
  const stack: { w: number; head: boolean }[] = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !line.trim()) continue;
    const m = ITEM.exec(line);
    if (!m) continue;
    const w = width(line);
    while (stack.length && stack[stack.length - 1].w >= w) stack.pop();
    if (
      stack.length &&
      stack[stack.length - 1].head &&
      isPlainEntry(m[2], keywords)
    ) {
      out[i] = withTodo(line);
    }
    stack.push({ w, head: HEAD.test(line) });
  }
  return out;
}
