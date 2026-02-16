-- Drop the on_match_created trigger that causes errors when inserting matches
-- from the API layer. Match notifications are now handled by the API via Resend.
DROP TRIGGER IF EXISTS on_match_created ON matches;
