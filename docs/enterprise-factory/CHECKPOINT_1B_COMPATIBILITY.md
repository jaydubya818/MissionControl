# Checkpoint 1B source compatibility

The four compatibility candidates remain exact historical commits. Fresh remote pull-ref reads matched the supplied SHAs on 2026-10-09. No newer commit was substituted. Source repositories are public. No dependency working tree or branch was changed.

| Dependency | Exact candidate | Current PR |
| --- | --- | --- |
| MyFactory | `fa48a820ba185eb9b891130c78166463b61cba74` | #12 OPEN; base `codex/external-alpha-private-source-clean` |
| MyEve | `8338309582d6806829dec1ae1beef301d6b52425` | #67 OPEN; base `codex/external-alpha-work-authority` |
| MySkills foundation | `d57ff77b8522f897fc6ae392cf59b3141295ba82` | #6 OPEN; base `main` |
| MySkills behavioral qualification | `21ae05a7be2f73be1378deb896f138700c473e84` | #7 OPEN; base `codex/myskills-platform` |

## MyFactory

The qualification loader reads four exact Git blobs from the pinned commit into a disposable directory. It imports the original `packages/contracts/src/cloud-execution.ts` parser and `packages/hosted-routing/src/result.ts` verifier, plus their runtime dependencies. The repository does not vendor or rewrite their logic. Hosted CI fetches the exact reachable commit and verifies FETCH_HEAD.

The original parser rejects unknown request keys and binds source, paths, commands, duration and sub-allowance. Tests exercise those limits. The original Result verifier authenticates Ed25519 signatures, current key status, exact operation/run/version identity, evidence, and artifact bytes. MissionControl then compares request, base/tree, execution profile, model policy, Work generation and verification policy before making a non-accepting projection.

`apps/cloud-control/src/external-alpha-control.mjs` is an installation-bound API requiring a slot credential and Vercel OIDC identity. It uses derived UUIDv8 request identities. The accepted 1A binding uses UUIDv4. This checkpoint does not repurpose external-alpha installations, adapt their credentials, or claim HTTP compatibility with that endpoint. The loopback fixture protocol is explicitly MissionControl-owned. Canonical interoperability still needs an approved receiving authority contract after dependency adoption.

## Sofie and MyEve

Keep the five execution choices from the accepted plan, plus CHAT_ONLY. Native direct and native multi-agent execution continue through existing Agents, Role Packs, Skills, EnvironmentRouter, Work and Result/Proof. DeepAgents remains a preserved candidate, not newly qualified by this checkpoint. No MyEve code changed.

At the pinned MyEve commit, `apps/eve/lib/engineering/factory-result-consumer.ts` uses authenticated receipt persistence, historical signature verification, and separate current-key checks before projection. Its Work store remains the lifecycle authority. MissionControl's Result projection must eventually flow through that consumer rather than reconstructing Proof from chat or a Factory PASS.

`apps/eve/lib/external-alpha/shared-accounting.ts` and its SQL procedure govern owner/cohort allowances shared across isolated app databases. That protocol deliberately does not refund full allowances after cancellation or expiry. MissionControl's fixture projection can settle confirmed usage against a synthetic Mission ceiling; it does not alter or refund the owner/cohort allowance. A future integration must explicitly map the parent reservation and delegated sub-allowance without adding spend authority. This checkpoint does not qualify the composed MyEve ledger.

Persistent Agent creation, ephemeral child execution, parent/child budget aggregation and scoped context remain the responsibilities of existing MyEve modules identified in `SOFIE_NATIVE.md`. Multiple agents do not automatically select MissionControl. Existing route and owner-approval boundaries stay intact.

## MySkills

The pinned behavioral candidate's `docs/myskills/integration-proposal.md` explicitly remains inactive. The strict Factory payload still rejects extra Skill fields. Reuse `myskills/resolver.py` and `myskills/qualification.py` after adoption, with exact version/digest/dependency graph, private custody and revocation. Do not install its in-memory reference stores as production persistence. Skills cannot create Work authority or relax tool, repository or budget limits.

## Next adoption boundary

Main-only canonical integration remains in force. Merging one candidate into another integration branch is insufficient. Recover exact main SHAs, inspect receiving authority and accounting contracts, then propose the canonical execution adapter. No deployment, new credentials, paid calls, external-alpha mutation or production grants occur in Checkpoint 1B.
