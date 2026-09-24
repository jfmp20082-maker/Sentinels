# Decision de la  arquitectura


Por qué cada tecnología está donde está, y qué se descartó.

---

## 1. Por qué cuatro procesos y no uno

El sistema tiene tres cargas de trabajo con formas muy distintas:

| Carga | Frecuencia | Naturaleza |
|---|---|---|
| Leer sensores del sistema operativo | cada 5 s por host | acceso al SO, multiplataforma |
| Evaluar reglas y difundir | cientos de eventos/s | flujo, muchas conexiones abiertas |
| Login, catálogo, preferencias | decenas de peticiones/min | CRUD transaccional |

Meterlas en un solo runtime obliga a elegir el peor compromiso para dos de las
tres. Separarlas permite que cada una use la herramienta que le corresponde y
que escalen por separado: si entran 300 servidores nuevos se replica el gateway,
no el panel.

---

## 2. Backend

### Java — el agente que vive en cada servidor

**Por qué.** Es el único lenguaje de la pila que corre igual en Linux, Windows
y macOS con **un solo artefacto compilado**, que es exactamente el requisito de
una flota mixta. `com.sun.management.OperatingSystemMXBean` entrega CPU,
memoria física, swap y carga del sistema con la misma llamada en los tres
sistemas; el resto de la JVM ya trae HTTP (`java.net.http.HttpClient`) y
criptografía (`javax.crypto.Mac`) sin bajar una sola dependencia.

**Cómo se usó.**
- `Agent.java` — bucle programado con un solo hilo (`ScheduledExecutorService`),
  firma HMAC-SHA256 de cada muestra, y una **cola local** (`ArrayDeque` de 500
  entradas) que retiene lo que no se pudo entregar y lo reenvía cuando vuelve la
  red. Un agente que pierde datos durante un corte no sirve para investigar ese
  corte.
- `Collector.java` — lo que la JVM sí sabe va por JMX; lo que no (sensores de
  temperatura, servicios, logs de autenticación) tiene una rama por sistema:
  `/sys/class/thermal` y `systemctl` en Linux, WMI y `sc query` en Windows,
  `launchctl` en macOS. El JSON que sale es idéntico en los tres casos, así que
  ni el gateway ni el frontend saben nunca en qué SO corre cada agente.
- `Json.java` — 90 líneas de serializador. Se instala en máquinas ajenas: cada
  dependencia es superficie de ataque y trabajo de parcheo ajeno.

`Descartado`. Un script Python o Bash por sistema: tres bases de código que
divergen. Un binario Go sería igual de válido y más ligero, pero Java estaba en
los requisitos y la JVM ya suele estar instalada en servidores corporativos.

### Node.js + TypeScript — el gateway de tiempo real

**Por qué.** Dos problemas que PHP resuelve mal:

1. **Miles de conexiones abiertas.** Un WebSocket por pestaña que dura horas.
   El modelo de PHP (un proceso por petición, que termina al responder) no
   sostiene conexiones largas; el bucle de eventos de Node sí, y con memoria casi
   plana.
2. **Estado entre muestras.** El motor de alertas necesita recordar *desde
   cuándo* se cumple una condición para no gritar por un pico de un segundo, y
   qué alertas ya avisó. Eso es estado en memoria vivo entre peticiones, algo
   que PHP no tiene sin Redis de por medio.

**Cómo se usó.**
- `index.ts` — servidor HTTP con `/ingest` (verifica la firma HMAC con
  `timingSafeEqual`, no con `===`) y `/healthz`.
- `hub.ts` — un `WebSocketServer` con `noServer: true` sobre el mismo puerto;
  el *upgrade* `solo se acepta si el token del panel es válido en PHP. Guarda 60
  muestras por servidor para que un cliente que acaba de conectarse vea la
  gráfica completa desde el primer frame.`
- `alerts.ts` — estructura con heap (`minHeap`), alertas de servicio caído,
  paso a UPS, puertos fuera de línea base, e intentos de acceso fallidos.
  Las caídas se detectan **por silencio**, en un temporizador, porque un
  servidor apagado justamente deja de enviar datos.
