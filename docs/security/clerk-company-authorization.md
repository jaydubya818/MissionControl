# Clerk company authorization

Mission Control uses Clerk to authenticate a human and its own Convex records
to authorize that human. Clerk Organizations are intentionally not used:
`tenants`, `operators`, `roles`, and `roleAssignments` remain the single source
of truth for company access.

## Identity contract

- `operators.authId` stores the exact Clerk user ID (`user_...`).
- Email is contact/display data and never establishes membership.
- Every protected server operation resolves the validated Convex identity and
  re-checks the selected company or workspace.
- Agent and scheduler authority is separate from human sessions. Do not create
  a fake Clerk user for an automation.
- The Clerk publishable key may be shipped to the browser. Never commit Clerk
  secret keys, JWTs, session cookies, or deployment credentials.

## Configure a Clerk deployment

1. In Clerk, create or select the Mission Control application and activate the
   Convex integration/JWT template described by Clerk's Convex guide.
2. Configure `convex/auth.config.ts` with the Clerk application's exact issuer
   domain:

   ```ts
   const clerkIssuerDomain = "https://your-clerk-issuer.clerk.accounts.dev";
   ```

3. Build the UI with the Clerk publishable key and explicit Clerk mode:

   ```bash
   VITE_AUTH_MODE=clerk \
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key \
   pnpm --filter mission-control-ui build
   ```

4. Set `MC_BACKEND_DEPLOYMENT_CLASS=shared` on preview/staging and
   `MC_BACKEND_DEPLOYMENT_CLASS=production` on production. Keep
   `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT` unset on both. Anonymous demo access is
   rejected unless the backend class is explicitly `local`.

The issuer must match the Clerk application that minted the browser token. A
publishable key alone does not authorize access; Convex validates the token and
Mission Control then resolves the exact `operators.authId` membership.

The current issuer is a Clerk development instance used for internal release
qualification. It is not the public-production identity boundary. Before a
public launch, create the production Clerk instance and custom domain, rotate
the browser to its `pk_live_...` publishable key, update the issuer, and repeat
the complete governed staging and production verification path.

## Bootstrap the first owner

Company membership is normally created by an existing company owner. For the
first authenticated owner only, configure these temporary Convex variables:

```bash
pnpm exec convex env set MC_BOOTSTRAP_OWNER_SUBJECT user_exact_clerk_user_id
pnpm exec convex env set MC_BOOTSTRAP_TENANT_SLUG exact-company-slug
```

Sign in as that exact Clerk identity and use the one-time bootstrap action. It
is eligible only while the configured active company has no active
Clerk-linked operator. After success, remove both variables:

```bash
pnpm exec convex env remove MC_BOOTSTRAP_OWNER_SUBJECT
pnpm exec convex env remove MC_BOOTSTRAP_TENANT_SLUG
```

The owner can then open **Settings → Workspaces & Repositories → Company
access**, initialize standard roles, and provision each member with their exact
Clerk user ID. Provisioning by email alone is deliberately unsupported.

## Rollout

1. Deploy the code with auth mode omitted/`legacy`; verify no current flow
   changes.
2. Configure the Clerk issuer and publishable key in a non-production target.
3. Bootstrap one owner and provision two test users in different companies.
4. Verify each identity sees only its companies, workspaces, members, and
   management controls.
5. Verify a Developer receives server denial for member, company, role, and
   workspace administration.
6. Verify the last active Company Owner cannot lose the owner role or be
   deactivated.
7. Set `VITE_AUTH_MODE=clerk` in production and monitor authentication,
   unauthorized-access, and no-membership errors.
8. Remove the temporary bootstrap variables immediately after the first owner
   succeeds, then prove that a second bootstrap attempt is denied.

Rollback the UI build to `legacy` mode if Clerk session establishment fails.
Do not enable anonymous company context as a rollback mechanism.

## Failure states

| State | Expected result |
| --- | --- |
| Clerk mode without UI publishable key | Configuration error; application does not render |
| Signed out | Sign-in gate only |
| Token loading or refreshing | Stable authentication loading state |
| Valid Clerk user without membership | No company data; exact user ID shown for provisioning |
| Inactive member or company | No company data |
| Unauthorized write | Convex rejects it even if called outside the UI |

## Official references

- [Clerk: Integrate Convex with Clerk](https://clerk.com/docs/guides/development/integrations/databases/convex)
- [Convex: Convex & Clerk](https://docs.convex.dev/auth/clerk)
- [Clerk React quickstart](https://clerk.com/docs/react/getting-started/quickstart)
