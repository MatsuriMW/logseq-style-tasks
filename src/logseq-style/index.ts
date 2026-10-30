import { Editor } from 'obsidian';
import type TodoTracker from '../main';
import { CycleGroupCommands } from './cycle-groups';
import { keywordIconsExtension } from './keyword-icons';
import { priorityShorthandExtension, togglePriorityAxis } from './priority';
import { setProgressFractions } from './progress-fraction';
import { TaskSounds } from './sounds';
import { setTodosParentBlock } from './todos-parent';

/**
 * Entry point for the features added by the Logseq Style Tasks fork, so the
 * upstream lifecycle only needs two calls: register on load, apply on save.
 */
export class LogseqStyle {
  private cycleGroups: CycleGroupCommands;

  constructor(private plugin: TodoTracker) {
    this.cycleGroups = new CycleGroupCommands(plugin);
  }

  register(): void {
    const plugin = this.plugin;
    this.applySettings();

    plugin.registerEditorExtension([
      priorityShorthandExtension(() =>
        plugin.settings.priorityShorthand
          ? {
              keywords: plugin.keywordManager.getAllKeywords(),
              uppercase: plugin.settings.uppercaseKeywords,
            }
          : null,
      ),
      keywordIconsExtension(() =>
        plugin.settings.keywordIcons
          ? {
              keywords: plugin.keywordManager.getAllKeywords(),
              groupOf: (k) => plugin.keywordManager.getGroup(k),
            }
          : null,
      ),
    ]);
    new TaskSounds(plugin).register();

    const toggle = (editor: Editor, axis: 0 | 1) =>
      togglePriorityAxis(
        editor,
        axis,
        plugin.keywordManager.getAllKeywords(),
        plugin.settings.uppercaseKeywords,
      );
    plugin.addCommand({
      id: 'toggle-important',
      name: 'Toggle important priority',
      icon: 'star',
      editorCallback: (editor) => toggle(editor, 0),
    });
    plugin.addCommand({
      id: 'toggle-urgent',
      name: 'Toggle urgent priority',
      icon: 'alarm-clock',
      editorCallback: (editor) => toggle(editor, 1),
    });
  }

  /** Called after settings change */
  applySettings(): void {
    setProgressFractions(this.plugin.settings.progressFractions);
    setTodosParentBlock(this.plugin.settings.todosParentBlock);
    this.cycleGroups.sync();
  }
}
