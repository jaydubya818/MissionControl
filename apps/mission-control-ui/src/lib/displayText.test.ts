import { describe, expect, it } from "vitest";
import { normalizeNarrativeText } from "./displayText";

describe("normalizeNarrativeText", () => {
  it("renders imported escaped newlines as actual line breaks", () => {
    expect(normalizeNarrativeText("Outcome\\n\\nContext")).toBe("Outcome\n\nContext");
  });

  it("preserves existing newlines and handles missing values", () => {
    expect(normalizeNarrativeText("Outcome\nContext")).toBe("Outcome\nContext");
    expect(normalizeNarrativeText(undefined)).toBe("");
  });
});
