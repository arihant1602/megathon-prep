-- Broadcast every new activity row to LISTEN 'activity' (live feeds and presence).
CREATE OR REPLACE FUNCTION notify_activity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('activity', json_build_object(
    'id', NEW.id, 'userId', NEW.user_id, 'actor', NEW.actor, 'app', NEW.app,
    'verb', NEW.verb, 'target', NEW.target, 'createdAt', NEW.created_at)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_notify ON activity;
--> statement-breakpoint
CREATE TRIGGER activity_notify AFTER INSERT ON activity FOR EACH ROW EXECUTE FUNCTION notify_activity();
