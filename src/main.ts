import { writeFile } from "fs/promises";
import { getFrontMatterInfo, Notice, Plugin, stringifyYaml } from "obsidian";
import { getAPI } from "obsidian-dataview";
import * as path from "path";
import { unified } from "unified";
import remarkMdx from "remark-mdx";
import remarkCallouts from "remark-callouts";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkObsidianLink } from "remark-obsidian-link";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { z } from "zod";
import { visit } from "unist-util-visit";
import * as m from "mdast-builder";
import {
  DEFAULT_SETTINGS,
  ExportProcessorSettings,
  ExportProcessorSettingTab,
} from "./settings";
import { isPromise } from "util/types";

// TODO(mAAdhaTTah) can we improve these types?
const fm = z.record(z.any());
const page = z.any();
const content = z.string();
const node = z.any();

const HooksFile = z.object({
  frontmatter: z.function().args(fm, page).returns(fm).optional(),
  headerContent: z.function().args(fm, page).returns(content).optional(),
  preprocessContent: z
    .function()
    .args(content, page, fm)
    .returns(content)
    .optional(),
  processCodeblock: z
    .function()
    .args(node)
    .returns(z.union([node, z.string()]))
    .optional(),
  postprocessContent: z
    .function()
    .args(content, page, fm)
    .returns(content)
    .optional(),
  footerContent: z.function().args(fm, page).returns(content).optional(),
  outputPath: z.function().args(page, fm, content).returns(content).optional(),
});
type HooksFile = z.infer<typeof HooksFile>;

type UnistNode = import("unist").Node<import("unist").Data>;

type CodeNode = UnistNode & {
  toString(): string;
  value: string;
  lang: string;
};

type CodeBlockOpts = {
  processCodeblock?: (
    node: CodeNode,
  ) => string | UnistNode | Promise<string | UnistNode>;
};

function remarkObsidianCodeblocks({
  processCodeblock = (x) => x,
}: CodeBlockOpts = {}) {
  return async function (tree: UnistNode) {
    const promises: Promise<any>[] = [];
    visit(tree, "code", (node: CodeNode, index, parent: any) => {
      let result = processCodeblock(node);
      if (result === node) return;
      if (!isPromise(result)) result = Promise.resolve(result);
      promises.push(
        result.then((result) => {
          const newNode = typeof result === "string" ? m.text(result) : result;
          parent.children.splice(index, 1, newNode);
        }),
      );
      return [false, index];
    });
    await Promise.all(promises);
  };
}

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

        const processor = unified()
          .use(remarkParse)
          .use(remarkMdx)
          .use(remarkGfm)
          .use(remarkObsidianLink, {
            toLink: (wikiLink) => ({
              value: wikiLink.alias ?? wikiLink.value,
              uri: `/${wikiLink.value}`,
            }),
          })
          .use(remarkCallouts)
          .use(remarkMath)
          .use(remarkObsidianCodeblocks, {
            processCodeblock(node) {
              switch (node.lang) {
                case "dataview":
                  return dv
                    .tryQueryMarkdown(node.value)
                    .then((markdown: string) =>
                      processor.run(processor.parse(markdown)),
                    );
                default:
                  return hooks.processCodeblock?.(node) ?? node;
              }
            },
          })
          .use(remarkStringify);

        // List all of the files
        const pages = dv.pages(this.settings.query);

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

            // - Insert any prepended content from userland
            markdown += hooks.headerContent?.(frontmatter, page) ?? "";

            // Fetch content
            const file = this.app.vault.getFileByPath(page.file.path);
            if (file == null) continue; // should never happen lol
            const fileContents = await this.app.vault.read(file);
            const { contentStart } = getFrontMatterInfo(fileContents);
            let content = fileContents.slice(contentStart);

            // - Preprocess entire content with userland plugin
            content =
              hooks.preprocessContent?.(content, page, frontmatter) ?? content;

            // - Process hyperlinks & embeds
            content = String(await processor.process(content));

            // - Postprocess entire content with userland plugin
            content =
              hooks.postprocessContent?.(content, page, frontmatter) ?? content;

            // Insert processed content
            markdown += content;

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

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
