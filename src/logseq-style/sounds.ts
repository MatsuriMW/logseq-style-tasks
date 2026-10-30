import { editorInfoField, TAbstractFile, TFile } from 'obsidian';
import { EditorView, ViewUpdate } from '@codemirror/view';
import type TodoTracker from '../main';

/**
 * Task state sounds: a short synthesized cue whenever a task's keyword
 * changes, whoever changed it (toggle, click, cycle group, the task list,
 * typing). No audio files; Web Audio oscillators only.
 *
 * Two moods: moving forward (TODO / DOING / DONE) uses sine and triangle
 * waves that step up, DONE settling softly on the tonic; stopping or failing
 * (PAUSED / WAITING / SUSPENDED / CANCELLED / FAILED) steps down, lower and
 * rougher the further from done. Volume is kept low: these play many times
 * a day. Nothing plays while Obsidian is not focused.
 */

type Cue = {
  type: OscillatorType;
  notes: [number, number][];
  vol?: number;
  attack?: number;
};

const SOUNDS: Record<string, Cue> = {
  TODO: { type: 'triangle', notes: [[523, 0.09]] },
  DOING: {
    type: 'sine',
    notes: [
      [523, 0.08],
      [784, 0.13],
    ],
  },
  DONE: {
    type: 'sine',
    notes: [
      [392, 0.09],
      [523, 0.22],
    ],
    vol: 0.85,
    attack: 0.03,
  },
  PAUSED: {
    type: 'sine',
    notes: [
      [587, 0.08],
      [494, 0.14],
    ],
    vol: 0.8,
  },
  WAITING: {
    type: 'sine',
    notes: [
      [494, 0.09],
      [494, 0.12],
    ],
    vol: 0.8,
  },
  SUSPENDED: {
    type: 'sine',
    notes: [
      [392, 0.1],
      [294, 0.18],
    ],
    vol: 0.8,
  },
  CANCELLED: {
    type: 'square',
    notes: [
      [330, 0.08],
      [247, 0.16],
    ],
    vol: 0.45,
  },
  FAILED: {
    type: 'sawtooth',
    notes: [
      [196, 0.1],
      [147, 0.22],
    ],
    vol: 0.5,
  },
  DELEGATED: {
    type: 'sine',
    notes: [
      [392, 0.05],
      [587, 0.12],
    ],
    vol: 0.6,
    attack: 0.02,
  },
  CLEAR: { type: 'triangle', notes: [[440, 0.06]], vol: 0.6 }, // keyword removed
};
const VOLUME = 0.1;

/** Cue for built-in and commonly used keywords */
const KEYWORD_CUE: Record<string, string> = {
  TODO: 'TODO',
  LATER: 'TODO',
  DOING: 'DOING',
  NOW: 'DOING',
  'IN-PROGRESS': 'DOING',
  DONE: 'DONE',
  PAUSED: 'PAUSED',
  TOREVIEW: 'WAITING',
  NEEDOK: 'WAITING',
  ERRORED: 'FAILED',
  HITLIMIT: 'SUSPENDED',
  QUEUED: 'SUSPENDED',
  DELEGATED: 'DELEGATED',
  WAITING: 'WAITING',
  WAIT: 'WAITING',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  YES: 'DONE',
  NO: 'CANCELLED',
  MAYBE: 'WAITING',
};
/** Cue for a custom keyword, by its keyword group */
const GROUP_CUE: Record<string, string> = {
  inactiveKeywords: 'TODO',
  activeKeywords: 'DOING',
  waitingKeywords: 'WAITING',
  completedKeywords: 'DONE',
};
// When several lines change at once, play only the most significant cue
const RANK = [
  'DONE',
  'FAILED',
  'CANCELLED',
  'DELEGATED',
  'DOING',
  'SUSPENDED',
  'WAITING',
  'PAUSED',
  'TODO',
  'CLEAR',
];

const STAMP = /^\*\*\d{1,2}[:：]\d{2}\*\*\s*/; // bold **07:37** time stamp
const CHECKBOX = /^\[([ xX/-])\]\s*/;
const LOG_LINE = /^(?:⏱|🔗|💬)/u; // log lines written by other tools

