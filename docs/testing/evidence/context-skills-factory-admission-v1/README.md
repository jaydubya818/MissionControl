# Context & Skills canonical Factory admission

Status: **SYNTHETIC_FACTORY_ADMISSION_QUALIFIED**

This bundle records the bounded, deterministic, no-provider qualification of Mission Control's local Context & Skills Factory path. It proves canonical authoring, Factory Version readiness and activation, WorkOrder admission, Task binding, a producer Attempt, an unpublished Git candidate, a distinct verifier Attempt, server-derived verification, operator browser visibility, and cleanup. It grants no publication, acceptance, production, or provider authority.

## Exact successful execution

- Frozen scenario: `context-skills-synthetic-factory/v1`; successful run: `v16`.
- Mission: `jh7v3gcyc39mn1b8nk7k2r21eh8dwk33`; Plan: `j17q76x5aw61zyvx5mc16rdgts8dxyam`.
- WorkOrder: `wd7r5t4149d88dvde8tjh0jajd8dw7bg`; Task: `ss7kehfkxhmxn8msbjfaj0km858dwzny`.
- Producer Factory Version: `t970ra13k3hap1xhd12xv3kw4n8dwerg`; Execution Profile: `tn7am6pjc8pqg5gcwy7qqbg01x8dxfk4`.
- Producer Attempt: `ws7q4dahj7fevwq08dwrqatvmx8dwz9v`; candidate: `ac5066350bc3bc81d112f634550ba7215dc50e9d`.
- Verification Subject: `sha256:a1d5880d5e8e01ffc545116eaeae6da8d3174b0f12b5e46baceb9aa3281307d0`.
- Verifier Factory Version: `t979t16dcf7y5d8rm3sgck6w018dwqp2`; Execution Profile: `tn70xse3x5ecajvfch2tfktwmd8dxtax`.
- Verifier Attempt: `ws7kvwdx1gz5mx0y46r8ccd6a18dw0mz`; Verification Run: `vd7xy458ay4xvchp9z268s3sa58dweat`.
- Verification Plan: `sha256:7d95f06c1962a829083a7defdaf4a1b3be9d6303d1961167f8c5e1968d85d9c0`; verdict: `VERIFIED`.

## Runtime contract

- Worker: `local-synthetic-qualification-worker`; recorded session: `5389c646-d15d-492a-8200-a09405f05579`; generation: `5`.
- Backend: `isolated-container`; model route: `DENIED`; transmission: `NONE`.
- Runtime image: `sha256:4c0e7e776c25f393ba9eb2e29319dbc38dc4c1d0f8a91e307aeb1a31849269db`.
- Runtime artifact: `sha256:950a19c8e2419323c4437954f6e812f8421a4d9fc42838ad099b0e0f24b3d666`.
- Harness capability manifest: `sha256:96bc4ecba48e24522b8c0002153a98f2d126fcf077861cc33f9470baf6fa6fcb`.
- Local repository admission: `sha256:423a92010c15be1bfbbb4c2eb4aa46ef4f26879102754bbf10a2ca46e88b276d`.

The WorkOrder receipt and all four evidence envelopes share the exact WorkOrder revision, producer Attempt, verifier Attempt, Verification Run, Subject digest, and Plan digest. All passed within their validity window. This is current qualification evidence. Canonical production acceptance currentness remains false by design because the envelopes are `SYNTHETIC`, `CONTROL_FIXTURE`, `authority: NONE`, and `behavioralPass: false`. That expected production fence also prevents the producer or the synthetic verifier from accepting or publishing the WorkOrder.

## Controls and limits

- Exact-match, candidate mutation, stale request, and cancellation controls passed.
- Earlier v8–v12 failures and the later v14/v15 failed trials remain in [attempt-history.json](attempt-history.json). The v12 verifier completed but returned `BLOCKED`; its result was retained and was not relabeled. The v14 persisted WorkOrder has no Attempt, and v15 records the producer lease-expiry failure.
- Temporary `factory.automation.manage` permission is absent, the automation role list is empty, and the post-removal action was denied.
- External model calls: `0`; provider calls: `0`; measured cost: `$0`.
- Publications: `0`; Production changes: `0`.
- The exact candidate remains unpublished and awaits explicit acceptance. No synthetic record can satisfy the production currentness filter.

## Browser proof

The proof server queried the persisted backend on each page request. Desktop and mobile renders passed, a reload produced a later backend-read timestamp while all durable identities remained unchanged, axe reported zero violations or incomplete checks, and the browser reported no page or console errors. See [browser/result.json](browser/result.json), [desktop.png](browser/desktop.png), and [mobile.png](browser/mobile.png).

The normalized evidence is [proof.json](proof.json), with the exact pre-dispatch worker heartbeat in [runtime-evidence-v16.json](runtime-evidence-v16.json). Its digest is `sha256:2cda42ad75f38d9e7308bc6fbbf6458c88babfa4c44604a476b7855c3df44bdd`.
