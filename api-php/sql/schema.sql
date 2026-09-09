-- Esquema del panel. SQLite en el prototipo; MySQL/PostgreSQL en produccion
-- (solo cambia el DSN: no se usa SQL propietario).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- identificador unico: SNT-4417
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,               -- password_hash(), Argon2id/bcrypt
  totp_secret   TEXT,                        -- base32; NULL = 2FA no activado
  role          TEXT NOT NULL DEFAULT 'viewer',
  failed_tries  INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  stage       TEXT NOT NULL,                 -- 'pending_2fa' | 'active'
  ip          TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
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
  ip_visible    INTEGER NOT NULL DEFAULT 0,  -- el usuario decide si se muestran
  tags          TEXT NOT NULL DEFAULT '[]',
  agent_version TEXT NOT NULL DEFAULT '-',
  agent_secret  TEXT NOT NULL,               -- HMAC compartido con el agente Java
  last_seen     INTEGER,
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
  -- '*' = regla global de la organizacion; por eso no hay clave foranea aqui.
  user_id   TEXT NOT NULL,
  server_id TEXT,                            -- NULL = aplica a toda la flota
  metric    TEXT NOT NULL,                   -- cpu_pct, mem_pct, disk_pct, temp_c...
  op        TEXT NOT NULL DEFAULT '>',
  threshold REAL NOT NULL,
  for_s     INTEGER NOT NULL DEFAULT 60,     -- histeresis: evita alertas por picos
  severity  TEXT NOT NULL DEFAULT 'warning',
  channels  TEXT NOT NULL DEFAULT '["lan"]', -- lan | push | email
  enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  server_id    TEXT NOT NULL,
  severity     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  metric       TEXT NOT NULL,
  message      TEXT NOT NULL,
  value        REAL,
  threshold    REAL,
  ts           INTEGER NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_devices (
  token      TEXT PRIMARY KEY,               -- APNs / FCM
  user_id    TEXT NOT NULL REFERENCES users(id),
  platform   TEXT NOT NULL,                  -- ios | android
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action  TEXT NOT NULL,
  detail  TEXT,
  ip      TEXT,
  ts      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);
CREATE INDEX IF NOT EXISTS idx_tiles_user ON tiles(user_id, ord);
