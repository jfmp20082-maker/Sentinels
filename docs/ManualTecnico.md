# Manual Tecnico
## Introduccion
Aplicacion de gestion de monitoreo de servidores que muestra el estatus sobre el hardware en tiempo real con alertas via LAN o remoto por medio de la aplicacion movil; sobre la utilizacion de recursos, apagones, colapsos o intentos de vulneracion. La aplcacion esta en base a las normativas y estandares de apple con disponibilidad para descargar en computadores(windows, linux, mac) y celulares(Android, iOS)

### Proposito del manual

### Version
0.1
### Autor
1. @Ddg6140
2. @jfmp20082-maker
### Contribuyentes
1. @jefardvv
### Historial de cambios
1. 
2. 
3. 
4. 
5. 

## Arquitectura 
### Diagrama de arquitectura
Tiene un apartado propio [Arquitectura](arquitectura.html)
## Arquitectura del Stack Tecnológico

Este documento describe la estructura, componentes e interacciones del stack tecnológico híbrido y políglota del proyecto.

### 🏗️ Resumen del Stack

El ecosistema está diseñado bajo un enfoque híbrido, combinando el desarrollo Frontend moderno, servicios Backend distribuidos, soluciones de Base de Datos como Servicio (BaaS) y automatización avanzada de sistemas.

---

### 🛠️ Capas del Sistema

#### 1. Capa de Frontend (Cliente)
*   **Tecnologías:** `JavaScript` / `TypeScript`
*   **Propósito:** Construcción de la interfaz de usuario, gestión del estado de la aplicación, validaciones en el cliente e interacciones dinámicas.

#### 2. Capa de Backend (Servicios)
El backend opera de forma híbrida para maximizar el rendimiento según el caso de uso:
*   **Java:** Microservicios robustos, procesamiento pesado de datos o lógica de negocio empresarial.
*   **PHP:** Gestión de contenido, plantillas web dinámicas o APIs de rápida iteración.
*   **Node.js (JS/TS):** Funciones Serverless, middlewares o APIs ligeras orientadas a eventos.

#### 3. Capa de Datos (BaaS)
*   **Tecnología:** `Supabase` (PostgreSQL)
*   **Propósito:** Gestión de la base de datos relacional, control de autenticación de usuarios (Auth), almacenamiento de archivos (Storage) y APIs REST/GraphQL autogeneradas.

#### 4. Capa de Automatización y DevOps (Scripts)
*   **Tecnologías:** `Bash` / `Shell` (entornos Linux/Unix) y `PowerShell` (entornos Windows/Multiplataforma).
*   **Propósito:** Automatización de despliegues (CI/CD), aprovisionamiento de servidores, configuración de entornos locales y mantenimiento del sistema.

---

### 🔄 Flujo de Integración y Comunicación

El siguiente diagrama conceptual muestra cómo interactúan los componentes dentro del ecosistema:

```text
       ┌────────────────────────────────────────┐
       │         Frontend: JS / TS              │
       └────┬───────────────────────────────┬───┘
            │                               │
            │ (Consultas y Auth)            │ (Peticiones HTTP/REST)
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│       Supabase        │       │   Backend Híbrido     │
│ (PostgreSQL / Storage)│       │    (Java / PHP)       │
└───────────────────────┘       └───────────────────────┘
            ▲                               ▲
            │                               │
            └───────────────┬───────────────┘
                            │ (Despliegue y Ops)
               ┌────────────┴────────────┐
               │ Bash / Shell / PS       │
               └─────────────────────────┘
```

### 🚀 Lineamientos de Desarrollo

1. **Tipado Estricto:** Se prefiere el uso de `TypeScript` sobre `JavaScript` en el Frontend y Node.js para asegurar la mantenibilidad del código.
2. **Seguridad en Datos:** Toda consulta directa desde el frontend a `Supabase` debe estar protegida mediante Políticas de Seguridad a Nivel de Fila (RLS).
3. **Multiplataforma:** Los scripts de automatización críticos deben tener su equivalente tanto en `Bash` (para servidores de producción en la nube) como en `PowerShell` (para desarrollo local si se utiliza Windows).
4.

## Modelo de datos `Pendiente`

### Diagrama entidad-relacion
### Diccionario de datos

## Diseño del sistema `Pendiente`
### Macrodiseño
### Microdiseño
### Diagrama de casos de uso/flujo

## Estructura del codigo
### Organizacion de carpetas y archivos
```
proyecto/
├── src/            # Código fuente
├── docs/           # Documentación adicional
├── tests/          # Pruebas
├── README.md
└── ...
```
### Explicacion de modulos/rutas principales
## API/Endponits `Pendiente`
### Lista de endpoints, metodos, parametros, respuestas
## Seguridad `Pendiente`
Se realizaron pruebas de las vulneraciones pertinentes ara garantizar la seguridad de la informacion de cada servidor y/o servicio vinvulado a la app 
     ### Detalle de cada prueba 
