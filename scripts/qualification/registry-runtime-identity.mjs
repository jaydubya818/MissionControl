import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const imageManifest = 'application/vnd.oci.image.manifest.v1+json';
const imageConfig = 'application/vnd.oci.image.config.v1+json';

function descriptor(value, mediaTypes) {
  assert.match(value?.digest ?? '', /^sha256:[a-f0-9]{64}$/, 'Invalid registry descriptor digest');
  assert.ok(Number.isSafeInteger(value.size) && value.size > 0, 'Invalid registry descriptor size');
  assert.ok(mediaTypes.includes(value.mediaType), 'Invalid registry descriptor media type');
}

export function verifyRegistryManifest(envelope, image, configDigest) {
  const manifestDigest = image.split('@')[1];
  assert.match(manifestDigest ?? '', /^sha256:[a-f0-9]{64}$/, 'Invalid registry image pin');
  assert.match(configDigest ?? '', /^sha256:[a-f0-9]{64}$/, 'Invalid registry config pin');
  assert.equal(image.split('@').length, 2, 'One registry image pin required');
  assert.equal(envelope.Ref, image, 'Registry reference differs from requested image');
  descriptor(envelope.Descriptor, [imageManifest]);
  assert.equal(envelope.Descriptor.digest, manifestDigest, 'Registry descriptor differs from pin');
  assert.equal(typeof envelope.Raw, 'string', 'Raw registry manifest required');
  const bytes = Buffer.from(envelope.Raw, 'base64');
  assert.equal(bytes.toString('base64'), envelope.Raw, 'Invalid raw manifest encoding');
  assert.equal(bytes.length, envelope.Descriptor.size, 'Registry manifest size mismatch');
  assert.equal(digest(bytes), manifestDigest, 'Registry manifest digest mismatch');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schemaVersion, 2, 'Registry manifest schema mismatch');
  assert.equal(manifest.mediaType, imageManifest, 'Registry manifest media type mismatch');
  descriptor(manifest.config, [imageConfig]);
  assert.equal(manifest.config.digest, configDigest, 'Registry config differs from pin');
  assert.ok(Array.isArray(manifest.layers) && manifest.layers.length === 1, 'One exact registry layer required');
  descriptor(manifest.layers[0], ['application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip']);
  return { manifestDigest, manifest, bytes };
}
