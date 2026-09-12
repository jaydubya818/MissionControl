# Source integration and Production release

Decision: approved 2026-09-05; keep the main-branch deployment guard after integration.

Merging to `main` no longer automatically deploys Production for these projects. Production deployment requires a separately authorized release action.

For Mission Control UI, root `vercel.json` adds `git.deploymentEnabled.main = false`. The rule preserves automatic Preview behavior on other branches, existing CI, build settings, security headers and SPA rewrites. It does not alter Convex deployment authority, runtime admission, credentials, environment values or Vercel protection.

Source qualification, merge and clean-main qualification remain distinct from a Production release. The rule does not disable separately authorized manual deployment; existing release qualification, rollout, observation and rollback gates still apply. The FDLC/Guide migration-bridge release remains a separate process for those projects.

Retain exact Preview source/deployment identities and verify no new Production deployment or canonical alias movement after a guarded merge. Stop the ecosystem merge sequence if the rule fails to prevent automatic Production deployment. Qualification does not promote capability maturity or resolve incomplete economics evidence.

Future rollback requires a separate explicit deployment-policy decision and reviewed removal or change of the `main: false` rule. Removing it can itself re-enable automatic deployment when merged. Do not perform that rollback simply because the integration is complete.

[Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration) documents the branch-specific behavior. This is source/release decoupling, with no new product capability or runtime authority.
