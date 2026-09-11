<?php
/**
 * Prueba de conexion a la base. Uso:
 *   $env:SENTINELA_DSN="postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres"
 *   php api-php/test-conexion.php
 * Solo lee (cuenta filas); no escribe nada.
 */
require __DIR__ . '/src/Db.php';
try {
    $driver = Db::driver();
    echo "Conexion OK. Motor: $driver\n";
    foreach (array('users', 'servers', 'services', 'tiles', 'alert_rules', 'alerts') as $t) {
        $c = Db::one("SELECT COUNT(*) AS c FROM $t")['c'];
        echo "  $t: $c filas\n";
    }
    echo "Todo bien: la base responde.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "FALLO la conexion:\n  " . $e->getMessage() . "\n");
    fwrite(STDERR, "Revisa: host correcto, puerto 5432, y la contrasena bien escrita (si tiene @ escribela como %40).\n");
    exit(1);
}
