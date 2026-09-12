"""Offline synthetic probe only. Never invokes codex exec or a model."""
import base64, hashlib, json, os, pathlib, platform, shutil, subprocess, tempfile, datetime
out=pathlib.Path(__file__).resolve().parent
binary=pathlib.Path('/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex')
archive=pathlib.Path('/tmp/fdlc-runtime-0146/openai-codex-0.146.0-darwin-arm64.tgz')
pin='ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02'
expected='nb61yX4r5L6Z0dlC4o3u0GAK1YCd4TUvjaB382bajDoh84V+uv2hTBIVZ++fgXWV9yoeuNrNnNcn7GoTGOe2Tg=='
actual=hashlib.sha256(binary.read_bytes()).hexdigest()
sri=base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
assert actual==pin and sri==expected
root=pathlib.Path(tempfile.mkdtemp(prefix='fdlc-admission-canary-')).resolve()
results={'schema':'fdlc-offline-runtime-containment-probe/v1','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':platform.platform(),'executable':str(binary),'executableSha256':actual,'package':'@openai/codex@0.146.0-darwin-arm64','archiveIntegrity':'sha512-'+sri,'archiveIntegrityMatch':True,'runtimeDigestMatch':True,'modelCalls':0,'probes':{}}
try:
    for d in ['workspace','outside-repository','home','codex-home']: (root/d).mkdir()
    (root/'workspace'/'README.md').write_text('synthetic allowed\n')
    (root/'outside-repository'/'canary').write_text('synthetic unrelated file, not a real secret\n')
    env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(root/'home'),'CODEX_HOME':str(root/'codex-home'),'TMPDIR':str(root),'CI':'true','GIT_TERMINAL_PROMPT':'0'}
    results['startup']=subprocess.run([str(binary),'--version'],env=env,text=True,capture_output=True).__dict__
    results['startup']={k:results['startup'][k] for k in ['returncode','stdout','stderr']}
    commands='; '.join(['if cat "$1" >/dev/null 2>&1; then echo workspace_read=ALLOWED; else echo workspace_read=DENIED; fi','if cat "$2" >/dev/null 2>&1; then echo outside_read=ALLOWED; else echo outside_read=DENIED; fi','if /bin/sh -c \'cat "$1" >/dev/null 2>&1\' child "$2"; then echo subprocess_outside_read=ALLOWED; else echo subprocess_outside_read=DENIED; fi','if touch "$3" 2>/dev/null; then echo workspace_write=ALLOWED; else echo workspace_write=DENIED; fi'])
    strict=['-P','mission-planner-contained','-c','permissions.mission-planner-contained.filesystem={":minimal"="read",glob_scan_max_depth=8,":workspace_roots"={"."="read",".env"="deny",".env.*"="deny","**/.env"="deny","**/.env.*"="deny"}}','-c','permissions.mission-planner-contained.network.enabled=false']
    for name,opts in [('adapter_mutation_workspace_write',['-c','sandbox_mode="workspace-write"','-c','sandbox_workspace_write.network_access=false']),('existing_read_only_planning_profile',strict)]:
        args=[str(binary),'sandbox',*opts,'-C',str(root/'workspace'),'--','/bin/sh','-c',commands,'canary',str(root/'workspace'/'README.md'),str(root/'outside-repository'/'canary'),str(root/'workspace'/name)]
        p=subprocess.run(args,env=env,text=True,capture_output=True,timeout=20)
        results['probes'][name]={'args':args,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
finally:
    shutil.rmtree(root)
    results['fixtureCleanup']=not root.exists()
    results['qualification']='OFFLINE_IDENTITY_ONLY; NOT_HOST_ADMISSION'
    (out/'runtime-containment.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
