import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const [directory, output] = process.argv.slice(2);
if (!directory || !output || process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY) throw new Error("Exact backend required.");
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, { subject: "user_SyntheticHandoffQualification", issuer: "https://synthetic-qualification.example.test", email: "qualification@example.test", name: "Synthetic Qualification Operator" });
const setup = JSON.parse(await readFile(`${directory}/authority-bootstrap.json`, "utf8"));
const bindings = await client.query(makeFunctionReference<"query">("workspaceHostBindings:listByProject"), { projectId: setup.projectId });
const repositories = await client.query(makeFunctionReference<"query">("projects:listRepositories"), { projectId: setup.projectId });
const result = { observedAt: Date.now(), bindings, repositories };
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ bindings: bindings.map((row: any) => ({ id: row._id, hostId: row.hostId, status: row.status,
  generation: row.workerRuntime?.generation, sessionId: row.workerRuntime?.sessionId, executors: row.workerRuntime?.supportedExecutors?.map((x: any) => `${x.adapter}/${x.version}`),
  backend: row.workerRuntime?.executionBackends, localObservation: row.localQualificationObservation?.admissionDigest })) }));
