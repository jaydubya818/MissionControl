import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/** Retry transient registry failures without changing the admitted image identity. */
export async function pullPinnedImage(image, {
  pull = value => execFileSync('docker', ['pull', value], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }),
  wait = delay,
  warn = console.warn,
} = {}) {
  assert.match(image, /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/, 'Immutable image digest required');
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return pull(image); }
    catch (error) {
      const diagnostic = `${error.message ?? ''}\n${error.stderr ?? ''}`;
      if (attempt === 2 || !/toomanyrequests|rate exceeded|429|connection reset|TLS handshake timeout|i\/o timeout|temporary failure in name resolution/i.test(diagnostic)) throw error;
      const milliseconds = (attempt + 1) * 10000;
      warn(`Transient registry failure; retrying the same pinned image in ${milliseconds / 1000}s (attempt ${attempt + 2}/3).`);
      await wait(milliseconds);
    }
  }
}
