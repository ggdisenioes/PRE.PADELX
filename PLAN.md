# Implementation Plan: 8 New Features for Pádel Manager

## Overview
This plan covers implementation of 8 major features to elevate the platform to "excellent service" level:
1. **News/Noticias** - Admin/Manager creates news visible to all users
3. **Advanced Statistics** - Graphs and historical data analysis
4. **Challenges/Desafíos** - Player-to-player challenge system
6. **Court Booking** - Integrated court reservation system
7. **Comments** - Comments on matches/tournaments/players
8. **Email Notifications** - Automated notifications for events
9. **Advanced Analytics Dashboard** - Admin/Manager insights
+ **PDF Export** - Generate reports for Admin/Manager

**User/Subscription features are DEFERRED** per user request.

---

## Phase 1: Database Schema & Infrastructure (Priority: CRITICAL)

### 1.1 New Tables

```sql
-- News/Noticias
CREATE TABLE news (
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

-- RLS Policies for news
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view published news in their tenant"
  ON news FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()) AND published = true);
CREATE POLICY "Admin/Manager can manage news in their tenant"
  ON news FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager'));

-- Comments
CREATE TABLE comments (
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

-- RLS Policies for comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view comments in their tenant"
  ON comments FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create comments"
  ON comments FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid());
CREATE POLICY "Users can update their own comments"
  ON comments FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "Admin/Manager can delete any comment"
  ON comments FOR DELETE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager'));

-- Challenges
CREATE TABLE challenges (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenger_id BIGINT NOT NULL REFERENCES players(id),
  challenger_partner_id BIGINT REFERENCES players(id),
  challenged_id BIGINT NOT NULL REFERENCES players(id),
  challenged_partner_id BIGINT REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  message TEXT,
  match_id BIGINT REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- RLS Policies for challenges
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view challenges in their tenant"
  ON challenges FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create challenges"
  ON challenges FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Challenged player can update challenge status"
  ON challenges FOR UPDATE
  USING (challenged_id IN (SELECT id FROM players WHERE user_id = auth.uid()));

-- Court Bookings
CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  court_id BIGINT NOT NULL REFERENCES courts(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  player_id BIGINT REFERENCES players(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_overlap UNIQUE (court_id, booking_date, start_time)
);

-- RLS Policies for bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view bookings in their tenant"
  ON bookings FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid());
CREATE POLICY "Users can update their own bookings"
  ON bookings FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "Admin/Manager can manage all bookings"
  ON bookings FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager'));

-- Email Queue (for notifications)
CREATE TABLE email_queue (
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
```

### 1.2 Database Functions

