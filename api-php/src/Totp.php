<?php
/**
 * TOTP RFC-6238 implementado a mano (sin dependencias) para el segundo factor.
 * Compatible con Google Authenticator, Authy y las claves de verificacion
 * de iOS (Ajustes > Contraseñas), que era el requisito de "alineado a Apple".
 */
class Totp
{
    const PERIOD = 30;
    const DIGITS = 6;
    const WINDOW = 1;   // +-30 s de tolerancia por desfase de reloj

    public static function generateSecret($bytes = 20)
    {
        return self::base32Encode(random_bytes($bytes));
    }

    /** Verifica el codigo aceptando una ventana de +-1 periodo. */
    public static function verify($secret, $code)
    {
        $code = preg_replace('/\D/', '', (string) $code);
        if (strlen($code) !== self::DIGITS) {
            return false;
        }
        $counter = (int) floor(time() / self::PERIOD);
        for ($i = -self::WINDOW; $i <= self::WINDOW; $i++) {
            // hash_equals evita fugas por comparacion en tiempo variable.
            if (hash_equals(self::at($secret, $counter + $i), $code)) {
                return true;
            }
        }
        return false;
    }

    public static function at($secret, $counter)
    {
        $key = self::base32Decode($secret);
        $bin = pack('N*', 0, $counter);                 // contador de 64 bits big-endian
        $hash = hash_hmac('sha1', $bin, $key, true);
        $offset = ord($hash[19]) & 0x0f;
        $part = substr($hash, $offset, 4);
        $value = unpack('N', $part)[1] & 0x7fffffff;
        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /** URI otpauth:// para pintar el QR de alta en la app movil. */
    public static function provisioningUri($secret, $account, $issuer = 'Sentinela')
    {
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account)
            . '?secret=' . $secret
            . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=' . self::DIGITS . '&period=' . self::PERIOD;
    }

    private static function base32Encode($data)
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $out = '';
        $buffer = 0;
        $bits = 0;
        for ($i = 0; $i < strlen($data); $i++) {
            $buffer = ($buffer << 8) | ord($data[$i]);
            $bits += 8;
            while ($bits >= 5) {
                $bits -= 5;
                $out .= $alphabet[($buffer >> $bits) & 31];
            }
        }
        if ($bits > 0) {
            $out .= $alphabet[($buffer << (5 - $bits)) & 31];
        }
        return $out;
    }

    private static function base32Decode($b32)
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $b32 = strtoupper(rtrim($b32, '='));
        $buffer = 0;
        $bits = 0;
        $out = '';
        for ($i = 0; $i < strlen($b32); $i++) {
            $idx = strpos($alphabet, $b32[$i]);
            if ($idx === false) {
                continue;
            }
            $buffer = ($buffer << 5) | $idx;
            $bits += 5;
            if ($bits >= 8) {
                $bits -= 8;
                $out .= chr(($buffer >> $bits) & 255);
            }
        }
        return $out;
    }
}