- `simulator.ts`(pruebas) — seis agentes falsos que firman con el mismo HMAC. El gateway
  no los distingue de agentes reales, que es la prueba de que el contrato está
  bien definido.

**TypeScript, no JavaScript a secas.** El agente Java escribe un JSON con 30
campos anidados que atraviesa tres procesos. `shared/types.ts` es la única
definición de ese contrato y la comparten el gateway y el navegador: si se
renombra `mem_used_mb`, el compilador señala los dos lados. En JavaScript plano
eso sale en producción como `undefined` en una gráfica.

Node 22+ ejecuta `.ts` directamente (borrado de tipos nativo), así que el
gateway **no tiene paso de compilación**: `node src/index.ts` y listo. Por eso
el `tsconfig.json` activa `erasableSyntaxOnly` y el código no usa `enum` ni
propiedades de constructor.

### PHP — la API del panel

**Por qué.** Es el terreno donde PHP sigue siendo la opción sensata: CRUD
transaccional, sesiones y despliegue. Corre en cualquier hosting compartido, se
actualiza copiando archivos, y trae de fábrica lo que aquí importa —
`password_hash()` con Argon2id/bcrypt y salt automático, `hash_equals()` para
comparar en tiempo constante, `hash_hmac()`, PDO con sentencias preparadas.

**Cómo se usó.**
- `public/index.php` — todas las rutas, sin framework. Un prototipo con 15
  endpoints no gana nada cargando Laravel; se pierde legibilidad y arranque.
- `src/Auth.php` — login en dos pasos. El primer paso emite un token en estado
  `pending_2fa` que **no abre ningún dato**: `/api/servers` responde 401 hasta
  que el TOTP lo promueve a `active`. Bloqueo tras 5 intentos, y `password_verify`
  se ejecuta incluso cuando el usuario no existe para que el tiempo de respuesta
  no revele qué identificadores son válidos.
- `src/Totp.php` — RFC 6238 implementado a mano, ~110 líneas, sin Composer.
  Compatible con Google Authenticator, Authy y las claves de verificación de
  iOS. Genera también la URI `otpauth://` para el QR de alta.
- `src/Db.php` — PDO sobre SQLite en el prototipo. Nada del SQL usado es
  propietario: cambiar `SENTINELA_DSN` a MySQL o PostgreSQL es todo el trabajo.

**IP enmascarado.** Cuando `ip_visible = 0` la API devuelve
`ip_private: null`. No se enmascara en el cliente, porque enmascarar en el
cliente es teatro: el dato seguiría estando en el JSON de la pestaña de red.

`Descartado`. Poner también el tiempo real en PHP con *long polling*: consume
un proceso por cliente conectado y añade segundos de latencia. Poner el CRUD en
Node: se pierde la facilidad de despliegue que fue la razón de elegir PHP.

---

## 3. Frontend

### React 19

Se usan a propósito las novedades de la versión 19, no como adorno:

| Novedad | Dónde | Qué resuelve |
|---|---|---|
| `useActionState` | `pages/Login.tsx` | El formulario es una función `async`. React gestiona pendiente, error y doble envío: cero `useState` de "cargando". |
| `useFormStatus` | `Login.tsx` (`BotonEnviar`) | El botón sabe solo si su formulario está enviando, sin recibir props. |
| `useOptimistic` | `MosaicGrid.tsx`, `Servers.tsx` | El mosaico se mueve y el ojo de la IP cambia en el mismo frame; si el guardado falla, React revierte. |
| `use(Context)` | `context/Session.tsx` | Lee el contexto sin `useContext` y sin las restricciones de los hooks clásicos. |
| `<Contexto>` como proveedor | `Session.tsx` | Ya no hace falta `<Contexto.Provider>`. |
| `<title>` en el componente | `Login.tsx`, `Dashboard.tsx` | React sube las etiquetas de metadatos al `<head>`; no hace falta `react-helmet`. |
| `ref` como prop normal | `Login.tsx` | Enfocar el campo del código sin `forwardRef`. |

