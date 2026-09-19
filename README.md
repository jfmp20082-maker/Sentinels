# Sentinel — Aplicacion web de monitoreo de servidores
18-Sep-2026

Aplicacion web que monitorea servicios y servidores, tanto fisicos como en la nube, pensado para personas y/o empresas que requieran de supervision 

## Descripcion

Aplicacion web de monitoreo de servicios y servidores en tiempo real: estado del hardware, servicios
que administra cada máquina,servicios en la nube, direcciones IP con visibilidad controlada por el
usuario, y alertas por uso de recursos, apagones, caídas e intentos de
vulneración. Acceso con identificador único, contraseña y verificación en dos
pasos. Tablero de mosaicos que cada usuario reordena y edita.

## Carecteristicas
1. Flujos de trabajo optimizados 
2. Facil visualizacion de los procesos que se gestionan 
3. Notificacion sobre anomalias en los servicios
4. Interpretacion de graficas de manera periodica 

## Tecnologias usadas 
1. Typescript
2. PHP
3. Java
4. CSS3
5. PowerShell
6. Shell
7. SQL (Postgresql, SupaBase, SQLITE)
8. Bash
9. Otros

### Justificacion


### Frameworks
1. Bootstrap
2. React
3. Node.Js

### Justificacion

### Requisitos 
1. Bootstrap 5
2. Node.js 22
3. PHP 8.3
4. JDK 17
5. React 19


## Las cuatro piezas

```
   ┌──────────────┐   HTTPS + HMAC   ┌────────────────────┐   WebSocket   ┌──────────────┐
   │ agente Java  │ ───────────────► │  gateway Node/TS   │ ────────────► │  React 19    │
   │ (cada host)  │   /ingest        │  alertas + fan-out │   /stream     │  + Bootstrap │
   └──────────────┘                  └─────────┬──────────┘               └──────┬───────┘
                                               │ latido, alertas                 │ REST
                                               ▼                                 ▼
                                     ┌────────────────────────────────────────────────┐
                                     │   API PHP · identidad, 2FA, catálogo, tablero  │
                                     │   SQLite (prototipo) / Supabase                │
                                     └────────────────────────────────────────────────┘
```

| Carpeta          | Tecnología                        |  Responsabilidad                                            |
|------------------|-----------------------------------|-------------------------------------------------------------|
| `agent-java/`    | Java 17, sin dependencias         | Medir el host, firmar y enviar                              |
| `realtime-node/` | Node 22+, TypeScript, `ws`        | Ingesta, motor de alertas, difusión en vivo                 |
| `api-php/`       | PHP 8.3+ (probado en 7.3 y 8.x )  | Login + TOTP, servidores, servicios, mosaicos, histórico    |
| `frontend/`      | React 19, TypeScript, Bootstrap 5 | Interfaz: acceso, tablero de mosaicos, inventario           |
| `shared/`        | TypeScript                        | Contrato de datos único para Node y el navegador            |

Las decisiones y sus alternativas descartadas están en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Arrancar la demo

- Requiere PHP con `pdo_sqlite`(proximamente supabase) y Node 22 o superior. Cuatro terminales:

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

## Verlo desde GitHub

GitHub Pages solo sirve ficheros estáticos: no ejecuta PHP, no mantiene vivo el
gateway Node y no acepta WebSockets. De ahí dos caminos, que dan cosas
distintas.

### Codespaces — el sistema real

`.devcontainer/` levanta las cuatro piezas dentro de un contenedor de GitHub con
PHP 8.3, Node 22 y JDK 17. Al crear el codespace se instalan las dependencias y
se siembra la base; al conectarte, `.devcontainer/start.sh` arranca los cuatroOtros
procesos en segundo plano.

En la pestaña **PORTS**, abrir el 5173. Solo ese puerto necesita salir: Vite hace
de proxy hacia el 8080 y el 8081 dentro del contenedor, así que el navegador ve
un único origen. Para enseñárselo a alguien más, cambiar su visibilidad a
*Public*.

Registros en `/tmp/sentinela-*.log`; reiniciar con `bash .devcontainer/start.sh`.
Es PHP de verdad, SQLite de verdad y WebSocket de verdad, y un agente Java real
puede reportar contra él. Dura lo que dure el codespace encendido: se apaga solo
a los 30 min de inactividad y la cuota gratuita es de 60 h al mes.

# Estructura del proyecto

proyecto/
├── src/            # Código fuente
├── docs/           # Documentación adicional
├── tests/          # Pruebas
├── README.md
└── ...

