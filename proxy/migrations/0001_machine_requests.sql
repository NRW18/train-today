-- Anonymous daily counters; no photographs, IPs or typed personal text.
CREATE TABLE IF NOT EXISTS machine_requests (name TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0), PRIMARY KEY(name, day));
CREATE INDEX IF NOT EXISTS machine_requests_day ON machine_requests(day);
CREATE TABLE IF NOT EXISTS machine_request_limits (anon TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0), PRIMARY KEY(anon, day));
CREATE INDEX IF NOT EXISTS machine_request_limits_day ON machine_request_limits(day);