type Change = { body: string; from: string; to: string };

let audio: AudioContext | null = null;

export function playCue(name: string): void {
  const spec = SOUNDS[name];
  if (!spec) return;
  try {
    audio ??= new AudioContext({ latencyHint: 'interactive' });
    if (audio.state === 'suspended') void audio.resume();
    let t = audio.currentTime + 0.005;
    const vol = VOLUME * (spec.vol ?? 1);
    for (const [freq, len] of spec.notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(freq, t);
      // Fade in and out, or the start and end click
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + (spec.attack ?? 0.012));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len * 0.85;
    }
  } catch {
    // No audio device: stay silent
  }
}

export class TaskSounds {
  private snapshots = new Map<string, Map<string, string | null>>();
  private heard = new Map<string, { to: string; at: number }>();
  private cachedKeywords = '';
  private keywordRegex: RegExp | null = null;

  constructor(private plugin: TodoTracker) {}

  register(): void {
    const plugin = this.plugin;
    plugin.registerEditorExtension(this.liveExtension());
    plugin.registerEvent(
      plugin.app.vault.on('modify', (f) => void this.onModify(f)),
    );
    plugin.registerEvent(
      plugin.app.workspace.on('file-open', (f) => void this.baseline(f)),
    );
    plugin.app.workspace.onLayoutReady(() =>
      plugin.app.workspace.iterateAllLeaves((leaf) => {
        const file = (leaf.view as { file?: TFile }).file;
        if (file) void this.baseline(file);
      }),
    );
  }

  private get enabled(): boolean {
    return this.plugin.settings.taskSounds;
  }

  private keywords(): RegExp {
    const keywords = this.plugin.keywordManager.getAllKeywords();
    const key = keywords.join('|');
    if (!this.keywordRegex || key !== this.cachedKeywords) {
      this.cachedKeywords = key;
      const alternation = keywords
        .slice()
        .sort((a, b) => b.length - a.length)
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      this.keywordRegex = new RegExp(`^(${alternation})(?=\\s|$)\\s*`);
    }
    return this.keywordRegex;
  }

