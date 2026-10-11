import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { verifyRegistryManifest } from './registry-runtime-identity.mjs';

// Read a retained local OCI archive. Never builds, imports, executes or publishes.
const [archiveArgument, buildArgument, outputArgument, registryArgument, imageArgument, configArgument] = process.argv.slice(2);
if (!archiveArgument || !buildArgument || !outputArgument) throw Error('Archive, build directory and fresh evidence directory required');
if ([registryArgument, imageArgument, configArgument].some(Boolean)
  && ![registryArgument, imageArgument, configArgument].every(Boolean)) throw Error('Registry evidence and exact image/config pins required together');
const registry = registryArgument
  ? verifyRegistryManifest(JSON.parse(await readFile(registryArgument, 'utf8')), imageArgument, configArgument)
  : undefined;
const archive = resolve(archiveArgument), buildDirectory = resolve(buildArgument), output = resolve(outputArgument);
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const member = name => execFileSync('tar', ['-xOf', archive, name], { maxBuffer: 256_000_000 });
const index = JSON.parse(member('index.json'));
if (index.schemaVersion !== 2 || !Array.isArray(index.manifests) || index.manifests.length !== 1
  || index.manifests[0].mediaType !== 'application/vnd.oci.image.manifest.v1+json') throw Error('One exact OCI manifest required');
const blob = descriptor => {
  if (!/^sha256:[a-f0-9]{64}$/.test(descriptor.digest) || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0) throw Error('Invalid OCI descriptor');
  const bytes = member('blobs/sha256/' + descriptor.digest.slice(7));
  if (bytes.length !== descriptor.size || hash(bytes) !== descriptor.digest) throw Error('OCI descriptor bytes do not match');
  return bytes;
};
const manifest = JSON.parse(blob(index.manifests[0]));
if (manifest.schemaVersion !== 2 || manifest.config?.mediaType !== 'application/vnd.oci.image.config.v1+json'
  || !Array.isArray(manifest.layers) || manifest.layers.length !== 1 || !['application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip'].includes(manifest.layers[0].mediaType)) throw Error('Unexpected successor image layout');
const config = JSON.parse(blob(manifest.config));
if (registry && (manifest.config.digest !== registry.manifest.config.digest
  || manifest.config.size !== registry.manifest.config.size)) throw Error('Export config differs from pinned registry config');
const layerBytes = blob(manifest.layers[0]);
const layer = manifest.layers[0].mediaType.endsWith('+gzip') ? gunzipSync(layerBytes, { maxOutputLength: 256_000_000 }) : layerBytes;
if (config.rootfs?.type !== 'layers' || JSON.stringify(config.rootfs.diff_ids) !== JSON.stringify([hash(layer)])) throw Error('Image layer identity mismatch');
const provenance = JSON.parse(await readFile(join(buildDirectory, 'provenance.json'), 'utf8'));
if (provenance.sourceClean !== true || !/^[a-f0-9]{40}$/.test(provenance.sourceSha)
  || config.os !== 'linux' || config.architecture !== 'amd64'
  || config.config?.Labels?.['org.opencontainers.image.revision'] !== provenance.sourceSha
  || config.config?.Labels?.['org.opencontainers.image.version'] !== '3') throw Error('Successor source or architecture mismatch');
for (const name of ['Dockerfile', 'bridge.mjs', 'invocation-binding.json']) {
  if (hash(await readFile(join(buildDirectory, 'context', name))) !== provenance.contextFiles[name]) throw Error('Build context changed');
}
const layerMember = name => execFileSync('tar', ['-xOf', '-', name], { input: layer, maxBuffer: 128_000_000 });
const bindingBytes = layerMember('jail/runtime/invocation-binding.json');
if (hash(bindingBytes) !== provenance.contextFiles['invocation-binding.json']
  || hash(layerMember('jail/runtime/invoke.mjs')) !== provenance.bundles.artifacts.bridge.digest) throw Error('Image runtime bytes differ from source build');
const binding = JSON.parse(bindingBytes);
if (binding.backendDigest !== provenance.bundles.artifacts.backend.digest) throw Error('Image backend binding mismatch');
const toolchain = JSON.parse(layerMember('jail/runtime/toolchain.json'));
if (toolchain.platform !== 'linux' || toolchain.architecture !== 'x64'
  || hash(layerMember('jail/runtime/node')) !== 'sha256:' + toolchain.binaries['/usr/local/bin/node']
  || hash(layerMember('usr/bin/env')) !== 'sha256:' + toolchain.binaries['/usr/bin/env']
  || hash(layerMember('usr/sbin/chroot')) !== 'sha256:' + toolchain.binaries['/usr/sbin/chroot']) throw Error('Toolchain bytes mismatch');
const imageBinding = { manifestDigest: registry?.manifestDigest ?? index.manifests[0].digest, configDigest: manifest.config.digest,
  sourceSha: provenance.sourceSha, os: config.os, architecture: config.architecture };
if (registry) Object.assign(imageBinding, {
  archiveManifestDigest: index.manifests[0].digest,
  registryLayer: registry.manifest.layers[0],
  archiveLayer: manifest.layers[0],
  layerDiffId: hash(layer),
  registryManifestVerified: true,
  archiveBytesVerified: true,
});
await mkdir(output);
await writeFile(join(output, 'image-binding.json'), JSON.stringify(imageBinding, null, 2) + '\n');
const evidence = { schema: 'native-runtime-artifact/v1', ...imageBinding, archiveSha256: hash(await readFile(archive)),
  imageDigestVerified: true, runtimeVersion: '3', harnessVersion: '3', toolchain, provenance,
  originalImage: 'UNAVAILABLE', binaryEquivalenceClaimed: false, qualification: 'NOT_PERFORMED', authority: 'NONE' };
await writeFile(join(output, 'artifact.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ ...imageBinding, archiveSha256: evidence.archiveSha256, output }));
