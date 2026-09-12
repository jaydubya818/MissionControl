// Immutable bootstrap. No host paths or credentials cross this interface.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = '/var/lib/mission-control/attempt';
// PID 1 owns the deadline, including stdin/bootstrap. Its exit kills the container.
let deadline = Number(process.env.MC_DEADLINE_AT);
if (!Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline > Date.now() + 900000) throw new Error('Invalid frozen deadline');
let timer = setTimeout(() => process.exit(124), deadline - Date.now());
const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new Error('Frozen deadline exceeded'); return ms; };
let bytes = 0;
const chunks = [];
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes > 32 * 1024 * 1024) throw new Error('Invocation too large');
  chunks.push(chunk);
}
const { schema, config, repository, deadlineAt } = JSON.parse(Buffer.concat(chunks));
if (schema !== 'factory-docker-invocation/v1' || Object.keys(config.environment).length || !Number.isSafeInteger(deadlineAt)) throw new Error('Invalid invocation authority');
deadline = Math.min(deadline, deadlineAt);
clearTimeout(timer); timer = setTimeout(() => process.exit(124), remaining());
mkdirSync(root + '/home', { recursive: true });
writeFileSync(root + '/repository.bundle', Buffer.from(repository, 'base64'), { mode: 0o600 });
await exec('git', ['clone', '--quiet', root + '/repository.bundle', root + '/repository'], { timeout: remaining() });
await exec('git', ['-C', root + '/repository', 'checkout', '--quiet', config.sourceSha], { timeout: remaining() });
writeFileSync(root + '/config.json', JSON.stringify(config), { mode: 0o400 });
await exec('node', ['/opt/factory/supervisor.mjs', root + '/config.json'], { maxBuffer: 1024 * 1024, timeout: remaining(), killSignal: 'SIGKILL' });
// stdout contains one bounded supervisor result, never arbitrary workload stdout.
process.stdout.write(readFileSync(root + '/result.json'));
clearTimeout(timer);
