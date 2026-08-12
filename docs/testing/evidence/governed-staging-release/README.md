# Governed Staging Release Browser Evidence

Date: 2026-08-11  
Branch: `codex/governed-release-verification`  
Route: `http://127.0.0.1:5199/v2/deployments`  
Workspace: Software Factory Demo

## Result

PASS. A headless Chromium session drove the governed code-release surface from
an exact, correlated GitHub merge through staging approval, provider receipt,
independent verification, refresh recovery, and explicit rollback. The browser
reported no page errors. Only Vite connection and React development messages
appeared in the console.

The proof used real demo lineage for WorkOrder
`yh7aygkkxryzj7ft65yq6czec58bq3ys`, Attempt
`ys76ktkq4b0wp33pz1gs0a8bhx8bqx97`, and GitHub PR #58. The release preserved
head SHA `0ab12fcb5e087d4496d42b74076e7f1a8b3380b3` and GitHub merge SHA
`d0b05f80b71f87a1bab0dc2867b5881c285f3fd1` as distinct identities.

## Journey proved

1. `MERGED` rendered with the exact WorkOrder, PR, head SHA, merge SHA, staging
   environment, pending human approval, and immutable merge evidence.
2. The operator configured an allowed local staging origin for browser proof,
   approved the exact merge SHA with a rationale, refreshed, and observed the
   durable approved state.
3. The operator attached provider deployment ID `browser-proof-pr58` and the
   same-origin deployment, provenance, smoke, and health URLs. The release moved
   to `DEPLOYED` without being shown as verified.
4. The server independently fetched all three endpoints. Provenance matched
   the exact merge SHA, deployment ID, and `staging` environment; all evidence
   rows recorded HTTP 200 and SHA-256 content digests. The release and WorkOrder
   moved to `VERIFIED` / `DONE`.
5. A refresh preserved the verified state. The operator then recorded restored
   SHA `0a4ebdbd92e69179efd46811b45ca20042ff3692`, provider rollback receipt,
   evidence URL, and rationale. A final refresh preserved `ROLLED_BACK` and the
   WorkOrder recovery requirement.

Temporary local provenance content, the local-host verification flag, seeded
release/evidence rows, origin metadata, and WorkOrder projection changes were
removed after capture. The existing demo WorkOrder was restored to `DONE` with
passing verification.

## Screenshots

- [01 — merged, awaiting approval](./01-merged-awaiting-approval.png)
- [02 — approval persists after refresh](./02-approved-after-refresh.png)
- [03 — deployed, verification still required](./03-deployed-awaiting-verification.png)
- [04 — verified with provenance, smoke, and health evidence](./04-verified-with-evidence.png)
- [05 — rolled back and persisted after refresh](./05-rolled-back-after-refresh.png)
