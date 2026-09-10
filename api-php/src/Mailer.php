<?php
/**
 * Envio de correo por SMTP, en PHP puro (sin dependencias, como el TOTP).
 * Pensado para Gmail: STARTTLS en el 587 con AUTH LOGIN y una "contraseña de
 * aplicacion" de Google. `mail()` de PHP no autentica; por eso hablamos SMTP a
 * mano.
 *
 * Configuracion (las variables de entorno ganan al fichero mail.local.php):
 *   SENTINELA_SMTP_HOST  (por defecto smtp.gmail.com)
 *   SENTINELA_SMTP_PORT  (587 STARTTLS, o 465 TLS directo)
 *   SENTINELA_SMTP_USER  (tu direccion Gmail)
 *   SENTINELA_SMTP_PASS  (la contraseña de aplicacion, NO la del correo)
 *   SENTINELA_SMTP_FROM  (remitente; por defecto = USER)
 */
class Mailer
{
    /** @return array<string,mixed> */
    public static function config()
    {
        $cfg = array(
            'host' => getenv('SENTINELA_SMTP_HOST') ?: 'smtp.gmail.com',
            'port' => (int) (getenv('SENTINELA_SMTP_PORT') ?: 587),
            'user' => getenv('SENTINELA_SMTP_USER') ?: '',
            'pass' => getenv('SENTINELA_SMTP_PASS') ?: '',
            'from' => getenv('SENTINELA_SMTP_FROM') ?: '',
            'from_name' => getenv('SENTINELA_SMTP_FROM_NAME') ?: 'Novara',
        );
        $file = __DIR__ . '/../mail.local.php';
        if (file_exists($file)) {
            $local = include $file;
            if (is_array($local)) {
                foreach ($local as $k => $v) {
                    if ($v !== '' && $v !== null) {
                        $cfg[$k] = $v;
                    }
                }
            }
        }
        if (!$cfg['from']) {
            $cfg['from'] = $cfg['user'];
        }
        return $cfg;
    }

    /** ¿Hay credenciales para enviar de verdad? */
    public static function configured()
    {
        $c = self::config();
        return $c['user'] !== '' && $c['pass'] !== '';
    }

    /**
     * Envia un correo HTML. Devuelve true si el servidor lo acepto.
     * Nunca lanza: si algo falla devuelve false y el llamador decide (por
     * ejemplo, caer al respaldo de desarrollo).
     */
    public static function send($to, $subject, $html)
    {
        $c = self::config();
        if ($c['user'] === '' || $c['pass'] === '') {
            return false;
        }

        $transport = $c['port'] === 465 ? 'ssl://' : 'tcp://';
        $fp = @stream_socket_client(
            $transport . $c['host'] . ':' . $c['port'],
            $errno, $errstr, 15, STREAM_CLIENT_CONNECT
        );
        if (!$fp) {
            error_log("[mailer] no conecta a {$c['host']}:{$c['port']} ($errstr)");
            return false;
        }
        stream_set_timeout($fp, 15);

        try {
            self::expect($fp, '220');
            self::cmd($fp, 'EHLO novara.local', '250');

            if ($c['port'] !== 465) {
                self::cmd($fp, 'STARTTLS', '220');
                if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    error_log('[mailer] STARTTLS fallo');
                    fclose($fp);
                    return false;
                }
                self::cmd($fp, 'EHLO novara.local', '250');
            }

            self::cmd($fp, 'AUTH LOGIN', '334');
            self::cmd($fp, base64_encode($c['user']), '334');
            self::cmd($fp, base64_encode($c['pass']), '235');

            $from = $c['from'];
            self::cmd($fp, 'MAIL FROM:<' . $from . '>', '250');
            self::cmd($fp, 'RCPT TO:<' . $to . '>', '250');
            self::cmd($fp, 'DATA', '354');

            $headers = array(
                'From: ' . self::encodeName($c['from_name']) . ' <' . $from . '>',
                'To: <' . $to . '>',
                'Subject: ' . self::encodeHeader($subject),
                'MIME-Version: 1.0',
                'Content-Type: text/html; charset=UTF-8',
                'Date: ' . date('r'),
            );
            // El punto solo en una linea termina DATA: hay que "escaparlo".
            $body = preg_replace('/^\./m', '..', $html);
            $msg = implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.";
            self::cmd($fp, $msg, '250');
            self::cmd($fp, 'QUIT', '221');
            fclose($fp);
            return true;
        } catch (Exception $e) {
            error_log('[mailer] ' . $e->getMessage());
            @fclose($fp);
            return false;
        }
    }

    private static function cmd($fp, $line, $expected)
    {
        fwrite($fp, $line . "\r\n");
        self::expect($fp, $expected);
    }

    private static function expect($fp, $expected)
    {
        $resp = self::read($fp);
        if (substr($resp, 0, 3) !== $expected) {
            throw new Exception("SMTP esperaba $expected y llego: " . trim($resp));
        }
    }

    /** Lee una respuesta SMTP completa (soporta multilinea 250-...). */
    private static function read($fp)
    {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            // El 4o caracter es ' ' en la ultima linea, '-' si hay continuacion.
            if (strlen($line) >= 4 && $line[3] === ' ') {
                break;
            }
        }
        return $data;
    }

    private static function encodeHeader($s)
    {
        return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }

    private static function encodeName($s)
    {
        return preg_match('/[^\x20-\x7e]/', $s) ? self::encodeHeader($s) : '"' . str_replace('"', '', $s) . '"';
    }
}
