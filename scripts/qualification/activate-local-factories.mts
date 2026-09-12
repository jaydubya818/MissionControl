import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) {
  throw new Error("Exact disposable backend required.");
}
const state = JSON.parse(await readFile(`${directory}/local-factory-setup.json`, "utf8"));
const runtimeEvidence = await readFile(`${directory}/canonical-worker-runtime-evidence.json`);
const evidenceReference = `local:canonical-worker-runtime-evidence.json#sha256:${createHash("sha256").update(runtimeEvidence).digest("hex")}`;
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, {
  subject: "user_SyntheticHandoffQualification",
  issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test",
  name: "Synthetic Qualification Operator",
});
const query = (name: string, args: any) => client.query(makeFunctionReference<"query">(name), args);
const mutate = (name: string, args: any) => client.mutation(makeFunctionReference<"mutation">(name), args);
const proof: Record<string, unknown> = { evidenceReference, activatedAt: Date.now(), factories: {} };
for (const purpose of ["producer", "verifier"] as const) {
  const factoryDefinitionVersionId = state[`${purpose}FactoryVersion`];
  const activation = await mutate("factory/configuration:activate", { factoryDefinitionVersionId, target: "QUALIFICATION", evidenceReference });
  const detail = await query("factory/configuration:getDetail", { factoryDefinitionId: state[`${purpose}Factory`] });
  const version = detail.versions.find((item: any) => item._id === factoryDefinitionVersionId);
  const assessment = detail.assessments.find((item: any) => item.factoryDefinitionVersionId === factoryDefinitionVersionId);
  if (detail.definition.status !== "ACTIVE" || detail.definition.activeVersionId !== factoryDefinitionVersionId || assessment?.status !== "PASS") {
    throw new Error(`The exact ${purpose} Factory did not reach qualification readiness.`);
  }
  (proof.factories as Record<string, unknown>)[purpose] = { activation, definition: detail.definition, version, assessment };
}
await writeFile(`${directory}/local-factory-activation-proof.json`, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ activated: [state.producerFactoryVersion, state.verifierFactoryVersion], target: "QUALIFICATION" }));
