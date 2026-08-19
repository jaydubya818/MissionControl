import { describe, expect, it } from "vitest";
import { MISSION_VALIDATION_COVERAGE_TEXT_CLASS } from "./MissionDetailView";

describe("MissionDetailView validation coverage", () => {
  it("breaks immutable identifiers before they can overflow the decision card", () => {
    expect(MISSION_VALIDATION_COVERAGE_TEXT_CLASS.split(" ")).toContain("break-words");
    expect(MISSION_VALIDATION_COVERAGE_TEXT_CLASS).toContain("[overflow-wrap:anywhere]");
  });
});
