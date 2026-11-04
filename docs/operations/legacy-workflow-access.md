# Legacy workflow access

Global legacy workflow definitions are read-compatible templates. They cannot be changed through public mutations or executed without an authorized workspace. `workflows:upsert` is now internal. Public production registration requires workspace automation-management permission and the structured workflow contract.

The built-in seeder requires explicit `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` deployment-administrator configuration. `pnpm run workflows:seed` invokes the Convex CLI with credentials in the environment. It does not use anonymous public writes. Configure and verify the intended deployment before running it; this change does not authorize production or tester changes.

A deployment administrator can retire an unowned global definition through internal `workflows:retireLegacy`. It refuses project-owned definitions and any PENDING, RUNNING or PAUSED run referencing the definition directly or through a frozen snapshot. After controlled retirement, an authorized workspace owner can register a validated project definition with that identity. Public callers cannot adopt an ambiguous global row. Existing-data inventory, explicit identity mapping and rollback/data snapshots remain prerequisites for staging migration.

Direct v1 workflow runs require an explicit workspace and automation-management permission. Global templates and deterministic v2 workflows are unavailable in the direct-start chooser; governed Work starts through canonical WorkOrder dispatch. Canonical WorkOrder revisions and linked Tasks cannot bypass that route through direct start. Legacy run reads and writes require workspace permission, while existing Mission grants retain their exact scoped authority.