**El problema de rendimiento y cómo se resolvió.** Llegan hasta seis muestras
por segundo. Si cada una hiciera `setState` en el componente raíz, React
recorrería el árbol completo doce veces por segundo y la interfaz se
arrastraría. La solución es `lib/useStream.ts`: un store externo con
`useSyncExternalStore` y suscripciones por clave (`server:<id>`, `alerts`,
`fleet`). Un dato nuevo de `srv-db-01` re-renderiza el mosaico de `srv-db-01` y
nada más.

**Descartado.** Redux o Zustand para el tiempo real: añaden una capa para lo
mismo que ya hace `useSyncExternalStore`, que es API estándar de React.
React Router: con dos vistas, el estado basta; con cinco, entraría.

### Bootstrap 5 + CSS propio

**Por qué Bootstrap.** El tablero se apoya en la rejilla de 12 columnas:
cada mosaico solo declara su ancho (`col-xl-3`, `col-xl-6`, `col-xl-12`) y el
navegador hace el reflujo, incluido el responsive de móvil. Eso ahorra una
librería de "dashboard grid" completa. Además viene resuelto lo aburrido y
fácil de hacer mal: estados de foco visibles, contraste de los formularios,
`aria` en los componentes, tablas responsivas.

**Cómo se personalizó sin pelearse con él.** `src/styles.css` **no
sobreescribe** las clases de Bootstrap: redefine sus propias variables CSS
(`--bs-body-bg`, `--bs-primary`, `--bs-border-radius`…) y añade las del
proyecto (`--snt-ok`, `--snt-warn`, `--snt-crit`). Actualizar Bootstrap no
rompe el tema. Del JavaScript de Bootstrap solo se carga el módulo del menú
desplegable; el panel lateral del editor lo controla React, porque mezclar los
dos sistemas de estado termina en paneles que no se cierran.

**Alineación con las pautas de Apple.** La tipografía encabeza con
`-apple-system`, así que en macOS e iOS se renderiza con San Francisco. Los
colores de estado son los semánticos del sistema (`#35c759`, `#ff9f0a`,
`#ff453a`). `index.html` declara `viewport-fit=cover` y
`apple-mobile-web-app-status-bar-style` para la barra de estado, y todas las
animaciones se desactivan bajo `prefers-reduced-motion`.

### Gráficas en SVG, sin librería

Un medidor circular y una serie temporal son unas 40 líneas de SVG cada uno
(`components/Charts.tsx`). Chart.js sumaría ~200 kB y un `<canvas>` que hay que
redibujar a mano en pantallas Retina y en cada cambio de tamaño. El SVG escala
solo, hereda las variables CSS del tema y se anima con `stroke-dasharray`.

---

## 4. Seguridad del prototipo

| Riesgo | Medida | Dónde |
|---|---|---|
| Agente suplantado | HMAC-SHA256 del cuerpo, secreto por servidor, comparación en tiempo constante | `Agent.java`, `index.ts` |
| Fuerza bruta al login | Bloqueo a los 5 intentos, respuesta de duración constante | `Auth.php` |
| Token robado en el primer paso | El estado `pending_2fa` no autoriza ninguna lectura | `Auth.php` |
| Inyección SQL | PDO con sentencias preparadas en todas las consultas | `Db.php` |
| Fuga de IP | El backend no envía la dirección cuando está oculta | `index.php` |
| WebSocket abierto | El *upgrade* valida el token contra `/api/me` | `hub.ts` |
| Trazabilidad | `audit_log` registra login, fallos, cambios y confirmaciones | `Db::audit()` |

Falta para producción: TLS en todo, token en cookie `HttpOnly` en vez de
`sessionStorage`, límite de peticiones por IP, y rotación de los secretos de los
agentes.

# Glosario
- ScheduledExecutorServices
  - Permite  programar tareas para que se ejecuten despues de un retraso o de fomra periodica, usando un pool de hilos en lugar de crear hilos manualmente con `Timer`/`TimerTask` que son mas limitados y propensos a errores 
- Ingest
  - Es un endpoint de Node/TypteScript que funje como puerta de entrada por donde cada angente java manda sus muestras de monitoreo cada 5seg
- healtz
  - Otro endpoint que verifica la salud del proceso permitiendo comprobar rapidamente si el gateway esta vivo y respondiendo, sin necesidad de la autentificacion ni enviar datos de monitoreo

