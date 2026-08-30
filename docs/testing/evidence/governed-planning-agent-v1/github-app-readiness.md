# GitHub App readiness

Date: 2026-08-27
Repository: `jaydubya818/MissionControl`
Repository record: `sx7swdarky96tbckcfw3bz6zfx8d9dcp`

## Verified identity

- Readiness: `VERIFIED`
- App ID: `4543062`
- App slug: `mission-control-factory-jaywest`
- Installation ID: `152563527`
- Installation account: `jaydubya818`
- Repository selection: `SELECTED`
- Installation status: `CONNECTED`
- Last verified: `2026-08-27T15:47:00.794Z`

The durable repository-readiness query returned four `VERIFIED` checks: installation identity, least-privilege permissions, required webhook subscriptions, and verification freshness. The repository is associated with the same canonical App installation used by the Convex control plane and orchestration path.

## Verified authority envelope

Permissions:

- Metadata: read
- Contents: write
- Pull requests: write
- Checks: read

Subscribed configurable events:

- `check_run`
- `pull_request`
- `pull_request_review`

Installation lifecycle events remain automatic GitHub App events.

## Configuration presence

The environment contains the required App configuration names without exposing values:

- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- the signed service-command secret used by the orchestration worker

No PAT, `gh` OAuth authority, fake installation state, or readiness override was used to satisfy this gate.

## Factory consequence

After the App installation was verified and bound, Factory readiness assessment `t970981g39zy310035c1s74e658d9zke` passed all 16 checks for Factory version `sh7fwgwkpkbwqawvarekb7r5eh8d8vh7` and configuration digest `factory-v1-d2b4fdf9`.
