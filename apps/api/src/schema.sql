CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, status text NOT NULL CHECK(status IN ('active','suspended','withdrawn')),
 operator boolean NOT NULL DEFAULT false, age_attested_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identities (
 provider text NOT NULL CHECK(provider IN ('google','github')), subject text NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
);
CREATE TABLE IF NOT EXISTS web_sessions (
 hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), csrf text NOT NULL, expires_at timestamptz NOT NULL,
 reauth_at timestamptz NOT NULL DEFAULT now(), reauth_provider text NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
 hash text PRIMARY KEY, provider text NOT NULL, intent text NOT NULL, user_id uuid REFERENCES users(id), session_hash text,
 verifier text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollment_proofs (hash text PRIMARY KEY, provider text NOT NULL, subject text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS developers (user_id uuid PRIMARY KEY REFERENCES users(id), status text NOT NULL CHECK(status IN ('approved','revoked')));
CREATE TABLE IF NOT EXISTS developer_applications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), display_name text NOT NULL, email text NOT NULL, description text NOT NULL,
 status text NOT NULL, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_application ON developer_applications(user_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS apps (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, published boolean NOT NULL DEFAULT false,
 availability text NOT NULL DEFAULT 'allowed' CHECK(availability IN ('allowed','normal_suspended','emergency_suspended')),
 current_version_id uuid, revision integer NOT NULL DEFAULT 0, closure text NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS versions (
 id uuid PRIMARY KEY, app_id uuid NOT NULL REFERENCES apps(id), version text NOT NULL, manifest jsonb NOT NULL,
 hash text NOT NULL, consent_hash text NOT NULL, validation_status text NOT NULL DEFAULT 'pending', review_status text NOT NULL DEFAULT 'not_submitted',
 reason text NOT NULL DEFAULT '', validation_error text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(app_id,version)
);
CREATE TABLE IF NOT EXISTS bundle_jobs (
 id uuid PRIMARY KEY, version_id uuid NOT NULL UNIQUE REFERENCES versions(id), status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, revision integer NOT NULL DEFAULT 0, error text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS my_apps (user_id uuid NOT NULL REFERENCES users(id), app_id uuid NOT NULL REFERENCES apps(id), PRIMARY KEY(user_id,app_id));
CREATE TABLE IF NOT EXISTS app_users (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), app_id uuid NOT NULL REFERENCES apps(id), UNIQUE(user_id,app_id));
CREATE TABLE IF NOT EXISTS consents (user_id uuid NOT NULL REFERENCES users(id), app_id uuid NOT NULL REFERENCES apps(id), fingerprint text NOT NULL, revoked_at timestamptz, PRIMARY KEY(user_id,app_id));
CREATE TABLE IF NOT EXISTS app_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), web_hash text NOT NULL, app_id uuid NOT NULL REFERENCES apps(id),
 app_user_id uuid NOT NULL REFERENCES app_users(id), version_id uuid NOT NULL REFERENCES versions(id), fingerprint text NOT NULL,
 status text NOT NULL DEFAULT 'active', expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_codes (hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES app_sessions(id), challenge text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS app_tokens (hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES app_sessions(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS app_credentials (app_id uuid PRIMARY KEY REFERENCES apps(id), hash text NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), app_id uuid NOT NULL REFERENCES apps(id), reason text NOT NULL, status text NOT NULL DEFAULT 'pending', resolution text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS withdrawals (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id), secret_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, platform_status text NOT NULL DEFAULT 'queued');
CREATE TABLE IF NOT EXISTS deletion_requests (id uuid PRIMARY KEY, withdrawal_id uuid NOT NULL REFERENCES withdrawals(id), app_id uuid NOT NULL REFERENCES apps(id), app_user_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending', note text NOT NULL DEFAULT '', UNIQUE(withdrawal_id,app_id));
CREATE TABLE IF NOT EXISTS audit_events (id uuid PRIMARY KEY, actor_id uuid, action text NOT NULL, target_id text, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS native_challenge text;
ALTER TABLE enrollment_proofs ADD COLUMN IF NOT EXISTS native_challenge text;
CREATE TABLE IF NOT EXISTS native_codes (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),provider text NOT NULL,challenge text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS native_bootstraps (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),provider text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency_results (user_id uuid NOT NULL,key text NOT NULL,signature text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS native_starts (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),session_hash text NOT NULL,provider text NOT NULL,intent text NOT NULL,challenge text NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE native_codes ADD COLUMN IF NOT EXISTS provider_subject text;
ALTER TABLE native_codes ADD COLUMN IF NOT EXISTS source_session text;
ALTER TABLE native_bootstraps ADD COLUMN IF NOT EXISTS provider_subject text;
ALTER TABLE native_bootstraps ADD COLUMN IF NOT EXISTS source_session text;
CREATE TABLE IF NOT EXISTS withdrawal_receipts(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),secret_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_user_id_app_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_mode_unique ON app_users(user_id,app_id,is_preview);
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;
ALTER TABLE deletion_requests DROP CONSTRAINT IF EXISTS deletion_requests_withdrawal_id_app_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS deletion_request_app_user_unique ON deletion_requests(withdrawal_id,app_user_id);
CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions(user_id,status);
CREATE INDEX IF NOT EXISTS app_sessions_app ON app_sessions(app_id,status);
CREATE INDEX IF NOT EXISTS versions_app ON versions(app_id);
ALTER TABLE versions ADD COLUMN IF NOT EXISTS asset_revision integer;
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS reason text;
UPDATE developers d SET reason=COALESCE((SELECT e.detail->>'reason' FROM audit_events e
 WHERE e.action='developer.revoked' AND e.target_id=d.user_id::text
 ORDER BY e.created_at DESC,e.id DESC LIMIT 1),'') WHERE d.status='revoked' AND d.reason IS NULL;
UPDATE developers SET reason='' WHERE reason IS NULL;
ALTER TABLE developers ALTER COLUMN reason SET DEFAULT '';
ALTER TABLE developers ALTER COLUMN reason SET NOT NULL;
-- Verified email credentials share the existing identity/session model.
ALTER TABLE identities DROP CONSTRAINT IF EXISTS identities_provider_check;
ALTER TABLE identities ADD CONSTRAINT identities_provider_check CHECK(provider IN ('google','github','email'));
CREATE TABLE IF NOT EXISTS email_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id), password_hash text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(), changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_challenges (
 hash text PRIMARY KEY, purpose text NOT NULL CHECK(purpose IN ('signup','link','reset')),
 email text NOT NULL, user_id uuid REFERENCES users(id), source_session text,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS email_challenges_user ON email_challenges(user_id);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_spaces (
 app_user_id uuid PRIMARY KEY REFERENCES app_users(id), generation uuid NOT NULL,
 used_bytes integer NOT NULL DEFAULT 0 CHECK(used_bytes>=0),
 window_started_at timestamptz NOT NULL DEFAULT now(), requests integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cloud_records (
 app_user_id uuid NOT NULL REFERENCES cloud_spaces(app_user_id) ON DELETE CASCADE,
 key text NOT NULL, value jsonb, revision integer NOT NULL CHECK(revision>0),
 schema_version integer NOT NULL DEFAULT 1, bytes integer NOT NULL DEFAULT 0 CHECK(bytes>=0),
 deleted boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(app_user_id,key)
);
CREATE TABLE IF NOT EXISTS cloud_receipts (
 app_user_id uuid NOT NULL REFERENCES cloud_spaces(app_user_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, signature text NOT NULL, result jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 PRIMARY KEY(app_user_id,request_id)
);
