import { canonicalHash } from "@mission-control/shared";

/** A bounded executable workflow operation, never a model route or an evaluator. */
export const RENDER_MARKDOWN_OPERATION = "render-markdown/v1" as const;
export const RENDER_MARKDOWN_OPERATION_DIGEST = `sha256:${canonicalHash({
  operation: RENDER_MARKDOWN_OPERATION,
  format: "heading-h1-blank-line-paragraphs-separated-by-blank-line-final-newline",
  limits: { titleCharacters: 120, paragraphs: 16, paragraphCharacters: 1000, outputBytes: 20_000 },
})}`;

export interface RenderMarkdownWorkload {
  reference: typeof RENDER_MARKDOWN_OPERATION;
  digest: string;
  input: { title: string; paragraphs: string[]; outputPath: string };
}
export interface DeterministicCandidateFile {
  path: string;
  encoding: "utf8";
  content: string;
  contentDigest: string;
}
function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
/** Relative, non-executable document paths only; host scope and symlink checks remain mandatory. */
export function deterministicDocumentPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200
    && /^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.md$/.test(value)
    && value.split("/").every(segment => segment.length > 0 && segment !== "." && segment !== "..");
}
export function renderMarkdownWorkloadIssues(value: unknown): string[] {
  if (!exact(value, ["reference", "digest", "input"])) return ["deterministic-workload-fields-invalid"];
  if (value.reference !== RENDER_MARKDOWN_OPERATION || value.digest !== RENDER_MARKDOWN_OPERATION_DIGEST) return ["deterministic-operation-unregistered"];
  if (!exact(value.input, ["title", "paragraphs", "outputPath"])) return ["deterministic-input-fields-invalid"];
  if (!text(value.input.title, 120) || !Array.isArray(value.input.paragraphs)
    || value.input.paragraphs.length < 1 || value.input.paragraphs.length > 16
    || !value.input.paragraphs.every(paragraph => text(paragraph, 1000))
    || !deterministicDocumentPath(value.input.outputPath)) return ["deterministic-input-invalid"];
  const output = `# ${value.input.title}\n\n${value.input.paragraphs.join("\n\n")}\n`;
  return new TextEncoder().encode(output).length > 20_000 ? ["deterministic-output-too-large"] : [];
}
/** Called by the producing runtime. This creates candidate content, not acceptance evidence. */
export function renderMarkdownCandidate(workload: RenderMarkdownWorkload): DeterministicCandidateFile {
  const issues = renderMarkdownWorkloadIssues(workload);
  if (issues.length) throw new Error(issues.join(","));
  const content = `# ${workload.input.title}\n\n${workload.input.paragraphs.join("\n\n")}\n`;
  return { path: workload.input.outputPath, encoding: "utf8", content,
    contentDigest: `sha256:${canonicalHash(content)}` };
}