### Pages — una maqueta navegable con enlace permanente


`npm run build:demo` compila el frontend con el backend metido dentro del
navegador. El generador de métricas (`realtime-node/src/fake-host.ts`) y el motor
de alertas (`realtime-node/src/alerts.ts`) son los mismos módulos que ejecuta el
gateway: lo único fingido es el transporte. La API PHP la sustituye un router de
objetos sobre `localStorage`, en `frontend/src/demo/runtime.ts`.

`.github/workflows/pages.yml` la publica, pero **solo si lo lanzas a mano** desde
la pestaña *Actions*: un sitio de Pages es público aunque el repositorio sea
privado, así que publicar no debería ser un efecto secundario de un `git push`.
Antes hay que activarlo una vez en *Settings › Pages › Source: GitHub Actions*;
mientras no lo hagas, no existe ningún sitio.

Para verlo en local sin levantar PHP ni el gateway:

```bash
cd frontend && npm run dev:demo
```

Un panel flotante marca el modo demo y deja callar a los agentes, que es como se
prueba la detección de caídas cuando no hay un simulador que matar.

Lo que la maqueta no puede ser: la contraseña se compara en el cliente y el
catálogo entero viaja en el bundle, así que ocultar una IP es coherencia de
comportamiento y no un control de acceso; y ningún agente real puede reportar
contra ella.

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
- **Incidentes a petición.** En modo demo (`npm run dev:demo`), el panel
  flotante dispara cualquiera de los ocho incidentes al momento —pico de CPU,
  memoria, disco, sobrecalentamiento, fuerza bruta, servicio detenido, apagón
  con UPS, puerto inesperado— y calla a los agentes para provocar la caída.
  Cada uno dice qué alerta debería salir y en cuántos segundos, así que sirve
  para comprobar el motor, no solo para ver bonito el tablero.

## Pruebas

```bash
cd frontend && npm test
```

47 pruebas sobre lo que tiene lógica de verdad:

| Fichero | Qué comprueba |
|---|---|
| `tests/alerts.test.ts` | El motor de alertas: histéresis, no repetir mientras dure, rearmarse al normalizar, métricas derivadas (MB a %, el disco más lleno), servicios caídos, apagones, puertos, detección de caídas y el estado consolidado del semáforo. |
| `tests/totp.test.ts` | El TOTP contra los vectores del RFC 6238. Es la garantía de que el código del modo demo es el mismo que da PHP y el mismo que daría Google Authenticator. |
| `tests/demo-api.test.ts` | El backend simulado: que el token del primer paso no lee nada, que un código equivocado no pasa, que ocultar una IP deja de enviarla, y que el tablero se guarda entero. |

El motor de alertas es el único módulo que ejecutan las dos vidas del sistema
—el gateway Node y el modo demo del navegador—, así que una regresión ahí las
rompe a la vez. De ahí que sea lo más cubierto.

`.github/workflows/ci.yml` corre esto en cada push, más los tipos, los dos
builds del frontend, la sintaxis de PHP con la semilla contra SQLite, y la
compilación del agente Java. No publica nada.

Lo que las pruebas **no** cubren: la API PHP de verdad (solo se comprueba que
la sintaxis es válida y que la semilla corre), el gateway como proceso —firma
HMAC, WebSocket, reconexión— y la interfaz.

## Modo real: el panel muestra ESTA máquina

La demo del navegador inventa los datos. Para ver las métricas **reales** del
equipo que ejecuta Sentinel, corre el stack completo con el agente Java, que las
mide de verdad. En Windows, con un comando:

```powershell
powershell -ExecutionPolicy Bypass -File run-real.ps1
```

Levanta las cuatro piezas (API PHP, gateway, agente Java, interfaz en modo
normal), siembra la base con un único servidor que es este equipo (`srv-local`,
etiquetado «Este equipo») y abre `http://127.0.0.1:5173`. Entras con `SNT-4417`
/ `Sentinela#2026`.

### Código de acceso por correo (segundo factor)

En el modo real, el segundo factor **llega por correo**: al meter usuario y
contraseña, el backend genera un código de 6 dígitos y lo envía a la dirección
del usuario. Para que se envíe de verdad hay que configurar el envío:

1. Copia `api-php/mail.local.php.example` a `api-php/mail.local.php`.
2. Pon tu Gmail y una **contraseña de aplicación** de Google (Ajustes de la
   cuenta → Seguridad → Contraseñas de aplicación; requiere verificación en 2
   pasos activada). Ese archivo está en `.gitignore`, no se sube.

