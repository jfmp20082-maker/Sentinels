<?php
/**
 * Semilla del MODO REAL. A diferencia de seed.php (6 servidores ficticios para
 * la demo), aqui hay UN solo servidor: la maquina que ejecuta esto. El agente
 * Java lee sus metricas reales (CPU, memoria, discos...) y las manda al gateway.
 *
 * Ejecutar:  php sql/seed-local.php
 * El secreto del agente es FIJO y conocido a proposito, para que agent.properties
 * funcione sin copiar nada de la base. Es una conveniencia de desarrollo local;
 * en un despliegue real cada agente lleva su secreto aleatorio (ver seed.php).
 */
require_once __DIR__ . '/../src/Db.php';
require_once __DIR__ . '/../src/Totp.php';

Db::migrate();
$pdo = Db::conn();
foreach (array('audit_log', 'push_devices', 'alerts', 'alert_rules', 'tiles', 'services', 'servers', 'login_codes', 'sessions', 'users') as $t) {
    $pdo->exec('DELETE FROM ' . $t);
}

$now = time();

// Mismo usuario que la demo.
$userId = 'SNT-4417';
$secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
// Correo del admin (destino del codigo 2FA). Se toma de una variable para no
// dejar un correo real en el repo; el valor por defecto es neutro. Para que el
// codigo llegue a tu bandeja, define SENTINELA_ADMIN_EMAIL antes de sembrar.
$adminEmail = getenv('SENTINELA_ADMIN_EMAIL') ?: 'admin@novara.local';
Db::run(
    'INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?,?,?)',
    array($userId, 'Juan Fernando', $adminEmail, password_hash('Sentinela#2026', PASSWORD_DEFAULT), $secret, 'admin', $now)
);

// El unico servidor: este equipo. Datos administrativos tomados del propio host.
$serverId = 'srv-local';
$agentSecret = 'local-dev-secret-0001';   // debe coincidir con agent-java/agent.properties
$hostname = gethostname() ?: 'localhost';
$osFamily = strtolower(PHP_OS_FAMILY);     // windows / linux / darwin
$os = $osFamily === 'darwin' ? 'macos' : ($osFamily === 'windows' ? 'windows' : 'linux');
$osVersion = php_uname('s') . ' ' . php_uname('r');

Db::run(
    'INSERT INTO servers (id, hostname, label, os, os_version, location, ip_private, ip_public, ip_visible, tags, agent_version, agent_secret, last_seen, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    array($serverId, $hostname, 'Este equipo', $os, $osVersion, 'Local', '127.0.0.1', null, 1,
          json_encode(array('local', 'real')), '1.0.0', $agentSecret, null, 'offline')
);

// Servicios vigilados: los que agent.properties pide medir en este equipo.
$svc = $os === 'windows'
    ? array(array('Dnscache', 'windows-sc', null, 1), array('LanmanServer', 'windows-sc', 445, 1), array('Schedule', 'windows-sc', null, 0))
    : array(array('cron', 'systemd', null, 1), array('ssh', 'systemd', 22, 1));
foreach ($svc as $s) {
    Db::run('INSERT INTO services (server_id, name, managed_by, port, critical) VALUES (?,?,?,?,?)',
        array($serverId, $s[0], $s[1], $s[2], $s[3]));
}

// Mismas reglas de alerta por defecto que la demo.
$rules = array(
    array('rule-cpu', '*', null, 'cpu_pct', '>', 85, 60, 'warning', '["lan","push"]'),
    array('rule-cpu-crit', '*', null, 'cpu_pct', '>', 95, 30, 'critical', '["lan","push","email"]'),
    array('rule-mem', '*', null, 'mem_pct', '>', 90, 120, 'warning', '["lan"]'),
    array('rule-disk', '*', null, 'disk_pct', '>', 88, 300, 'warning', '["lan","push"]'),
    array('rule-temp', '*', null, 'temp_c', '>', 78, 60, 'critical', '["lan","push"]'),
    array('rule-intrusion', '*', null, 'failed_logins_5m', '>', 25, 0, 'critical', '["lan","push","email"]'),
);
foreach ($rules as $r) {
    Db::run('INSERT INTO alert_rules (id, user_id, server_id, metric, op, threshold, for_s, severity, channels) VALUES (?,?,?,?,?,?,?,?,?)', $r);
}

// Tablero enfocado en este equipo: medidores de CPU, memoria y disco reales.
$tiles = array(
    array('t1', 'fleet', 'Estado', null, null, 12, 1),
    array('t2', 'gauge', 'CPU', $serverId, 'cpu_pct', 4, 1),
    array('t3', 'gauge', 'Memoria', $serverId, 'mem_pct', 4, 1),
    array('t4', 'gauge', 'Disco', $serverId, 'disk_pct', 4, 1),
    array('t5', 'sparkline', 'CPU ultimos 60 s', $serverId, 'cpu_pct', 6, 1),
    array('t6', 'power', 'Energia', $serverId, null, 6, 1),
    array('t7', 'services', 'Servicios', $serverId, null, 6, 2),
    array('t8', 'alerts', 'Alertas recientes', null, null, 6, 2),
    array('t9', 'security', 'Seguridad', $serverId, null, 12, 1),
);
$i = 0;
foreach ($tiles as $t) {
    Db::run('INSERT INTO tiles (id, user_id, kind, title, server_id, metric, w, h, ord, options) VALUES (?,?,?,?,?,?,?,?,?,?)',
        array($t[0], $userId, $t[1], $t[2], $t[3], $t[4], $t[5], $t[6], $i++, '{}'));
}

echo "Semilla local lista.\n";
echo "  Equipo   : $hostname ($os, $osVersion)\n";
echo "  server.id: $serverId   agent.secret: $agentSecret\n";
echo "  Usuario  : $userId  /  Sentinela#2026   TOTP: $secret\n";
echo "  Codigo valido ahora: " . Totp::at($secret, (int) floor(time() / 30)) . "\n";
