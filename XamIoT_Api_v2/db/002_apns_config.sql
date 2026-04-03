CREATE TABLE IF NOT EXISTS apns_config (
  id          integer PRIMARY KEY DEFAULT 1,
  team_id     text NOT NULL,
  key_id      text NOT NULL,
  bundle_id   text NOT NULL,
  key_pem     text NOT NULL,
  use_sandbox boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);
