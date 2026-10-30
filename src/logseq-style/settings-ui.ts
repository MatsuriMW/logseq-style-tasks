import {
  App,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingGroupItem,
} from 'obsidian';
import type TodoTracker from '../main';
import { cleanKeywords, newCycleGroupId } from './cycle-groups';
import { CycleGroup } from './settings';

interface HotkeyTab {
  searchComponent?: { setValue(value: string): void };
  updateHotkeyVisibility?: () => void;
}
interface AppSetting {
  open(): void;
  openTabById(id: string): HotkeyTab | undefined;
}

/** Open Settings → Hotkeys with the search box filled in */
export function openHotkeys(app: App, query: string): void {
  const setting = (app as App & { setting?: AppSetting }).setting;
  if (!setting) return;
  setting.open();
  const tab = setting.openTabById('hotkeys');
  tab?.searchComponent?.setValue(query);
  tab?.updateHotkeyVisibility?.();
}

const splitKeywords = (value: string) => cleanKeywords(value.split(/[\s,，]+/));

/**
 * Settings for the features the Logseq Style Tasks fork adds on top of
 * TODOseq. `rerender` redraws the settings tab after groups are added or
 * removed.
 */
export function buildLogseqStyleGroups(
  plugin: TodoTracker,
  rerender: () => void,
): SettingDefinitionItem[] {
  const save = () => void plugin.saveSettings();
  const pluginName = () => plugin.manifest.name;

  const groupItem = (group: CycleGroup): SettingGroupItem => ({
    name: group.name || 'Unnamed group',
    render: (setting) => {
      setting
        .setDesc('Keywords in cycle order, separated by spaces or commas.')
        .addText((text) =>
          text
            .setPlaceholder('Group name')
            .setValue(group.name)
            .onChange((value) => {
              group.name = value.trim();
              setting.setName(group.name || 'Unnamed group');
              save();
            }),
        )
        .addText((text) =>
          text
            .setPlaceholder('Keywords')
            .setValue(group.keywords.join(' '))
            .onChange((value) => {
              group.keywords = splitKeywords(value);
              save();
            }),
        )
        .addExtraButton((button) =>
          button
            .setIcon('keyboard')
            .setTooltip('Set hotkey')
            .onClick(() =>
              openHotkeys(
                plugin.app,
                `${pluginName()}: Cycle keywords: ${group.name || cleanKeywords(group.keywords).join(' → ')}`,
              ),
            ),
        )
        .addExtraButton((button) =>
          button
            .setIcon('trash')
            .setTooltip('Delete group')
            .onClick(() => {
              plugin.settings.cycleGroups = plugin.settings.cycleGroups.filter(
                (g) => g.id !== group.id,
              );
              save();
              rerender();
            }),
        );
    },
  });

  const cycleGroups: SettingDefinitionGroup = {
    type: 'group',
    heading: 'Keyword cycle groups',
    items: [
      {
        name: 'Hotkeys for toggling task state',
        desc: 'Toggle task state, Cycle task state, Toggle important priority and Toggle urgent priority are commands. Set their hotkeys in Settings → Hotkeys.',
        render: (setting) => {
          setting.addButton((button) =>
            button
              .setButtonText('Set hotkeys')
              .onClick(() => openHotkeys(plugin.app, pluginName())),
          );
        },
      },
      {
        name: 'Cycle groups',
        desc: 'Each group cycles through its own keywords and gets its own command, so it can have its own hotkey. On a line whose keyword is in the group, the command moves to the next keyword; any other line gets the first keyword.',
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText('Add group').onClick(() => {
              plugin.settings.cycleGroups.push({
                id: newCycleGroupId(),
                name: '',
                keywords: [],
              });
              save();
              rerender();
            }),
          );
        },
      },
      ...plugin.settings.cycleGroups.map(groupItem),
    ],
  };

  const features: SettingDefinitionGroup = {
    type: 'group',
    heading: 'Logseq style',
    items: [
      {
        name: 'Children of "todos:" are tasks',
        desc: 'Direct children of a "- todos:" list item without a keyword are read as TODO. The keyword is written into the line the first time its state changes.',
        control: { type: 'toggle', key: 'todosParentBlock' },
      },
      {
        name: 'Toggle adds a keyword to plain items',
        desc: 'Toggle task state on a list item without a keyword adds the default inactive keyword.',
        control: { type: 'toggle', key: 'plainItemToggleAddsKeyword' },
      },
      {
        name: 'Priority shorthand',
        desc: '"todoa write" or "todo a write" becomes "TODO [#A] write" when the cursor leaves the line.',
        control: { type: 'toggle', key: 'priorityShorthand' },
      },
      {
        name: 'Uppercase keywords',
        desc: 'Keywords that are uppercased when typed in lower or mixed case at the start of a list item, e.g. TODO4AI. Separate with spaces or commas.',
        render: (setting) => {
          setting.addText((text) =>
            text
              .setPlaceholder('TODO4AI')
              .setValue(plugin.settings.uppercaseKeywords.join(' '))
              .onChange((value) => {
                plugin.settings.uppercaseKeywords = splitKeywords(value);
                save();
              }),
          );
        },
      },
      {
        name: 'Fractions are progress',
        desc: 'A standalone 2/3 or 1/4 (denominator up to 10) is read as progress, not as a date, by smart date recognition.',
        control: { type: 'toggle', key: 'progressFractions' },
      },
      {
        name: 'Keyword icons',
        desc: 'Show an animated icon in front of each keyword in the editor.',
        control: { type: 'toggle', key: 'keywordIcons' },
      },
      {
        name: 'Task sounds',
        desc: 'Play a short, quiet sound when a task changes state. Silent while Obsidian is in the background.',
        control: { type: 'toggle', key: 'taskSounds' },
      },
      {
        name: 'Keyword tooltip',
        desc: 'Show "Task keyword: …" when hovering a keyword.',
        control: { type: 'toggle', key: 'keywordTooltip' },
      },
      {
        name: 'Clicking a keyword',
        desc: 'Change the task state, or open a note listing every task with that keyword.',
        control: {
          type: 'dropdown',
          key: 'keywordClickAction',
          options: {
            toggle: 'Change task state',
            note: 'Open keyword note',
          },
          defaultValue: 'toggle',
        },
      },
      {
        name: 'Keyword note folder',
        desc: 'Folder for keyword notes, e.g. "Keyword queries/DOING.md".',
        control: {
          type: 'text',
          key: 'keywordNoteFolder',
          placeholder: 'Keyword queries',
          disabled: () => plugin.settings.keywordClickAction !== 'note',
        },
      },
      {
        name: 'Keyword note template',
        desc: 'Content of a new keyword note. {{keyword}} is replaced with the keyword.',
        render: (setting) => {
          setting.addTextArea((text) => {
            text
              .setValue(plugin.settings.keywordNoteTemplate)
              .onChange((value) => {
                plugin.settings.keywordNoteTemplate = value;
                save();
              });
            text.inputEl.rows = 5;
          });
        },
      },
    ],
  };

  return [features, cycleGroups];
}
