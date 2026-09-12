import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) throw new Error("Disposable backend required.");
const a = JSON.parse(await readFile(`${directory}/local-repository-admission.json`, "utf8"));
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, { subject: "user_SyntheticHandoffQualification", issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test", name: "Synthetic Qualification Operator" });
const repositoryId = await client.mutation(makeFunctionReference<"mutation">("localQualificationRepositories:register"), {});
const rows = await client.query(makeFunctionReference<"query">("projects:listRepositories"), { projectId: a.projectId });
const repository = rows.find((row: any) => row.repositoryId === repositoryId);
if (repository?.repositoryMode !== "LOCAL_SYNTHETIC_QUALIFICATION" || repository.publicationAuthority !== "NONE" || repository.status !== "CONFIGURED") {
  throw new Error("Canonical registration did not preserve its unready non-publishable type.");
}
const controls = [];
for (const name of ["githubAppConnections:beginInstallation", "githubAppConnections:bindExistingInstallation"] as const) {
  let error: string | undefined;
  try { await client.action(makeFunctionReference<"action">(name), { repositoryId, ...(name.endsWith("bindExistingInstallation") ? { installationId: "1" } : {}) }); }
  catch (e) { error = String(e); }
  if (!error?.includes("no GitHub publication")) throw new Error(`Wrong denial for ${name}: ${error}`);
  controls.push({ name, denied: true, error });
}
let defaultError: string | undefined;
try { await client.mutation(makeFunctionReference<"mutation">("projects:setDefaultRepository"), { repositoryId }); } catch (e) { defaultError = String(e); }
if (!defaultError?.includes("cannot become a GitHub compatibility default")) throw new Error("Local repository default classification escaped.");
controls.push({ name: "GitHub compatibility default", denied: true, error: defaultError });
const proof = { classification: "CANONICAL_SYNTHETIC_REPOSITORY_REGISTRATION", repositoryId, repository,
  tenantId: a.tenantId, projectId: a.projectId, engagementId: a.engagementId, operatorId: a.operatorId, environmentId: a.environmentId,
  controls, executionQualified: false, publicationAuthority: "NONE", productionAuthority: "NONE", externalModelCalls: 0 };
await writeFile(`${directory}/local-repository-registration-proof.json`, JSON.stringify(proof, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ repositoryId, status: repository.status, deniedControls: controls.length, executionQualified: false }));
