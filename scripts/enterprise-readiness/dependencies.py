"""Read pinned Git sources and captured GitHub metadata; never fetch or mutate dependencies."""
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sources, metadata, output = map(Path, sys.argv[1:4])
pins = {
    'MissionControl': ('08daed6f5745dce00d18da4218a26fdc5b827666', ['convex/factory/enterpriseCompatibility.ts', 'convex/factory/nativeAccounting.ts', 'convex/factory/enterpriseQualification.ts']),
    'MyFactory': ('fa48a820ba185eb9b891130c78166463b61cba74', ['apps/cloud-control/src/external-alpha-authority.mjs', 'apps/cloud-control/migrations/011-external-alpha-work-authority.sql']),
    'MyEveBot': ('8338309582d6806829dec1ae1beef301d6b52425', ['apps/eve/lib/digital-worker/routing.ts', 'apps/eve/lib/engineering/route-admission.ts', 'apps/eve/lib/engineering/factory-result-consumer.ts', 'apps/eve/lib/external-alpha/shared-accounting.ts']),
    'skillz': ('3c975f3df6cfd973d5d42b45c64565c1171dcdc8', ['myskills/resolver.py', 'myskills/registry.py', 'qualification/checkpoint5/consumer-compatibility.json', 'qualification/checkpoint6/independent-review.json']),
    'relay': ('a90625776193031ca2303ba2e2162249d1245479', ['lib/v2/federation/contracts.ts', 'lib/v2/federation/service.ts', 'lib/v2/federation/signing-envelope.ts']),
}
rows=[]
for repo,(pin,paths) in pins.items():
    git=['git','--git-dir='+str(sources/(repo+'.git'))]
    def run(*args): return subprocess.check_output(git+list(args),stderr=subprocess.DEVNULL)
    main=run('rev-parse','main').decode().strip()
    pr_numbers={'MissionControl':[], 'MyFactory':[12], 'MyEveBot':[65,67], 'skillz':[6,7], 'relay':[34]}[repo]
    prs=[p for p in json.loads((metadata/(repo+'-prs.json')).read_text()) if p['number'] in pr_numbers]
    row={'repository':repo,'mainSha':main,'compatibilitySourceSha':pin,'sourceIsInMain':subprocess.run(git+['merge-base','--is-ancestor',pin,main],capture_output=True).returncode==0,'pullRequests':prs,'contracts':[]}
    for path in paths:
        source=run('show',pin+':'+path)
        try: main_bytes=run('show',main+':'+path)
        except subprocess.CalledProcessError: main_bytes=None
        row['contracts'].append({'path':path,'sha256':hashlib.sha256(source).hexdigest(),'url':f'https://github.com/jaydubya818/{repo}/blob/{pin}/{path}',
            'mainStatus':'ABSENT' if main_bytes is None else 'IDENTICAL' if main_bytes==source else 'DIFFERENT','mainSha256':hashlib.sha256(main_bytes).hexdigest() if main_bytes else None})
    rows.append(row)
manifest={'schema':'enterprise-dependency-adoption/v1','observedAt':datetime.now(timezone.utc).isoformat(),'sourceReadOnly':True,'automaticAdoption':False,'repositories':rows,
 'qualifiedLocalMyFactory':{'sha':'e498c31db8b749fa91b0544ecd1d1a661b971c2c','factoryVersion':'4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95','scope':'Accepted isolated deterministic local-provider checkpoint; no canonical production adoption'},
 'decisions':{
 'MissionControl':'Qualified native/hybrid branch is not main; retain pins. Requalify canonical merged source before production adoption.',
 'MyFactory':'PR12 remains stacked on the private-source branch. Existing adapter qualified only at exact compatibility/local-provider sources. Main is not a substitute for those contracts.',
 'MyEve':'PR65 and PR67 remain open. Main route schema lacks MissionControl; shared owner/cohort accounting and enterprise owner session-to-connection projection need composed qualification. Do not modify external alpha.',
 'MySkills':'PR6 platform and PR7 checkpoint6 remain open. PR7 advanced from 21ae05a7be2f73be1378deb896f138700c473e84. Source-bound claim review PASS is retained evidence, not consumer execution qualification. Existing deterministic bridge cannot execute the qualified Python TDD task profile; consumer compatibility NOT_ESTABLISHED, activation DISABLED.',
 'Relay':'Federation signing-envelope v2 exists in main. Transport delivery does not grant receiver execution or spending. MissionControl transport binding remains NOT_QUALIFIED and is unnecessary for the direct readiness fixture.'},
 'nextAdoptionChecks':['Record exact merged main SHAs without merging automatically','Revalidate identity, scope, revision, Result signatures and revocation against those SHAs','Compose MyEve owner/cohort allowance with enterprise reservations without a second ledger','Qualify actual MyEve owner session/proposal/decision and canonical Result consumer','Qualify exact MySkills task/model/harness profile if adopted','Qualify Relay transport only if selected, keeping receiver authority separate'],
 'productionIntegration':'NOT_RUN','externalAlphaChanges':0}
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({r['repository']:{'main':r['mainSha'],'sourceInMain':r['sourceIsInMain'],'contracts':[(f['path'],f['mainStatus']) for f in r['contracts']]} for r in rows},indent=2))
