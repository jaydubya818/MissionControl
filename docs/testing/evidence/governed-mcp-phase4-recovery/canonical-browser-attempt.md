# Canonical browser Attempt and real-service receipt

Date: 2026-09-05

## Disposition

`PASS`

The operator dispatched a synthetic WorkOrder from the Mission Control browser
against the isolated Phase 4 backend. The canonical Factory worker claimed the
Attempt, loaded the exact Execution Profile and Tool Grant, and the host broker
called Context7. No shared Convex development state or customer data was used.

## Canonical lineage

- Workspace/project: `sn7b1vs0eda93we4qe76rpcmm18dtnjn`
- Mission: `gs7nhgw097vcasjqw7dcm2hwgd8dvb1s`
- Plan: `gn7nwft7pxak8728449cr071dd8dvn5z`
- WorkOrder: `yh7201gkt7cqwgqv085n95nxbs8dt7s2`
- Task: `wh762h5d558c11b0n7s7sbsc4n8dvshm`
- source Attempt/workflow run: `ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg`
- operator run ID: `ci4zgph7`
- Execution Profile: `w17g54jf86s77hn370407emp5d8dvk0e`
- Execution Profile digest: `sha256:a49832c6a97ced874ecc48a7b6d364976b164b57b3b4655cac205200b8d45f1b`
- Tool Grant: `w97vvpwmnc3a2wfwj2x3nzb3fs8dvave`
- Tool Grant digest: `sha256:2bdbc466379b81bf1189c4703121c8418ecaa99b9da51c6972e174c486ae3cab`
- Tool Version: `wd7r7htk8w5fj5bka3peexgv2s8dv60j`
- Tool Version digest: `sha256:59151f37eb70b6f51a0a6d213fd6e330703a6cc2cb470f525ee574f1fe22b490`
- service/operation: Context7 `4.0.5` / `query-docs`
- destination: `mcp.context7.com:443`
- data classification: `PUBLIC`
- credential class: `NONE`
- call ID: `mcp:ys7cw2kv8qv0prn2vz0m5etpvn8dvqmg:query-docs:1`

## Durable broker receipts

Authorization receipt `w57gyhz7y6fq52cm1tk1ez8egx8dv5hg` is `ALLOWED`
with reason `EXACT_AUTHORITY_MATCH`. Completion receipt
`w57h70zrn7a0pfqpw970da0n6x8dvmd2` is `SUCCEEDED` with reason
`BOUNDED_READ_COMPLETED`.

The completion took 905 ms, used zero retries, transmitted an 86-byte request,
and retained a 138-byte normalized output. Cost is explicitly `UNKNOWN`.
Expected and observed server versions are both `4.0.5`; expected and observed
input-schema digests are both
`6b6c59ee65e0d7fcbf0aaf4eb42f419e6b13927808ec75af09e62e55921b8942`.
The sanitized output digest is
`62f801a8916430200cd7b3136c4d7e2ce812f1a266e747335f630cb7461e81b6`.
Neither receipt is late or stale, and poisoning detection was false.

## Candidate recovery without replay

The model produced candidate commit
`9111c11f00b85690a4bcf160e0fd32a6800208db`, but publication then failed
because the isolated worker intentionally had no GitHub App credential. The
operator recovered the exact failed policy-v2 Attempt using its durable prior
workspace ownership. The recovery worker attested the existing commit and
allowed-path diff and emitted a `LOCAL_GIT` VerificationSubject. It did not
rerun the model, MCP broker, or publication step.

This browser record predates the independent review hardening and therefore
shows the superseded in-place recovery behavior. The release implementation
does not reopen or clear this terminal failure: it requires the exact GitHub
credential failure plus a durable commit/tree/source-bound code-diff artifact,
then creates a new linked recovery Attempt. This historical UI record proves
the no-replay qualification path; it is not acceptance evidence.

The only candidate file is
`docs/testing/evidence/governed-mcp-phase4-live-attempt/react-use-effect-cleanup.md`.
The subject digest is
`sha256:fa65de1665d100612a4a6464e95b7c768229484f95041135c4327c8d0704edfb`.

## Browser evidence

The desktop browser showed the WorkOrder as `AWAITING VERIFICATION` with
`Verification: PASS`, both source and verification Attempts as `COMPLETED`, and
the source Attempt timeline with `TOOL_CALLED` authorization and completion,
the 905 ms duration, the failed publication, the no-replay recovery, the exact
candidate commit, and the two broker-created receipt artifacts. Refresh
preserved the same durable state.

At a 390 × 844 viewport, the header, KPI strip, filters, and qualification
WorkOrder remained readable without horizontal overflow. Keyboard `Tab` then
`Enter` opened the mobile navigation and `Escape` closed it. The accessibility
snapshot exposed named navigation, banner, main, heading, filter comboboxes,
WorkOrder action, expanded-state semantics, and the live-region notification
container. The failed publication and explicit candidate-attestation recovery
in the desktop Attempt timeline provide the required failure and remediation
state without another external call.

Independent review also made every `LOCAL_GIT` subject non-accepting until a
trusted current publication projection exists. The separate verification below
still proves the exact candidate, but cannot authorize WorkOrder acceptance.
