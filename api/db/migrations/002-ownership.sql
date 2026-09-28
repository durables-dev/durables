-- Links accounts to the activities (and, later, groups) they own. The code and
-- metadata live in documents, not here.
CREATE TABLE ownership (
  owner_handle text NOT NULL REFERENCES accounts (handle),
  kind         text NOT NULL CHECK (kind IN ('activity', 'group')),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_handle, kind, name)
);
