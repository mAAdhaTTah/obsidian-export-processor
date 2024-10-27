import { expect, test, vi } from "vitest";
import { ContentProcessor } from "../src/processor";

test("wikilinks parsing", async () => {
  const processor = new ContentProcessor({}, {});

  expect(
    await processor.processContent("[[Test Link]]", {
      page: {},
      frontmatter: {},
      pages: [{ slug: "test-link", file: { name: "Test Link" } }],
    }),
  ).toEqual("[Test Link](/test-link)\n");
});

test("wikilinks parsing with alias", async () => {
  const processor = new ContentProcessor({}, {});

  expect(
    await processor.processContent("[[Test Link|This is a test]]", {
      page: {},
      frontmatter: {},
      pages: [{ slug: "test-link", file: { name: "Test Link" } }],
    }),
  ).toEqual("[This is a test](/test-link)\n");
});

test("remove wikilink when target is missing", async () => {
  const processor = new ContentProcessor({}, {});

  expect(
    await processor.processContent("[[Test Link]]", {
      page: {},
      frontmatter: {},
      pages: [],
    }),
  ).toEqual("Test Link\n");
});

test("dataview codeblock", async () => {
  const processor = new ContentProcessor(
    {
      tryQueryMarkdown: vi
        .fn()
        .mockImplementation(() => Promise.resolve("Dataview Output")),
    },
    {},
  );

  expect(
    await processor.processContent(
      `
\`\`\`dataview
LIST
FROM #web
\`\`\`
      `,
      {
        page: {},
        frontmatter: {},
        pages: [],
      },
    ),
  ).toEqual("Dataview Output\n");
});

test("dataview codeblock post-processing", async () => {
  const processor = new ContentProcessor(
    {
      tryQueryMarkdown: vi
        .fn()
        .mockImplementation(() => Promise.resolve(`- [[Test Link]]`)),
    },
    {},
  );

  expect(
    await processor.processContent(
      `
\`\`\`dataview
LIST
FROM #web
\`\`\`
      `,
      {
        page: {},
        frontmatter: {},
        pages: [{ slug: "test-link", file: { name: "Test Link" } }],
      },
    ),
  ).toEqual("* [Test Link](/test-link)\n");
});
