<?php
/** Router minimo: patrones tipo /api/servers/{id} sin dependencias externas. */
class Router
{
    private $routes = [];

    public function add($method, $pattern, callable $handler)
    {
        $regex = '#^' . preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [strtoupper($method), $regex, $handler];
        return $this;
    }

    public function get($p, callable $h) { return $this->add('GET', $p, $h); }
    public function post($p, callable $h) { return $this->add('POST', $p, $h); }
    public function put($p, callable $h) { return $this->add('PUT', $p, $h); }
    public function patch($p, callable $h) { return $this->add('PATCH', $p, $h); }
    public function delete($p, callable $h) { return $this->add('DELETE', $p, $h); }

    public function dispatch($method, $path)
    {
        $allowed = [];
        foreach ($this->routes as $r) {
            list($m, $regex, $handler) = $r;
            if (preg_match($regex, $path, $matches)) {
                if ($m !== strtoupper($method)) {
                    $allowed[] = $m;
                    continue;
                }
                $params = [];
                foreach ($matches as $k => $v) {
                    if (!is_int($k)) {
                        $params[$k] = $v;
                    }
                }
                return call_user_func($handler, $params);
            }
        }
        if ($allowed) {
            return Http::json(['error' => 'method_not_allowed', 'allow' => $allowed], 405);
        }
        return Http::json(['error' => 'not_found', 'path' => $path], 404);
    }
}

/** Utilidades de entrada/salida HTTP. */
class Http
{
    public static function json($data, $status = 200)
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return null;
    }

    /** @return array<string,mixed> */
    public static function body()
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function bearer()
    {
        $h = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
        if (!$h && function_exists('apache_request_headers')) {
            $hs = apache_request_headers();
            $h = isset($hs['Authorization']) ? $hs['Authorization'] : '';
        }
        return preg_match('/Bearer\s+(\S+)/i', $h, $m) ? $m[1] : null;
    }
}
