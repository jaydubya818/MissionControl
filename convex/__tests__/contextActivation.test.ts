import { describe, expect, it } from "vitest";
import { parseResolvedContextLock } from "../lib/contextActivation";

const HASH = "sha256:224d9f437b2dee846b79177167b2f203b5f9081b5d6641d62062182f85d8e12c";

describe("parseResolvedContextLock", () => {
  it("preserves exact pinned versions and hashes", () => {
    expect(
      parseResolvedContextLock(
        JSON.stringify({
          schemaVersion: "1.0",
          resolved: {
            "software-factory/workspace-handoff-checklist": {
              version: "0.1.0",
              contentHash: HASH,
              sourceCommitSha: "922d98b",
            },
          },
        })
      )
    ).toEqual({
      "software-factory/workspace-handoff-checklist": {
        version: "0.1.0",
        contentHash: HASH,
        sourceCommitSha: "922d98b",
      },
    });
  });

  it("rejects missing or malformed immutable hashes", () => {
    expect(() =>
      parseResolvedContextLock(
        JSON.stringify({
          resolved: { "software-factory/example": { version: "0.1.0", contentHash: "nope" } },
        })
      )
    ).toThrow("invalid content hash");
    expect(() => parseResolvedContextLock("not-json")).toThrow("not valid JSON");
  });
});
