    CREATE SCHEMA incident_management;

REVOKE ALL ON SCHEMA incident_management FROM PUBLIC;

CREATE TABLE incident_management.archived_reports (
    report_type text NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'aging')),
    report_id text NOT NULL CHECK (report_id <> ''),
    period text NOT NULL,
    title text NOT NULL,
    saved_at timestamptz NOT NULL,
    source_order integer NOT NULL CHECK (source_order > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (report_type, report_id),
    UNIQUE (report_type, source_order)
);

CREATE INDEX archived_reports_saved_at_idx
    ON incident_management.archived_reports (report_type, saved_at DESC);

CREATE TABLE incident_management.published_reports (
    report_type text NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'aging')),
    report_id text NOT NULL CHECK (report_id <> ''),
    period text NOT NULL,
    title text NOT NULL,
    saved_at timestamptz NOT NULL,
    server_saved_at timestamptz,
    source_order integer NOT NULL CHECK (source_order > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (report_type, report_id),
    UNIQUE (report_type, source_order)
);

CREATE INDEX published_reports_period_idx
    ON incident_management.published_reports (report_type, period);

CREATE TABLE incident_management.incident_assignments (
    request_id text PRIMARY KEY CHECK (request_id <> ''),
    department text NOT NULL,
    responsible_or_dependency text NOT NULL,
    recent_update text,
    updated_at timestamptz NOT NULL,
    updated_by text NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE incident_management.department_mappings (
    department text PRIMARY KEY,
    allowed_teams jsonb NOT NULL CHECK (jsonb_typeof(allowed_teams) = 'array'),
    is_override boolean NOT NULL
);

CREATE TABLE incident_management.ir_analytics_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    server_saved_at timestamptz,
    metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE incident_management.ir_import_batches (
    batch_id text PRIMARY KEY CHECK (batch_id <> ''),
    imported_at timestamptz NOT NULL,
    source_order integer NOT NULL UNIQUE CHECK (source_order > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE incident_management.ir_tickets (
    row_key text PRIMARY KEY CHECK (row_key <> ''),
    batch_id text NOT NULL REFERENCES incident_management.ir_import_batches (batch_id),
    ir_id text NOT NULL,
    ticket_id text NOT NULL,
    status_category text NOT NULL,
    source_order integer NOT NULL UNIQUE CHECK (source_order > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX ir_tickets_batch_idx ON incident_management.ir_tickets (batch_id);
CREATE INDEX ir_tickets_ir_id_idx ON incident_management.ir_tickets (ir_id);
CREATE INDEX ir_tickets_ticket_id_idx ON incident_management.ir_tickets (ticket_id);

CREATE TABLE incident_management.accounts (
    account_id text PRIMARY KEY,
    username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,64}$'),
    display_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'super-admin'))
);

CREATE UNIQUE INDEX accounts_super_admin_idx
    ON incident_management.accounts (role) WHERE role = 'super-admin';

CREATE TABLE incident_management.account_credentials (
    account_id text PRIMARY KEY REFERENCES incident_management.accounts (account_id) ON DELETE CASCADE,
    password_salt text NOT NULL CHECK (password_salt ~ '^[0-9a-f]{32}$'),
    password_hash text NOT NULL CHECK (password_hash ~ '^[0-9a-f]{128}$'),
    session_key text NOT NULL CHECK (session_key ~ '^[0-9a-f]{64}$')
);

CREATE TABLE incident_management.audit_events (
    event_id text PRIMARY KEY,
    occurred_at timestamptz NOT NULL,
    action text NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
    actor_username text,
    target_type text NOT NULL,
    target_id text,
    source_order integer NOT NULL UNIQUE CHECK (source_order > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX audit_events_recent_idx
    ON incident_management.audit_events (occurred_at DESC, source_order DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA incident_management FROM PUBLIC;
