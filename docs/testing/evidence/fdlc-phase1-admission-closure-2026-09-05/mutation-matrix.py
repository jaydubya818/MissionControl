"""No-model OS sandbox feasibility evidence. NOT worker/host qualification."""
import datetime,hashlib,json,os,pathlib,shutil,subprocess,tempfile
out=pathlib.Path(__file__).resolve().parent
native=pathlib.Path('/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex')
assert hashlib.sha256(native.read_bytes()).hexdigest()=='ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02'
root=pathlib.Path(tempfile.mkdtemp(prefix='fdlc-mutation-matrix-')).resolve()
w=root/'workspace';t=root/'admitted-temp';outside=root/'sibling-repository';home=root/'synthetic-home'
for p in [w,t,outside,home,root/'codex-home',home/'.ssh',home/'.aws',home/'.config']:p.mkdir(parents=True,exist_ok=True)
for p in [outside/'delete',outside/'chmod',outside/'chown',outside/'hardlink-source',w/'modify',w/'delete-generated',w/'rename-source',w/'move-source']:p.write_text('synthetic canary\n')
(w/'escape').symlink_to(outside,target_is_directory=True);(w/'nested-escape').symlink_to(w/'escape',target_is_directory=True)
protected={str(p):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mode':p.stat().st_mode} for p in outside.iterdir()}
profile='fdlc-mutation-feasibility-v3'
# Allowlist only. No broad /tmp write and no deny-pattern blacklist.
fs={':root':'deny',':minimal':'read',':slash_tmp':'deny','/System/Library/Perl':'read',':workspace_roots':{'.':'write'},str(t):'write',str(native.parent.parent):'read'}
# Root-default denial and removal of the implicit global temp grant; writes are allowlisted only.
inline=lambda d:'{'+','.join(json.dumps(k)+'='+ (inline(v) if isinstance(v,dict) else json.dumps(v)) for k,v in d.items())+'}'
configs=['sandbox_workspace_write.exclude_slash_tmp=true','sandbox_workspace_write.exclude_tmpdir_env_var=true',f'permissions.{profile}.filesystem='+inline(fs),f'permissions.{profile}.network.enabled=false']
args=[str(native),'sandbox','-P',profile,*sum((['-c',c]for c in configs),[]),'-C',str(w),'--']
env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(home),'CODEX_HOME':str(root/'codex-home'),'TMPDIR':str(t),'CI':'true'}
rows=[]
def run(name,path,script,expected='DENIED',extra=None,qualification='DIRECT_NATIVE_SANDBOX_ONLY'):
 p=pathlib.Path(path);canonical=str(p.resolve());r=subprocess.run(args+['/bin/sh','-c',script,'probe',str(p),*(extra or [])],env=env,capture_output=True,text=True,timeout=15)
 actual='ALLOWED' if r.returncode==0 else 'DENIED_OR_ERROR'
 # Preserve errors for review: nonzero alone is never asserted to prove OS enforcement.
 rows.append({'operation':name,'requestedPath':str(p),'canonicalPath':canonical,'expected':expected,'actual':actual,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'enforcementLayer':'Codex 0.146.0 sandbox / macOS Seatbelt; review errno in stderr','qualificationScope':qualification})
try:
 run('create workspace file',w/'created','echo canary > "$1"','ALLOWED')
 run('modify permitted file',w/'modify','echo modified >> "$1"','ALLOWED')
 run('delete generated file',w/'delete-generated','rm "$1"','ALLOWED')
 run('create admitted temp',t/'temp','echo bounded > "$1"','ALLOWED')
 # /etc test uses a unique nonexistent filename and shell noclobber; no existing host file touched.
 etc=pathlib.Path('/etc')/(root.name+'.canary')
 run('write /etc canary',etc,'set -C; echo canary > "$1"')
 for label,parent in [('host home',pathlib.Path.home()),('host ssh',pathlib.Path.home()/'.ssh'),('host aws',pathlib.Path.home()/'.aws'),('host config',pathlib.Path.home()/'.config')]:
  target=parent/(root.name+'.canary')
  if parent.exists():run('write '+label,target,'set -C; echo canary > "$1"')
  else:rows.append({'operation':'write '+label,'requestedPath':str(target),'canonicalPath':str(target.resolve()),'expected':'DENIED','actual':'NOT_RUN_PARENT_ABSENT','enforcementLayer':'UNPROVEN','qualificationScope':'DIRECT_NATIVE_SANDBOX_ONLY'})
 for label,parent in [('sibling repository',outside),('parent directory',root),('unrelated temp',pathlib.Path('/tmp'))]:run('write '+label,parent/(root.name+'.canary'),'set -C; echo canary > "$1"')
 run('delete outside workspace',outside/'delete','rm "$1"')
 run('rename across boundary',outside/'renamed','mv "$2" "$1"',extra=[str(w/'rename-source')])
 run('move across boundary',outside/'moved','mv "$2" "$1"',extra=[str(w/'move-source')])
 run('symlink escape',w/'escape'/'symlink-write','echo escape > "$1"')
 run('nested symlink escape',w/'nested-escape'/'nested-write','echo escape > "$1"')
 run('hardlink outside inode into workspace',w/'hardlink','ln "$2" "$1"',extra=[str(outside/'hardlink-source')])
 run('shell redirection',outside/'redirect','echo escape > "$1"')
 run('subprocess write',outside/'subprocess','/bin/sh -c \'echo escape > "$1"\' child "$1"')
 run('language runtime direct write',outside/'language','/usr/bin/perl -e \'open(my $f, ">", $ARGV[0]) or die "$!"; print $f "escape"; close($f)\' "$1"')
 run('chmod outside',outside/'chmod','chmod 600 "$1"')
 run('chown outside',outside/'chown','chown "$(id -u)" "$1"')
 for p in sorted(native.parent.parent.rglob('*')):
  if p.is_file():run('runtime resource writable-open, no bytes written',p,': >> "$1"')
finally:
 unchanged=all(pathlib.Path(p).exists() and hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==v['sha256'] and pathlib.Path(p).stat().st_mode==v['mode'] for p,v in protected.items())
 runtimeUnchanged=hashlib.sha256(native.read_bytes()).hexdigest()=='ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02'
 # Remove only uniquely named canaries potentially created by a failed boundary.
 cleanup=[]
 for parent in [pathlib.Path('/etc'),pathlib.Path.home(),pathlib.Path.home()/'.ssh',pathlib.Path.home()/'.aws',pathlib.Path.home()/'.config',pathlib.Path('/tmp')]:
  p=parent/(root.name+'.canary')
  if p.exists():cleanup.append(str(p));p.unlink()
 shutil.rmtree(root)
 result={'schema':'fdlc-mutation-feasibility/v1','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'profile':profile,'configuration':configs,'configurationSha256':hashlib.sha256(json.dumps(configs,separators=(',',':')).encode()).hexdigest(),'modelCalls':0,'workerStarted':False,'workerPathQualified':False,'rows':rows,'cleanup':{'fixtureRemoved':not root.exists(),'outsideCanariesUnchanged':unchanged,'nativeRuntimeUnchanged':runtimeUnchanged,'unexpectedHostCanariesRemoved':cleanup},'qualification':'NOT_HOST_ADMISSION: profile is not integrated into the producing worker; inspect each denial/error'}
 (out/'mutation-matrix.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'rows':[{k:r[k] for k in ['operation','actual']} for r in rows],'cleanup':result['cleanup']},indent=2))
