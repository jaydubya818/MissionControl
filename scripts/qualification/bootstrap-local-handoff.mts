import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [noncePath, outputPath] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290"
  || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !noncePath || !outputPath) throw new Error("Exact disposable bootstrap inputs required.");
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY);
const result = await client.mutation(makeFunctionReference<"mutation">("qualificationHandoffFixture:bootstrap"),
  { nonce: await readFile(noncePath, "utf8") });
await writeFile(outputPath, JSON.stringify({ classification: "SYNTHETIC_FIXTURE_SETUP", ...result }, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ classification: "SYNTHETIC_FIXTURE_SETUP", ...result }));
