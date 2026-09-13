import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPostRelaySyntheticQualification } from "./lib/postRelaySyntheticQualification.mts";

const report = await runPostRelaySyntheticQualification();
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const evidenceFlag = process.argv.indexOf("--evidence");
if (evidenceFlag >= 0) {
  const evidencePath = process.argv[evidenceFlag + 1];
  if (!evidencePath) throw new Error("--evidence requires a file path");
  await writeFile(resolve(evidencePath), serialized);
}
process.stdout.write(serialized);
