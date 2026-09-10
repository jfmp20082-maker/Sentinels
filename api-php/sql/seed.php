<?php
/**
 * Datos de demostracion. Ejecutar:  php sql/seed.php
 * Crea 1 usuario admin con 2FA, 6 servidores, sus servicios, reglas y mosaicos.
 */
require_once __DIR__ . '/../src/Db.php';
require_once __DIR__ . '/../src/Totp.php';

Db::migrate();
$pdo = Db::conn();
foreach (array('audit_log', 'push_devices', 'alerts', 'alert_rules', 'tiles', 'services', 'servers', 'login_codes', 'sessions', 'users') as $t) {
    $pdo->exec('DELETE FROM ' . $t);
}

$now = time();
$userId = 'SNT-4417';
// Secreto TOTP fijo SOLO para la demo: asi el codigo es reproducible.
$secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
Db::run(
    'INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?,?,?)',
    array($userId, 'Juan Fernando', 'admin@sentinela.mx', password_hash('Sentinela#2026', PASSWORD_DEFAULT), $secret, 'admin', $now)
);
Db::run(
    'INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?,?,?)',
    array('SNT-9002', 'Operador NOC', 'noc@sentinela.mx', password_hash('Noc#2026', PASSWORD_DEFAULT), null, 'operator', $now)
);
// Rol de solo lectura: existe para que el 403 de PATCH /api/servers sea un
// camino que alguien recorre de verdad, no una rama de codigo sin ejercer.
Db::run(
    'INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?,?,?)',
    array('SNT-7003', 'Auditor Lectura', 'lectura@sentinela.mx', password_hash('Lectura#2026', PASSWORD_DEFAULT), null, 'viewer', $now)
);

$servers = array(
    // id, hostname, label, os, version, sitio, ip privada, ip publica, visible, tags
    array('srv-core-01', 'core01.mx-qro', 'Core API 01', 'linux', 'Debian 12', 'Queretaro / Rack A3', '10.20.4.11', '189.203.11.4', 1, array('produccion', 'api')),
    array('srv-core-02', 'core02.mx-qro', 'Core API 02', 'linux', 'Debian 12', 'Queretaro / Rack A3', '10.20.4.12', '189.203.11.5', 0, array('produccion', 'api')),
    array('srv-db-01', 'db01.mx-qro', 'PostgreSQL Primario', 'linux', 'Ubuntu 24.04', 'Queretaro / Rack B1', '10.20.5.20', null, 0, array('produccion', 'datos')),
    array('srv-win-01', 'win01.mx-cdmx', 'File Server Corp', 'windows', 'Server 2022', 'CDMX / Oficina', '10.30.1.8', null, 1, array('corporativo')),
    array('srv-build-01', 'build01.mx-cdmx', 'Build & CI', 'macos', 'macOS 15', 'CDMX / Laboratorio', '10.30.2.40', null, 1, array('ci', 'apple')),
    array('srv-edge-01', 'edge01.us-dal', 'Edge / CDN Dallas', 'linux', 'Alpine 3.20', 'Dallas / Equinix', '10.50.0.3', '23.129.64.7', 0, array('borde', 'cdn')),
);
foreach ($servers as $s) {
    Db::run(
        'INSERT INTO servers (id, hostname, label, os, os_version, location, ip_private, ip_public, ip_visible, tags, agent_version, agent_secret, last_seen, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        array($s[0], $s[1], $s[2], $s[3], $s[4], $s[5], $s[6], $s[7], $s[8], json_encode($s[9]), '1.0.0', bin2hex(random_bytes(16)), $now - 5, 'ok')
    );
}

