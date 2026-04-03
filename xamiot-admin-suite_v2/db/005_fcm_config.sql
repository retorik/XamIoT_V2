-- db/005_fcm_config.sql
-- Configuration FCM (Firebase Cloud Messaging) stockée en DB

CREATE TABLE IF NOT EXISTS fcm_config (
  id                   integer     PRIMARY KEY DEFAULT 1,
  project_id           text        NOT NULL,
  client_email         text        NOT NULL,
  service_account_json jsonb       NOT NULL,
  updated_at           timestamptz DEFAULT now()
);
