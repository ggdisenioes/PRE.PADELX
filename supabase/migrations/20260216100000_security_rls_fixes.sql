-- ============================================================
-- Security RLS Fixes
-- 1. Restrict challenges UPDATE to relevant players + admins
-- 2. Add DELETE protection on sensitive tables
-- 3. Fix comments DELETE to check tenant
-- ============================================================

-- ============================================================
-- 1. Fix challenges_update_all: restrict to involved players + admins
-- ============================================================
DROP POLICY IF EXISTS "challenges_update_all" ON challenges;

-- Challenged players can update (for acceptance responses)
CREATE POLICY "challenges_update_challenged"
  ON challenges FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (
      -- User is the challenged player (via players.user_id)
      EXISTS (
        SELECT 1 FROM players
        WHERE players.user_id = auth.uid()
          AND (players.id = challenges.challenged_id OR players.id = challenges.challenged_partner_id)
      )
      -- Or user is the challenger (for cancel/schedule)
      OR EXISTS (
        SELECT 1 FROM players
        WHERE players.user_id = auth.uid()
          AND (players.id = challenges.challenger_id OR players.id = challenges.challenger_partner_id)
      )
      -- Or user is admin/manager
      OR (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager', 'super_admin')
    )
  );

-- ============================================================
-- 2. Protect sensitive tables from DELETE (only super_admin)
-- ============================================================

-- subscription_invoices: only super_admin can delete
DROP POLICY IF EXISTS "super_admin_delete_invoices" ON subscription_invoices;
CREATE POLICY "super_admin_delete_invoices" ON subscription_invoices
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- tenant_usage: only super_admin can delete
DROP POLICY IF EXISTS "super_admin_delete_usage" ON tenant_usage;
CREATE POLICY "super_admin_delete_usage" ON tenant_usage
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- super_admin_action_logs: only super_admin can delete
DROP POLICY IF EXISTS "super_admin_delete_logs" ON super_admin_action_logs;
CREATE POLICY "super_admin_delete_logs" ON super_admin_action_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- 3. Fix comments DELETE: add tenant check
-- ============================================================
DROP POLICY IF EXISTS "comments_delete_admin" ON comments;
CREATE POLICY "comments_delete_admin"
  ON comments FOR DELETE
  USING (
    -- User can delete own comments
    user_id = auth.uid()
    OR (
      -- Admin/manager can delete comments in their tenant only
      tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
      AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
    )
  );
