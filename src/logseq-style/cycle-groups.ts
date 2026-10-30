import { Editor, MarkdownView } from 'obsidian';
import type TodoTracker from '../main';
import { CycleGroup } from './settings';

/**
 * Cycle groups: each group is an ordered list of keywords with its own
 * command, so it can get its own hotkey in Settings → Hotkeys. Running the
 * command on a line whose keyword is in the group moves to the next keyword
 * (wrapping around); any other line gets the group's first keyword.
 */

export const cycleGroupCommandId = (group: CycleGroup) =>
  `cycle-group-${group.id}`;

export function cleanKeywords(keywords: string[]): string[] {
  const out: string[] = [];
  for (const k of keywords) {
    const keyword = k.trim().toUpperCase();
    if (keyword && !out.includes(keyword)) out.push(keyword);
  }
  return out;
}

export function nextKeyword(group: CycleGroup, current: string): string {
  const keywords = cleanKeywords(group.keywords);
  const i = keywords.indexOf(current);
  return i === -1 ? keywords[0] : keywords[(i + 1) % keywords.length];
}

export function newCycleGroupId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class CycleGroupCommands {
  private registered = new Set<string>();

  constructor(private plugin: TodoTracker) {}

  /** Add commands for new groups, rename changed ones, remove deleted ones */
  sync(): void {
    const groups = this.plugin.settings.cycleGroups.filter(
      (g) => cleanKeywords(g.keywords).length > 0,
    );
    const wanted = new Set(groups.map(cycleGroupCommandId));
    for (const id of this.registered) {
      if (!wanted.has(id)) {
        this.plugin.removeCommand(id);
        this.registered.delete(id);
      }
    }
    for (const group of groups) {
      const id = cycleGroupCommandId(group);
      // addCommand replaces an existing command with the same id
      this.plugin.addCommand({
        id,
        name: `Cycle keywords: ${group.name || cleanKeywords(group.keywords).join(' → ')}`,
        icon: 'repeat',
        editorCheckCallback: (
          checking: boolean,
          editor: Editor,
          view: MarkdownView,
        ) => this.run(group.id, checking, editor, view),
      });
      this.registered.add(id);
    }
  }

  private run(
    groupId: string,
    checking: boolean,
    editor: Editor,
    view: MarkdownView,
  ): boolean {
    const group = this.plugin.settings.cycleGroups.find(
      (g) => g.id === groupId,
    );
    const parser = this.plugin.getVaultScanner()?.getParser();
    if (!group || !parser || cleanKeywords(group.keywords).length === 0) {
      return false;
    }
    if (checking) return true;

    const lineNumber = editor.getCursor().line;
    const line = editor.getLine(lineNumber);
    const task = parser.parseLineAsTask(
      line,
      lineNumber,
      view.file?.path ?? '',
    );
    this.plugin.editorController.handleUpdateTaskCycleStateAtLine(
      false,
      lineNumber,
      editor,
      view,
      nextKeyword(group, task?.state ?? ''),
    );
    return true;
  }
}