| Tipo de vulneracion | ¿Como se probo? | Resultado|¿Que lo bloquea en el codigo? |
|---------------------|-----------------|----------|-----|
|1. Acceso a datos sin iniciar sesion| Pedir el listado de servidores directamente, sin token de sesion para ver si la API entrega datos a cualquiera `GET /api/servers (sin cabecera Authorization)`| HTTP 401 Unauthorized -- la API no entrego ningun dato| Toda la ruta que devuelve datos privados pasa primero por la funcion `requieUser()` en `api-php/public/index.php` que exige un token de inicio de sesion activo (`Auth::currentUser()`) y cortacon 401 si no lo hay.|
|2. Token de sesion falso(manipulado)| Provar con un token inventado("token-falso-123") en la cabecera Authorization, por si el backend confia en cualquier valor con forma de token `GET /api/servers Autorization: Bearer-falso-123`| HTTP 401 Unauthorized| Los tokens  se generan con `random_bytes(32)`criptograficamente aleatorio (`Auth.php`) y se validan contra la tabla `sessions`en base de datos; un token que no existe ahi, no pasa la verificacion, y no hay ningun atajo ni valor por defecto que lo acepte.|
|3. Inyeccion SQL en formulario de login | Mandar una carga tipica de inyeccion SQL ('` OR 1=1--`) en el campo identificador, buscando saltarse la contrasena o filtrar la base. `POST /api/auth/login   {"id": "' OR 1=1 --", "password": "x"}`| ` {"error":"invalid_credentials"}` — tratado como un usuario mas que no existe, sin errores de base de datos ni acceso indebido| Todas las consultas usan sentencias preparadas con parametros `(Db::one('... WHERE id = ? OR email = ?', [...]))`, asi que el texto que manda el usuario nunca se interpreta como SQL. Ademas,*` password_verify()`* se ejecuta siempre (incluso si el usuario no existe) para que el tiempo de respuesta no revele si el identificador es valido.|
|4. Backdoor de 2FA de demo (GET /api/demo/totp) | Este endpoint existe a proposito en el codigo para el modo demo: entrega el codigo TOTP vigente sin pedir nada. Se probo si sigue activo en el modo real. `GET /api/demo/totp` |  HTTP 404 — "not_found". El endpoint esta inactivo. | El propio codigo lo desactiva salvo que exista el archivo `api-php/data/DEMO` o la variable de entorno `SENTINELA_DEMO=1`; ninguno de los dos esta presente en modo real, asi que la ruta se corta antes de entregar nada.|
|5. Backdoor de respaldo del codigo de acceso (GET /api/dev/last-code)|  Endpoint de desarrollo que devuelve el ultimo codigo de 2FA enviado, pensado para probar el login sin tener SMTP configurado. Se probo si sigue activo aun con el correo real configurado. `GET /api/dev/last-code`|HTTP 404 — "not_found".|  La funcion valida `Mailer::configured()` antes de responder: si hay una configuracion de correo real (`api-php/mail.local.php`, que en esta instalacion apunta a Gmail), el respaldo de desarrollo se apaga solo y el codigo unicamente llega a la bandeja del usuario.|
|6. Fuerza bruta de contrasena|  Enviar la contrasena incorrecta seis veces seguidas contra la misma cuenta, para ver si el sistema permite probar contrasenas sin limite. `POST /api/auth/login (x6)  {"id": "SNT-4417", "password": "incorrecta"}`| Los primeros 5 intentos devuelven `"invalid_credentials"`; el 6to devuelve `{"error":"account_locked","retry_in":299}` — la cuenta queda bloqueada.|`Auth::login()` cuenta los intentos fallidos por usuario (`failed_tries`) y, al llegar a `MAX_TRIES = 5`, fija `locked_until` 300 segundos (5 min) hacia adelante; mientras tanto ningun intento se procesa, ni con la contrasena correcta.|
| 7. Robo de sesion desde un sitio malicioso (CORS) | Simular una peticion como si viniera de un sitio atacante `(Origin: https://evil-attacker.com)`, para ver si el navegador de una victima podria leer sus datos desde ahi. `GET /api/me   Origin: https://evil-attacker.com` | La respuesta no trae la cabecera `Access-Control-Allow-Origin:` el navegador de la victima bloqueria la lectura aunque la peticion "saliera", por politica CORS por defecto.| La API simplemente no declara ninguna cabecera CORS abierta. El frontend real le habla en el mismo origen gracias al proxy de Vite (`/api` → 127.0.0.1:8080, `/stream` → ws://127.0.0.1:8081, en `vite.config.ts`), asi que no necesita ni expone CORS entre sitios.|
|8. Acceso directo a archivos con secretos |  Pedir por HTTP los archivos que guardan credenciales reales: la configuracion de correo Gmail, la base de datos SQLite y la cadena de conexion de Supabase. `GET /mail.local.php    GET /data/sentinela.sqlite    GET /../conexion.local.ps1`| Los tres devuelven HTTP 404. Ninguno es accesible desde la web.| El servidor PHP se levanta con `-t public`, es decir que su raiz servible es solo la `carpeta public/` (que contiene unicamente `index.php`); `mail.local.php`, la base de datos y los scripts de PowerShell viven fuera de ese directorio y son fisicamente inalcanzables por HTTP.| 
|9. Recorrido de directorios (path traversal) | Intentar escapar del directorio publico con secuencias ../ para llegar a archivos fuera de HTTP 404 en ambos casos.`public/. GET /../conexion.local.ps1    GET /../../conexion.local.ps1`| HTTP 404 en ambos casos.| El servidor embebido de PHP normaliza y rechaza rutas con .. antes de resolver el archivo, ademas de que, como en la prueba 8, esos archivos ya estan fuera del document root por diseno — doble barrera.

### Autentificacion, automatizacion, parametros, manejo de credenciales



## Mantenimiento `Pendiente`
### Backups
### Logs
### Errores Comunes
#### Glosario de errores
|Numero de error|Razon| Solucion|
|---------------|-----|---------|
|Error 404      |Pagina no encontrada| Reinicia la pagina o espera respuesta de servico tecnico|
|Error 403      |Time Out| Revisa tu conexion a internet|
Error 505
## Anexos `Pendiente`
### Glosario
### Referencias
### Diagrama