import { describe, expect, it } from "vitest";
import { resolveDocsPageByHref } from "./docsSiteConfig";

describe("resolveDocsPageByHref", () => {
  it("resolves sibling relative links", () => {
    expect(resolveDocsPageByHref("../get-started/run-the-demo.md", "overview/readme")).toBe(
      "run-demo"
    );
  });

  it("resolves same-section links", () => {
    expect(resolveDocsPageByHref("./platform-components.md", "overview/readme")).toBe(
      "platform-components"
    );
  });

  it("returns null for external links", () => {
    expect(resolveDocsPageByHref("https://docs.tessl.io/", "overview/readme")).toBeNull();
  });
});
