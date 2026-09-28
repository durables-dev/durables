-- Accounts. Sign-in is still the hardcoded header user (SC-001); this table
-- holds what a listing shows about its publisher.
CREATE TABLE accounts (
  handle       text PRIMARY KEY,
  display_name text NOT NULL,
  verified     boolean NOT NULL DEFAULT false
);

-- The Verified Publisher badge is set by hand here, for kisasa only.
-- POC-SHORTCUT: SC-009
INSERT INTO accounts (handle, display_name, verified) VALUES
  ('kisasa', 'Kisasa', true),
  ('demo-consumer', 'Demo Consumer', false);