```sql
-- Function to get player advanced stats
CREATE OR REPLACE FUNCTION get_player_advanced_stats(player_id_input BIGINT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_matches', COUNT(*),
    'wins', SUM(CASE WHEN (winner = 'A' AND (player_1_a = player_id_input OR player_2_a = player_id_input))
                      OR (winner = 'B' AND (player_1_b = player_id_input OR player_2_b = player_id_input))
                 THEN 1 ELSE 0 END),
    'losses', SUM(CASE WHEN winner IS NOT NULL AND winner != 'pending' AND
                       NOT ((winner = 'A' AND (player_1_a = player_id_input OR player_2_a = player_id_input))
                         OR (winner = 'B' AND (player_1_b = player_id_input OR player_2_b = player_id_input)))
                  THEN 1 ELSE 0 END),
    'points_scored', SUM(
      CASE
        WHEN player_1_a = player_id_input OR player_2_a = player_id_input THEN
          (SELECT SUM(CAST(SPLIT_PART(set_score, '-', 1) AS INT)) FROM unnest(string_to_array(score, ' ')) AS set_score)
        WHEN player_1_b = player_id_input OR player_2_b = player_id_input THEN
          (SELECT SUM(CAST(SPLIT_PART(set_score, '-', 2) AS INT)) FROM unnest(string_to_array(score, ' ')) AS set_score)
      END
    ),
    'avg_match_duration', AVG(EXTRACT(EPOCH FROM (end_time - start_time))/60)::INT,
    'win_streak', (SELECT MAX(streak) FROM (
      SELECT COUNT(*) as streak
      FROM matches
      WHERE (player_1_a = player_id_input OR player_2_a = player_id_input OR
             player_1_b = player_id_input OR player_2_b = player_id_input)
        AND ((winner = 'A' AND (player_1_a = player_id_input OR player_2_a = player_id_input))
          OR (winner = 'B' AND (player_1_b = player_id_input OR player_2_b = player_id_input)))
      ORDER BY start_time DESC
    ) streaks)
  ) INTO result
  FROM matches
  WHERE player_1_a = player_id_input OR player_2_a = player_id_input
     OR player_1_b = player_id_input OR player_2_b = player_id_input;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to enqueue notification emails
CREATE OR REPLACE FUNCTION enqueue_notification_email(
  recipient TEXT,
  subject_text TEXT,
  body_html TEXT,
  template TEXT DEFAULT NULL,
  tenant_id_input BIGINT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO email_queue (tenant_id, recipient_email, subject, body_html, template_type)
  VALUES (tenant_id_input, recipient, subject_text, body_html, template)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Phase 2: API Routes (Priority: HIGH)

### 2.1 News API
- **POST /api/news** - Create news (admin/manager only)
- **GET /api/news** - List published news (all users)
- **GET /api/news/[id]** - Get single news item
- **PUT /api/news/[id]** - Update news (admin/manager only)
- **DELETE /api/news/[id]** - Delete news (admin/manager only)

### 2.2 Comments API
- **GET /api/comments?entity_type=match&entity_id=123** - Get comments for entity
- **POST /api/comments** - Create comment
- **PUT /api/comments/[id]** - Update own comment
- **DELETE /api/comments/[id]** - Delete comment (own or admin/manager)

### 2.3 Challenges API
- **GET /api/challenges** - List challenges (pending/active)
- **POST /api/challenges** - Create challenge
- **PUT /api/challenges/[id]** - Update challenge status (accept/decline)
- **DELETE /api/challenges/[id]** - Cancel challenge

### 2.4 Bookings API
- **GET /api/bookings?date=2026-02-15** - List bookings for date
- **GET /api/bookings/availability** - Check court availability
- **POST /api/bookings** - Create booking
- **PUT /api/bookings/[id]** - Update booking
- **DELETE /api/bookings/[id]** - Cancel booking

### 2.5 Statistics API
- **GET /api/stats/player/[id]** - Get advanced player stats
- **GET /api/stats/tournament/[id]** - Get tournament statistics
- **GET /api/stats/global** - Get global platform statistics (admin/manager)

### 2.6 Export API
- **POST /api/export/pdf** - Generate PDF report (admin/manager only)
  - Supports: player stats, tournament results, match history, booking reports

---

## Phase 3: Frontend Components (Priority: HIGH)

### 3.1 News Components
**Files to create:**
- `app/news/page.tsx` - News listing page (public)
- `app/news/[id]/page.tsx` - Single news view
- `app/admin/news/page.tsx` - News management (admin/manager)
- `app/components/news/NewsCard.tsx` - News card component
- `app/components/news/NewsEditor.tsx` - Rich text editor for news

**Features:**
- Featured news carousel on homepage
- Image upload support (Supabase Storage)
- Draft/Published status toggle
- Markdown or rich text editor

### 3.2 Comments Components
**Files to create:**
- `app/components/comments/CommentSection.tsx` - Comment section widget
- `app/components/comments/CommentForm.tsx` - Add comment form
- `app/components/comments/Comment.tsx` - Single comment component

**Features:**
- Real-time comment updates (Supabase subscriptions)
- Edit/Delete own comments
- Admin moderation (delete any comment)
- Render on match/tournament/player pages

### 3.3 Challenges Components
**Files to create:**
- `app/challenges/page.tsx` - Challenge dashboard
- `app/challenges/create/page.tsx` - Create challenge form
- `app/components/challenges/ChallengeCard.tsx` - Challenge display
- `app/components/challenges/ChallengeNotification.tsx` - Challenge alerts

**Features:**
- Challenge creation wizard (select opponent, partner, message)
- Accept/Decline actions
- Auto-expire after 7 days
- Link to schedule match when accepted

### 3.4 Bookings Components
**Files to create:**
- `app/bookings/page.tsx` - Booking calendar view
- `app/bookings/create/page.tsx` - Create booking form
- `app/components/bookings/BookingCalendar.tsx` - Calendar widget
- `app/components/bookings/TimeSlotPicker.tsx` - Time slot selector

**Features:**
- Weekly/daily calendar view
- Court availability checker
- Conflict detection
- Booking confirmation emails

### 3.5 Advanced Statistics Components
**Files to create:**
- `app/stats/page.tsx` - Global statistics dashboard
- `app/stats/player/[id]/page.tsx` - Enhanced player stats with charts
- `app/components/stats/StatChart.tsx` - Reusable chart component (using Chart.js or Recharts)
- `app/components/stats/StatCard.tsx` - Metric display card

**Features:**
- Line charts (win rate over time)
- Bar charts (points scored per match)
- Pie charts (match outcomes)
- Leaderboards with filters

### 3.6 Advanced Analytics Dashboard
**Files to create:**
- `app/admin/analytics/page.tsx` - Admin analytics dashboard
- `app/components/analytics/MetricsGrid.tsx` - KPI metrics grid
- `app/components/analytics/ActivityChart.tsx` - Activity timeline
- `app/components/analytics/UserGrowthChart.tsx` - User growth visualization

**Features:**
- Total users, matches, bookings, active players
- Revenue tracking (future integration)
- Popular courts/time slots
- User engagement metrics
- Export to PDF button

### 3.7 PDF Export Components
**Files to create:**
- `app/lib/pdf.ts` - PDF generation utility (using jsPDF or PDFKit)
- `app/components/export/ExportButton.tsx` - Export trigger button

**Features:**
- Export player profiles with stats
- Export tournament brackets and results
- Export booking schedules
- Export analytics reports
- Branded PDF templates with logo

### 3.8 Email Notification System
**Files to create:**
- `supabase/functions/process-emails/index.ts` - Email processor Edge Function
- `app/lib/email-templates.ts` - Email template generator
- `app/components/notifications/NotificationSettings.tsx` - User notification preferences

**Email Templates:**
- Tournament created/updated
- Match scheduled/result posted
- Challenge received/accepted/declined
- Booking confirmed/cancelled
- News published
- Court availability reminder

---

## Phase 4: Integration & Testing (Priority: MEDIUM)

### 4.1 Sidebar Updates
**File:** `app/components/Sidebar.tsx`

Add new menu items:
```typescript
const generalMenuItems = [
  // ... existing items
  { id: "news", label: "Noticias", href: "/news", emoji: "📰" },
  { id: "challenges", label: "Desafíos", href: "/challenges", emoji: "⚔️" },
  { id: "bookings", label: "Reservar Pista", href: "/bookings", emoji: "📅" },
  { id: "stats", label: "Estadísticas", href: "/stats", emoji: "📈" },
];

