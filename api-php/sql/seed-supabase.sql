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

-- ============================================================
-- DATOS (equivalente a php sql/seed-local.php, para Supabase).
-- Ejecutar TODO este archivo en el editor SQL de Supabase (base 'postgres').
-- Re-ejecutable: borra y vuelve a insertar.
-- ============================================================

-- Vaciar en orden seguro por claves foraneas.
DELETE FROM audit_log;
DELETE FROM push_devices;
DELETE FROM alerts;
DELETE FROM alert_rules;
DELETE FROM tiles;
DELETE FROM services;
DELETE FROM servers;
DELETE FROM login_codes;
DELETE FROM sessions;
DELETE FROM users;

-- Usuario admin. Contrasena: Sentinela#2026  (hash bcrypt precalculado).
INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES
  ('SNT-4417', 'Juan Fernando', 'jfmp20082@gmail.com', '$2y$10$NyFEqhFVgzVbg3T85JMUwOZvDvd88wPDK/O6PFjN8QNLoXhMfa.xS', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'admin', floor(extract(epoch from now()))::bigint);

-- Este equipo (server.id srv-local). El agente Java lo actualiza al reportar.
INSERT INTO servers (id, hostname, label, os, os_version, location, ip_private, ip_public, ip_visible, tags, agent_version, agent_secret, last_seen, status) VALUES
  ('srv-local', 'este-equipo', 'Este equipo', 'windows', 'Windows', 'Local', '127.0.0.1', NULL, 1,
   '["local","real"]', '1.0.0', 'local-dev-secret-0001', NULL, 'offline');

INSERT INTO services (server_id, name, managed_by, port, critical) VALUES
  ('srv-local', 'Dnscache', 'windows-sc', NULL, 1),
  ('srv-local', 'LanmanServer', 'windows-sc', 445, 1),
  ('srv-local', 'Schedule', 'windows-sc', NULL, 0);

INSERT INTO alert_rules (id, user_id, server_id, metric, op, threshold, for_s, severity, channels) VALUES
  ('rule-cpu',       '*', NULL, 'cpu_pct',          '>', 85, 60,  'warning',  '["lan","push"]'),
  ('rule-cpu-crit',  '*', NULL, 'cpu_pct',          '>', 95, 30,  'critical', '["lan","push","email"]'),
  ('rule-mem',       '*', NULL, 'mem_pct',          '>', 90, 120, 'warning',  '["lan"]'),
  ('rule-disk',      '*', NULL, 'disk_pct',         '>', 88, 300, 'warning',  '["lan","push"]'),
  ('rule-temp',      '*', NULL, 'temp_c',           '>', 78, 60,  'critical', '["lan","push"]'),
  ('rule-intrusion', '*', NULL, 'failed_logins_5m', '>', 25, 0,   'critical', '["lan","push","email"]');

INSERT INTO tiles (id, user_id, kind, title, server_id, metric, w, h, ord, options) VALUES
  ('t1', 'SNT-4417', 'fleet',     'Estado',            NULL,        NULL,       12, 1, 0, '{}'),
  ('t2', 'SNT-4417', 'gauge',     'CPU',               'srv-local', 'cpu_pct',   4, 1, 1, '{}'),
  ('t3', 'SNT-4417', 'gauge',     'Memoria',           'srv-local', 'mem_pct',   4, 1, 2, '{}'),
  ('t4', 'SNT-4417', 'gauge',     'Disco',             'srv-local', 'disk_pct',  4, 1, 3, '{}'),
  ('t5', 'SNT-4417', 'sparkline', 'CPU ultimos 60 s',  'srv-local', 'cpu_pct',   6, 1, 4, '{}'),
  ('t6', 'SNT-4417', 'power',     'Energia',           'srv-local', NULL,        6, 1, 5, '{}'),
  ('t7', 'SNT-4417', 'services',  'Servicios',         'srv-local', NULL,        6, 2, 6, '{}'),
  ('t8', 'SNT-4417', 'alerts',    'Alertas recientes', NULL,        NULL,        6, 2, 7, '{}'),
  ('t9', 'SNT-4417', 'security',  'Seguridad',         'srv-local', NULL,       12, 1, 8, '{}');
