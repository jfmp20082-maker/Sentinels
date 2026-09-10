# Revisión de seguridad — Sentinela

Fecha: 2026-09-08 · Alcance: `api-php`, `realtime-node`, `frontend`, `agent-java`
· Prototipo local, no desplegado.

## Cómo se hizo, y qué NO es

La habilidad `/strix` lanza agentes de IA que explotan el objetivo en un
sandbox de Docker con una clave de LLM. En este equipo **no hay Docker ni clave
de LLM**, así que Strix no se pudo ejecutar. En su lugar quedó montado para que
corra en GitHub (ver *Automatización*), y esta revisión se hizo a mano
siguiendo su método: levanté la API PHP y el gateway en local y **probé los
controles con peticiones reales**, no solo leyendo el código.

Esto **no es** un pentest completo ni cubre todo. Es una revisión caja-gris de
las fronteras de autorización más importantes, con prueba de concepto donde la
hubo. Lo que quedó sin cubrir está al final.

---

## Hallazgos

> **Estado (2026-09-08): los dos hallazgos están corregidos y re-verificados.**
> Detalle al final, en *Correcciones aplicadas*.

### 1 · Alto (por diseño en el prototipo) — el token de servicio por defecto filtra todos los secretos HMAC · ✅ CORREGIDO

**Dónde:** `api-php/public/index.php` → `requireService()`; `realtime-node/src/index.ts`.

`GET /internal/fleet` y `POST /internal/{heartbeat,alerts}` se protegen con un
token de servicio compartido que, si no se define `SENTINELA_SERVICE_TOKEN`,
vale `dev-service-token` — un valor que está escrito en el repositorio.

**Probado:** con ese token, `/internal/fleet` devolvió los seis servidores
**con su `agent_secret` en claro**:

```
GET /internal/fleet   Authorization: Bearer dev-service-token
→ srv-core-01  agent_secret = e40071ffa755022f7445bd1592245841
  srv-core-02  agent_secret = edfe1416dff678ca57dc711f0c19fccc
  ...
```

Y con ese secreto firmé una muestra falsa que el gateway **aceptó como si
viniera del agente real** (métrica de CPU al 99 %, que dispararía alertas):

```
POST /ingest  (firma HMAC calculada con el secreto filtrado)  → 202 Aceptada
```

Es decir: quien alcance la red interna y conozca el token por defecto puede
leer los secretos de todos los agentes y luego inyectar métricas y alertas
falsas por cualquier servidor.

**Por qué es "por diseño" y no un bug:** el `README` ya dice que en producción
va todo detrás de nginx y que estos endpoints son internos. El riesgo real es
que el **valor por defecto sea funcional**: si alguien despliega sin definir la
variable, queda abierto y nada avisa.

**Arreglo:** que el token no tenga valor por defecto utilizable — si
`SENTINELA_SERVICE_TOKEN` no está definido, que la API y el gateway **fallen al
arrancar** en vez de caer a `dev-service-token`. Mismo trato para el
`SENTINELA_SERVICE_TOKEN` del gateway.

---

### 2 · Bajo (latente) — el control de rol `viewer` no se ejerce nunca · ✅ CORREGIDO

**Dónde:** `PATCH /api/servers/{id}` corta con 403 si `role === 'viewer'`, pero
la semilla solo crea un `admin` y un `operator`. El camino que niega el acceso
**no lo recorre ningún usuario**, así que nunca se ha comprobado que funcione.

**Probado:** el `operator` (SNT-9002, sin 2FA) sí puede hacer `PATCH` sobre un
servidor (→ 200), que es lo esperado. Pero no hay ningún `viewer` con el que
confirmar que a él se le niega.

**Arreglo:** añadir un usuario `viewer` a la semilla y una prueba que confirme
el 403. Es barato y cierra un control que hoy es teórico. Encaja como caso nuevo
en `frontend/tests/demo-api.test.ts` y en la semilla PHP.

---

## Controles que SÍ resistieron (probados, no asumidos)

