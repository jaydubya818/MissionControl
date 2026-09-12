/**
 * Public surface ratchet for actions with no public caller.
 *
 * A Convex `action` export is callable by anyone holding the deployment URL,
 * and that URL ships to every browser as `VITE_CONVEX_URL`. An action that
 * nothing outside `convex/` invokes is exposure without a use — the correct fix
 * is to remove the public surface, not to add a check to it.
 *
 * These three were verified to have zero callers across `apps/`, `packages/`,
 * `scripts/` and `convex/` before being narrowed. `webhooks.deliverPending` had
 * in fact been internal historically: the built declaration in
 * `packages/telegram-bot/dist/convex/webhooks.d.ts` still records it as
 * `RegisteredAction<"internal">`, so its public export was a regression rather
 * than a decision.
 *
 * This test fails if any of them is widened back to `action`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONVEX_ROOT = path.resolve(__dirname, "..");

const INTERNAL_ONLY: Array<{ file: string; name: string; why: string }> = [
  {
    file: "qcRuns.ts",
    name: "execute",
    why: "no UI, orchestration-server, or CLI caller",
  },
  {
    file: "webhooks.ts",
    name: "deliverPending",
    why: "takes no arguments and resolves no caller; drives outbound delivery",
  },
  {
    file: "workflows.ts",
    name: "install",
    why: "unimplemented and uncalled",
  },
];

describe("actions with no public caller are not publicly callable", () => {
  for (const { file, name, why } of INTERNAL_ONLY) {
    it(`${file}:${name} is internalAction — ${why}`, () => {
      const source = readFileSync(path.join(CONVEX_ROOT, file), "utf8");

      expect(
        source,
        `${file}:${name} is exported as a public action again`,
      ).toContain(`export const ${name} = internalAction({`);

      expect(
        source.includes(`export const ${name} = action({`),
        `${file}:${name} must not be a public action`,
      ).toBe(false);
    });
  }
});