  /** A line's keyword and its text without keyword, time and priority */
  private parseLine(raw: string): { keyword: string; body: string } | null {
    let s = raw
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s+/, '')
      .replace(STAMP, '');
    let keyword = '';
    const cb = CHECKBOX.exec(s);
    if (cb) {
      keyword =
        cb[1] === ' '
          ? 'TODO'
          : cb[1] === '/'
            ? 'DOING'
            : cb[1] === '-'
              ? 'CANCELLED'
              : 'DONE';
      s = s.slice(cb[0].length);
    }
    const m = this.keywords().exec(s);
    if (m) {
      keyword = m[1];
      s = s.slice(m[0].length);
    }
    // A time or priority after the keyword changes with the state, it isn't text
    s = s
      .replace(/^\[#[ABC]\]\s*/, '')
      .replace(/^\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?\s*/, '')
      .replace(/^\[#[ABC]\]\s*/, '')
      .trim();
    if (!s || LOG_LINE.test(s)) return null;
    return { keyword, body: s };
  }

  private snapshot(content: string): Map<string, string | null> {
    const out = new Map<string, string | null>();
    let inCode = false;
    let count = 0;
    for (const raw of content.split('\n')) {
      if (/^\s*(```|~~~)/.test(raw)) {
        inCode = !inCode;
        continue;
      }
      if (inCode || !raw.trim() || ++count > 6000) continue;
      const r = this.parseLine(raw);
      // The same text twice can't be told apart: ignore it
      if (r) out.set(r.body, out.has(r.body) ? null : r.keyword);
    }
    return out;
  }

  /** Whether two versions of one line are a state change */
  private lineChange(oldRaw: string, newRaw: string): Change | null {
    const a = this.parseLine(oldRaw);
    const b = this.parseLine(newRaw);
    if (!a || !b || a.keyword === b.keyword) return null;
    if (a.body === b.body)
      return { body: b.body, from: a.keyword, to: b.keyword };
    // Typing a keyword: before the last keystroke the line was "half a keyword + text"
    if (!a.keyword && b.keyword && a.body.endsWith(b.body)) {
      const typed = a.body.slice(0, a.body.length - b.body.length).trim();
      if (typed && b.keyword.startsWith(typed)) {
        return { body: b.body, from: '', to: b.keyword };
      }
    }
    return null;
  }

  private cueOf(keyword: string): string {
    if (!keyword) return 'CLEAR';
    return (
      KEYWORD_CUE[keyword] ??
      GROUP_CUE[this.plugin.keywordManager.getGroup(keyword) ?? ''] ??
      'CLEAR'
    );
  }

  private play(changes: Change[]): void {
    if (!document.hasFocus()) return;
    const cue = changes
      .map((c) => this.cueOf(c.to))
      .sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
    if (cue) playCue(cue);
  }

  /**
   * The editor and the file write both see the same change (about two
   * seconds apart): play once. Remember what each line last changed to and
   * skip a repeat within a minute.
   */
  private fresh(path: string, changes: Change[]): Change[] {
    const now = Date.now();
    for (const [k, v] of this.heard)
      if (now - v.at > 60000) this.heard.delete(k);
    return changes.filter((c) => {
      const k = path + '\n' + c.body;
      const was = this.heard.get(k);
      this.heard.set(k, { to: c.to, at: now });
      return !(was && was.to === c.to);
    });
  }

  /**
   * Changes in the editor play right away. Only edits within one line count;
   * pastes, syncs and reloads touching more than three lines are left to the
   * file-write path.
   */
  private liveExtension() {
    return EditorView.updateListener.of((u: ViewUpdate) => {
      if (!u.docChanged || !this.enabled) return;
      const a = u.startState.doc;
      const b = u.state.doc;
      const changes: Change[] = [];
      let lines = 0;
      u.changes.iterChangedRanges((fa, ta, fb, tb) => {
        if (++lines > 3) return;
        const la = a.lineAt(fa);
        const lb = b.lineAt(fb);
        if (ta > la.to || tb > lb.to) {
          lines = 99;
          return;
        }
        const c = this.lineChange(la.text, lb.text);
        if (c) changes.push(c);
      });
      if (!changes.length || lines > 3) return;
      const info = u.state.field(editorInfoField, false);
      const fresh = this.fresh(info?.file?.path ?? '', changes);
      if (fresh.length) this.play(fresh);
    });
  }

  /** Changes made outside the editor, e.g. from the task list */
  private async onModify(f: TAbstractFile): Promise<void> {
    if (!(f instanceof TFile) || f.extension !== 'md' || !this.enabled) return;
    try {
      const cur = this.snapshot(await this.plugin.app.vault.cachedRead(f));
      const prev = this.snapshots.get(f.path);
      this.snapshots.delete(f.path);
      this.snapshots.set(f.path, cur);
      // Keep only the last few dozen notes
      if (this.snapshots.size > 80) {
        this.snapshots.delete(this.snapshots.keys().next().value as string);
      }
      if (!prev) return;
      const changes: Change[] = [];
      for (const [body, keyword] of cur) {
        const was = prev.get(body);
        if (
          keyword !== null &&
          was !== undefined &&
          was !== null &&
          was !== keyword
        ) {
          changes.push({ body, from: was, to: keyword });
        }
      }
      const fresh = this.fresh(f.path, changes);
      if (fresh.length && fresh.length <= 3) this.play(fresh);
    } catch {
      // Unreadable: ignore
    }
  }

  /** Remember a note's states when it opens, so later changes have a baseline */
  private async baseline(f: TFile | null): Promise<void> {
    if (
      !f ||
      f.extension !== 'md' ||
      this.snapshots.has(f.path) ||
      !this.enabled
    ) {
      return;
    }
    try {
      this.snapshots.set(
        f.path,
        this.snapshot(await this.plugin.app.vault.cachedRead(f)),
      );
    } catch {
      // Unreadable: ignore
    }
  }
}
