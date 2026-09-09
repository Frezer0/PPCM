-- Existing members keep their Supabase login until an administrator changes it.
ALTER TABLE ppcm.members ADD COLUMN IF NOT EXISTS login_mode text NOT NULL DEFAULT 'supabase'
  CHECK (login_mode IN ('supabase', 'password'));
ALTER TABLE ppcm.members ADD COLUMN IF NOT EXISTS access_version integer NOT NULL DEFAULT 1;

-- Credentials and session tokens are separate from member profiles and backups.
CREATE TABLE IF NOT EXISTS ppcm.member_credentials (
  member_id uuid PRIMARY KEY REFERENCES ppcm.members(id) ON DELETE CASCADE,
  password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS ppcm.member_sessions (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES ppcm.members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ppcm.guest_sessions (
  token_hash text PRIMARY KEY,
  display_name text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ppcm_guest_sessions_expiry_idx ON ppcm.guest_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ppcm.access_settings (
  id integer PRIMARY KEY CHECK(id=1),
  require_credentials boolean NOT NULL DEFAULT true
);
INSERT INTO ppcm.access_settings(id,require_credentials) VALUES(1,true) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS ppcm_member_sessions_member_idx ON ppcm.member_sessions(member_id);
CREATE INDEX IF NOT EXISTS ppcm_member_sessions_expiry_idx ON ppcm.member_sessions(expires_at);
REVOKE ALL ON ppcm.member_credentials, ppcm.member_sessions, ppcm.guest_sessions, ppcm.access_settings FROM PUBLIC;
ALTER TABLE ppcm.member_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppcm.member_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppcm.access_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppcm.guest_sessions ENABLE ROW LEVEL SECURITY;
