<?php
/**
 * Acceso a datos. PDO + SQLite en el prototipo; el mismo codigo corre contra
 * MySQL/PostgreSQL cambiando SENTINELA_DSN. Todo va con sentencias preparadas.
 */
class Db
{
    /** @var PDO|null */
    private static $pdo = null;

    /** @return PDO */
    public static function conn()
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        $dsn = getenv('SENTINELA_DSN');
        if (!$dsn) {
            $file = __DIR__ . '/../data/sentinela.sqlite';
            $dsn = 'sqlite:' . $file;
        }
        $pdo = new PDO($dsn, getenv('SENTINELA_DB_USER') ?: null, getenv('SENTINELA_DB_PASS') ?: null);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        if (strpos($dsn, 'sqlite:') === 0) {
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
        self::$pdo = $pdo;
        return $pdo;
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

    public static function migrate()
    {
        self::conn()->exec(file_get_contents(__DIR__ . '/../sql/schema.sql'));
    }

    public static function audit($userId, $action, $detail = null)
    {
        self::run(
            'INSERT INTO audit_log (user_id, action, detail, ip, ts) VALUES (?,?,?,?,?)',
            [$userId, $action, $detail, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null, time()]
        );
    }
}
