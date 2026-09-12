# FDLC Docker execution closure implementation

Status: bounded implementation and qualification attempt complete; admission blocked. See fdlc-phase1-docker-execution-path-qualification-report.md. Source request: operator attachment 1c324565-1894-4157-9a06-ebd87479a7e2. WO1 must remain undispatched.

1. Extend the existing SandboxProvider and RemoteSandboxRuntime lifecycle with an internal Docker provider. Use an immutable image, no host mounts, no credentials, no network, non-root and bounded tmpfs. Keep production inference fail-closed pending broker qualification.
2. Use the existing Factory worker lease, manifest and result reporting. Bind Docker invocation to the frozen manifest, allocation/lease and profile; reject unsupported authority. Exercise a disposable qualification repository only.
3. Implement a durable atomic reservation ledger and deterministic broker fixtures. Use integer monetary units, exact scoped price identity and pre-request worst-case bounds. Retain unknown holds. Do not treat fixtures as provider certification.
4. Collect actual Docker containment/runtime/lifecycle evidence and worker tests; run all required repository gates. Record failures without weakening gates.
5. Review security and data integrity, preserve all prior reports, and issue a new qualification report. No dependent admission unless both hard gates qualify. No commits, remote publication or model calls.

Production inference remains blocked if no exact current provider price and enforceable billing bound are available. The old Darwin artifact is not a Linux artifact. No pilot identities or gates change.
