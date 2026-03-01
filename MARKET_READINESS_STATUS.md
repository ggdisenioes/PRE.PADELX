# Market Readiness Status

Last updated: 2026-02-27

## Completed
- Production deployment is `READY` on Vercel.
- Production health endpoint returns healthy (`/api/health`).
- Security advisor findings addressed for definer views and exposed legacy tables.
- Legacy stats tables hardened with restrictive tenant-aware RLS policies.
- Migration guardrails enabled in CI (naming/order/version uniqueness).
- Client secret exposure guard enabled in CI (`SUPABASE_SERVICE_ROLE_KEY` in client code).
- Production health monitor automation enabled (scheduled GitHub Action + incident issue automation).
- E2E CI is resilient to missing role credentials:
  - runs full suite when real Supabase + role secrets are configured;
  - runs public smoke fallback when they are not.
- Billing lifecycle hardening is active in super-admin tenant API:
  - explicit plan transitions (`upgrade`, `downgrade`, `lateral`);
  - downgrade blocked when current usage exceeds target plan limits;
  - explicit failed-payment / recovered-payment status handling;
  - reactivation guard when overdue invoices exist (unless `force=true`);
  - audit trail in `super_admin_action_logs`.
- Go-live smoke and runbook are in repository.

## Pending (Blockers for stronger production resilience)
- PITR is disabled on Supabase production project.
  - Current check result:
    - `pitr_enabled: false`
    - `backups_count: 0`
  - Impact:
    - No validated point-in-time restore path.
  - Action:
    - Enable PITR in Supabase project settings and confirm backup window is populated.

## Pending (Recommended before scale-up)
- External backup/restore drill:
  - run and document one full restore simulation.
- E2E role suite completeness:
  - configure all role credentials in CI so fallback mode is no longer used.

## Verification commands
- `npm run check:migrations`
- `npm run check:client-secrets`
- `npm run check:e2e-env`
- `npm run go-live:smoke`
- `npm run monitor:health`
- `npm run check:backup-readiness`
