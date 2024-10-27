import { z } from "zod";

// TODO(mAAdhaTTah) can we improve these types?
export const fm = z.record(z.any());
export const page = z.any();
export const content = z.string();
export const node = z.any();

export const HooksFile = z.object({
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
export type HooksFile = z.infer<typeof HooksFile>;
