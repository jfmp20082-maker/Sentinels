<?php
/**
 * Copia los datos del SQLite local a la base destino (Supabase/Postgres).
 * Opcional: si prefieres empezar de cero, corre `php sql/seed-local.php` con
 * SENTINELA_DSN apuntando a Supabase y ya. Esto es para conservar lo que tengas.
 *
 * Uso (PowerShell):
 *   $env:SENTINELA_DSN="postgresql://postgres:TU_PASS@db.xxxx.supabase.co:5432/postgres"
 *   php sql/migrate-to-pg.php
 */
require_once __DIR__ . '/../src/Db.php';

$dsn = getenv('SENTINELA_DSN');
if (!$dsn) {
    fwrite(STDERR, "Define SENTINELA_DSN con tu conexion de Supabase antes de correr esto.\n");
    exit(1);
}

$sqliteFile = __DIR__ . '/../data/sentinela.sqlite';
if (!file_exists($sqliteFile)) {
    fwrite(STDERR, "No existe el SQLite de origen: $sqliteFile\n");
    exit(1);
}

$src = new PDO('sqlite:' . $sqliteFile);
$src->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

echo "==> Creando el esquema en el destino (" . Db::driver() . ")\n";
Db::migrate();
$dst = Db::conn();

// Padres antes que hijos al insertar; al vaciar, al reves.
$order = array('users', 'servers', 'services', 'sessions', 'login_codes',
               'tiles', 'alert_rules', 'alerts', 'push_devices', 'audit_log');

echo "==> Vaciando el destino\n";
foreach (array_reverse($order) as $t) {
    $dst->exec('DELETE FROM ' . $t);
}

echo "==> Copiando filas\n";
$total = 0;
foreach ($order as $t) {
    $rows = $src->query('SELECT * FROM ' . $t)->fetchAll();
    if (!$rows) {
        echo "   $t: 0\n";
        continue;
    }
    $cols = array_keys($rows[0]);
    // audit_log.id es autonumerico en el destino: dejar que lo asigne solo.
    if ($t === 'audit_log') {
        $cols = array_values(array_filter($cols, function ($c) { return $c !== 'id'; }));
    }
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $st = $dst->prepare('INSERT INTO ' . $t . ' (' . implode(',', $cols) . ") VALUES ($ph)");
    foreach ($rows as $r) {
        $st->execute(array_map(function ($c) use ($r) { return $r[$c]; }, $cols));
    }
    echo '   ' . $t . ': ' . count($rows) . "\n";
    $total += count($rows);
}
echo "Listo. $total filas copiadas al destino.\n";
