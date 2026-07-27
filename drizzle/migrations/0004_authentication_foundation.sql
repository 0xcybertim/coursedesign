CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'workos',
  provider_tenant_id text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  display_name text,
  email_verified boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_check
    CHECK (provider = 'workos'),
  CONSTRAINT auth_identities_provider_values_check
    CHECK (
      char_length(provider_tenant_id) BETWEEN 3 AND 255
      AND char_length(provider_subject) BETWEEN 3 AND 255
    ),
  CONSTRAINT auth_identities_email_check
    CHECK (
      email IS NULL
      OR (
        email = lower(btrim(email))
        AND char_length(email) BETWEEN 3 AND 320
      )
    ),
  CONSTRAINT auth_identities_state_check
    CHECK (state IN ('active', 'deletion_pending', 'deleted')),
  CONSTRAINT auth_identities_deleted_state_check
    CHECK ((state = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_provider_subject_uidx
  ON auth_identities(provider, provider_tenant_id, provider_subject);

CREATE INDEX IF NOT EXISTS auth_identities_email_idx
  ON auth_identities(email);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_identity_id uuid
    REFERENCES auth_identities(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_identity_uidx
  ON users(auth_identity_id)
  WHERE auth_identity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_session_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_identity_id uuid NOT NULL
    REFERENCES auth_identities(id) ON DELETE RESTRICT,
  provider_session_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_session_observations_digest_check
    CHECK (provider_session_digest ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_session_observations_digest_uidx
  ON auth_session_observations(provider_session_digest);

CREATE INDEX IF NOT EXISTS auth_session_observations_identity_expiry_idx
  ON auth_session_observations(auth_identity_id, expires_at);

CREATE INDEX IF NOT EXISTS auth_session_observations_maintenance_idx
  ON auth_session_observations(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS auth_revoked_provider_sessions (
  provider_session_digest text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_revoked_provider_sessions_digest_check
    CHECK (provider_session_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS auth_revoked_provider_sessions_expiry_idx
  ON auth_revoked_provider_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_webhook_events (
  event_digest text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_webhook_events_digest_check
    CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_webhook_events_type_check
    CHECK (event_type ~ '^[a-z0-9_.]{3,100}$')
);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_identity_id uuid
    REFERENCES auth_identities(id) ON DELETE SET NULL,
  provider_session_digest text,
  event_type text NOT NULL,
  subject_digest text,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_audit_events_event_type_check
    CHECK (event_type ~ '^[a-z0-9_]{3,80}$'),
  CONSTRAINT auth_audit_events_session_digest_check
    CHECK (
      provider_session_digest IS NULL
      OR provider_session_digest ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT auth_audit_events_subject_digest_check
    CHECK (
      subject_digest IS NULL
      OR subject_digest ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT auth_audit_events_outcome_check
    CHECK (outcome IN ('success', 'failure', 'requested')),
  CONSTRAINT auth_audit_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS auth_audit_events_actor_created_idx
  ON auth_audit_events(actor_auth_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_events_created_idx
  ON auth_audit_events(created_at DESC);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS retirement_reason text;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_retirement_state_check
  CHECK (
    (retired_at IS NULL AND retirement_reason IS NULL)
    OR (
      retired_at IS NOT NULL
      AND retirement_reason IN (
        'unverified_selector_retired',
        'account_deletion_requested',
        'administrator_retired'
      )
    )
  );

GRANT SELECT, INSERT, UPDATE ON
  auth_identities,
  auth_session_observations
TO coursedesign_runtime;

REVOKE DELETE, TRUNCATE ON
  auth_identities,
  auth_session_observations
FROM coursedesign_runtime;

GRANT SELECT, INSERT ON auth_revoked_provider_sessions
  TO coursedesign_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON auth_revoked_provider_sessions
  FROM coursedesign_runtime;

GRANT SELECT, INSERT ON auth_webhook_events TO coursedesign_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON auth_webhook_events
  FROM coursedesign_runtime;

GRANT SELECT, INSERT ON auth_audit_events TO coursedesign_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON auth_audit_events
  FROM coursedesign_runtime;

REVOKE CREATE ON SCHEMA public FROM coursedesign_runtime;
