<?php
/**
 * Novara - API de panel (PHP).
 * Responsabilidad: identidad, 2FA, catalogo de servidores, configuracion de
 * mosaicos, reglas de alerta e historico. NO toca el tiempo real: eso es del
 * gateway Node. Arrancar con:  php -S 127.0.0.1:8080 -t public
 */

require_once __DIR__ . '/../src/Db.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Router.php';
require_once __DIR__ . '/../src/Totp.php';

// CORS solo para el dev server de Vite; en produccion todo sale del mismo origen.
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (preg_match('#^http://(localhost|127\.0\.0\.1):\d+$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

Db::migrate();

/** Exige sesion activa; corta con 401 si no la hay. @return array<string,mixed> */
function requireUser()
{
    $user = Auth::currentUser(Http::bearer());
    if (!$user) {
        Http::json(array('error' => 'unauthorized'), 401);
        exit;
    }
    return $user;
}

/** El gateway Node se autentica con un secreto de servicio, no con sesion. */
function requireService()
{
    // Sin valor por defecto a proposito: un default funcional aqui filtraria los
    // secretos HMAC de todos los agentes a quien conociera el valor del codigo.
    // Si la variable no esta definida, los endpoints internos NO funcionan;
    // asi un despliegue que la olvide falla en vez de quedar abierto. El
    // servidor PHP procesa por peticion (no hay "arranque" donde abortar), asi
    // que la negativa es 503 aqui y no una caida al inicio.
    $expected = getenv('SENTINELA_SERVICE_TOKEN');
    if ($expected === false || $expected === '') {
        Http::json(array('error' => 'service_token_no_configurado'), 503);
        exit;
    }
    if (!hash_equals($expected, (string) Http::bearer())) {
        Http::json(array('error' => 'forbidden'), 403);
        exit;
    }
}

function rowToServer(array $r)
{
    $visible = (int) $r['ip_visible'] === 1;
    return array(
        'id' => $r['id'],
        'hostname' => $r['hostname'],
        'label' => $r['label'],
        'os' => $r['os'],
        'os_version' => $r['os_version'],
        'location' => $r['location'],
        // Si el usuario oculto las IP el backend NO las envia: enmascararlas en
        // el cliente seria teatro, seguirian viajando en el JSON.
        'ip_private' => $visible ? $r['ip_private'] : null,
        'ip_public' => $visible ? $r['ip_public'] : null,
        'ip_visible' => $visible,
        'tags' => json_decode($r['tags'], true) ?: array(),
        'agent_version' => $r['agent_version'],
        'last_seen' => $r['last_seen'] !== null ? (int) $r['last_seen'] * 1000 : null,
        'status' => $r['status'],
    );
}

$router = new Router();

// ------------------------------------------------------------------- salud
$router->get('/api/health', function () {
    return Http::json(array('ok' => true, 'service' => 'api-php', 'php' => PHP_VERSION, 'ts' => time() * 1000));
});

// -------------------------------------------------------------------- auth
$router->post('/api/auth/login', function () {
    $b = Http::body();
    $res = Auth::login((string) (isset($b['id']) ? $b['id'] : ''), (string) (isset($b['password']) ? $b['password'] : ''));
    return Http::json($res, isset($res['error']) ? 401 : 200);
});

$router->post('/api/auth/2fa', function () {
    $b = Http::body();
    $res = Auth::verifyLoginCode((string) (isset($b['token']) ? $b['token'] : ''), (string) (isset($b['code']) ? $b['code'] : ''));
    return Http::json($res, isset($res['error']) ? 401 : 200);
});

/** Reenvia el codigo de acceso al correo del usuario del token intermedio. */
$router->post('/api/auth/resend', function () {
    $b = Http::body();
    $res = Auth::resendLoginCode((string) (isset($b['token']) ? $b['token'] : ''));
    return Http::json($res, isset($res['error']) ? 401 : 200);
});

/**
 * SOLO respaldo de desarrollo. Devuelve el ultimo codigo de acceso cuando NO
 * hay SMTP configurado, para poder probar el login sin enviar correos. En
 * cuanto configuras Gmail deja de existir: el codigo solo va al correo.
 */
$router->get('/api/dev/last-code', function () {
    if (Mailer::configured()) {
        return Http::json(array('error' => 'not_found'), 404);
    }
    $code = Auth::lastDevCode();
    return $code ? Http::json(array('code' => $code)) : Http::json(array('error' => 'sin_codigo'), 404);
});

$router->post('/api/auth/logout', function () {
    Auth::logout(Http::bearer());
    return Http::json(array('ok' => true));
});

$router->get('/api/me', function () {
    return Http::json(requireUser());
});

/** Alta de 2FA: devuelve secreto + URI otpauth para pintar el QR. */
$router->post('/api/me/totp', function () {
    $user = requireUser();
    $secret = Totp::generateSecret();
    Db::run('UPDATE users SET totp_secret = ? WHERE id = ?', array($secret, $user['id']));
    Db::audit($user['id'], 'totp_enrolled');
    return Http::json(array('secret' => $secret, 'uri' => Totp::provisioningUri($secret, $user['email'])));
});

/**
 * SOLO DEMO. Devuelve el codigo TOTP vigente para que se pueda probar el
 * segundo factor sin instalar una app de autenticacion. Se activa unicamente
 * si existe el fichero data/DEMO o SENTINELA_DEMO=1, y nunca deberia existir
 * en produccion: entrega el segundo factor a quien lo pida.
 */
$router->get('/api/demo/totp', function () {
    if (getenv('SENTINELA_DEMO') !== '1' && !file_exists(__DIR__ . '/../data/DEMO')) {
        return Http::json(array('error' => 'not_found'), 404);
    }
    $u = Db::one('SELECT totp_secret FROM users WHERE totp_secret IS NOT NULL ORDER BY created_at LIMIT 1');
    if (!$u) {
        return Http::json(array('error' => 'sin_2fa'), 404);
    }
    return Http::json(array(
        'code' => Totp::at($u['totp_secret'], (int) floor(time() / 30)),
        'expira_en' => 30 - (time() % 30),
    ));
});

// -------------------------------------------------------------- servidores
$router->get('/api/servers', function () {
    requireUser();
    return Http::json(array_map('rowToServer', Db::all('SELECT * FROM servers ORDER BY label')));
});

$router->get('/api/servers/{id}', function ($p) {
    requireUser();
    $r = Db::one('SELECT * FROM servers WHERE id = ?', array($p['id']));
    if (!$r) {
        return Http::json(array('error' => 'not_found'), 404);
    }
    $out = rowToServer($r);
    $out['services'] = Db::all(
        'SELECT name, managed_by, port, critical FROM services WHERE server_id = ? ORDER BY name',
        array($p['id'])
    );
    return Http::json($out);
});

/** Editar ficha: renombrar, etiquetar y mostrar u ocultar las IP. */
$router->patch('/api/servers/{id}', function ($p) {
    $user = requireUser();
    if ($user['role'] === 'viewer') {
        return Http::json(array('error' => 'forbidden'), 403);
    }
    $b = Http::body();
    $sets = array();
    $args = array();
    if (array_key_exists('label', $b)) { $sets[] = 'label = ?'; $args[] = (string) $b['label']; }
    if (array_key_exists('ip_visible', $b)) { $sets[] = 'ip_visible = ?'; $args[] = $b['ip_visible'] ? 1 : 0; }
    if (array_key_exists('tags', $b)) { $sets[] = 'tags = ?'; $args[] = json_encode(array_values((array) $b['tags'])); }
    if (!$sets) {
        return Http::json(array('error' => 'nothing_to_update'), 422);
    }
    $args[] = $p['id'];
    Db::run('UPDATE servers SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
    Db::audit($user['id'], 'server_updated', $p['id'] . ':' . implode(',', array_keys($b)));
    return Http::json(rowToServer(Db::one('SELECT * FROM servers WHERE id = ?', array($p['id']))));
});

// ----------------------------------------------------------------- mosaicos
$router->get('/api/tiles', function () {
    $user = requireUser();
    $tiles = array();
    foreach (Db::all('SELECT * FROM tiles WHERE user_id = ? ORDER BY ord', array($user['id'])) as $r) {
        $tiles[] = array(
            'id' => $r['id'], 'kind' => $r['kind'], 'title' => $r['title'],
            'server_id' => $r['server_id'], 'metric' => $r['metric'],
            'w' => (int) $r['w'], 'h' => (int) $r['h'], 'order' => (int) $r['ord'],
            'options' => json_decode($r['options'], true) ?: new stdClass(),
        );
    }
    return Http::json($tiles);
});

/** El frontend manda el layout completo: una transaccion, sin diffs parciales. */
$router->put('/api/tiles', function () {
    $user = requireUser();
    $body = Http::body();
    $tiles = isset($body['tiles']) ? $body['tiles'] : array();
    $pdo = Db::conn();
    $pdo->beginTransaction();
    try {
        Db::run('DELETE FROM tiles WHERE user_id = ?', array($user['id']));
        $i = 0;
        foreach ($tiles as $t) {
            Db::run(
                'INSERT INTO tiles (id, user_id, kind, title, server_id, metric, w, h, ord, options) VALUES (?,?,?,?,?,?,?,?,?,?)',
                array(
                    (string) $t['id'], $user['id'], (string) $t['kind'], (string) $t['title'],
                    isset($t['server_id']) ? $t['server_id'] : null,
                    isset($t['metric']) ? $t['metric'] : null,
                    (int) $t['w'], (int) $t['h'], $i++,
                    json_encode(isset($t['options']) ? $t['options'] : new stdClass()),
                )
            );
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        return Http::json(array('error' => 'save_failed', 'detail' => $e->getMessage()), 500);
    }
    return Http::json(array('ok' => true, 'count' => count($tiles)));
});

// ------------------------------------------------------------------ alertas
$router->get('/api/alerts', function () {
    requireUser();
    $limit = isset($_GET['limit']) ? max(1, min(200, (int) $_GET['limit'])) : 50;
    $rows = Db::all(
        'SELECT a.*, s.label AS server_label FROM alerts a
         LEFT JOIN servers s ON s.id = a.server_id ORDER BY a.ts DESC LIMIT ' . $limit
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'id' => $r['id'], 'server_id' => $r['server_id'],
            'server_label' => $r['server_label'] ? $r['server_label'] : $r['server_id'],
            'severity' => $r['severity'], 'kind' => $r['kind'], 'metric' => $r['metric'],
            'message' => $r['message'],
            'value' => $r['value'] !== null ? (float) $r['value'] : null,
            'threshold' => $r['threshold'] !== null ? (float) $r['threshold'] : null,
            'ts' => (int) $r['ts'] * 1000,
            'acknowledged' => (int) $r['acknowledged'] === 1,
        );
    }
    return Http::json($out);
});

$router->post('/api/alerts/{id}/ack', function ($p) {
    $user = requireUser();
    Db::run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', array($p['id']));
    Db::audit($user['id'], 'alert_ack', $p['id']);
    return Http::json(array('ok' => true));
});

$router->get('/api/alert-rules', function () {
    $user = requireUser();
    $rows = Db::all('SELECT * FROM alert_rules WHERE user_id = ? OR user_id = ?', array($user['id'], '*'));
    $out = array();
    foreach ($rows as $r) {
        $r['threshold'] = (float) $r['threshold'];
        $r['for_s'] = (int) $r['for_s'];
        $r['enabled'] = (int) $r['enabled'] === 1;
        $r['channels'] = json_decode($r['channels'], true) ?: array();
        $out[] = $r;
    }
    return Http::json($out);
});

// -------------------------------------------------------------------- movil
$router->post('/api/push/register', function () {
    $user = requireUser();
    $b = Http::body();
    Db::upsert('push_devices', array(
        'token' => (string) (isset($b['token']) ? $b['token'] : ''),
        'user_id' => $user['id'],
        'platform' => (string) (isset($b['platform']) ? $b['platform'] : 'ios'),
        'created_at' => time(),
    ), array('token'));
    return Http::json(array('ok' => true));
});

// --------------------------------------------------- endpoints internos (Node)
/** El gateway consulta la flota y sus secretos HMAC al arrancar. */
$router->get('/internal/fleet', function () {
    requireService();
    return Http::json(Db::all('SELECT id, label, hostname, agent_secret, status FROM servers'));
});

/** El gateway persiste el latido y el estado calculado. */
$router->post('/internal/heartbeat', function () {
    requireService();
    $b = Http::body();
    Db::run('UPDATE servers SET last_seen = ?, status = ?, agent_version = ? WHERE id = ?', array(
        (int) round(((float) (isset($b['ts']) ? $b['ts'] : time() * 1000)) / 1000),
        (string) (isset($b['status']) ? $b['status'] : 'ok'),
        (string) (isset($b['agent_version']) ? $b['agent_version'] : '-'),
        (string) (isset($b['server_id']) ? $b['server_id'] : ''),
    ));
    return Http::json(array('ok' => true));
});

/** El motor de alertas de Node escribe aqui el historico. */
$router->post('/internal/alerts', function () {
    requireService();
    $a = Http::body();
    Db::upsert('alerts', array(
        'id' => (string) $a['id'],
        'server_id' => (string) $a['server_id'],
        'severity' => (string) $a['severity'],
        'kind' => (string) $a['kind'],
        'metric' => (string) $a['metric'],
        'message' => (string) $a['message'],
        'value' => isset($a['value']) ? $a['value'] : null,
        'threshold' => isset($a['threshold']) ? $a['threshold'] : null,
        'ts' => (int) round(((float) $a['ts']) / 1000),
        'acknowledged' => 0,
    ), array('id'));
    return Http::json(array('ok' => true));
});

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$router->dispatch($_SERVER['REQUEST_METHOD'], rtrim($path, '/') ?: '/');
