import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SUCCESSOR_ISOLATED_IMAGE_BINDING } from '../../packages/workflow-engine/src/harnessManifests.js';
import { inspectIsolatedRuntimeImage } from '../../packages/workflow-engine/src/isolatedRuntimeImage.js';

const [docker, output] = process.argv.slice(2);
if (!docker || !output) throw Error('Exact Docker executable and fresh evidence directory required');
await mkdir(output);
const config = await mkdtemp(join(tmpdir(), 'mc-native-security-'));
const options = ['--host', 'unix:///var/run/docker.sock', '--config', config];
const run = (...args: string[]) => execFileSync(docker, [...options, ...args], {
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', QUALIFICATION_SECRET_CANARY: 'must-not-enter-runtime' },
  encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128000,
}).trim();
const binding = SUCCESSOR_ISOLATED_IMAGE_BINDING;
const resources: string[] = [];
const evidence: any = { schema: 'native-successor-sandbox-security/v1', canonicalAttempt: false,
  classification: 'ADVERSARIAL_COMPONENT_CONTROL', paidOperations: 0, productionAuthority: 'NONE', probes: [] };
try {
  let image: any;
  for (const reference of [binding.manifestDigest, binding.configDigest]) {
    try { image = inspectIsolatedRuntimeImage(binding, reference, JSON.parse(run('image', 'inspect', reference))); break; }
    catch (error: any) { if (error.status !== 1 || !String(error.stderr).includes('No such image')) throw error; }
  }
  assert.ok(image); evidence.image = image;
  // Same immutable image and sandbox policy as the adapter. A diagnostic Node
  // program replaces only the entrypoint's final script argument; this is not
  // execution or Result evidence for a canonical WorkOrder.
  const probe = `const fs=require('node:fs'),net=require('node:net');
    const denied=p=>{try{fs.writeFileSync(p,'x');return false}catch{return true}};
    const markerAbsent=!fs.existsSync('/workspace/owner-marker');fs.writeFileSync('/workspace/owner-marker','isolated');
    const checks={nonroot:process.getuid()===65534,rootReadOnly:denied('/escape'),runtimeReadOnly:denied('/runtime/invoke.mjs'),
      hostPathsAbsent:['/Users','/host','/var/run/docker.sock','/root/.aws','/proc'].every(p=>!fs.existsSync(p)),
      credentialsAbsent:!Object.keys(process.env).some(k=>/TOKEN|SECRET|PASSWORD|KEY|DATABASE/.test(k)),
      environmentExact:Object.keys(process.env).sort().join(',')==='HOME,LANG,PATH,TMPDIR',crossOwnerMarkerAbsent:markerAbsent};
    const socket=net.connect({host:'1.1.1.1',port:443});let finished=false;
    const done=blocked=>{if(finished)return;finished=true;socket.destroy();process.stdout.write(JSON.stringify({...checks,networkBlocked:blocked}));};
    socket.on('connect',()=>done(false));socket.on('error',()=>done(true));socket.setTimeout(1000,()=>done(true));`;
  for (let i = 0; i < 2; i++) {
    const name = 'mc-native-security-' + randomUUID(); resources.push(name);
    const args = ['run', '--pull', 'never', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--cap-add', 'SYS_CHROOT', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--security-opt', 'no-new-privileges',
      '--pids-limit', '64', '--memory', '256m', '--cpus', '1',
      '--tmpfs', '/jail/workspace:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700',
      '--tmpfs', '/jail/tmp:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700',
      '--entrypoint', '/usr/bin/env', image.selectedReference, '-i', 'PATH=/runtime', 'HOME=/workspace', 'TMPDIR=/tmp', 'LANG=C',
      '/usr/sbin/chroot', '--userspec=65534:65534', '/jail', '/runtime/node', '-e', probe];
    const result = JSON.parse(run(...args)); assert.ok(Object.values(result).every(x => x === true));
    const [inspection] = JSON.parse(run('container', 'inspect', name));
    assert.ok([binding.manifestDigest, binding.configDigest].includes(inspection.Image));
    assert.equal(inspection.HostConfig.NetworkMode, 'none'); assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspection.HostConfig.Memory, 268435456); assert.equal(inspection.HostConfig.PidsLimit, 64);
    assert.equal(inspection.HostConfig.NanoCpus, 1000000000); assert.equal(inspection.HostConfig.Privileged, false);
    assert.deepEqual(inspection.HostConfig.Binds ?? [], []);
    evidence.probes.push({ containerId: inspection.Id, imageId: inspection.Image, result,
      hostConfig: { network: 'none', readOnly: true, memory: 268435456, pids: 64, nanoCpus: 1000000000, privileged: false, hostBinds: [] } });
  }
} finally {
  for (const name of resources) {
    run('rm', '-f', name);
    assert.throws(() => run('container', 'inspect', name), (error: any) => error.status === 1 && String(error.stderr).includes('No such container'));
  }
  await rm(config, { recursive: true });
}
evidence.cleanup = 'VERIFIED'; evidence.passed = true;
await writeFile(join(output, 'security.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ sandboxSecurity: 'PASS', exactImage: binding.manifestDigest, probes: evidence.probes.length, cleanup: evidence.cleanup }));
