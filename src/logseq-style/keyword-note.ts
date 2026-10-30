import { App, MarkdownView, normalizePath, TFile } from 'obsidian';

/**
 * Click a keyword in the editor to open a note for that keyword, e.g.
 * "Keyword queries/DOING.md". The note is created from the template the
 * first time; by default the template is an embedded task list of every
 * task in that state.
 */
export async function openKeywordNote(
  app: App,
  keyword: string,
  folder: string,
  template: string,
): Promise<void> {
  const dir = normalizePath(folder || 'Keyword queries');
  const path = normalizePath(`${dir}/${keyword}.md`);
  let file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    if (!app.vault.getAbstractFileByPath(dir)) {
      await app.vault.createFolder(dir);
    }
    file = await app.vault.create(
      path,
      template.split('{{keyword}}').join(keyword),
    );
  }
  if (!(file instanceof TFile)) return;

  const shown = app.workspace
    .getLeavesOfType('markdown')
    .find((leaf) => (leaf.view as MarkdownView).file?.path === path);
  if (shown) {
    app.workspace.setActiveLeaf(shown, { focus: true });
    (shown.view as MarkdownView).previewMode?.rerender(true);
    return;
  }
  await app.workspace
    .getLeaf('tab')
    .openFile(file, { state: { mode: 'preview' }, active: true });
}
