# 🚀 Database Deployment & Testing Guide

## Phase 1: Deployment Instructions

### Prerequisites
- Access to Supabase SQL Editor for your project
- PostgreSQL 14+ (provided by Supabase)
- Admin privileges in the database

### Deployment Steps

#### **Step 1: Execute Migration 004 (News & Comments)**

Go to Supabase Dashboard → SQL Editor → New Query

Copy and paste the entire content of `sql/004_news_and_comments.sql`:

```sql
-- News Table
CREATE TABLE IF NOT EXISTS news (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
```

✅ Click "Run" - Should complete without errors

---

#### **Step 2: Execute Migration 005 (Challenges)**

Copy and paste the entire content of `sql/005_challenges.sql`:

```sql
-- Challenges Table
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenger_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenger_partner_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  challenged_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenged_partner_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  message TEXT,
  match_id BIGINT REFERENCES matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Enable RLS on challenges table
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view challenges in their tenant
CREATE POLICY "challenges_select_all"
  ON challenges FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Users can create challenges
CREATE POLICY "challenges_insert_own"
  ON challenges FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Challenged player can update challenge status
CREATE POLICY "challenges_update_challenged"
  ON challenges FOR UPDATE
  USING (
    challenged_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Challenger can cancel their challenge
CREATE POLICY "challenges_update_challenger"
  ON challenges FOR UPDATE
  USING (
    challenger_id IN (SELECT id FROM players WHERE user_id = auth.uid() LIMIT 1)
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);
```

✅ Click "Run" - Should complete without errors

---

#### **Step 3: Execute Migration 006 (Bookings)**

Copy and paste the entire content of `sql/006_bookings.sql`:

```sql
-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  court_id BIGINT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT booking_time_order CHECK (start_time < end_time),
  CONSTRAINT booking_no_overlap UNIQUE (court_id, booking_date, start_time)
);

-- Enable RLS on bookings table
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view bookings in their tenant
CREATE POLICY "bookings_select_all"
  ON bookings FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- RLS Policy: Users can create bookings
CREATE POLICY "bookings_insert_own"
  ON bookings FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can update their own bookings
CREATE POLICY "bookings_update_own"
  ON bookings FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policy: Admin/Manager can manage all bookings
CREATE POLICY "bookings_admin_all"
  ON bookings FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_date_court ON bookings(booking_date, court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id, booking_date);
```

✅ Click "Run" - Should complete without errors

---

#### **Step 4: Execute Migration 007 (Email Queue)**

Copy and paste the entire content of `sql/007_email_queue.sql`:

```sql
-- Email Queue Table
CREATE TABLE IF NOT EXISTS email_queue (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  template_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Enable RLS on email_queue table (admin/manager only)
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admin/Manager can view email queue
CREATE POLICY "email_queue_select_admin"
  ON email_queue FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- RLS Policy: Service role can insert/update (via functions)
CREATE POLICY "email_queue_admin_all"
  ON email_queue FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'manager')
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_tenant ON email_queue(tenant_id, status);
```

✅ Click "Run" - Should complete without errors

---

#### **Step 5: Execute Migration 008 (Database Functions)**

Copy and paste the entire content of `sql/008_database_functions.sql`

This file is long, so copy the entire file from `sql/008_database_functions.sql` into the SQL editor.

✅ Click "Run" - Should complete without errors (you may see notices about triggers being dropped, that's normal)

---

## Phase 2: Schema Verification

### ✅ Verify Tables Were Created

Run this query in SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('news', 'comments', 'challenges', 'bookings', 'email_queue')
ORDER BY table_name;
```

**Expected Output:**
```
bookings
challenges
comments
email_queue
news
```

### ✅ Verify RLS is Enabled

Run this query:

```sql
SELECT tablename, rls_enabled
FROM (
  SELECT tablename, 'Disabled' as rls_enabled FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('news', 'comments', 'challenges', 'bookings', 'email_queue')
  UNION
  SELECT table_name, 'Enabled' FROM information_schema.tables
  WHERE table_schema = 'public'
  AND rowsecurity = true
  AND table_name IN ('news', 'comments', 'challenges', 'bookings', 'email_queue')
) AS combined;
```

**Expected:** All 5 tables show "Enabled"

### ✅ Verify Indexes

Run this query:

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('news', 'comments', 'challenges', 'bookings', 'email_queue')
ORDER BY tablename, indexname;
```

**Expected:** 16 indexes total (4 for news, 4 for comments, 4 for challenges, 4 for bookings)

### ✅ Verify Database Functions

Run this query:

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'enqueue_notification_email',
  'notify_on_challenge_created',
  'cleanup_expired_challenges',
  'get_player_advanced_stats',
  'get_platform_stats',
  'notify_on_booking_created',
  'is_court_available'
)
ORDER BY routine_name;
```

**Expected:** All 7 functions listed

---

## Phase 3: Testing

### Test 1: News Table - Insert & Read

```sql
-- Insert test news
INSERT INTO news (tenant_id, title, content, author_id, published)
SELECT 1, 'Test News Article', 'This is test content', id, true
FROM auth.users LIMIT 1;