| Control | Prueba | Resultado |
|---|---|---|
| **Salto de 2FA** | token `pending_2fa` contra `/api/me`, `/servers`, `/tiles`, `/alerts` | **401 en los cuatro.** El token de primer paso no lee nada. |
| **Inyección SQL en `limit`** | `/api/alerts?limit=5;DROP TABLE alerts` | Neutralizada por el `(int)` cast; la tabla sigue viva. |
| **Firma HMAC en `/ingest`** | sin firma / firma inventada | **401 en ambas.** Solo pasa la firma correcta. |
| **Auth del WebSocket** | `/stream` sin token y con token basura | **HTTP 401 en ambas.** No hay upgrade sin sesión activa. |
| **Endpoint de demo** | `GET /api/demo/totp` sin el fichero `DEMO` | 404. Solo se abre en modo demo explícito. |
| **Bloqueo por fuerza bruta** | 6 logins con contraseña mala | Se bloquea al 6.º intento (`account_locked`). |
| **CORS** | `Origin` arbitrario | El regex solo refleja `localhost`/`127.0.0.1`, no dominios externos. |
| **Enumeración de usuarios** | login con id inexistente vs. contraseña mala | Mismo error `invalid_credentials`; no distingue. |

El diseño de fondo es sólido: el 2FA se valida en servidor, las IP ocultas no
viajan en el JSON, las contraseñas usan `password_hash`, el TOTP es RFC-6238 y
la comparación de códigos y tokens usa `hash_equals` (tiempo constante).

---

## Lo que NO se cubrió

- **La ejecución real de Strix.** Falta Docker + clave de LLM. El flujo quedó en
  `.github/workflows/security.yml` para correr en GitHub, donde el runner ya
  tiene Docker; solo faltan los dos secretos.
- **El agente Java** más allá de compilar: no se auditó su manejo de la red ni
  del `agent.secret` en disco.
- **XSS en el frontend:** React escapa por defecto, pero no se probó
  específicamente inyección en etiquetas/labels de servidor que el usuario edita.
- **Dependencias:** no se corrió `npm audit` ni análisis de la cadena de
  suministro.
- **Diseño e infraestructura:** TLS, cabeceras, rate-limiting global — el
  prototipo mismo declara que eso va detrás de nginx en producción.

## Correcciones aplicadas (2026-09-08)

### Hallazgo 1 — el token de servicio ya no tiene valor por defecto

Se eliminó el fallback `dev-service-token` de las tres piezas que lo usaban.
En vez de cambiarlo por otro valor, **el código no trae ninguno**: la única
forma de que un despliegue no pueda quedar abierto por olvido es que el
software se niegue a funcionar sin la variable.

- `api-php/public/index.php` — `requireService()` responde **503** si
  `SENTINELA_SERVICE_TOKEN` no está definida (PHP procesa por petición, no hay
  arranque que abortar; los endpoints públicos siguen vivos).
- `realtime-node/src/index.ts` y `simulator.ts` — **abortan al arrancar**
  (código de salida 1) si la variable falta.
- `dev.sh`, `dev.ps1`, `.devcontainer/start.sh` — fijan un token de desarrollo
  local, para que el arranque sin configurar siga funcionando. Ese valor vive
  solo en el lanzador, nunca como default del código: en un despliegue lo pone
  el operador, distinto.

**Re-verificado con peticiones reales:**

| Situación | Antes | Ahora |
|---|---|---|
| API sin la variable, `/internal/fleet` con `dev-service-token` | 200 + secretos | **503** `service_token_no_configurado` |
| API con token real, intento con el viejo `dev-service-token` | — | **403** |
| API con token real, intento con el token correcto | — | **200** |
| Gateway / simulador sin la variable | arrancaban | **no arrancan** (salida 1) |
| `/api/health` sin la variable | 200 | **200** (lo público no se ve afectado) |

### Hallazgo 2 — existe un `viewer` y su 403 está probado

Se sembró `SNT-7003` (rol `viewer`) en `api-php/sql/seed.php` y en los datos de
la demo, y se añadieron pruebas en `frontend/tests/demo-api.test.ts`.

**Re-verificado en la API PHP real:** el viewer hace `GET /api/servers` → 200
(lee), pero `PATCH /api/servers/srv-core-01` → **403** `forbidden`. El camino
que antes no recorría nadie ahora lo recorre un usuario y está cubierto por una
prueba automática (50 pruebas en verde).

> Credencial del nuevo rol (demo): `SNT-7003` / `Lectura#2026`, sin 2FA.
