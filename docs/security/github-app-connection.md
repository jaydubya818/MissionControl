# GitHub App Connection and Webhook Contract

## Scope

GitHub is the only V1 Git provider. Mission Control uses a GitHub App
installation as repository identity; personal access tokens are not a
production credential path.

This contract covers connection setup, minimum authority, token handling,
signed webhook ingress, replay behavior, and operator-visible readiness. It
does not authorize Factory activation, WorkOrder dispatch, or merge.

## Required repository permissions

| Permission | Access | V1 reason |
| --- | --- | --- |
| Metadata | Read | Identify the exact repository installation |
| Contents | Write | Create the bounded execution branch and commit result |
| Pull requests | Write | Open and update the review-ready PR |
| Checks | Read | Read current CI/check-run evidence |

Any missing grant blocks readiness. Any stronger or unrelated grant also
blocks readiness until the GitHub App returns to this least-privilege envelope.
GitHub recommends selecting only the permissions required by the APIs the App
uses: [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

## Required webhook events

- Select these events in the GitHub App configuration:

- `pull_request`
- `pull_request_review`
- `check_run`

GitHub also delivers these lifecycle events to every GitHub App by default;
they cannot be selected or removed in the App configuration:

- `installation`
- `installation_repositories`

Mission Control handles all five events, but readiness only expects the three
selectable events in GitHub's installation API response. See GitHub's
[webhook event documentation](https://docs.github.com/en/webhooks/webhook-events-and-payloads#installation),
which defines both installation lifecycle events as automatic.

The webhook endpoint is `POST /github/webhook`. Configure the App with a strong
webhook secret and `application/json` payloads. Mission Control validates
`X-Hub-Signature-256` against the untouched request body before JSON parsing.
GitHub describes `X-GitHub-Delivery` as a globally unique delivery GUID; that
GUID is the idempotency key for the inbound ledger: [Webhook delivery
headers](https://docs.github.com/en/webhooks/webhook-events-and-payloads#delivery-headers).

## Setup and credential configuration

Configure these Convex environment variables. The orchestration server also
requires `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` when real Factory execution
is enabled. Those values must identify the same App recorded in the repository
installation binding so the worker can mint the just-in-time repository token
at the provider boundary.

| Variable | Purpose |
| --- | --- |
| `GITHUB_APP_ID` | Numeric GitHub App identity used as the JWT issuer |
| `GITHUB_APP_SLUG` | Public App slug used to construct the installation URL |
| `GITHUB_APP_CLIENT_ID` | OAuth client identity for validating the installing GitHub user |
| `GITHUB_APP_CLIENT_SECRET` | OAuth exchange secret; server-only |
| `GITHUB_APP_PRIVATE_KEY` | GitHub RSA private key in PKCS#1 or PKCS#8 PEM form; literal newlines or escaped `\n` supported |
| `GITHUB_APP_PRIVATE_KEY_FILE` | Optional orchestration-host-only path to an owner-readable PEM file; used when the inline key is unset |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret used only by the signed ingress boundary |
| `MISSION_CONTROL_APP_URL` | Optional post-setup redirect back to Mission Control |

The GitHub App must request user authorization during installation and return
to `GET /github/app/setup`. The setup flow uses a 15-minute, one-use state
record tied to the authenticated Mission Control operator and repository.
GitHub explicitly warns that the setup URL's `installation_id` can be spoofed,
so Mission Control exchanges the OAuth code and verifies that the installing
GitHub user can access the selected repository through that installation:
[About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url).

## Token handling

Mission Control mints an installation access token only after GitHub user and
App identity validation. During Factory execution, it mints a fresh token only
App identity validation. During governed execution, publication happens only
after the durable Attempt owns a valid lease, the complete Git change set fits
the approved repository scopes, and every approved verification command
passes. The token is restricted to the selected repository, retained only in
worker memory for the push and idempotent PR lookup/create calls, and then
discarded. It never appears in a remote URL, command argument, record, artifact,
or log. Only Git and pull-request identities are retained. GitHub installation
tokens expire after one hour:
[Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

Never store or return:

- installation access tokens;
- OAuth user access tokens;
- the App private key;
- OAuth client secrets; or
- webhook secrets.

## Delivery ledger and recovery

For every request with a GitHub delivery GUID, Mission Control retains:

- delivery GUID, event, and action;
- repository and provider repository ID when verified;
- installation ID;
- signature result;
- first receive time, last attempt time, and attempt count;
- processed, ignored, or failed result; and
- original or duplicate replay state.

Payload bodies are not retained in this ledger. Duplicate GUIDs update replay
metadata and return success without repeating PR/CI ingestion or meta-loop
effects. Installation deletion, suspension, or repository removal immediately
degrades the repository connection and requires repair. Other material
installation changes invalidate verification and require revalidation.

## Readiness semantics

Repository setup shows four explicit checks: installation identity,
least-privilege permissions, webhook subscriptions, and verification
freshness. The aggregate state is:

- `VERIFIED`: connected, exact least privilege, all required events, checked
  within 24 hours;
- `STALE`: configuration is otherwise valid but verification is older than 24
  hours;
- `MISSING`: no installation is bound; or
- `BLOCKED`: revoked/degraded installation, missing permission/event, or
  excessive authority.

Factory activation, dispatch, and attempt claim consume this evidence and fail
closed when it is missing, stale, or mismatched.
The production durable worker is enabled only with all of the following
server-side settings: `CODEX_FACTORY_WORKER_ENABLED=true`,
`CODEX_WORKER_PROJECT_ID`, `CODEX_WORKER_REPOSITORY_ID`,
`MISSION_CONTROL_SERVICE_ID`, `MISSION_CONTROL_SERVICE_COMMAND_SECRET`,
`GITHUB_APP_ID`, and either `GITHUB_APP_PRIVATE_KEY` or the owner-controlled
`GITHUB_APP_PRIVATE_KEY_FILE`. The immutable execution manifest and verified
host binding supply the governed checkout/worktree path; operators do not
provide a second repository-root setting. One worker is pinned to one governed
repository in V1; additional repository schedulers wait until the single golden
path is proven durable.
