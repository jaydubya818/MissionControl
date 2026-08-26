# OpenClaw SDK — retired for V1

The direct OpenClaw SDK is intentionally disabled. It previously called human
Task and Approval functions while supplying an Agent ID; that label did not
authenticate the caller.

V1 execution is owned by `mission-control-orchestration`. Workers claim, renew,
and report bounded Attempts through signed, workspace/repository-scoped,
replay-protected service commands. Use the Mission Control operator UI to
create and approve work. Do not restore the removed direct-write client.
