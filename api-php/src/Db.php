<?php
/**
 * Acceso a datos. PDO + SQLite en el prototipo; el MISMO codigo corre contra
 * PostgreSQL/Supabase (o MySQL) cambiando SENTINELA_DSN. Todo va con sentencias
 * preparadas.
 *
 * Supabase: puedes pegar su cadena tal cual, por ejemplo
 *   SENTINELA_DSN="postgresql://postgres:TU_PASS@db.xxxx.supabase.co:5432/postgres"
 * y aqui se traduce al DSN de PDO con SSL. O usa el DSN nativo de PDO
 *   SENTINELA_DSN="pgsql:host=...;port=5432;dbname=postgres;sslmode=require"
 * con SENTINELA_DB_USER / SENTINELA_DB_PASS.
 */
class Db
{
    /** @var PDO|null */
    private static $pdo = null;
    /** @var string 'sqlite' | 'pgsql' | 'mysql' */
    private static $driver = 'sqlite';

    /** @return PDO */
    public static function conn()
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $dsn = getenv('SENTINELA_DSN');
        $user = getenv('SENTINELA_DB_USER') ?: null;
        $pass = getenv('SENTINELA_DB_PASS') ?: null;

        // Cadena estilo URI (la que da Supabase) -> DSN de PDO + credenciales.
        if ($dsn && preg_match('#^postgres(ql)?://#', $dsn)) {
            $p = parse_url($dsn);
            if ($user === null && isset($p['user'])) {
                $user = urldecode($p['user']);
            }
            if ($pass === null && isset($p['pass'])) {
                $pass = urldecode($p['pass']);
            }
            $host = isset($p['host']) ? $p['host'] : 'localhost';
            $port = isset($p['port']) ? $p['port'] : 5432;
            $db = isset($p['path']) ? ltrim($p['path'], '/') : 'postgres';
            // Supabase exige TLS.
            $dsn = "pgsql:host=$host;port=$port;dbname=$db;sslmode=require";
        }

        if (!$dsn) {
            $file = __DIR__ . '/../data/sentinela.sqlite';
            $dsn = 'sqlite:' . $file;
        }

        self::$driver = strtolower(explode(':', $dsn, 2)[0]);

        $pdo = new PDO($dsn, $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        if (self::$driver === 'sqlite') {
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
        self::$pdo = $pdo;
        return $pdo;
    }

    /** Motor activo: 'sqlite' | 'pgsql' | 'mysql'. */
    public static function driver()
    {
        self::conn();
        return self::$driver;
    }

    /** @return array<int,array<string,mixed>> */
    public static function all($sql, array $args = [])
    {
        $st = self::conn()->prepare($sql);
        $st->execute($args);
        return $st->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public static function one($sql, array $args = [])
    {
        $rows = self::all($sql, $args);
        return count($rows) ? $rows[0] : null;
    }

    public static function run($sql, array $args = [])
    {
        $st = self::conn()->prepare($sql);
        $st->execute($args);
        return $st->rowCount();
    }

    /**
     * Inserta o reemplaza por clave. Genera el SQL segun el motor: en SQLite es
     * INSERT OR REPLACE; en Postgres/MySQL es un UPSERT. Asi el mismo llamado
     * funciona en las dos bases sin ramificar en cada sitio.
     *
     * @param array<string,mixed> $data     columna => valor
     * @param array<int,string>   $conflict columnas de la clave de conflicto
     */
    public static function upsert($table, array $data, array $conflict)
    {
        $cols = array_keys($data);
        $ph = implode(',', array_fill(0, count($cols), '?'));
        $colList = implode(',', $cols);

        if (self::driver() === 'sqlite') {
            $sql = "INSERT OR REPLACE INTO $table ($colList) VALUES ($ph)";
        } else {
            $sets = [];
            foreach ($cols as $c) {
                if (!in_array($c, $conflict, true)) {
                    $sets[] = "$c = EXCLUDED.$c";
                }
            }
            $sql = "INSERT INTO $table ($colList) VALUES ($ph) "
                . 'ON CONFLICT (' . implode(',', $conflict) . ') '
                . ($sets ? 'DO UPDATE SET ' . implode(', ', $sets) : 'DO NOTHING');
        }
        return self::run($sql, array_values($data));
    }

    public static function migrate()
    {
        $file = self::driver() === 'pgsql' ? 'schema.pg.sql' : 'schema.sql';
        self::conn()->exec(file_get_contents(__DIR__ . '/../sql/' . $file));
    }

    public static function audit($userId, $action, $detail = null)
    {
        self::run(
            'INSERT INTO audit_log (user_id, action, detail, ip, ts) VALUES (?,?,?,?,?)',
            [$userId, $action, $detail, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null, time()]
        );
    }
}
