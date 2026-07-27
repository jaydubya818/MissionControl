import { describe, expect, it } from "vitest";
import { ADW_PROGRESSION, ADW_SANDBOXES, THREE_ACTORS } from "./harnessAdw";

describe("harnessAdw", () => {
  it("orders three actors by reliability", () => {
    expect(THREE_ACTORS[0]?.id).toBe("code");
    expect(THREE_ACTORS[2]?.id).toBe("agent");
  });

  it("defines specialized sandboxes", () => {
    const ids = ADW_SANDBOXES.map((s) => s.id);
    expect(ids).toContain("hotfix");
    expect(ids).toContain("chore");
  });

  it("ends progression at software factory", () => {
    expect(ADW_PROGRESSION[ADW_PROGRESSION.length - 1]?.id).toBe("factory");
  });
});
