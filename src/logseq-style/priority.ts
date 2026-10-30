import { Editor, Notice } from 'obsidian';
import { EditorView, ViewUpdate } from '@codemirror/view';

/**
 * Priority shorthand and the Eisenhower toggles.
 *
 * 1. Shorthand: a keyword followed by a / b / c ("todoa write", "todo a write",
 *    "doing b report") becomes "TODO [#A] write" when the cursor leaves the
 *    line. With a space, the letter must end the line, be followed by
 *    non-ASCII text, or by a space that isn't followed by a Latin letter, so
 *    "todo a book" stays an English sentence. A time right after the keyword
 *    ("DOING 14:05") stays in front of the priority.
 * 2. Keywords listed in "uppercaseKeywords" are uppercased when typed in
 *    lower or mixed case.
 * 3. Toggle "important" / "urgent": A = important and urgent, B = urgent,
 *    C = important, neither = no priority.
 */

const ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)(\*\*\d{1,2}[:：]\d{2}\*\*\s*)?(.*)$/;
const TIME = /^\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*/;
const PRIO = /\[#([ABC])\]/;
const AXES: Record<string, [number, number]> = {
  A: [1, 1],
  B: [0, 1],
  C: [1, 0],
}; // [important, urgent]
const LABEL: Record<string, string> = {
  A: 'Priority A · important and urgent',
  B: 'Priority B · urgent',
  C: 'Priority C · important',
  '': 'Priority removed',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternation = (keywords: string[]) =>
  keywords
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');

function short(text: string, keywords: string[]) {
  // Two-letter keywords such as NO would rewrite ordinary English ("no a …")
  const longEnough = keywords.filter((k) => k.length > 2);
  const k = new RegExp(`^(${alternation(longEnough)})`, 'i').exec(text);
  if (!k) return null;
  const rest = text.slice(k[0].length);
  const m =
    // eslint-disable-next-line no-control-regex -- [^\x00-\x7f] matches non-ASCII text
    /^([abcABC])(?=$|[\s:：]|[^\x00-\x7f])/.exec(rest) ||
    // eslint-disable-next-line no-control-regex -- [^\x00-\x7f] matches non-ASCII text
    /^[ \t]+([abcABC])(?=$|[^\x00-\x7f]|[ \t]+(?![ \tA-Za-z]))/.exec(rest);
  if (!m) return null;
  return {
    keyword: k[1].toUpperCase(),
    priority: m[1].toUpperCase(),
    rest: rest.slice(m[0].length).replace(/^[\s:：]+/, ''),
  };
}

function joinPriority(priority: string, rest: string): string {
  const t = TIME.exec(rest);
  if (!t) return `[#${priority}]${rest ? ' ' + rest : ''}`;
  const after = rest.slice(t[0].length);
  return `${t[0].trimEnd()} [#${priority}]${after ? ' ' + after : ''}`;
}

/** The expanded line, or null when the line has no shorthand */
export function expandShorthand(
  line: string,
  keywords: string[],
  uppercaseKeywords: string[] = [],
): string | null {
  const m = ITEM.exec(line);
  if (!m) return null;
  const head = m[1] + (m[2] ?? '');
  if (uppercaseKeywords.length) {
    const u = new RegExp(`^(${alternation(uppercaseKeywords)})(?=\\s|$)`, 'i');
    const word = u.exec(m[3])?.[1];
    if (word) {
      return word === word.toUpperCase()
        ? null
        : head + word.toUpperCase() + m[3].slice(word.length);
    }
  }
  const p = short(m[3], keywords);
  return p ? `${head}${p.keyword} ${joinPriority(p.priority, p.rest)}` : null;
}

function axesOf(line: string): [number, number] {
  const p = PRIO.exec(line);
  return p ? [...AXES[p[1]]] : [0, 0];
}

/** Write or remove the priority after the checkbox, keyword and time */
export function setPriority(
  line: string,
  letter: string,
  keywords: string[],
): string {
  const out = line
    .replace(/[ \t]*\[#[ABC]\]/, '')
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]+$/, '');
  if (!letter) return out;
  const m = ITEM.exec(out);
  if (!m) return line;
  let rest = m[3];
  let head = '';
  const cb = /^\[.\](?:\s+|$)/.exec(rest);
  if (cb) {
    head += cb[0].trimEnd() + ' ';
    rest = rest.slice(cb[0].length);
  }
  const k = new RegExp(`^(${alternation(keywords)})(?:\\s+|$)`).exec(rest);
  if (k) {
    head += k[1] + ' ';
    rest = rest.slice(k[0].length);
    const t = TIME.exec(rest);
    if (t) {
      head += t[0].trimEnd() + ' ';
      rest = rest.slice(t[0].length);
    }
  }
  return `${m[1]}${m[2] ?? ''}${head}[#${letter}]${rest ? ' ' + rest : ''}`;
}

/** Flip one axis (0 = important, 1 = urgent) on every selected list item */
export function togglePriorityAxis(
  editor: Editor,
  axis: 0 | 1,
  keywords: string[],
  uppercaseKeywords: string[],
): void {
  const lines = new Set<number>();
  for (const s of editor.listSelections()) {
    const a = Math.min(s.anchor.line, s.head.line);
    const z = Math.max(s.anchor.line, s.head.line);
    if (a === z) {
      // On a continuation line, use the item it belongs to
      let n = a;
      while (n >= 0 && !ITEM.test(editor.getLine(n))) n--;
      if (n >= 0) lines.add(n);
    } else {
      for (let n = a; n <= z; n++) {
        if (ITEM.test(editor.getLine(n))) lines.add(n);
      }
    }
  }
  const changes = [];
  let last: string | null = null;
  for (const n of lines) {
    const old = editor.getLine(n);
    if (/^\s*[-*+]\s+-{3,}\s*$/.test(old)) continue; // horizontal rule
    const base = expandShorthand(old, keywords, uppercaseKeywords) ?? old;
    const ax = axesOf(base);
    ax[axis] = ax[axis] ? 0 : 1;
    const letter = ax[0] && ax[1] ? 'A' : ax[1] ? 'B' : ax[0] ? 'C' : '';
    const line = setPriority(base, letter, keywords);
    if (line === old) continue;
    changes.push({
      from: { line: n, ch: 0 },
      to: { line: n, ch: old.length },
      text: line,
    });
    last = letter;
  }
  if (last === null) {
    new Notice('Not on a list item');
    return;
  }
  editor.transaction({ changes });
  new Notice(LABEL[last]);
}

/**
 * Expand the shorthand on the line the cursor just left, the same way smart
 * dates wait until you are done typing.
 */
export function priorityShorthandExtension(
  getKeywords: () => { keywords: string[]; uppercase: string[] } | null,
) {
  return EditorView.updateListener.of((u: ViewUpdate) => {
    if (!u.selectionSet && !u.docChanged) return;
    const config = getKeywords();
    if (!config) return;
    const doc = u.state.doc;
    const oldHead = u.docChanged
      ? u.changes.mapPos(u.startState.selection.main.head, -1)
      : u.startState.selection.main.head;
    if (oldHead > doc.length) return;
    const line = doc.lineAt(oldHead);
    if (line.number === doc.lineAt(u.state.selection.main.head).number) return;
    const fixed = expandShorthand(line.text, config.keywords, config.uppercase);
    if (!fixed || fixed === line.text) return;
    const { from, text } = line;
    const view = u.view;
    window.setTimeout(() => {
      if (
        from + text.length > view.state.doc.length ||
        view.state.doc.sliceString(from, from + text.length) !== text
      ) {
        return;
      }
      view.dispatch({
        changes: { from, to: from + text.length, insert: fixed },
        userEvent: 'input.logseq-style-priority',
      });
    }, 0);
  });
}
