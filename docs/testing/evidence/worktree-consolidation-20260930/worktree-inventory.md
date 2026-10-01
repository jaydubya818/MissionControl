# Worktree consolidation inventory

Base: `3105f1ffd4a7a6a8c2a6be318b769e1950587e2a`. Initial registrations: 83.

Eight redundant worktrees were fully archived and removed; 16 missing-directory registrations were pruned. Remaining checkouts: 59.

Recovery files live privately at `/Users/jaywest/.local/share/mission-control-backups/consolidation-20260930/`. `history.bundle` was verified and retains all recorded worktree heads through archive refs. Dirty worktrees have binary patches and untracked-file archives where readable. Retired worktrees have complete archives, including ignored local configuration; do not publish those archives.

No open PRs were returned by the GitHub inventory. A closed PR is not acceptance. Divergent branches and uncommitted product changes remain held for review. Ten Documents worktrees timed out during status inspection. No runtime release checkout or parent of a nested worktree was removed.

The Codex task list exposed no pinned tasks, but only the 50 most recent non-pinned tasks. Candidate retirement additionally checked live process working directories, current clean status, exact head, and merged ancestry or exact merged PR head.

| Worktree | Revision | Disposition |
| --- | --- | --- |
| `/Users/jaywest/MissionControl` | `1b5884b94bfd` | retain primary; 40 tracked files changed plus untracked work |
| `/private/tmp/mc-fde-status` | `94217f6cdf7f` | stale registration pruned |
| `/private/tmp/mc-final-13ce5f0` | `13ce5f0ef961` | stale registration pruned |
| `/private/tmp/mc-incident-v51-postmerge.f22Vhd/repo` | `cb9a041707aa` | stale registration pruned |
| `/private/tmp/mc-main-compare-9dd7bb8` | `9dd7bb8f790e` | stale registration pruned |
| `/private/tmp/mc-todo063-exact-main.beaf1f8` | `3f7fc714cfcc` | stale registration pruned |
| `/private/tmp/mc-todo063-final-main.466342b` | `466342b5be97` | stale registration pruned |
| `/private/tmp/mc-v51-final-main-57d6ac9` | `57d6ac90c7ff` | stale registration pruned |
| `/private/tmp/mission-control-phase-2-final` | `ffd58077989a` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/39d1/MissionControl/.worktrees/codex/phase1-model-runtime-identity` | `9a80cf3c5cc2` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/39d1/MissionControl/.worktrees/codex/phase1-model-runtime-identity/.worktrees/codex/postmerge-phase1-qualification` | `68770edcb15f` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/39d1/MissionControl/.worktrees/codex/phase3-governed-readonly-mcp` | `2034a869d392` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f4c3/MissionControl/.worktrees/codex/fdlc-bedrock-current-main-20260906` | `6295acea5ae1` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f4c3/MissionControl/.worktrees/codex/fdlc-bedrock-current-tip-20260906` | `038498df424c` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f4c3/MissionControl/.worktrees/codex/fdlc-bedrock-postmerge-20260906` | `9e6dfd9b0110` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f4c3/MissionControl/.worktrees/codex/fdlc-current-main-reconciliation-20260905` | `683b9f04f1a2` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f4c3/MissionControl/.worktrees/codex/todo063-aws-support-case-20260907` | `f73fdf173713` | stale registration pruned |
| `/Users/jaywest/.codex/worktrees/f854/MissionControl` | `d141b50a7ed6` | active consolidation checkout |
| `/Users/jaywest/.local/share/mission-control-runtime/releases/f01fed47ded95e9456803845211bac49ef54a1f1` | `f01fed47ded9` | retain runtime release |
| `/Users/jaywest/Documents/ChatGPT/Factory_Deployed_Engineer/mission-control-main-worktree` | `396967d3d870` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/Factory_Deployed_Engineer/mission-control-worktree` | `0f8267e1ba21` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/accounting-recovery` | `72bd2392f8f1` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/accounting-recovery-postmerge` | `a0214b72e9a3` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/capability-production` | `f01fed47ded9` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/mc-context-skills-final` | `da1def5ad694` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/mc-context-skills-recovered` | `e0a913b477df` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/mc-fab-phase3` | `1d29965deedc` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/todo063-bedrock-gate` | `fb933ae03f9a` | hold-unreadable |
| `/Users/jaywest/Documents/ChatGPT/FDLC/.worktrees/todo063-liability-bound` | `a7b0bd11f033` | hold-unreadable |
| `/Users/jaywest/MissionControl/.mission-control/worktrees/rvy4n58cj4c4` | `601b07ece6f1` | review-divergent |
| `/Users/jaywest/MissionControl/.mission-control/worktrees/verify-gjx3dj45` | `b0e1b55bfae8` | review-divergent |
| `/Users/jaywest/MissionControl/.mission-control/worktrees/verify-hefj89b6` | `08e62ba49179` | review-divergent |
| `/Users/jaywest/MissionControl/.mission-control/worktrees/verify-ncst3yrr` | `f52ff6c8c494` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/avf-execution-intent-shadow-v1` | `dc51cd873a2e` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/codex/factory-worker-guardrails` | `63d31ca3dcd8` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/FactoryMemoryGraphRag` | `03c87a39a9b9` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/governed-release-verification` | `dc51cd873a2e` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/codex/governed-release-verification/.worktrees/codex/remote-sandbox-hardening-v1` | `6db1389c2e5d` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/codex/guarded-auto-bounded-experiment-v1` | `95b6b2d18fb9` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path` | `d0e5ff2ff57d` | merged-candidate |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/3qcfqn8cgvmf` | `7ef3827fc438` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/eqce7s8cgm2d` | `3f60e1c10194` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/et3zcx8cg3d0` | `5cdf9ce94434` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/g153cx8cg279` | `8f85a75a167a` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/v3m0218ch3zt` | `54ea2ee85296` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/verify-11kikd33` | `1a617e5e50fb` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/verify-i5muicry` | `7ef3827fc438` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/verify-yn19xsec` | `3f60e1c10194` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/local-mission-pr-golden-path/.mission-control/worktrees/verify-yxyva70h` | `54ea2ee85296` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/model-routing-authorization-reconcile` | `e91763af3347` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/observability-evals-v1` | `071c6f8adb21` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/opensandbox-provider-spike` | `d0e5ff2ff57d` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/opensandbox-provider-v2` | `e32444a2aecb` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/pr89-multitenant-qualification` | `064ac62f2b7b` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/production-routing-evidence-bootstrap-v1` | `048dcb04ec8f` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/codex/remote-sandbox-final-blocker-qualification-v1-20260819` | `11a51cac1e44` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/remote-sandbox-hardening-blockers-v1-20260819` | `11a51cac1e44` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/codex/task-drawer-contrast-pr4` | `1bd0fbc01918` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/feat/remote-sandbox-factory-n1` | `78d7e417d1a3` | review-divergent |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e` | `05adbb5e625d` | merged-candidate |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix` | `a327af0bc8c7` | merged-candidate |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/canonical-task-queue` | `4a6c163a592c` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/demo-stack-runtime-alignment` | `50a44ad838b3` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/high-risk-return-contracts-pr8` | `50a44ad838b3` | hold-dirty |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/runtime-contract-ci-guard-pr7` | `3625ee2073e6` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/runtime-contract-gate-pr6` | `73293c99e0f0` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/runtime-correctness-pr5` | `995b15491079` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/pi-governed-context-bridge-e2e/.worktrees/codex/production-receipt-test-fix/.worktrees/codex/workflow-state-cleanup-pr3` | `43d491b0faa9` | archived and removed |
| `/Users/jaywest/MissionControl/.worktrees/pr-36-merge` | `c2545b1bec2a` | review-divergent |
| `/Users/jaywest/worktrees/arm-prd-roadmap` | `dbcb2a4a42cc` | review-divergent |
| `/Users/jaywest/worktrees/land-cbom` | `63cdba0a8f85` | review-divergent |
| `/Users/jaywest/worktrees/land-eval` | `824e0d6ef542` | review-divergent |
| `/Users/jaywest/worktrees/land-executor` | `1dae4d0ad588` | review-divergent |
| `/Users/jaywest/worktrees/sf-02a-workorders` | `d06aad9fa7ae` | review-divergent |
| `/Users/jaywest/worktrees/sf-06-cbom` | `eb4df2581cfe` | review-divergent |
| `/Users/jaywest/worktrees/sf-07-eval` | `8717aaafb5c4` | review-divergent |
| `/Users/jaywest/worktrees/sf-18-registry` | `31415950e6c0` | review-divergent |
| `/Users/jaywest/worktrees/sf-19-ui-migration` | `ea032bfb3ef5` | hold-dirty |
| `/Users/jaywest/worktrees/sf-21a-executor` | `4ffab485f07b` | review-divergent |
| `/Users/jaywest/worktrees/sf-90-demo` | `cf4cbfd432f3` | hold-dirty |
| `/Users/jaywest/worktrees/sf-95-blueprint` | `6a79c8e9921d` | review-divergent |
| `/Users/jaywest/worktrees/sf-96-demo-stable` | `f79825fc028c` | hold-dirty |
| `/Users/jaywest/worktrees/sf-96-eos-demo` | `c1d75a0a8248` | hold-dirty |

The remote-sandbox-hardening-v1 leaf was patch-equivalent to main (both commits matched), allowing its retirement and then its clean merged parent. Documents status checks also timed out when retried outside the sandbox; those directories remain intact.
