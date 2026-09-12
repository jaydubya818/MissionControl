# Governed MCP recertification policy

Status: active

## Purpose

Qualification applies only to the exact admitted service, operation, schema,
implementation, authority, broker, and security-policy tuple. It does not
expire merely with time, but it stops being current when a material input
changes or currentness can no longer be proved.

## Offline regression and live recertification

`pnpm run test:mcp:phase4` is mandatory deterministic regression coverage. It
uses fixtures and must not perform an external call. It protects the broker,
authority, receipt, lifecycle, currentness, and hostile-output boundaries on
normal CI runs.

Live service recertification is a separate operator-authorized activity. It
must use a disposable isolated environment, synthetic non-customer data, an
explicit maximum call/retry budget, the canonical Attempt path, durable
redacted receipts, independent verification, and documented cleanup. A live
call made outside that procedure is diagnostic only and cannot renew
qualification.

## Recertification triggers

Requalification is required before the capability is used again when any of
these inputs changes or becomes unverifiable:

- provider package, published contract, server, or API version;
- expected or observed input/output schema or schema digest;
- endpoint, protocol, DNS/egress destination, redirect policy, or credential model;
- Tool Version identity, digest, implementation bytes, or supply-chain source;
- Tool Grant scope, authority semantics, workspace binding, or revocation model;
- Execution Profile binding or the canonical Attempt lifecycle;
- broker transport, validation, receipt, timeout, cancellation, retry, or replay behavior;
- relevant authorization, data-handling, security, or network policy;
- a security advisory, incident, provider deprecation, or unexplained observed drift;
- loss of the evidence needed to reproduce the admitted tuple.

The old Tool Version and evidence remain immutable history. Material drift
requires a new Tool Version/digest where applicable, a separately reviewed
grant, fresh negative controls, and a new evidence package. Discovery output
cannot update either the expected schema or authority.

## Fail-closed rules

- Compare `EXPECTED_QUALIFIED_SCHEMA` with `OBSERVED_LIVE_SCHEMA`; mismatch or
  missing currentness blocks invocation.
- A stale Tool Version, revoked or mismatched grant, wrong workspace,
  destination drift, implementation substitution, stale lease, replay, or
  missing durable receipt fails closed.
- Unknown cost remains `UNKNOWN`; unknown facts are never treated as zero or as
  successful coverage.
- Recertification of a read operation cannot authorize any write operation.

## Qualification output

Each recertification records the complete admitted identity, expected and
observed contract facts, call and retry counts, receipts, verifier result,
negative-control results, reviews, exact code revision/runtime contract,
environment classification, cleanup, and the narrow capability claim. Broader
claims require separate evidence.
