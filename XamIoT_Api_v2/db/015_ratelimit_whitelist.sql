-- Migration 015 : add ip_whitelist to rate_limit_config
ALTER TABLE rate_limit_config ADD COLUMN IF NOT EXISTS ip_whitelist TEXT DEFAULT '';
