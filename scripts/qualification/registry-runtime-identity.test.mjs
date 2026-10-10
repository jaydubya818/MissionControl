import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { verifyRegistryManifest } from './registry-runtime-identity.mjs';

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value));
const media = 'application/vnd.oci.image.';
const source = 'a'.repeat(40);
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'runtime-integrity-'));
  roots.push(root);
  const put = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  const build = join(root, 'build');
  const bridge = Buffer.from('qualified bridge bytes');
  const binding = encoded({ backendDigest: hash('qualified backend') });
  const context = { Dockerfile: Buffer.from('FROM scratch'), 'bridge.mjs': bridge, 'invocation-binding.json': binding };
  for (const [name, bytes] of Object.entries(context)) put(join(build, 'context', name), bytes);
  put(join(build, 'provenance.json'), encoded({ sourceClean: true, sourceSha: source,
    contextFiles: Object.fromEntries(Object.entries(context).map(([name, bytes]) => [name, hash(bytes)])),
    bundles: { artifacts: { bridge: { digest: hash(bridge) }, backend: { digest: hash('qualified backend') } } } }));
  const binaries = { '/usr/local/bin/node': Buffer.from('node bytes'), '/usr/bin/env': Buffer.from('env bytes'), '/usr/sbin/chroot': Buffer.from('chroot bytes') };
  const layerRoot = join(root, 'layer');
  put(join(layerRoot, 'jail/runtime/invocation-binding.json'), binding);
  put(join(layerRoot, 'jail/runtime/invoke.mjs'), options.runtimeTamper ? 'changed runtime' : bridge);
  put(join(layerRoot, 'jail/runtime/node'), binaries['/usr/local/bin/node']);
  put(join(layerRoot, 'usr/bin/env'), binaries['/usr/bin/env']);
  put(join(layerRoot, 'usr/sbin/chroot'), options.toolchainTamper ? 'changed chroot' : binaries['/usr/sbin/chroot']);
  put(join(layerRoot, 'jail/runtime/toolchain.json'), encoded({ platform: 'linux', architecture: 'x64',
    binaries: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, hash(bytes).slice(7)])) }));
  const layerFile = join(root, 'layer.tar');
  execFileSync('tar', ['-cf', layerFile, '-C', layerRoot, 'jail', 'usr']);
  const layer = readFileSync(layerFile);
  const compressed = gzipSync(layer);
  const config = encoded({ os: options.os ?? 'linux', architecture: options.architecture ?? 'amd64',
    config: { Labels: { 'org.opencontainers.image.revision': options.source ?? source, 'org.opencontainers.image.version': '3' } },
    rootfs: { type: 'layers', diff_ids: [options.diffId ?? hash(layer)] } });
  const descriptor = (bytes, type) => ({ mediaType: media + type, digest: hash(bytes), size: bytes.length });
  const registryManifest = { schemaVersion: 2, mediaType: media + 'manifest.v1+json',
    config: descriptor(config, 'config.v1+json'), layers: [descriptor(compressed, 'layer.v1.tar+gzip')] };
  const registryBytes = encoded(registryManifest);
  const image = 'ghcr.io/example/qualified@' + hash(registryBytes);
  const envelope = { Ref: image, Descriptor: descriptor(registryBytes, 'manifest.v1+json'), Raw: registryBytes.toString('base64') };
  const archiveRoot = join(root, 'oci');
  const archiveLayer = options.compressedExport ? compressed : layer;
  const archiveManifest = { ...registryManifest, layers: [descriptor(archiveLayer, options.compressedExport ? 'layer.v1.tar+gzip' : 'layer.v1.tar')] };
  const manifestBytes = encoded(archiveManifest);
  const blob = bytes => { const path = join(archiveRoot, 'blobs/sha256', hash(bytes).slice(7)); put(path, bytes); return path; };
  const manifestPath = blob(manifestBytes), configPath = blob(config), layerPath = blob(archiveLayer);
  const indexPath = join(archiveRoot, 'index.json');
  put(indexPath, encoded({ schemaVersion: 2, manifests: [descriptor(manifestBytes, 'manifest.v1+json')] }));
  const archive = join(root, 'image.tar'), registryPath = join(root, 'registry.json');
  return { root, build, image, envelope, configDigest: hash(config), archiveDigest: hash(manifestBytes),
    registryManifest, registryBytes, configPath, layerPath, manifestPath, indexPath,
    run() {
      writeFileSync(registryPath, encoded(envelope));
      execFileSync('tar', ['-cf', archive, '-C', archiveRoot, 'index.json', 'blobs']);
      const output = join(root, 'evidence');
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./inspect-native-successor.mjs', import.meta.url)),
        archive, build, output, registryPath, image, hash(config)], { encoding: 'utf8' });
      return { ...result, binding: result.status === 0 ? JSON.parse(readFileSync(join(output, 'image-binding.json'))) : undefined };
    } };
}

