import { describe, expect, it } from "vitest";
import { detectSkillPitfalls } from "./skillPitfalls";

describe("detectSkillPitfalls", () => {
  it("flags vague descriptions without activation language", () => {
    const pitfalls = detectSkillPitfalls({
      description: "This is a helpful skill for code review and quality improvement.",
    });
    expect(pitfalls.some((p) => p.id === "vague-description")).toBe(true);
  });

  it("passes strong activation descriptions", () => {
    const pitfalls = detectSkillPitfalls({
      description:
        "Run ESLint with project rules; flag type-safety violations when editing TypeScript React components.",
      reviewAxes: { validation: 90, implementation: 90, activation: 90 },
    });
    expect(pitfalls.some((p) => p.id === "vague-description")).toBe(false);
  });

  it("flags weak activation axis scores", () => {
    const pitfalls = detectSkillPitfalls({
      description: "Use this skill when running security checks on authentication modules in convex/.",
      reviewAxes: { validation: 90, implementation: 90, activation: 60 },
    });
    expect(pitfalls.some((p) => p.id === "weak-activation")).toBe(true);
  });
});
