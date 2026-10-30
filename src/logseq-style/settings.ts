/**
 * Settings added by the Logseq Style Tasks fork. Kept in one place so the
 * upstream TODOseq settings file only needs to extend this interface.
 */

export interface CycleGroup {
  id: string; // stable id, used in the command id so hotkeys survive renames
  name: string;
  keywords: string[]; // cycled in order, wrapping from the last to the first
}

export interface LogseqStyleSettings {
  todosParentBlock: boolean; // children of a "- todos:" item count as TODO
  plainItemToggleAddsKeyword: boolean; // toggle on a plain list item adds the default keyword
  priorityShorthand: boolean; // "todoa" / "todo a" becomes "TODO [#A]" when the cursor leaves the line
  uppercaseKeywords: string[]; // keywords uppercased when typed in lower or mixed case
  progressFractions: boolean; // a standalone "2/3" is progress, not a date
  keywordIcons: boolean; // animated icon in front of each keyword in the editor
  keywordTooltip: boolean; // "Task keyword: …" tooltip on keywords
  taskSounds: boolean; // short synthesized sound when a task changes state
  keywordClickAction: 'toggle' | 'note'; // what a click on a keyword in the editor does
  keywordNoteFolder: string; // folder for per-keyword notes
  keywordNoteTemplate: string; // body of a new keyword note, {{keyword}} is replaced
  cycleGroups: CycleGroup[];
}

export const DEFAULT_KEYWORD_NOTE_TEMPLATE = [
  '```todoseq',
  'search: state:{{keyword}}',
  'title: {{keyword}}',
  '```',
  '',
].join('\n');

export const DefaultLogseqStyleSettings: LogseqStyleSettings = {
  todosParentBlock: true,
  plainItemToggleAddsKeyword: true,
  priorityShorthand: true,
  uppercaseKeywords: [],
  progressFractions: true,
  keywordIcons: true,
  keywordTooltip: true,
  taskSounds: true,
  keywordClickAction: 'toggle',
  keywordNoteFolder: 'Keyword queries',
  keywordNoteTemplate: DEFAULT_KEYWORD_NOTE_TEMPLATE,
  cycleGroups: [],
};
