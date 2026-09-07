import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [setupPath, outputPath] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290"
  || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !setupPath || !outputPath) throw new Error("Exact disposable setup required.");
const setup = JSON.parse(await readFile(setupPath, "utf8"));
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
// Admin-authenticated synthetic identity fixture. This does not prove browser
// OIDC authentication, and public handlers still enforce project membership.
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, {
  subject: "user_SyntheticHandoffQualification", issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test", name: "Synthetic Qualification Operator",
});
const project = await client.query(makeFunctionReference<"query">("projects:get"), { projectId: setup.projectId });
if (project?._id !== setup.projectId || project?.tenantId !== setup.tenantId) throw new Error("Synthetic project binding mismatch.");
const denials = [];
for (const [name, args, expected] of [
  ["registry/tenants:createTenant", { name: "Forbidden Tenant", slug: "forbidden-qualification-tenant" }, "Platform tenant administration is required"],
  ["registry/operators:createOperator", { tenantId: setup.tenantId, email: "forbidden@example.test", name: "Forbidden Operator" }, "Your company role does not permit this action"],
] as const) {
  let error: string | undefined;
  try { await client.mutation(makeFunctionReference<"mutation">(name), args); }
  catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  if (!error || !error.includes(expected)) throw new Error(`Unexpected authority outcome: ${name}: ${error ?? "allowed"}`);
  denials.push({ name, denied: true, error });
}
const result = { classification: "SYNTHETIC_AUTHORITY_SCOPE_CONTROL", browserAuthenticationQualified: false,
  projectId: setup.projectId, tenantId: setup.tenantId, projectRead: true, denials };
await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(result));
