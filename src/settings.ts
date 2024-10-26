import { PluginSettingTab, App, Setting } from "obsidian";
import type ExportProcessorPlugin from "./main";

export interface ExportProcessorSettings {
  query: string;
  output: string;
  hooksFile: string;
}

export const DEFAULT_SETTINGS: ExportProcessorSettings = {
  query: "",
  output: "",
  hooksFile: "",
};

export class ExportProcessorSettingTab extends PluginSettingTab {
  plugin: ExportProcessorPlugin;

  constructor(app: App, plugin: ExportProcessorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Export query")
      .setDesc("Dataview query of the vault files to be exported")
      .addText((text) =>
        text
          .setPlaceholder("#web")
          .setValue(this.plugin.settings.query)
          .onChange(async (value) => {
            this.plugin.settings.query = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Output destination")
      .setDesc(
        "Where the files should be written to. NOTE: Existing files will be overwritten.",
      )
      .addText((text) =>
        text
          .setPlaceholder("~/output")
          .setValue(this.plugin.settings.output)
          .onChange(async (value) => {
            this.plugin.settings.output = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Hooks file")
      .setDesc("The JS file that defines the hooks you want to load.")
      .addText((text) =>
        text
          .setPlaceholder("processor-hooks.js")
          .setValue(this.plugin.settings.hooksFile)
          .onChange(async (value) => {
            this.plugin.settings.hooksFile = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
