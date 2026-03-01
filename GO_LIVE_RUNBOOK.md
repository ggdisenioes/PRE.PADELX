# Go-Live Runbook

## 1. Pre-deploy checks
- `npm run check:migrations`
- `npm run check:client-secrets`
- `npm run check:e2e-env` (strict mode, requires role credentials)
- `npm run build`
- `npm run test:e2e`
- `supabase db lint --linked`
- `supabase migration list --linked` (local vs remote aligned)

## 2. Database release
- Apply pending migrations:
  - `supabase db push --linked`
- Re-check schema:
  - `supabase db lint --linked`

## 3. Application release
- Push changes to `main`.
- Deploy production from clean git state:
  - `vercel deploy --prod --yes`
- Verify deployment status:
  - `vercel inspect <deployment-url>`

## 4. Post-release smoke checks
- `npm run go-live:smoke` (defaults to `https://twinco.padelx.es`)
- Manual spot-check:
  - Login with admin account.
  - Open dashboard, matches, ranking, admin notifications.
  - Confirm `/api/health` returns `ok: true`.

## 5. Incident rollback
- Identify previous working deployment:
  - `vercel ls --status READY`
- Promote previous deployment alias to production (or redeploy previous commit).
- If DB rollback is required:
  - Apply forward-fix migration (preferred).
  - Avoid destructive rollback unless absolutely necessary.

## 6. Monitoring and response
- Primary health endpoint: `/api/health`
- Alert trigger suggestion:
  - 2 consecutive failures (>=503) within 5 minutes.
- During incident:
  - Capture failing endpoint, timestamp, and user impact.
  - Check Vercel deployment status/logs.
  - Check Supabase status and recent migrations.
- Automation:
  - GitHub Action: `.github/workflows/prod-health-monitor.yml`
  - GitHub Action: `.github/workflows/supabase-backup-readiness.yml`
  - Manual trigger: `Actions -> Production Health Monitor -> Run workflow`
  - Local smoke: `npm run go-live:smoke`
  - Local monitor check: `npm run monitor:health`
  - Backup readiness check: `npm run check:backup-readiness`
  - Backup readiness strictness: `BACKUP_READINESS_STRICT` (defaults to `false` in workflow)
  - Required repo secret for automated backup check: `SUPABASE_ACCESS_TOKEN`
  - E2E workflow behavior:
    - If real Supabase env + role credentials are present, it runs full suite.
    - If role credentials are missing, it runs `tests/e2e/public.smoke.spec.ts` fallback and uploads `e2e-env-report`.

## 7. Billing operations (super-admin)
- Plan transition endpoint:
  - `PUT /api/super-admin/tenants/[id]` with `subscription_plan_id`.
  - Response includes transition type: `upgrade` / `downgrade` / `lateral`.
  - Downgrades are blocked (`409 BILLING_DOWNGRADE_BLOCKED`) when tenant usage exceeds target plan limits.
- Payment lifecycle endpoint:
  - `PUT /api/super-admin/tenants/[id]` with `billing_event`.
  - Supported events: `payment_failed`, `payment_recovered`.
  - Reactivation to `active` is blocked when overdue invoices exist unless `force=true`.
- Audit:
  - Billing transitions and status changes are logged in `super_admin_action_logs`.
