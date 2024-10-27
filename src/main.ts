import { writeFile } from "fs/promises";
import { getFrontMatterInfo, Notice, Plugin, stringifyYaml } from "obsidian";
import { getAPI } from "obsidian-dataview";
import * as path from "path";
import {
  DEFAULT_SETTINGS,
  ExportProcessorSettings,
  ExportProcessorSettingTab,
} from "./settings";
import { HooksFile } from "./hooks";
import { ContentProcessor } from "./processor";

export default class ExportProcessorPlugin extends Plugin {
  settings: ExportProcessorSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "export-vault",
      name: "Export Vault",
      callback: async () => {
        const dv = getAPI(this.app);
        const jsEngine = (this.app as any).plugins.plugins["js-engine"]?.api;

        if (!dv) {
          new Notice(
            `Dataview is not installed. Please install it and try again.`,
          );
          return;
        }

        if (!jsEngine) {
          new Notice(
            `js-engine is not installed. Please install it and try again.`,
          );
          return;
        }

        let hooks: HooksFile = {};
        if (this.settings.hooksFile) {
          try {
            hooks = await jsEngine.importJs(this.settings.hooksFile);
            hooks = await HooksFile.parseAsync(hooks);
          } catch (err) {
            new Notice(
              `Error importing userland hooks. Check console for details`,
            );
            console.error(err);
            return;
          }
        }

        // List all of the files
        const pages = dv.pages(this.settings.query);
        const contentProcessor = new ContentProcessor(dv, hooks);

        try {
          // Process files
          for (const page of pages) {
            // Construct the MD file:
            let markdown = "";

            // - Grab or extract frontmatter
            const fm = page.file.frontmatter;

            // - Postprocess the frontmatter through userland with metadata
            const frontmatter = hooks.frontmatter?.(fm, page) ?? fm;

            // - Insert frontmatter
            markdown += "---\n" + stringifyYaml(frontmatter) + "---\n";

            // - Insert any header content from userland
            markdown += hooks.headerContent?.(frontmatter, page) ?? "";

            const content = await this.fetchContent(page);
            if (content == null) continue;

            // Insert processed content
            markdown += await contentProcessor.processContent(content, {
              page,
              frontmatter,
              pages,
            });

            // - Insert any appended content from userland
            markdown += hooks.footerContent?.(frontmatter, page) ?? "";

            // - Get path from userland
            const outputPath =
              hooks.outputPath?.(page, frontmatter, markdown) ?? page.file.path;

            // - Write file
            await writeFile(
              path.join(this.settings.output, outputPath),
              markdown,
            );
          }

          new Notice("Export complete!");
        } catch (err) {
          new Notice(`Error exporting vault. Check console for details`);
          console.error(err);
        }
      },
    });

    this.addSettingTab(new ExportProcessorSettingTab(this.app, this));
  }

  private async fetchContent(page: any) {
    const file = this.app.vault.getFileByPath(page.file.path)!;
    if (file == null) return null; // should never happen lol
    const fileContents = await this.app.vault.read(file);
    const { contentStart } = getFrontMatterInfo(fileContents);
    return fileContents.slice(contentStart);
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
