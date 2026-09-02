# Exact model route qualification

- Date: 2026-08-27
- Repository: `jaydubya818/MissionControl`
- Checkout: `/Users/jaywest/.codex/worktrees/a037/MissionControl`
- Repository HEAD: `8816332fe721a11b86a00e8553f023252ca6c7dd`
- Harness: `codex-cli` 0.146.0 / adapter `codex` v1
- Harness manifest digest: `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06`
- Effective configuration SHA-256: `94daa9e3e1ee5ce2e3d8ca9116ec29c1a1eb8d78e232d1abb383cbdf2e7d6081`
- Executable SHA-256: `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`
- Model: `openai/gpt-5.6-sol`
- Sandbox: `read-only`
- Output contract: [model-route-smoke.schema.json](./model-route-smoke.schema.json)

The live Codex CLI invocation inspected `package.json` and `git rev-parse HEAD`, then returned this final schema-valid response:

```json
{"status":"PASS","packageName":"mission-control","headCommit":"8816332fe721a11b86a00e8553f023252ca6c7dd"}
```

The CLI exited `0`. The repository porcelain status was captured before and after the run and was unchanged. The invocation used `--ephemeral`, `--ignore-user-config`, `--sandbox read-only`, and the request-bound JSON Schema. The CLI logged a local model-cache compatibility warning and rollout-state fallback warnings; neither changed the successful structured result. This evidence admits this exact tuple only for a bounded production pilot. It does not certify general provider routing, remote sandboxing, publication, acceptance, or merge authority.