Mientras **no** lo configures, el código no se pierde: aparece en la propia
pantalla de acceso (etiqueta «modo desarrollo») y en
`api-php/data/last-login-code.txt`, para poder probar el flujo sin enviar
correos. En cuanto pones el Gmail, ese respaldo desaparece y el código solo
llega a la bandeja. El correo destino es el del usuario en la base
(`sql/seed-local.php`).

Qué es real y qué no, por sistema operativo (lo que la máquina expone):

| Métrica | Linux | Windows | macOS |
|---|---|---|---|
| CPU, memoria, swap, carga | sí | sí (carga 0) | sí |
| Discos (uso) | sí | sí | sí |
| Servicios vigilados | systemd | SCM (`sc query`) | launchd |
| Intentos de intrusión | journald + fail2ban | eventos 4625 | no |
| Puertos fuera de línea base | sí | sí | sí |
| Red (kbps) | sí | no (0) | no |
| Temperatura | sensores | WMI si existe | no |
| Energía / UPS | batería + NUT | `Win32_Battery` | no |

Lo que un sistema no expone se envía honestamente vacío (`temp_c: null`, red en
0), no inventado. El agente y sus servicios vigilados se configuran en
`agent-java/agent.properties`.

### En otra máquina (no la local)

El `run-real.ps1` usa un secreto de agente fijo por comodidad. En una máquina
remota de verdad, cada agente lleva su propio secreto aleatorio (columna
`agent_secret` de la tabla `servers`, que llena `sql/seed.php`):

```bash
cd agent-java
javac -d out $(find src -name '*.java')
cp agent.properties.example agent.properties   # poner server.id y agent.secret
java -cp out mx.sentinela.agent.Agent agent.properties
```

Detalles de empaquetado como servicio en
[agent-java/README.md](agent-java/README.md).

## Base de datos y Supabase

Por defecto la base es un archivo SQLite en `api-php/data/sentinela.sqlite`
(esquema en `sql/schema.sql`). El backend es agnóstico del motor: `Db.php` lee
`SENTINELA_DSN`, así que el mismo código corre contra PostgreSQL/Supabase
cambiando esa variable. Guía paso a paso (incluye habilitar `pdo_pgsql` y el
script de copia de datos) en [docs/SUPABASE.md](docs/SUPABASE.md).
## Creadores
  1. @Ddg6140
  2. @jfmp20082-maker
  3. @jefardvv

## Licencia
Este proyecto esta bajo la licencia de Apache

## Areas de oportunidad y mejora 

- Sin TLS: en producción va todo detrás de nginx con certificados, y el token
  de sesión debería viajar en una cookie `HttpOnly; Secure; SameSite=Strict`
  en vez de en `sessionStorage`.
- Sin serie histórica larga: el gateway guarda 60 muestras en memoria. Para
  gráficas de días hace falta una base de series temporales (TimescaleDB,
  VictoriaMetrics) alimentada desde el mismo `/ingest`.
- Sin app móvil nativa: la interfaz es responsiva y el registro de dispositivos
  para notificaciones (`POST /api/push/register`) ya existe, pero falta el
  envío real a APNs y FCM.
- Sin pruebas de la API PHP ni del gateway como proceso: lo cubierto es el
  motor de alertas, el TOTP y el backend simulado (ver *Pruebas*).
- Sin despliegue del sistema real. El único workflow que publica algo sube la
  maqueta estática a Pages, y hay que lanzarlo a mano.

  # Autores
  1. JUAN FERNANDO MARTINEZ PEREZ
  2. FERNANDO ORTIZ ALVARADO
  3. ERICK ALEJANDRO VAZQUEZ ARGÜELLES

  ## Glosario

- pdo_sqlite
  - Controlador de PHP que implementa la interfaz de PHP Data Objects para permiter que las aplicaciones en PHP se concten y manipulen bases de datos de SQLite
- FCM (Firebase Cloud Messaging)
  - Plataforma de mensajeria multiplataforma  gratuita de google que permite evitar notificaciones y mensajes de forma masiva y confiable a dispositivos Android, iOS y palicacinoes web
- TOTP (Time-based One-Time Password)
  - Algoritmo matematico utilizado para generar tokens de seguridasd temporales de 6 codigos 
- firma HMAC (Hash-based Message Authenthication Code)
  - Codigo de seguridad que se utiliza para verificar la autenticidad y la integridad de un mensaje transmitido a traves de internet 

  # Implementacion de SupaBase

# Aplicacion Movil
## Tecnologia 
1. Android Studio
