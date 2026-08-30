import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contractDirectory = resolve(
  process.cwd(),
  "../..",
  "contracts/venture-factory/v1",
);

describe("Venture Factory ExecutionIntent contract lock", () => {
  it("pins the exact three schemas and preserves shadow-only authority", () => {
    const lock = JSON.parse(
      readFileSync(resolve(contractDirectory, "contract-lock.json"), "utf8"),
    );
    expect(lock).toMatchObject({
      contract_version: "execution-intent/v1",
      factory_baseline: "ab7818976818c9a81d2004e1b6e6c4caba016f61",
      mode: "SHADOW",
      dispatch_authority: false,
      software_acceptance_authority: false,
    });
    const names = [
      "execution-event.schema.json",
      "execution-intent-response.schema.json",
      "execution-intent.schema.json",
    ];
    expect(Object.keys(lock.schemas).sort()).toEqual([...names].sort());
    for (const name of names) {
      const digest = `sha256:${createHash("sha256")
        .update(readFileSync(resolve(contractDirectory, name)))
        .digest("hex")}`;
      expect(lock.schemas[name]).toBe(digest);
    }
  });
});
