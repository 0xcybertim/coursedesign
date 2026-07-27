WITH anonymized_selectors AS (
  SELECT
    id,
    'retired+'
      || encode(digest(id::text, 'sha256'), 'hex')
      || '@invalid.example' AS retired_email
  FROM provisional_email_selectors
)
UPDATE provisional_email_selectors AS selector
SET
  email_normalized = anonymized.retired_email,
  status = 'disabled',
  updated_at = now()
FROM anonymized_selectors AS anonymized
WHERE
  selector.id = anonymized.id
  AND (
    selector.email_normalized <> anonymized.retired_email
    OR selector.status <> 'disabled'
  );

UPDATE provisional_sessions
SET
  revoked_at = COALESCE(revoked_at, now()),
  updated_at = now()
WHERE revoked_at IS NULL;

UPDATE workspaces AS workspace
SET
  retired_at = COALESCE(workspace.retired_at, now()),
  retirement_reason = 'unverified_selector_retired',
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM provisional_email_selectors AS selector
  WHERE selector.workspace_id = workspace.id
);

REVOKE ALL PRIVILEGES ON
  provisional_email_selectors,
  provisional_sessions
FROM coursedesign_runtime;

REVOKE CREATE ON SCHEMA public FROM coursedesign_runtime;
