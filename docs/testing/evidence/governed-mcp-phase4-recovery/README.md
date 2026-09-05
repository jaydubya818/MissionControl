# Phase 4 recovery evidence

Status: canonical real-service qualification complete in the isolated runtime.

The immutable OpenAI Docs NO_GO remains in
`../governed-mcp-phase4-real-service/no-go-record.md`. This directory records
only the replacement-service recovery proof.

Current offline evidence:

- service selection and contract source:
  `../../../software-factory/phase4-real-mcp-service-selection-v2.md`
- selected provider release: `@upstash/context7-mcp@4.0.5`
- release commit: `a37d30cf14f69341e12c226fcc729c62b4f0a900`
- npm integrity: `sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==`
- expected input schema digest:
  `6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942`
- exact Tool Version digest:
  `sha256:59151f37eb70b6f51a0a6d213fd6e330703a6cc2cb470f525ee574f1fe22b490`
- first-live-call preflight: `first-live-call-preflight.md`
- successful one-call transport qualification: `direct-live-qualification.md`
- historical, superseded browser authorization blocker:
  `browser-attempt-authorization.md`
- historical, superseded shared-demo blocker:
  `shared-demo-environment-blocker.md`
- canonical browser Attempt and receipt: `canonical-browser-attempt.md`
- independent verification: `independent-verification.md`
- deterministic browser validation: `browser-validation.json`
- final pre-merge qualification and independent review record:
  `pre-merge-qualification.md`

External-call accounting for this recovery is two Context7 `query-docs`
operations total: one direct transport diagnostic and one canonical
browser-dispatched Attempt call. Both used zero retries. The authorization
allowed at most three external transports, so one transport remained unused;
no further call was necessary to establish the exact canonical receipt.

The earlier direct transport proof remains diagnostic only. The qualifying
proof is the browser-dispatched WorkOrder and Attempt recorded in
`canonical-browser-attempt.md`; its receipts were written by the host broker,
not injected by a script.

Independent release review hardened three boundaries without repeating the
external call: HTTPS now connects to the already-validated public DNS address
under one end-to-end deadline; local recovery creates a new linked Attempt and
preserves the failed Attempt as terminal history; and verified `LOCAL_GIT`
subjects remain non-accepting without a trusted publication projection. The
isolated launcher also refuses to copy source SQLite state while its configured
backend ports or WAL/SHM sidecars are active. Historical browser fields that
predate those corrections are labeled as such in the detailed evidence rather
than rewritten.
