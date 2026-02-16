-- News Table
CREATE TABLE IF NOT EXISTS news (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  published BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on news table
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view published news in their tenant
CREATE POLICY "news_select_published"
  ON news FOR SELECT
  USING (
    published = true
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Admin/Manager can manage news in their tenant
CREATE POLICY "news_admin_all"
  ON news FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('match', 'tournament', 'player')),
  entity_id BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on comments table
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view comments in their tenant
CREATE POLICY "comments_select_all"
  ON comments FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Users can create comments
CREATE POLICY "comments_insert_own"
  ON comments FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can update their own comments
CREATE POLICY "comments_update_own"
  ON comments FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policy: Admin/Manager can delete any comment
CREATE POLICY "comments_delete_admin"
  ON comments FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_tenant_published ON news(tenant_id, published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