describe('pinned registry and Docker export runtime identity', () => {
  it.each([false, true])('verifies layer bytes for compressedExport=%s and preserves registry identity', compressedExport => {
    const f = fixture({ compressedExport });
    const result = f.run();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.binding).toMatchObject({ manifestDigest: f.image.split('@')[1], archiveManifestDigest: f.archiveDigest,
      configDigest: f.configDigest, sourceSha: source, os: 'linux', architecture: 'amd64',
      registryManifestVerified: true, archiveBytesVerified: true });
    expect(result.binding.archiveLayer.mediaType).toBe(media + (compressedExport ? 'layer.v1.tar+gzip' : 'layer.v1.tar'));
    if (!compressedExport) {
      expect(result.binding.manifestDigest).not.toBe(result.binding.archiveManifestDigest);
      expect(result.binding.layerDiffId).toBe(result.binding.archiveLayer.digest);
    }
  });

  it.each(['manifestPath', 'configPath', 'layerPath'])('rejects tampered export bytes in %s', field => {
    const f = fixture();
    writeFileSync(f[field], Buffer.concat([readFileSync(f[field]), Buffer.from('tampered')]));
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OCI descriptor bytes do not match');
  });

  it.each([
    [{ diffId: 'sha256:' + 'b'.repeat(64) }, 'Image layer identity mismatch'],
    [{ architecture: 'arm64' }, 'Successor source or architecture mismatch'],
    [{ os: 'windows' }, 'Successor source or architecture mismatch'],
    [{ source: 'b'.repeat(40) }, 'Successor source or architecture mismatch'],
    [{ runtimeTamper: true }, 'Image runtime bytes differ from source build'],
    [{ toolchainTamper: true }, 'Toolchain bytes mismatch'],
  ])('rejects independently hash-valid but invalid runtime %j', (options, message) => {
    const result = fixture(options).run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it('rejects an export of another hash-valid config even when its descriptors match', () => {
    const f = fixture();
    const manifest = JSON.parse(readFileSync(f.manifestPath));
    const changedConfig = encoded({ ...JSON.parse(readFileSync(f.configPath)), created: 'different image' });
    writeFileSync(join(dirname(f.configPath), hash(changedConfig).slice(7)), changedConfig);
    manifest.config = { ...manifest.config, digest: hash(changedConfig), size: changedConfig.length };
    const changedManifest = encoded(manifest);
    writeFileSync(join(dirname(f.manifestPath), hash(changedManifest).slice(7)), changedManifest);
    writeFileSync(f.indexPath, encoded({ schemaVersion: 2, manifests: [{ mediaType: media + 'manifest.v1+json', digest: hash(changedManifest), size: changedManifest.length }] }));
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Export config differs from pinned registry config');
  });

  it.each([
    ['raw bytes', e => { e.Raw = Buffer.from('tampered').toString('base64'); }],
    ['descriptor size', e => { e.Descriptor.size += 1; }],
    ['descriptor digest', e => { e.Descriptor.digest = 'sha256:' + 'b'.repeat(64); }],
    ['invalid digest', e => { e.Descriptor.digest = '../config'; }],
    ['wrong type', e => { e.Descriptor.mediaType = media + 'index.v1+json'; }],
    ['missing raw', e => { delete e.Raw; }],
    ['invalid base64', e => { e.Raw += '\n'; }],
    ['wrong reference', e => { e.Ref = 'ghcr.io/other/image@sha256:' + 'b'.repeat(64); }],
  ])('fails closed on registry envelope %s', (_name, mutate) => {
    const f = fixture();
    mutate(f.envelope);
    expect(() => verifyRegistryManifest(f.envelope, f.image, f.configDigest)).toThrow();
  });

  it.each([
    ['no layers', m => { m.layers = []; }],
    ['non-array layers', m => { m.layers = { 0: m.layers[0], length: 1 }; }],
    ['ambiguous layers', m => { m.layers.push(m.layers[0]); }],
    ['invalid layer digest', m => { m.layers[0].digest = 'sha256:no'; }],
    ['negative layer size', m => { m.layers[0].size = -1; }],
    ['unknown layer type', m => { m.layers[0].mediaType = 'unknown'; }],
    ['wrong config', m => { m.config.digest = 'sha256:' + 'b'.repeat(64); }],
    ['missing config', m => { delete m.config; }],
    ['wrong schema', m => { m.schemaVersion = 1; }],
  ])('rejects a hash-valid unsupported registry manifest with %s', (_name, mutate) => {
    const f = fixture();
    mutate(f.registryManifest);
    const raw = encoded(f.registryManifest);
    const image = 'ghcr.io/example/qualified@' + hash(raw);
    const envelope = { Ref: image, Raw: raw.toString('base64'), Descriptor: { mediaType: media + 'manifest.v1+json', digest: hash(raw), size: raw.length } };
    expect(() => verifyRegistryManifest(envelope, image, f.configDigest)).toThrow();
  });

  it('does not let evidence supply replacement image or config pins', () => {
    const f = fixture();
    f.envelope.expectedManifestDigest = f.envelope.Descriptor.digest;
    f.envelope.expectedConfigDigest = f.configDigest;
    expect(() => verifyRegistryManifest(f.envelope, 'ghcr.io/example/qualified@sha256:' + 'b'.repeat(64), f.configDigest)).toThrow();
    expect(() => verifyRegistryManifest(f.envelope, f.image, 'sha256:' + 'b'.repeat(64))).toThrow('Registry config differs from pin');
    expect(() => verifyRegistryManifest(f.envelope, 'ghcr.io/example/qualified@sha256:bad', f.configDigest)).toThrow('Invalid registry image pin');
    expect(() => verifyRegistryManifest(f.envelope, f.image, 'sha256:bad')).toThrow('Invalid registry config pin');
  });
});
