import { expect, it, vi } from 'vitest';
import { pullPinnedImage } from './pull-pinned-image.mjs';

const image = 'public.ecr.aws/docker/library/node@sha256:' + 'a'.repeat(64);
const limited = () => Object.assign(new Error('docker pull failed'), { stderr: 'toomanyrequests: Rate exceeded' });

it('retries a rate limit with exactly the same image digest', async () => {
  const pull = vi.fn().mockImplementationOnce(() => { throw limited(); }).mockReturnValue('pulled');
  const wait = vi.fn(), warn = vi.fn();
  await expect(pullPinnedImage(image, { pull, wait, warn })).resolves.toBe('pulled');
  expect(pull.mock.calls).toEqual([[image], [image]]);
  expect(wait.mock.calls).toEqual([[10000]]);
});

it('fails after three transient failures without substituting an image', async () => {
  const pull = vi.fn(() => { throw limited(); }), wait = vi.fn();
  await expect(pullPinnedImage(image, { pull, wait, warn: vi.fn() })).rejects.toThrow('docker pull failed');
  expect(pull.mock.calls).toEqual([[image], [image], [image]]);
  expect(wait.mock.calls).toEqual([[10000], [20000]]);
});

it.each(['unauthorized: authentication required', 'manifest unknown', 'denied: access forbidden'])('does not retry a permanent failure: %s', async stderr => {
  const pull = vi.fn(() => { throw Object.assign(new Error('pull denied'), { stderr }); }), wait = vi.fn();
  await expect(pullPinnedImage(image, { pull, wait })).rejects.toThrow('pull denied');
  expect(pull).toHaveBeenCalledTimes(1);
  expect(wait).not.toHaveBeenCalled();
});

it('rejects a mutable image tag before invoking Docker', async () => {
  const pull = vi.fn();
  await expect(pullPinnedImage('node:24', { pull })).rejects.toThrow('Immutable image digest required');
  expect(pull).not.toHaveBeenCalled();
});

it('does not mistake digest text for a transient HTTP status', async () => {
  const digestImage = image.replace('a'.repeat(64), '429' + 'a'.repeat(61));
  const pull = vi.fn(() => { throw new Error(`Command failed: docker pull ${digestImage}\nunauthorized`); });
  const wait = vi.fn();
  await expect(pullPinnedImage(digestImage, { pull, wait })).rejects.toThrow('unauthorized');
  expect(pull).toHaveBeenCalledTimes(1);
  expect(wait).not.toHaveBeenCalled();
});

it.each(['HTTP 429 Too Many Requests', 'status code: 429'])('retries an explicit rate-limit status: %s', async stderr => {
  const pull = vi.fn().mockImplementationOnce(() => { throw Object.assign(new Error('pull failed'), { stderr }); }).mockReturnValue('pulled');
  await expect(pullPinnedImage(image, { pull, wait: vi.fn(), warn: vi.fn() })).resolves.toBe('pulled');
  expect(pull.mock.calls).toEqual([[image], [image]]);
});
