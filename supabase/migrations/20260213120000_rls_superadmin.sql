-- Allow super_admin to read and manage tenants
DO $$ BEGIN
  CREATE POLICY super_admin_read_tenants ON tenants FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_insert_tenants ON tenants FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_update_tenants ON tenants FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow super_admin to read subscription_plans
DO $$ BEGIN
  CREATE POLICY super_admin_read_plans ON subscription_plans FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow super_admin to read addons
DO $$ BEGIN
  CREATE POLICY super_admin_read_addons ON addons FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow super_admin to manage tenant_addons
DO $$ BEGIN
  CREATE POLICY super_admin_read_tenant_addons ON tenant_addons FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_insert_tenant_addons ON tenant_addons FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
