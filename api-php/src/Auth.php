<?php
require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Totp.php';

/**
 * Login en dos pasos:
 *   1) id unico + contraseña  -> devuelve un token en estado 'pending_2fa'
 *   2) codigo TOTP            -> el mismo token pasa a 'active'
 * Asi el token intermedio no sirve para leer datos si alguien lo intercepta.
 */
class Auth
{
    const MAX_TRIES = 5;
    const LOCK_S = 300;
    const SESSION_S = 43200;   // 12 h

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
        $needs2fa = !empty($user['totp_secret']);
        $token = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO sessions (token, user_id, stage, ip, user_agent, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
            [
                $token,
                $user['id'],
                $needs2fa ? 'pending_2fa' : 'active',
                isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null,
                isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 200) : null,
                $now,
                $now + ($needs2fa ? 300 : self::SESSION_S),
            ]
        );
        Db::audit($user['id'], 'login_step1');

        return ['token' => $token, 'stage' => $needs2fa ? 'pending_2fa' : 'active', 'user' => self::publicUser($user)];
    }

    public static function verifyTotp($token, $code)
    {
        $s = Db::one('SELECT * FROM sessions WHERE token = ?', [$token]);
        if (!$s || $s['stage'] !== 'pending_2fa' || (int) $s['expires_at'] < time()) {
            return ['error' => 'invalid_session'];
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$s['user_id']]);
        if (!Totp::verify($user['totp_secret'], $code)) {
            Db::audit($user['id'], 'totp_failed');
            return ['error' => 'invalid_code'];
        }
        Db::run("UPDATE sessions SET stage = 'active', expires_at = ? WHERE token = ?", [time() + self::SESSION_S, $token]);
        Db::audit($user['id'], 'login_ok');
        return ['token' => $token, 'stage' => 'active', 'user' => self::publicUser($user)];
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
