-- Presence is ephemeral and is not part of the maintenance activity log or backup.
CREATE TABLE IF NOT EXISTS ppcm.presence (
  user_key text NOT NULL,
  browser_id uuid NOT NULL,
  tab_id uuid NOT NULL,
  member_id uuid REFERENCES ppcm.members(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  PRIMARY KEY(user_key, browser_id, tab_id)
);
CREATE INDEX IF NOT EXISTS ppcm_presence_seen_idx ON ppcm.presence(last_seen);
CREATE INDEX IF NOT EXISTS ppcm_presence_browser_idx ON ppcm.presence(browser_id);
CREATE INDEX IF NOT EXISTS ppcm_presence_member_idx ON ppcm.presence(member_id);
REVOKE ALL ON ppcm.presence FROM PUBLIC;
ALTER TABLE ppcm.presence ENABLE ROW LEVEL SECURITY;
