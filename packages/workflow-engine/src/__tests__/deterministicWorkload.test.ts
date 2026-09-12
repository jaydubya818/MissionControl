import { describe, expect, it } from "vitest";
import { RENDER_MARKDOWN_OPERATION_DIGEST, deterministicDocumentPath, renderMarkdownCandidate, renderMarkdownWorkloadIssues, type RenderMarkdownWorkload } from "../deterministicWorkload.js";
const workload: RenderMarkdownWorkload = { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
  input: { title: "Synthetic control", paragraphs: ["This document contains synthetic qualification data."], outputPath: "docs/control.md" } };
describe("bounded deterministic document operation", () => {
  it("produces exact candidate content without conferring verification authority", () => {
    expect(renderMarkdownCandidate(workload)).toMatchObject({ path: "docs/control.md", encoding: "utf8",
      content: "# Synthetic control\n\nThis document contains synthetic qualification data.\n" });
    expect(Object.keys(renderMarkdownCandidate(workload)).sort()).toEqual(["content", "contentDigest", "encoding", "path"]);
  });
  it.each(["../control.md", "/control.md", "docs/../control.md", ".git/control.md", "docs//control.md", "docs\\control.md", "docs/control.sh", "docs/control.md/", "docs/%2e%2e/control.md"])("rejects unsafe or executable destination %s", path => {
    expect(deterministicDocumentPath(path)).toBe(false);
    expect(() => renderMarkdownCandidate({ ...workload, input: { ...workload.input, outputPath: path } })).toThrow();
  });
  it("rejects unknown operations and material input expansion", () => {
    for (const value of [null, {}, { ...workload, command: "sh" }, { ...workload, digest: "sha256:" + "a".repeat(64) },
      { ...workload, input: { ...workload.input, environment: {} } },
      { ...workload, input: { ...workload.input, title: "control\nextra" } },
      { ...workload, input: { ...workload.input, paragraphs: Array(17).fill("text") } },
      { ...workload, input: { ...workload.input, paragraphs: Array(16).fill("界".repeat(1000)) } }]) {
      expect(renderMarkdownWorkloadIssues(value).length).toBeGreaterThan(0);
    }
  });
});