$services = array(
    array('srv-core-01', 'nginx', 'systemd', 443, 1),
    array('srv-core-01', 'sentinela-api', 'systemd', 8080, 1),
    array('srv-core-01', 'redis', 'systemd', 6379, 0),
    array('srv-core-02', 'nginx', 'systemd', 443, 1),
    array('srv-core-02', 'sentinela-api', 'systemd', 8080, 1),
    array('srv-db-01', 'postgresql', 'systemd', 5432, 1),
    array('srv-db-01', 'pgbouncer', 'systemd', 6432, 1),
    array('srv-db-01', 'barman', 'systemd', null, 0),
    array('srv-win-01', 'LanmanServer', 'windows-sc', 445, 1),
    array('srv-win-01', 'MSSQLSERVER', 'windows-sc', 1433, 1),
    array('srv-win-01', 'W32Time', 'windows-sc', null, 0),
    array('srv-build-01', 'com.sentinela.runner', 'launchd', null, 1),
    array('srv-build-01', 'docker', 'docker', 2375, 0),
    array('srv-edge-01', 'haproxy', 'systemd', 80, 1),
    array('srv-edge-01', 'varnish', 'systemd', 6081, 0),
);
foreach ($services as $s) {
    Db::run('INSERT INTO services (server_id, name, managed_by, port, critical) VALUES (?,?,?,?,?)', $s);
}

$rules = array(
    array('rule-cpu', '*', null, 'cpu_pct', '>', 85, 60, 'warning', '["lan","push"]'),
    array('rule-cpu-crit', '*', null, 'cpu_pct', '>', 95, 30, 'critical', '["lan","push","email"]'),
    array('rule-mem', '*', null, 'mem_pct', '>', 90, 120, 'warning', '["lan"]'),
    array('rule-disk', '*', null, 'disk_pct', '>', 88, 300, 'warning', '["lan","push"]'),
    array('rule-temp', '*', null, 'temp_c', '>', 78, 60, 'critical', '["lan","push"]'),
    array('rule-intrusion', '*', null, 'failed_logins_5m', '>', 25, 0, 'critical', '["lan","push","email"]'),
);
foreach ($rules as $r) {
    Db::run(
        'INSERT INTO alert_rules (id, user_id, server_id, metric, op, threshold, for_s, severity, channels) VALUES (?,?,?,?,?,?,?,?,?)',
        $r
    );
}

// Mosaico inicial del admin: el usuario lo reordena y edita desde la UI.
$tiles = array(
    array('t1', 'fleet', 'Estado de la flota', null, null, 12, 1),
    array('t2', 'gauge', 'CPU Core API 01', 'srv-core-01', 'cpu_pct', 3, 1),
    array('t3', 'gauge', 'Memoria PostgreSQL', 'srv-db-01', 'mem_pct', 3, 1),
    array('t4', 'gauge', 'Disco File Server', 'srv-win-01', 'disk_pct', 3, 1),
    array('t5', 'power', 'Energia y UPS', null, null, 3, 1),
    array('t6', 'sparkline', 'CPU ultimos 60 s', 'srv-core-01', 'cpu_pct', 6, 1),
    array('t7', 'security', 'Intentos de vulneracion', null, null, 6, 1),
    array('t8', 'services', 'Servicios criticos', 'srv-db-01', null, 6, 2),
    array('t9', 'alerts', 'Alertas recientes', null, null, 6, 2),
);
$i = 0;
foreach ($tiles as $t) {
    Db::run(
        'INSERT INTO tiles (id, user_id, kind, title, server_id, metric, w, h, ord, options) VALUES (?,?,?,?,?,?,?,?,?,?)',
        array($t[0], $userId, $t[1], $t[2], $t[3], $t[4], $t[5], $t[6], $i++, '{}')
    );
}

echo "Semilla lista.\n";
echo "  Usuario : $userId  /  admin@sentinela.mx\n";
echo "  Password: Sentinela#2026\n";
echo "  TOTP    : $secret\n";
echo "  Codigo valido ahora: " . Totp::at($secret, (int) floor(time() / 30)) . "\n";
echo "  Servidores: " . count($servers) . ", servicios: " . count($services) . ", mosaicos: " . count($tiles) . "\n";
