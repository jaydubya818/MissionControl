import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safeExternalUrl";

describe("safeExternalUrl", () => {
  it("passes absolute http(s) destinations through", () => {
    expect(safeExternalUrl("https://github.com/o/r/pull/12")).toBe(
      "https://github.com/o/r/pull/12",
    );
    expect(safeExternalUrl("  http://ci.example.com/run/9  ")).toBe(
      "http://ci.example.com/run/9",
    );
  });

  it("returns undefined for anything that is not a navigational URL", () => {
    // Regression: pull-request URLs, CI links, evidence locations and artifact
    // `externalLocation` values originate outside Mission Control. React does
    // not sanitize `href`, so a `javascript:` value would execute in the
    // operator's authenticated session on click.
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("JAVASCRIPT:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeExternalUrl("file:///etc/passwd")).toBeUndefined();
    expect(safeExternalUrl("/v2/command-center")).toBeUndefined();
    expect(safeExternalUrl("")).toBeUndefined();
    expect(safeExternalUrl(null)).toBeUndefined();
    expect(safeExternalUrl(undefined)).toBeUndefined();
  });
});
