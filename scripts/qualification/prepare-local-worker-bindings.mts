import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) {
  throw new Error("Exact disposable backend required.");
}
const state = JSON.parse(await readFile(`${directory}/local-factory-setup.json`, "utf8"));
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, {
  subject: "user_SyntheticHandoffQualification",
  issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test",
  name: "Synthetic Qualification Operator",
});
const query = (name: string, args: any) => client.query(makeFunctionReference<"query">(name), args);
const bindings = [];
for (const purpose of ["producer", "verifier"] as const) {
  const detail = await query("factory/configuration:getDetail", { factoryDefinitionId: state[`${purpose}Factory`] });
  const version = detail.versions.find((item: any) => item._id === state[`${purpose}FactoryVersion`]);
  if (!version || version.executionBackend !== "isolated-container" || version.inferenceConstraint?.mode !== "DENIED") {
    throw new Error(`The exact ${purpose} offline Factory Version is unavailable.`);
  }
  bindings.push({
    factoryDefinitionVersionId: version._id,
    factoryConfigurationDigest: version.configurationDigest,
    adapter: version.executor.adapter,
    version: version.executor.version,
    capabilityManifestSha256: version.harnessCapabilityManifestDigest,
    effectiveConfigSha256: version.harnessEffectiveConfigSha256,
    runtimeArtifactSha256: version.harnessRuntimeArtifactDigest,
    executionBackend: "isolated-container",
    inferenceConstraint: { schema: "factory-inference-constraint/v1", mode: "DENIED" },
    sandboxProfileDigest: version.sandboxProfileDigest,
    repositoryId: version.repositoryId,
  });
}
await writeFile(`${directory}/local-factory-worker-bindings.json`, `${JSON.stringify(bindings, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ prepared: bindings.map(item => ({ factoryDefinitionVersionId: item.factoryDefinitionVersionId, factoryConfigurationDigest: item.factoryConfigurationDigest })) }));
