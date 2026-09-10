-- Esquema para PostgreSQL / Supabase. Mismas tablas y columnas que schema.sql,
-- con los tipos de Postgres. Las fechas siguen siendo epoch (BIGINT) y los
-- booleanos siguen siendo 0/1 (INTEGER), para no tocar ni una linea de PHP.
-- Db::migrate() elige este fichero cuando el DSN es pgsql.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret   TEXT,
  role          TEXT NOT NULL DEFAULT 'viewer',
  failed_tries  INTEGER NOT NULL DEFAULT 0,
  locked_until  BIGINT  NOT NULL DEFAULT 0,
  created_at    BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  stage       TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  token       TEXT PRIMARY KEY REFERENCES sessions(token),
  code_hash   TEXT NOT NULL,
  expires_at  BIGINT NOT NULL,
  tries       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS servers (
  id            TEXT PRIMARY KEY,
  hostname      TEXT NOT NULL,
  label         TEXT NOT NULL,
  os            TEXT NOT NULL,
  os_version    TEXT NOT NULL,
  location      TEXT NOT NULL,
  ip_private    TEXT NOT NULL,
  ip_public     TEXT,
  ip_visible    INTEGER NOT NULL DEFAULT 0,
  tags          TEXT NOT NULL DEFAULT '[]',
  agent_version TEXT NOT NULL DEFAULT '-',
  agent_secret  TEXT NOT NULL,
  last_seen     BIGINT,
  status        TEXT NOT NULL DEFAULT 'offline'
);

CREATE TABLE IF NOT EXISTS services (
  server_id   TEXT NOT NULL REFERENCES servers(id),
  name        TEXT NOT NULL,
  managed_by  TEXT NOT NULL,
  port        INTEGER,
  critical    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, name)
);

CREATE TABLE IF NOT EXISTS tiles (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id),
  kind      TEXT NOT NULL,
  title     TEXT NOT NULL,
  server_id TEXT,
  metric    TEXT,
  w         INTEGER NOT NULL DEFAULT 4,
  h         INTEGER NOT NULL DEFAULT 1,
  ord       INTEGER NOT NULL DEFAULT 0,
  options   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  server_id TEXT,
  metric    TEXT NOT NULL,
  op        TEXT NOT NULL DEFAULT '>',
  threshold DOUBLE PRECISION NOT NULL,
  for_s     INTEGER NOT NULL DEFAULT 60,
  severity  TEXT NOT NULL DEFAULT 'warning',
  channels  TEXT NOT NULL DEFAULT '["lan"]',
  enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL,
  severity     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  metric       TEXT NOT NULL,
  message      TEXT NOT NULL,
  value        DOUBLE PRECISION,
  threshold    DOUBLE PRECISION,
  ts           BIGINT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_devices (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  platform   TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action  TEXT NOT NULL,
  detail  TEXT,
  ip      TEXT,
  ts      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);
CREATE INDEX IF NOT EXISTS idx_tiles_user ON tiles(user_id, ord);
