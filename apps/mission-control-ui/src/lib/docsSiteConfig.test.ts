import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCS_PAGE_ID,
  DOCS_SITE_PAGES,
  resolveDocsPageByHref,
  resolveDocsPageId,
} from "./docsSiteConfig";

describe("DOCS_SITE_PAGES", () => {
  it("uses a unique ID for every page", () => {
    const ids = DOCS_SITE_PAGES.map((page) => page.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers every documentation path once", () => {
    const paths = DOCS_SITE_PAGES.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);
  });
});

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

describe("resolveDocsPageId", () => {
  it("keeps a registered operator document ID", () => {
    expect(resolveDocsPageId("sfe-overview")).toBe("sfe-overview");
  });

  it("falls back for missing or unknown document IDs", () => {
    expect(resolveDocsPageId(null)).toBe(DEFAULT_DOCS_PAGE_ID);
    expect(resolveDocsPageId("unknown-document")).toBe(DEFAULT_DOCS_PAGE_ID);
  });
});
