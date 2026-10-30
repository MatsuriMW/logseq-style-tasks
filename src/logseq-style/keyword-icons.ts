import { Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * Animated icon in front of each task keyword in the editor (Live Preview and
 * Source mode; Reading view is left alone).
 *
 * Icons are Lucide (ISC license); the animations follow lucide-animated
 * (https://github.com/pqoqubbw/icons, MIT) translated to CSS, see the
 * "Keyword icons" section of styles.css.
 *
 * Only the active group (DOING, NOW, …) animates continuously. Other icons
 * play once, right after the line switches to that keyword; scrolling,
 * reopening a note, or a change touching more than five lines does not
 * replay them.
 */

const P = (d: string, cls?: string) =>
  `<path${cls ? ` class="${cls}"` : ''} d="${d}"${cls && cls.includes('draw') ? ' pathLength="1"' : ''}/>`;
const ICON: Record<string, string> = {
  todo: [
    'M10.1 2.182a10 10 0 0 1 3.8 0',
    'M17.609 3.721a10 10 0 0 1 2.69 2.7',
    'M21.818 10.1a10 10 0 0 1 0 3.8',
    'M20.279 17.609a10 10 0 0 1-2.7 2.69',
    'M13.9 21.818a10 10 0 0 1-3.8 0',
    'M6.391 20.279a10 10 0 0 1-2.69-2.7',
    'M2.182 13.9a10 10 0 0 1 0-3.8',
    'M3.721 6.391a10 10 0 0 1 2.7-2.69',
  ]
    .map(
      (d: string, i: number) => `<path class="seg" style="--i:${i}" d="${d}"/>`,
    )
    .join(''),
  bot:
    P('M12 8V4H8') +
    '<rect x="4" y="8" width="16" height="12" rx="2"/>' +
    P('M2 14h2') +
    P('M20 14h2') +
    '<g class="eyes"><line x1="15" x2="15" y1="13" y2="15"/><line x1="9" x2="9" y1="13" y2="15"/></g>',
  doing: P('M21 12a9 9 0 1 1-6.219-8.56', 'spin'),
  done: '<circle cx="12" cy="12" r="10"/>' + P('m9 12 2 2 4-4', 'draw'),
  paused:
    '<rect class="l" x="6" y="4" width="4" height="16" rx="1"/><rect class="r" x="14" y="4" width="4" height="16" rx="1"/>',
  waiting:
    '<g class="flip">' +
    P('M5 22h14') +
    P('M5 2h14') +
    P(
      'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22',
    ) +
    P(
      'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
    ) +
    '</g>',
  suspended:
    '<g class="wob">' +
    [
      'm10 20-1.25-2.5L6 18',
      'M10 4 8.75 6.5 6 6',
      'm14 20 1.25-2.5L18 18',
      'm14 4 1.25 2.5L18 6',
      'm17 21-3-6h-4',
      'm17 3-3 6 1.5 3',
      'M2 12h6.5L10 9',
      'm20 10-1.5 2 1.5 2',
      'M22 12h-6.5L14 15',
      'm4 10 1.5 2L4 14',
      'm7 21 3-6-1.5-3',
      'm7 3 3 6h4',
    ]
      .map((d: string) => P(d))
      .join('') +
    '</g>',
  cancelled:
    '<circle class="draw" pathLength="1" cx="12" cy="12" r="10"/>' +
    P('m4.9 4.9 14.2 14.2', 'draw slash'),
  failed: P('M18 6 6 18', 'draw') + P('m6 6 12 12', 'draw late'),
  review:
    P(
      'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      'lid',
    ) + '<circle class="pupil" cx="12" cy="12" r="3"/>',
  needok:
    '<g class="wave">' +
    P('M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2') +
    P('M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2') +
    P('M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8') +
    P(
      'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
    ) +
    '</g>',
  errored:
    '<g class="shake">' +
    P(
      'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z',
    ) +
    '<line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></g>',
  hitlimit: P('m12 14 4-4', 'needle') + P('M3.34 19a10 10 0 1 1 17.32 0'),
  delegated:
    '<g class="fly">' +
    P(
      'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
    ) +
    P('m21.854 2.147-10.94 10.939') +
    '</g>' +
    '<path class="trail" stroke-dasharray="2 2" d="M -3 28 C -0.5 26.8 1.6 24.6 3.3 22 C 4.8 19.7 5.2 17.6 4.2 16.1 C 3.2 14.7 1.4 14.5 0.3 15.8 C -0.9 17.2 -0.6 19.4 1.2 20.4 C 3.4 21.5 6.4 19.4 9 15.8"/>',
  yes:
    '<g class="thumb">' +
    P('M7 10v12') +
    P(
      'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
    ) +
    '</g>',
  no:
    '<g class="thumb">' +
    P('M17 14V2') +
    P(
      'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z',
    ) +
    '</g>',
  maybe:
    '<circle cx="12" cy="12" r="10"/>' +
    '<g class="q">' +
    P('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3') +
    P('M12 17h.01') +
    '</g>',
  queued:
    '<g class="ring">' +
    P('M18 20.5L19.5 22') +
    P('M6 20.5L4.5 22') +
    P(
      'M21 13C21 17.968 16.968 22 12 22C7.032 22 3 17.968 3 13C3 8.032 7.032 4 12 4C16.968 4 21 8.032 21 13Z',
    ) +
    P(
      'M15.339 15.862L12.549 14.197C12.063 13.909 11.667 13.216 11.667 12.649V8.95898',
    ) +
    '</g>' +
    '<g class="bells">' +
    P('M18 2L21.747 5.31064') +
    P('M6 2L2.25304 5.31064') +
    '</g>',
};

/** Icon for a built-in or commonly used keyword */
const KIND: Record<string, string> = {
  TODO: 'todo',
  LATER: 'todo',
  TODOFORAI: 'bot',
  TODO4AI: 'bot',
  TODO2AI: 'bot',
  TODOTOAI: 'bot',
  DOING: 'doing',
  NOW: 'doing',
  'IN-PROGRESS': 'doing',
  DONE: 'done',
  PAUSED: 'paused',
  WAITING: 'waiting',
  WAIT: 'waiting',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  FAILED: 'failed',
  TOREVIEW: 'review',
  NEEDOK: 'needok',
  ERRORED: 'errored',
  HITLIMIT: 'hitlimit',
  QUEUED: 'queued',
  DELEGATED: 'delegated',
  YES: 'yes',
  NO: 'no',
  MAYBE: 'maybe',
};

/** Icon for a custom keyword, by its keyword group */
const GROUP_KIND: Record<string, string> = {
  inactiveKeywords: 'todo',
  activeKeywords: 'doing',
  waitingKeywords: 'waiting',
  completedKeywords: 'done',
};

export interface KeywordIconConfig {
  keywords: string[];
  groupOf: (keyword: string) => string | null;
}

const FIRE_MS = 2500;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class Icon extends WidgetType {
  constructor(
    readonly keyword: string,
    readonly kind: string,
    readonly fire: number,
  ) {
    super();
  }

  eq(other: Icon): boolean {
    return other.keyword === this.keyword && other.fire === this.fire;
  }

  toDOM(): HTMLElement {
    const el = createSpan();
    el.className = `tsq-ico tsq-ico-${this.kind}${this.fire ? ' is-fire' : ''}`;
    el.setAttribute('data-kw', this.keyword);
    el.setAttribute('aria-hidden', 'true');
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[this.kind]}</svg>`,
      'image/svg+xml',
    ).documentElement;
    el.appendChild(document.importNode(svg, true));
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const inCode = (view: EditorView, pos: number): boolean => {
  for (
    let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null =
      syntaxTree(view.state).resolveInner(pos, 1);
    n;
    n = n.parent
  ) {
    if (/codeblock|inline-code|frontmatter|hmd-code/i.test(n.name)) return true;
  }
  return false;
};

export function keywordIconsExtension(
  getConfig: () => KeywordIconConfig | null,
): Extension {
  let cachedKeywords = '';
  let line: RegExp | null = null;
  const lineRegex = (keywords: string[]): RegExp => {
    const key = keywords.join('|');
    if (!line || key !== cachedKeywords) {
      cachedKeywords = key;
      const alternation = keywords
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(escape)
        .join('|');
      // Keyword at the start of the line, after quote, list marker and a bold **07:37** time
      line = new RegExp(
        `^(\\s*(?:>\\s*)*(?:(?:[-*+]|\\d+[.)])\\s+)?(?:\\*\\*\\d{1,2}[:：]\\d{2}\\*\\*\\s*)?)(${alternation})(?=\\s|$)`,
      );
    }
    return line;
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      fires = new Map<number, { keyword: string; id: number; at: number }>();
      seq = 0;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      keywordOf(text: string, config: KeywordIconConfig) {
        const m = lineRegex(config.keywords).exec(text);
        return m ? { at: m[1].length, keyword: m[2] } : null;
      }

      /** The text without keyword, time and priority: stays the same when only the keyword changes */
      bodyOf(text: string, config: KeywordIconConfig): string {
        return text
          .replace(lineRegex(config.keywords), '$1')
          .replace(
            /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*\d{1,2}[:：]\d{2}\*\*\s*)?/,
            '',
          )
          .replace(
            /^\s*(?:\[#[ABC]\]\s*)?(?:\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*)?(?:\[#[ABC]\]\s*)?/,
            '',
          )
          .trim();
      }

      kindOf(keyword: string, config: KeywordIconConfig): string | null {
        return (
          KIND[keyword] ?? GROUP_KIND[config.groupOf(keyword) ?? ''] ?? null
        );
      }

      update(u: ViewUpdate) {
        const config = getConfig();
        if (u.docChanged && config) {
          const now = Date.now();
          const moved = new Map<
            number,
            { keyword: string; id: number; at: number }
          >();
          for (const [pos, f] of this.fires) {
            if (now - f.at < FIRE_MS) moved.set(u.changes.mapPos(pos, 1), f);
          }
          this.fires = moved;
          const a = u.startState.doc;
          const b = u.state.doc;
          const fresh: [number, string][] = [];
          let lines = 0;
          u.changes.iterChangedRanges((fa, ta, fb, tb) => {
            const was = new Map<string, string>();
            for (
              let n = a.lineAt(fa).number, end = a.lineAt(ta).number;
              n <= end && lines < 50;
              n++, lines++
            ) {
              const t = a.line(n).text;
              was.set(
                this.bodyOf(t, config),
                this.keywordOf(t, config)?.keyword ?? '',
              );
            }
            for (
              let n = b.lineAt(fb).number, end = b.lineAt(tb).number;
              n <= end && lines < 100;
              n++, lines++
            ) {
              const l = b.line(n);
              const k = this.keywordOf(l.text, config);
              if (!k) continue;
              const old = was.get(this.bodyOf(l.text, config));
              if (old !== undefined && old !== k.keyword)
                fresh.push([l.from, k.keyword]);
            }
          });
          if (fresh.length && fresh.length <= 5) {
            for (const [pos, keyword] of fresh) {
              this.fires.set(pos, { keyword, id: ++this.seq, at: now });
            }
          }
        }
        if (u.docChanged || u.viewportChanged || this.fires.size) {
          this.decorations = this.build(u.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const out = new RangeSetBuilder<Decoration>();
        const config = getConfig();
        if (!config) return out.finish();
        const doc = view.state.doc;
        const now = Date.now();
        for (const [pos, f] of this.fires) {
          if (now - f.at >= FIRE_MS) this.fires.delete(pos);
        }
        // An embed in the middle of a line splits it into two visible ranges:
        // continue after the last scanned line so a line never gets two icons
        let next = 0;
        for (const { from, to } of view.visibleRanges) {
          for (let pos = Math.max(from, next); pos <= to;) {
            const l = doc.lineAt(pos);
            const k = this.keywordOf(l.text, config);
            const kind = k && this.kindOf(k.keyword, config);
            if (k && kind && !inCode(view, l.from)) {
              const f = this.fires.get(l.from);
              const fire = f && f.keyword === k.keyword ? f.id : 0;
              out.add(
                l.from + k.at,
                l.from + k.at,
                Decoration.widget({
                  widget: new Icon(k.keyword, kind, fire),
                  side: -1,
                }),
              );
            }
            pos = next = l.to + 1;
          }
        }
        return out.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}
