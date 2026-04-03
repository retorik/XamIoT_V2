CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,        -- ex: 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'
  resource_type text NOT NULL, -- ex: 'page', 'product', 'user', 'media', 'ticket', 'config'
  resource_id text,            -- UUID ou identifiant de la ressource
  details jsonb,               -- payload avant/après ou infos supplémentaires
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
