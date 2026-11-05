import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ISOLATED_CONTAINER_POLICY_DIGEST, INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA } from '../../packages/workflow-engine/src/harnessContract.ts';

const root = process.cwd(), output = resolve(process.argv[2] ?? 'dist/native-successor');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000 }).trim();
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const sourceSha = run('git', ['rev-parse', 'HEAD']);
if (process.env.MC_NATIVE_BUILD_ALLOW_DIRTY !== '1' && run('git', ['status', '--porcelain'])) throw Error('Exact clean source required');
await mkdir(output, { recursive: true });
run(process.execPath, ['scripts/qualification/build-isolated-invocation.mjs', join(output, 'bundles')]);
const build = JSON.parse(await readFile(join(output, 'bundles/build.json'), 'utf8'));
if (process.env.MC_NATIVE_BUILD_ALLOW_DIRTY !== '1') {
  for (const artifact of Object.values(build.artifacts)) for (const [path, digest] of Object.entries(artifact.inputs)) {
    if (hash(execFileSync('git', ['show', `${sourceSha}:${path}`], { cwd: root, maxBuffer: 8_000_000 })) !== digest) {
      throw Error(`Captured source does not match the committed revision: ${path}`);
    }
  }
}
const context = join(output, 'context'); await mkdir(context);
await copyFile(join(root, 'infra/native-runtime/Dockerfile'), join(context, 'Dockerfile'));
await copyFile(join(output, 'bundles/bridge.mjs'), join(context, 'bridge.mjs'));
await writeFile(join(context, 'invocation-binding.json'), JSON.stringify({ bridgeDigest: build.artifacts.bridge.digest,
  backendDigest: build.artifacts.backend.digest, invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA,
  isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST }) + '\n');
const files = {};
for (const name of ['Dockerfile', 'bridge.mjs', 'invocation-binding.json']) files[name] = hash(await readFile(join(context, name)));
const manifest = { schema: 'native-runtime-build/v1', runtimeVersion: '3', harnessVersion: '3', sourceSha,
  sourceClean: !run('git', ['status', '--porcelain']), requestedPlatform: 'linux/amd64',
  baseImage: 'public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0',
  dockerfile: 'infra/native-runtime/Dockerfile', contextFiles: files, bundles: build,
  securityPolicyDigest: ISOLATED_CONTAINER_POLICY_DIGEST, originalImage: 'UNAVAILABLE', binaryEquivalenceClaimed: false,
  qualification: 'NOT_PERFORMED', authority: 'NONE' };
if (run('git', ['rev-parse', 'HEAD']) !== sourceSha) throw Error('Source revision changed during artifact generation');
if (process.env.MC_NATIVE_BUILD_ALLOW_DIRTY !== '1' && !manifest.sourceClean) throw Error('Source changed during artifact generation');
await writeFile(join(output, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, sourceSha, contextFiles: files, bridge: build.artifacts.bridge.digest, backend: build.artifacts.backend.digest }));
