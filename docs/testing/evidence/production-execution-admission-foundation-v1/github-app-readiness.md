# GitHub App production readiness

Observed state on 2026-08-21:

- `githubAppInstallations`: 0 records;
- Convex production environment names: only
  `VERCEL_AUTOMATION_BYPASS_SECRET`;
- no `GITHUB_APP_*` or `GITHUB_WEBHOOK_SECRET` setting exists;
- no installation ID or repository authorization was fabricated;
- PAT publication remains prohibited.

The existing canonical integration is sufficient. It requires the same App
identity at the Convex control plane and orchestration worker, repository-scoped
installation access, a just-in-time installation token, exact least privilege,
signed webhook ingress, and a fresh verified installation record.

## Exact operator action after this branch is deployed

1. Register or update the existing Mission Control GitHub App with:
   - setup URL:
     `https://gallant-cassowary-27.convex.site/github/app/setup`;
   - webhook URL:
     `https://gallant-cassowary-27.convex.site/github/webhook`;
   - request user authorization during installation;
   - repository permissions: Metadata read, Contents write, Pull requests
     write, Checks read, with no unrelated or stronger grant;
   - subscribed events: `pull_request`, `pull_request_review`, `check_run`.
     GitHub supplies `installation` and `installation_repositories`
     automatically.
2. Set the production Convex server values `GITHUB_APP_ID`,
   `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
   `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Set
   `MISSION_CONTROL_APP_URL` to the operator-approved production UI origin.
   Do not record secret values in evidence or command history.
3. Install and authorize that exact App for the operator-controlled canary
   repository, complete the canonical setup callback as an authenticated
   Mission Control operator, and verify the stored installation/repository
   identity and 24-hour freshness.
4. Configure the worker with the same `GITHUB_APP_ID` and private key (inline
   or owner-readable file), plus the canonical service identity settings.
5. Only after readiness is `VERIFIED`, use the existing publication boundary
   against the disposable controlled repository. Do not use a PAT and do not
   merge the canary PR.

This is an external operator action because GitHub installation consent and
private-key provisioning cannot be created truthfully by repository code.
