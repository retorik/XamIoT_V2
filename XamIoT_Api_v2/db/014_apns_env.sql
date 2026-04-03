-- Migration 014 : replace use_sandbox boolean with apns_env text ('sandbox' | 'production' | 'both')
ALTER TABLE apns_config ADD COLUMN IF NOT EXISTS apns_env TEXT DEFAULT 'sandbox';

UPDATE apns_config SET apns_env = CASE
  WHEN use_sandbox IS TRUE  THEN 'sandbox'
  WHEN use_sandbox IS FALSE THEN 'production'
  ELSE 'sandbox'
END;

ALTER TABLE apns_config DROP COLUMN IF EXISTS use_sandbox;
