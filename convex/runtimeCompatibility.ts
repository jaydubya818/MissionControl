import { query } from "./_generated/server";
import { RUNTIME_CONTRACT_VERSION } from "./lib/runtimeContract";

/** Stable bootstrap query used before the application mounts normal consumers. */
export const get = query({
  args: {},
  handler: () => ({
    contractVersion: RUNTIME_CONTRACT_VERSION,
  }),
});
