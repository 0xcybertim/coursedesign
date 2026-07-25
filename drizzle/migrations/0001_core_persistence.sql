CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $course_design_role$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'coursedesign_runtime'
  ) THEN
    CREATE ROLE coursedesign_runtime NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$course_design_role$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_pk PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_memberships_role_check CHECK (role IN ('owner'))
);

CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx
  ON workspace_memberships(user_id, workspace_id);

CREATE TABLE IF NOT EXISTS provisional_email_selectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  email_normalized text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_email_selectors_membership_fk
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT provisional_email_selectors_email_check
    CHECK (
      email_normalized = lower(btrim(email_normalized))
      AND char_length(email_normalized) BETWEEN 3 AND 320
    ),
  CONSTRAINT provisional_email_selectors_status_check
    CHECK (status IN ('active', 'claimed', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS provisional_email_selectors_email_uidx
  ON provisional_email_selectors(email_normalized);

CREATE TABLE IF NOT EXISTS provisional_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_sessions_membership_fk
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT provisional_sessions_digest_check
    CHECK (token_digest ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS provisional_sessions_digest_uidx
  ON provisional_sessions(token_digest);

CREATE INDEX IF NOT EXISTS provisional_sessions_maintenance_idx
  ON provisional_sessions(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  legacy_route_key text NOT NULL,
  family_id text NOT NULL,
  display_name text NOT NULL,
  draft_snapshot jsonb NOT NULL,
  domain_schema_version text NOT NULL,
  lock_version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT designs_lock_version_check CHECK (lock_version >= 1),
  CONSTRAINT designs_workspace_id_unique UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS designs_workspace_route_uidx
  ON designs(workspace_id, legacy_route_key);

CREATE INDEX IF NOT EXISTS designs_workspace_updated_idx
  ON designs(workspace_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS design_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  design_id uuid NOT NULL,
  ordinal integer NOT NULL,
  name text NOT NULL,
  configuration_hash text NOT NULL,
  domain_schema_version text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_revisions_workspace_design_fk
    FOREIGN KEY (workspace_id, design_id)
    REFERENCES designs(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT design_revisions_ordinal_check CHECK (ordinal >= 1),
  CONSTRAINT design_revisions_configuration_hash_check
    CHECK (configuration_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT design_revisions_design_ordinal_unique
    UNIQUE (design_id, ordinal),
  CONSTRAINT design_revisions_workspace_id_unique
    UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS design_revisions_design_cursor_idx
  ON design_revisions(design_id, ordinal, id);

CREATE OR REPLACE FUNCTION reject_design_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $course_design_revision_guard$
BEGIN
  RAISE EXCEPTION 'design_revisions are append-only'
    USING ERRCODE = '55000';
END
$course_design_revision_guard$;

DROP TRIGGER IF EXISTS design_revisions_append_only
  ON design_revisions;

CREATE TRIGGER design_revisions_append_only
BEFORE UPDATE OR DELETE ON design_revisions
FOR EACH ROW
EXECUTE FUNCTION reject_design_revision_mutation();

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  legacy_route_key text NOT NULL,
  name text NOT NULL,
  draft_snapshot jsonb NOT NULL,
  domain_schema_version text NOT NULL,
  lock_version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_lock_version_check CHECK (lock_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS courses_workspace_route_uidx
  ON courses(workspace_id, legacy_route_key);

CREATE INDEX IF NOT EXISTS courses_workspace_updated_idx
  ON courses(workspace_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS artwork_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  content_hash text NOT NULL,
  crc32c text NOT NULL,
  detected_media_type text NOT NULL,
  byte_length integer NOT NULL,
  pixel_width integer NOT NULL,
  pixel_height integer NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  object_generation text NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artwork_assets_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT artwork_assets_media_type_check
    CHECK (detected_media_type IN ('image/png')),
  CONSTRAINT artwork_assets_dimensions_check
    CHECK (byte_length > 0 AND pixel_width > 0 AND pixel_height > 0),
  CONSTRAINT artwork_assets_state_check
    CHECK (state IN ('pending', 'available', 'failed')),
  CONSTRAINT artwork_assets_workspace_id_unique
    UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS artwork_assets_workspace_hash_uidx
  ON artwork_assets(workspace_id, content_hash);

CREATE TABLE IF NOT EXISTS operation_idempotency (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  result_record_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_idempotency_pk
    PRIMARY KEY (workspace_id, operation_kind, idempotency_key),
  CONSTRAINT operation_idempotency_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT operation_idempotency_key_check
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 200)
);

CREATE INDEX IF NOT EXISTS operation_idempotency_expiry_idx
  ON operation_idempotency(expires_at);

GRANT USAGE ON SCHEMA public TO coursedesign_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  workspaces,
  workspace_memberships,
  provisional_email_selectors,
  provisional_sessions,
  designs,
  courses,
  artwork_assets,
  operation_idempotency
TO coursedesign_runtime;

GRANT SELECT, INSERT ON design_revisions TO coursedesign_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON design_revisions
  FROM coursedesign_runtime;
REVOKE CREATE ON SCHEMA public FROM coursedesign_runtime;
