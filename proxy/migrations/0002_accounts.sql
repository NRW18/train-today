-- Optional Google sign-in + backup sync. Stores Google's account id (sub), never the email or name.
CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, sub TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_sub ON sessions(sub);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
CREATE TABLE IF NOT EXISTS sync_blobs (sub TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_limits (k TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(k, day));
CREATE INDEX IF NOT EXISTS auth_limits_day ON auth_limits(day);
