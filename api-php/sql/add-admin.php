<?php
/**
 * Agrega un administrador SIN borrar los usuarios existentes (a diferencia de
 * seed.php / seed-local.php). La contrasena no se escribe en ningun archivo: se
 * lee de una variable de entorno y se guarda solo su hash.
 *
 * Uso (PowerShell):
 *   $env:ADMIN_EMAIL='correo@dominio.com'; $env:ADMIN_NAME='Nombre'
 *   $env:ADMIN_PASSWORD='...'; php sql/add-admin.php
 *
 * El segundo factor en modo real llega por correo (ver mail.local.php); se genera
 * ademas un secreto TOTP propio para el modo demo / autenticador.
 */
require_once __DIR__ . '/../src/Db.php';
require_once __DIR__ . '/../src/Totp.php';

$email = trim((string) getenv('ADMIN_EMAIL'));
$name = trim((string) getenv('ADMIN_NAME'));
$password = (string) getenv('ADMIN_PASSWORD');
if ($email === '' || $password === '') {
    fwrite(STDERR, "Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD.\n");
    exit(1);
}
if ($name === '') {
    $name = $email;
}

Db::migrate();

/** Copia el tablero de otro admin al usuario dado, si este aun no tiene mosaicos. */
function copiarTablero($destino)
{
    if (Db::one('SELECT 1 FROM tiles WHERE user_id = ?', array($destino))) {
        return 0;
    }
    $origen = Db::one("SELECT u.id FROM users u JOIN tiles t ON t.user_id = u.id WHERE u.role = 'admin' AND u.id <> ? GROUP BY u.id ORDER BY MIN(u.created_at) LIMIT 1", array($destino));
    if (!$origen) {
        return 0;
    }
    $n = 0;
    foreach (Db::all('SELECT * FROM tiles WHERE user_id = ? ORDER BY ord', array($origen['id'])) as $t) {
        Db::run('INSERT INTO tiles (id, user_id, kind, title, server_id, metric, w, h, ord, options) VALUES (?,?,?,?,?,?,?,?,?,?)',
            array($destino . '-' . $t['id'], $destino, $t['kind'], $t['title'], $t['server_id'], $t['metric'], $t['w'], $t['h'], $t['ord'], $t['options']));
        $n++;
    }
    return $n;
}

$existente = Db::one('SELECT id FROM users WHERE email = ?', array($email));
if ($existente) {
    // Ya existe: no se toca la cuenta, solo se completa el tablero si esta vacio.
    $n = copiarTablero($existente['id']);
    echo "Ya existia " . $existente['id'] . " ($email); cuenta intacta, mosaicos copiados: $n
";
    exit(0);
}

// Siguiente identificador libre: SNT-<n>, sin chocar con los existentes.
do {
    $id = 'SNT-' . random_int(1000, 9999);
} while (Db::one('SELECT 1 FROM users WHERE id = ?', array($id)));

$secret = Totp::generateSecret();
Db::run(
    'INSERT INTO users (id, name, email, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?,?,?)',
    array($id, $name, $email, password_hash($password, PASSWORD_DEFAULT), $secret, 'admin', time())
);
$n = copiarTablero($id);

echo "Administrador creado
  Identificador: $id
  Correo       : $email
  TOTP         : $secret
  Mosaicos     : $n
";
