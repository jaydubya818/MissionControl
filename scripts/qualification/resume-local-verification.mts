import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290"
  || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) {
  throw new Error("Exact disposable backend required.");
}
const state = JSON.parse(await readFile(`${directory}/local-synthetic-mission-v5.json`, "utf8"));
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, {
  subject: "user_SyntheticHandoffQualification",
  issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test",
  name: "Synthetic Qualification Operator",
});
const result = await client.mutation(makeFunctionReference<"mutation">("factory/attempts:resumeVerification"), {
  workOrderId: state.workOrderId,
  sourceAttemptId: state.producerAttemptId,
  reason: "Verifier Factory readiness was refreshed against the current canonical worker generation; resume the exact immutable candidate without producer replay.",
});
const evidence = {
  capturedAt: Date.now(),
  workOrderId: state.workOrderId,
  sourceAttemptId: state.producerAttemptId,
  verificationAttemptId: result.workflowRun._id,
  created: result.created,
};
await writeFile(`${directory}/local-verification-resumption.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(evidence));
