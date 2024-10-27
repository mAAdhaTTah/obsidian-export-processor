import { unified } from "unified";
import remarkMdx from "remark-mdx";
import remarkCallouts from "remark-callouts";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { SKIP, visit } from "unist-util-visit";
import * as m from "mdast-builder";
import { isPromise } from "util/types";
import remarkWikiLink from "remark-wiki-link";
import { DataviewApi } from "obsidian-dataview";
import { HooksFile } from "./hooks";

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
      return [SKIP, index];
    });
    await Promise.all(promises);
  };
}

interface WikiLink {
  value: string;
  alias?: string;
}

type ToLink = (wikiLink: WikiLink) => UnistNode | string;

const remarkObsidianLink = function (opts?: { toLink?: ToLink }) {
  const toLink: ToLink = opts?.toLink || (({ value, alias }) => alias || value);

  this.use(remarkWikiLink, { aliasDivider: "|" });

  return (tree: any) => {
    visit(tree, "wikiLink", (node, index, parent) => {
      const wValue = node.value;
      const wAlias = node.data.alias;
      const wikiLink: WikiLink = {
        value: wValue.trim(),
        alias: wAlias === wValue ? undefined : wAlias.trim(),
      };

      const link = toLink(wikiLink);

      const newNode = typeof link == "string" ? m.text(link) : link;

      parent.children.splice(index, 1, newNode);

      return [SKIP, index];
    });
  };
};

export class ContentProcessor {
  constructor(
    private dv: DataviewApi,
    private hooks: HooksFile = {},
  ) {}

  async processContent(
    content: string,
    { page, frontmatter, pages }: { page: any; frontmatter: any; pages: any[] },
  ) {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .use(remarkObsidianLink, {
        toLink: (wikiLink) => {
          const targetPage = pages.find(
            (page) => page.file.name === wikiLink.value,
          );
          if (!targetPage) return wikiLink.value;
          return m.link(
            `/${targetPage.slug}`,
            undefined,
            m.text(wikiLink.alias ?? wikiLink.value),
          );
        },
      })
      .use(remarkCallouts)
      .use(remarkMath)
      .use(remarkObsidianCodeblocks, {
        processCodeblock: (node) => {
          switch (node.lang) {
            case "dataview":
              return this.dv
                .tryQueryMarkdown(node.value)
                .then((markdown: string) =>
                  processor.run(processor.parse(markdown)),
                );
            default:
              return this.hooks.processCodeblock?.(node) ?? node;
          }
        },
      })
      .use(remarkStringify);
    content =
      this.hooks.preprocessContent?.(content, page, frontmatter) ?? content;

    // - Process hyperlinks & embeds
    content = String(await processor.process(content));

    // - Postprocess entire content with userland plugin
    content =
      this.hooks.postprocessContent?.(content, page, frontmatter) ?? content;
    return content;
  }
}
