import pathlib,tempfile,subprocess,json,shutil,hashlib,datetime
out=pathlib.Path('docs/testing/evidence/fdlc-phase1-final-admission-2026-09-05')
r=pathlib.Path(tempfile.mkdtemp(prefix='fdlc-outer-')).resolve();w=r/'workspace';t=r/'private-temp';h=r/'home'
for p in [w,t,h]:p.mkdir()
native='/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex'
q=json.dumps
policy='(version 1)\n(deny default)\n(allow process*)\n(allow sysctl-read)\n(allow mach-lookup)\n(allow file-map-executable)\n(allow file-read*)\n'+''.join('(allow file-read* (subpath '+q(p)+'))\n' for p in ['/System','/usr','/bin','/sbin','/Library/Apple','/dev','/private/etc',str(w),str(t),str(h),str(pathlib.Path(native).resolve().parent.parent)])+''.join('(allow file-write* (subpath '+q(str(p))+'))\n' for p in [w,t])
env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(h),'CODEX_HOME':str(h),'TMPDIR':str(t),'TEMP':str(t),'TMP':str(t)}
checks={}
try:
 for key,command in [('startup',[native,'--version']),('nested_native_tool',[native,'sandbox','-P','probe','-c','permissions.probe.filesystem={":minimal"="read",":workspace_roots"={"."="write"}}','-C',str(w),'--','/bin/sh','-c','echo allowed > "$1"','probe',str(w/'allowed')])]:
  p=subprocess.run(['/usr/bin/sandbox-exec','-p',policy,*command],env=env,cwd=w,text=True,capture_output=True,timeout=15)
  checks[key]={'command':command,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
finally:
 shutil.rmtree(r)
 d={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mechanism':'outer macOS Seatbelt allowlist; no model calls','policy':policy,'policySha256':hashlib.sha256(policy.encode()).hexdigest(),'nativeSha256':hashlib.sha256(pathlib.Path(native).read_bytes()).hexdigest(),'checks':checks,'cleanup':not r.exists(),'qualification':'FEASIBILITY_ONLY; worker not started; no host admission'}
 (out/'outer-boundary-probe.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d,indent=2))