const adminMenuItems = [
  // ... existing items
  { id: "analytics", label: "Analytics Avanzado", href: "/admin/analytics", emoji: "📊" },
  { id: "news-admin", label: "Gestión de Noticias", href: "/admin/news", emoji: "📝" },
];
```

### 4.2 Homepage Updates
**File:** `app/page.tsx`

Add featured news section and quick stats widgets at the top.

### 4.3 Real-time Subscriptions
Set up Supabase real-time subscriptions for:
- New comments on viewed entities
- Challenge status updates
- Booking conflicts
- New news articles

### 4.4 Notification Triggers
Create database triggers to auto-enqueue emails:
```sql
CREATE OR REPLACE FUNCTION notify_challenge_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM enqueue_notification_email(
    (SELECT email FROM profiles p JOIN players pl ON p.id = pl.user_id WHERE pl.id = NEW.challenged_id),
    'Nuevo Desafío Recibido',
    '<h1>Has recibido un desafío!</h1><p>Ve a la plataforma para aceptar o rechazar.</p>',
    'challenge_received',
    NEW.tenant_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_challenge_created
AFTER INSERT ON challenges
FOR EACH ROW EXECUTE FUNCTION notify_challenge_created();
```

---

## Phase 5: Deployment & Documentation (Priority: LOW)

### 5.1 Environment Variables
Add to `.env.local`:
```
NEXT_PUBLIC_CHART_COLORS='["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"]'
PDF_LOGO_URL='https://yourbucket.supabase.co/storage/v1/object/public/assets/logo.png'
EMAIL_FROM='noreply@padelx.es'
```

### 5.2 Migration Scripts
Create SQL migration files in `sql/migrations/` directory for all schema changes.

### 5.3 Testing Checklist
- [ ] Admin can create/edit/delete news
- [ ] Users can view published news
- [ ] Users can comment on matches/tournaments/players
- [ ] Admin can delete any comment
- [ ] Users can create challenges
- [ ] Challenged player receives email notification
- [ ] Challenge acceptance creates match (optional)
- [ ] Users can book courts without conflicts
- [ ] Booking confirmation email sent
- [ ] Advanced stats display correctly with charts
- [ ] Analytics dashboard shows accurate metrics (admin/manager only)
- [ ] PDF export generates formatted reports
- [ ] Email queue processes successfully

### 5.4 User Documentation
Create user guide sections:
- How to create a challenge
- How to book a court
- How to comment on matches
- How to view advanced statistics
- Admin: How to create news articles
- Admin: How to export reports

---

## Implementation Timeline

### Week 1-2: Database & Backend (16-20 hours)
- Create all database tables with RLS policies
- Create database functions
- Build all API routes
- Set up email queue system
- Test API endpoints with Postman/curl

### Week 3-4: Frontend Core (20-24 hours)
- Build News system (listing, detail, admin CRUD)
- Build Comments system (display, add, edit, delete)
- Build Challenges system (create, accept, decline)
- Build Bookings system (calendar, create, manage)
- Add to Sidebar and integrate navigation

### Week 5: Advanced Features (12-16 hours)
- Implement Advanced Statistics with charts
- Build Analytics Dashboard
- Create PDF export functionality
- Build email notification templates
- Set up database triggers for auto-notifications

### Week 6: Testing & Polish (8-10 hours)
- Integration testing
- Cross-browser testing
- Mobile responsive fixes
- Performance optimization
- User acceptance testing
- Deploy to production

**Total Estimated Time: 56-70 hours**

---

## Technical Dependencies

### New NPM Packages Required:
```bash
npm install recharts          # For charts/graphs
npm install jspdf             # For PDF generation
npm install react-calendar    # For booking calendar
npm install react-quill       # For rich text news editor (optional)
npm install date-fns          # For date manipulation
```

### Supabase Storage Buckets:
- `news-images` - For news article images
- `pdf-exports` - For generated PDF reports (temporary storage)

### Edge Functions:
- `process-emails` - Process email queue every 5 minutes
- `cleanup-expired-challenges` - Run daily to clean up expired challenges

---

## Security Considerations

1. **RLS Policies**: All new tables have strict RLS policies enforcing tenant isolation
2. **Input Validation**: All API routes use Zod schemas for validation
3. **Rate Limiting**: API routes should have rate limiting (especially bookings to prevent spam)
4. **XSS Protection**: Comments are sanitized before rendering
5. **Authorization**: Bearer token validation on all protected routes
6. **Audit Logging**: All admin actions logged to action_logs table
7. **Email Security**: Email addresses validated, no injection vulnerabilities

---

## Performance Optimization

1. **Database Indexes**:
```sql
CREATE INDEX idx_news_tenant_published ON news(tenant_id, published) WHERE published = true;
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id, tenant_id);
CREATE INDEX idx_bookings_date_court ON bookings(booking_date, court_id);
CREATE INDEX idx_challenges_status ON challenges(status, tenant_id);
```

2. **Caching Strategy**:
- News articles: Cache for 5 minutes
- Player stats: Cache for 1 minute
- Analytics dashboard: Cache for 30 minutes

3. **Pagination**:
- News: 12 per page
- Comments: Load 20, "Load More" button
- Bookings: Show 7 days at a time
- Challenges: 10 per page

---

## Success Metrics

After implementation, track:
- Daily Active Users (DAU)
- News article views
- Comments per match/tournament
- Challenge creation rate and acceptance rate
- Booking conversion rate (views → bookings)
- Email open rates
- PDF export usage
- Average session duration

---

## Future Enhancements (Post-MVP)

- Push notifications (web/mobile)
- In-app messaging between players
- Video uploads for match highlights
- Social media integration (share results)
- Mobile app (React Native)
- Advanced booking: recurring bookings, group bookings
- Payment integration for court fees
- Referee assignment system
- Live scoring app integration

---

## Rollback Plan

If issues arise:
1. Database: Keep all migration scripts reversible
2. Feature Flags: Wrap new features in feature flags for easy disable
3. Monitoring: Set up error tracking (Sentry recommended)
4. Backup: Daily Supabase backups enabled

---

## Notes

- All features respect multi-tenant architecture (tenant_id isolation)
- All features work with existing authentication system
- UI follows existing Tailwind CSS design patterns
- Code follows existing TypeScript strict mode
- All API routes follow existing Bearer token + Zod validation pattern
- Email system uses existing Edge Function pattern
- PDF exports use admin/manager authorization
