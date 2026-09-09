# Sentinela — prototipo de monitoreo de servidores

Panel de monitoreo de servidores en tiempo real: estado del hardware, servicios
que administra cada máquina, direcciones IP con visibilidad controlada por el
usuario, y alertas por uso de recursos, apagones, caídas e intentos de
vulneración. Acceso con identificador único, contraseña y verificación en dos
pasos. Tablero de mosaicos que cada usuario reordena y edita.

## Las cuatro piezas

```
   ┌──────────────┐   HTTPS + HMAC   ┌────────────────────┐   WebSocket   ┌──────────────┐
   │ agente Java  │ ───────────────► │  gateway Node/TS   │ ────────────► │  React 19    │
   │ (cada host)  │   /ingest        │  alertas + fan-out │   /stream     │  + Bootstrap │
   └──────────────┘                  └─────────┬──────────┘               └──────┬───────┘
                                               │ latido, alertas                  │ REST
                                               ▼                                  ▼
                                     ┌────────────────────────────────────────────────┐
                                     │   API PHP  ·  identidad, 2FA, catálogo, tablero │
                                     │   SQLite (prototipo) / MySQL o PostgreSQL       │
                                     └────────────────────────────────────────────────┘
```

| Carpeta          | Tecnología                     | Responsabilidad                                            |
|------------------|--------------------------------|------------------------------------------------------------|
| `agent-java/`    | Java 17, sin dependencias      | Medir el host, firmar y enviar                              |
| `realtime-node/` | Node 22+, TypeScript, `ws`     | Ingesta, motor de alertas, difusión en vivo                 |
| `api-php/`       | PHP 7.3+ (probado en 7.3 y 8.x)| Login + TOTP, servidores, servicios, mosaicos, histórico    |
| `frontend/`      | React 19, TypeScript, Bootstrap 5 | Interfaz: acceso, tablero de mosaicos, inventario         |
| `shared/`        | TypeScript                     | Contrato de datos único para Node y el navegador            |

Las decisiones y sus alternativas descartadas están en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Arrancar la demo

Requiere PHP con `pdo_sqlite` y Node 22 o superior. Cuatro terminales:

```bash
# 1. API PHP (crea la base y los datos de prueba)
cd api-php && php sql/seed.php && php -S 127.0.0.1:8080 -t public
```

```bash
# 2. Gateway de tiempo real
cd realtime-node && npm install && npm start
```

```bash
# 3. Agentes simulados (sustituyen a las máquinas reales)
cd realtime-node && npm run simulate
```

```bash
# 4. Interfaz
cd frontend && npm install && npm run dev
```

Abrir <http://127.0.0.1:5173>.

**Credenciales de la demo**

| Campo         | Valor              |
|---------------|--------------------|
| Identificador | `SNT-4417`         |
| Contraseña    | `Sentinela#2026`   |
| Segundo paso  | El propio panel muestra el código vigente en modo demo |

El código TOTP también se puede consultar en `GET /api/demo/totp`.
**Ese endpoint solo existe si está el archivo
`api-php/data/DEMO`**; bórralo antes de cualquier despliegue real, porque
entrega el segundo factor a quien lo pida.

Con un autenticador real (Google Authenticator, Authy, Contraseñas de iOS) el
secreto de la demo es `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`.

## Qué se puede probar

- **Acceso en dos pasos.** El token del primer paso no sirve para leer datos:
  `GET /api/servers` responde 401 hasta que se valida el código.
- **Tablero editable.** Botón *Personalizar*: arrastrar para reordenar, el
  engrane para cambiar tipo, servidor, métrica, ancho y alto, la X para quitar.
  Todo se guarda por usuario en la base.
- **Visibilidad de IP.** En *Servidores*, el ojo de cada fila. Cuando está
  oculta, la API deja de enviar la dirección: no viaja al navegador.
- **Alertas en vivo.** Los agentes simulados representan un guion: pico de CPU
  en Core API 01, presión de memoria en PostgreSQL, `MSSQLSERVER` detenido en el
  File Server, sobrecalentamiento y fuerza bruta SSH en el Edge de Dallas, y un
  apagón con UPS en Core API 02.
- **Caídas.** Al detener el simulador, en 15 s toda la flota pasa a `offline`
  con alerta de falta de latido.

## Agente Java en una máquina real

No hace falta el simulador si hay una máquina de verdad:

```bash
cd agent-java
javac -d out $(find src -name '*.java')
cp agent.properties.example agent.properties   # poner server.id y agent.secret
java -cp out mx.sentinela.agent.Agent agent.properties
```

El `agent.secret` de cada servidor está en la columna `agent_secret` de la tabla
`servers`. Detalles de empaquetado como servicio en
[agent-java/README.md](agent-java/README.md).

## Lo que este prototipo todavía no es

- Sin TLS: en producción va todo detrás de nginx con certificados, y el token
  de sesión debería viajar en una cookie `HttpOnly; Secure; SameSite=Strict`
  en vez de en `sessionStorage`.
- Sin serie histórica larga: el gateway guarda 60 muestras en memoria. Para
  gráficas de días hace falta una base de series temporales (TimescaleDB,
  VictoriaMetrics) alimentada desde el mismo `/ingest`.
- Sin app móvil nativa: la interfaz es responsiva y el registro de dispositivos
  para notificaciones (`POST /api/push/register`) ya existe, pero falta el
  envío real a APNs y FCM.
- Sin pruebas automatizadas ni pipeline de despliegue.