-- Verify insert
SELECT id, title, published FROM news WHERE title = 'Test News Article';
```

**Expected:** Returns 1 row

### Test 2: Comments Table - Insert & Read

```sql
-- Get a match ID to comment on (adjust match_id as needed)
INSERT INTO comments (tenant_id, entity_type, entity_id, user_id, user_name, content)
SELECT 1, 'match', 1, id, 'TestUser', 'Great match!'
FROM auth.users LIMIT 1;

-- Verify insert
SELECT id, user_name, content FROM comments WHERE content = 'Great match!';
```

**Expected:** Returns 1 row

### Test 3: Challenges Table - Insert & Read

```sql
-- Insert test challenge (adjust challenger_id and challenged_id)
INSERT INTO challenges (tenant_id, challenger_id, challenged_id, message)
VALUES (1, 1, 2, 'Want to play?');

-- Verify insert
SELECT id, status, message FROM challenges WHERE message = 'Want to play?';
```

**Expected:** Returns 1 row with status='pending'

### Test 4: Bookings Table - Insert & Read

```sql
-- Insert test booking (adjust court_id and user_id)
INSERT INTO bookings (tenant_id, court_id, user_id, booking_date, start_time, end_time)
SELECT 1, 1, id, CURRENT_DATE + INTERVAL '1 day', '10:00', '11:00'
FROM auth.users LIMIT 1;

-- Verify insert
SELECT id, booking_date, start_time, end_time, status FROM bookings WHERE start_time = '10:00';
```

**Expected:** Returns 1 row with status='confirmed'

### Test 5: Email Queue - Insert & Read

```sql
-- Insert test email
INSERT INTO email_queue (tenant_id, recipient_email, subject, body_html, status)
VALUES (1, 'test@example.com', 'Test Email', '<h1>Test</h1>', 'pending');

-- Verify insert
SELECT id, recipient_email, status FROM email_queue WHERE recipient_email = 'test@example.com';
```

**Expected:** Returns 1 row with status='pending'

### Test 6: Database Function - Get Player Stats

```sql
-- Test get_player_advanced_stats function
SELECT get_player_advanced_stats(1);
```

**Expected:** Returns JSON object with stats structure

### Test 7: Database Function - Get Platform Stats

```sql
-- Test get_platform_stats function
SELECT get_platform_stats(1);
```

**Expected:** Returns JSON object with 9 metrics

### Test 8: Booking Availability Function

```sql
-- Test is_court_available function
SELECT is_court_available(1, CURRENT_DATE + INTERVAL '1 day', '12:00', '13:00');
```

**Expected:** Returns true or false

---

## ✅ Completion Checklist

After deployment and testing:

- [ ] All 5 migration files executed without errors
- [ ] All 5 tables exist in database
- [ ] RLS is enabled on all tables
- [ ] All 16 indexes created
- [ ] All 7 functions created
- [ ] Test 1-5 pass (data can be inserted and read)
- [ ] Test 6-8 pass (functions work correctly)
- [ ] No error messages in SQL Editor

---

## 🔧 Troubleshooting

### Error: "relation 'tenants' does not exist"
**Solution:** Your `tenants` table may not exist. Create it first or adjust foreign key references.

### Error: "relation 'auth.users' does not exist"
**Solution:** Supabase's auth schema should always exist. Check project is properly initialized.

### Error: "relation 'players' does not exist"
**Solution:** The `players` table must exist before creating challenges/bookings. Create it first.

### Error: "relation 'matches' does not exist"
**Solution:** The `matches` table is referenced by comments. Create or adjust the reference.

### RLS Policies Not Working
**Solution:** Verify:
1. `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;` executed
2. User is authenticated with valid token
3. User has profile record with tenant_id

---

## 📝 Notes

- All migrations use `IF NOT EXISTS` to make them idempotent (safe to re-run)
- RLS policies prevent unauthorized data access
- Database triggers automatically send notifications
- All timestamps use TIMESTAMPTZ for timezone awareness
- Email queue supports background processing via Edge Functions

