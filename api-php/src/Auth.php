<?php
require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Totp.php';
require_once __DIR__ . '/Mailer.php';

/**
 * Login en dos pasos:
 *   1) id unico + contraseña  -> devuelve un token en estado 'pending_2fa' y
 *                                envia un codigo de 6 digitos al correo del usuario
 *   2) codigo del correo       -> el mismo token pasa a 'active'
 * Asi el token intermedio no sirve para leer datos si alguien lo intercepta, y
 * el segundo factor llega a una bandeja que el atacante no controla.
 */
class Auth
{
    const MAX_TRIES = 5;
    const LOCK_S = 300;
    const SESSION_S = 43200;   // 12 h
    const CODE_TTL_S = 300;    // el codigo del correo caduca a los 5 min
    const CODE_TRIES = 5;      // intentos por codigo antes de invalidarlo

    public static function login($userId, $password)
    {
        $user = Db::one('SELECT * FROM users WHERE id = ? OR email = ?', [$userId, $userId]);
        $now = time();

        if ($user && (int) $user['locked_until'] > $now) {
            return ['error' => 'account_locked', 'retry_in' => (int) $user['locked_until'] - $now];
        }

        // password_verify siempre se ejecuta (aunque el usuario no exista) para
        // que el tiempo de respuesta no revele si el id es valido.
        $hash = $user ? $user['password_hash'] : password_hash('dummy', PASSWORD_DEFAULT);
        $ok = password_verify($password, $hash);

        if (!$user || !$ok) {
            if ($user) {
                $tries = (int) $user['failed_tries'] + 1;
                $lock = $tries >= self::MAX_TRIES ? $now + self::LOCK_S : 0;
                Db::run('UPDATE users SET failed_tries = ?, locked_until = ? WHERE id = ?', [$tries, $lock, $user['id']]);
                Db::audit($user['id'], 'login_failed', 'tries=' . $tries);
            }
            return ['error' => 'invalid_credentials'];
        }

        Db::run('UPDATE users SET failed_tries = 0, locked_until = 0 WHERE id = ?', [$user['id']]);

        // Siempre segundo factor por correo: se crea un token intermedio y se
        // envia un codigo de 6 digitos a la bandeja del usuario.
        $token = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO sessions (token, user_id, stage, ip, user_agent, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
            [
                $token,
                $user['id'],
                'pending_2fa',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null,
                isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 200) : null,
                $now,
                $now + 600,   // el token intermedio vive 10 min
            ]
        );
        self::sendLoginCode($user, $token);
        Db::audit($user['id'], 'login_step1');

        return [
            'token' => $token,
            'stage' => 'pending_2fa',
            'user' => self::publicUser($user),
            'sent_to' => self::maskEmail($user['email']),
        ];
    }

    /** Genera, guarda y envia (o deja en el respaldo de desarrollo) el codigo. */
    public static function sendLoginCode(array $user, $token)
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        Db::run('DELETE FROM login_codes WHERE token = ?', [$token]);
        Db::run(
            'INSERT INTO login_codes (token, code_hash, expires_at, tries) VALUES (?,?,?,0)',
            [$token, password_hash($code, PASSWORD_DEFAULT), time() + self::CODE_TTL_S]
        );

        $enviado = Mailer::send(
            $user['email'],
            'Tu codigo de acceso a Novara',
            self::codeEmailHtml($user['name'], $code)
        );

        if (!$enviado) {
            // Sin SMTP configurado (o fallo): el codigo queda en un fichero local
            // para poder probar el flujo. Nunca debe existir en produccion.
            $dir = __DIR__ . '/../data';
            @file_put_contents($dir . '/last-login-code.txt', $code . "\n");
            error_log('[auth] codigo de acceso (respaldo dev): ' . $code);
        }
        return $enviado;
    }

    public static function verifyLoginCode($token, $code)
    {
        $s = Db::one('SELECT * FROM sessions WHERE token = ?', [$token]);
        if (!$s || $s['stage'] !== 'pending_2fa' || (int) $s['expires_at'] < time()) {
            return ['error' => 'invalid_session'];
        }
        $lc = Db::one('SELECT * FROM login_codes WHERE token = ?', [$token]);
        if (!$lc || (int) $lc['expires_at'] < time()) {
            return ['error' => 'code_expired'];
        }
        if ((int) $lc['tries'] >= self::CODE_TRIES) {
            return ['error' => 'invalid_code'];
        }
        $code = preg_replace('/\D/', '', (string) $code);
        if (!password_verify($code, $lc['code_hash'])) {
            Db::run('UPDATE login_codes SET tries = tries + 1 WHERE token = ?', [$token]);
            Db::audit($s['user_id'], 'login_code_failed');
            return ['error' => 'invalid_code'];
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
        Db::run('DELETE FROM login_codes WHERE token = ?', [$token]);
        Db::run("UPDATE sessions SET stage = 'active', expires_at = ? WHERE token = ?", [time() + self::SESSION_S, $token]);
        Db::audit($user['id'], 'login_ok');
        return ['token' => $token, 'stage' => 'active', 'user' => self::publicUser($user)];
    }

    /** Reenvia un codigo nuevo si el token intermedio sigue vivo. */
    public static function resendLoginCode($token)
    {
        $s = Db::one('SELECT * FROM sessions WHERE token = ?', [$token]);
        if (!$s || $s['stage'] !== 'pending_2fa' || (int) $s['expires_at'] < time()) {
            return ['error' => 'invalid_session'];
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
        self::sendLoginCode($user, $token);
        return ['ok' => true, 'sent_to' => self::maskEmail($user['email'])];
    }

    /** Solo respaldo de desarrollo: el ultimo codigo, cuando no hay SMTP. */
    public static function lastDevCode()
    {
        $f = __DIR__ . '/../data/last-login-code.txt';
        return file_exists($f) ? trim(file_get_contents($f)) : null;
    }

    private static function maskEmail($email)
    {
        $at = strpos($email, '@');
        if ($at === false || $at < 1) {
            return $email;
        }
        $user = substr($email, 0, $at);
        $visible = substr($user, 0, 1);
        return $visible . str_repeat('*', max(1, strlen($user) - 1)) . substr($email, $at);
    }

    private static function codeEmailHtml($name, $code)
    {
        $n = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#101216">'
            . '<h2 style="margin:0 0 8px">Novara</h2>'
            . '<p style="color:#565c64;margin:0 0 16px">Hola ' . $n . ', tu codigo de acceso es:</p>'
            . '<div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f5f6f7;border-radius:12px;padding:16px;text-align:center">'
            . $code . '</div>'
            . '<p style="color:#565c64;font-size:13px;margin:16px 0 0">Caduca en 5 minutos. Si no intentabas iniciar sesion, ignora este correo.</p>'
            . '</div>';
    }

    /** Devuelve el usuario de una sesion ACTIVA, o null. */
    public static function currentUser($token)
    {
        if (!$token) {
            return null;
        }
        $row = Db::one(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND s.stage = 'active' AND s.expires_at > ?",
            [$token, time()]
        );
        return $row ? self::publicUser($row) : null;
    }

    public static function logout($token)
    {
        Db::run('DELETE FROM sessions WHERE token = ?', [$token]);
    }

    public static function publicUser(array $row)
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => $row['role'],
            'totp_enabled' => !empty($row['totp_secret']),
        ];
    }
}
