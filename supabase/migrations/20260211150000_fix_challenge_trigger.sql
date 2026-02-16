-- Fix notify_on_challenge_created function
-- The previous version tried to join players with profiles using pl.user_id which doesn't exist
-- This migration corrects the trigger to not try to send emails via the trigger
-- Email notifications for challenges are handled by the Edge Function instead

DROP TRIGGER IF EXISTS on_challenge_created ON challenges;
DROP FUNCTION IF EXISTS notify_on_challenge_created();

CREATE OR REPLACE FUNCTION notify_on_challenge_created()
RETURNS TRIGGER AS $$
DECLARE
  challenged_name TEXT;
  challenger_name TEXT;
BEGIN
  -- Get the challenged player name
  SELECT name INTO challenged_name
  FROM players
  WHERE id = NEW.challenged_id
  LIMIT 1;

  -- Get the challenger player name
  SELECT name INTO challenger_name
  FROM players
  WHERE id = NEW.challenger_id
  LIMIT 1;

  -- Notification sending is now handled via Edge Function
  -- This trigger is kept for future extensibility but doesn't send emails directly
  -- since there's no direct user-player relationship

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for challenge creation
CREATE TRIGGER on_challenge_created
AFTER INSERT ON challenges
FOR EACH ROW EXECUTE FUNCTION notify_on_challenge_created();
