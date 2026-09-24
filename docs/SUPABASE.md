# Migrar la base a Supabase (Postgres)

El backend ya es agnóstico del motor: `Db.php` lee `SENTINELA_DSN` y el mismo
código corre contra SQLite (por defecto) o PostgreSQL/Supabase. Esta guía deja
la base en Supabase sin tocar el resto (gateway, agente, frontend siguen igual).

Lo que **no** cambia: las métricas en vivo no se guardan en la base (van por el
gateway en memoria), así que migrar a Supabase no afecta el tiempo real. Y la
demo del navegador sigue con `localStorage`.

## Paso 0 (requisito): habilitar `pdo_pgsql` en PHP

Tu PHP hoy trae `pdo_sqlite` y `pdo_mysql`, pero **no** `pdo_pgsql`. Sin él, PHP
no puede conectarse a Postgres. Para habilitarlo en Windows:

1. Encuentra tu `php.ini`:
   ```powershell
   php --ini
   ```
2. Ábrelo y quita el `;` del principio de estas dos líneas (o agrégalas):
   ```ini
   extension=pdo_pgsql
   extension=pgsql
   ```
   Los DLL (`php_pdo_pgsql.dll`, `php_pgsql.dll`) ya vienen en la carpeta `ext/`
   de PHP para Windows; basta con activar la extensión.
3. Verifica:
   ```powershell
   php -m | findstr pgsql
   ```
   Debe listar `pdo_pgsql` y `pgsql`.

## Paso 1: crear el proyecto en Supabase

1. En [supabase.com](https://supabase.com) crea un proyecto y **anota la
   contraseña** de la base que te pide al crearlo.
2. Ve a **Project Settings → Database → Connection string → URI**. Copia la
   cadena; se ve así:
   ```
   postgresql://postgres:TU_PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres
   ```
   Usa la conexión **directa** (puerto `5432`) o el **Session pooler**. Evita el
   *Transaction pooler* (6543) para sembrar/migrar, porque no soporta bien las
   sentencias preparadas de `migrate()`.

## Paso 2: apuntar Sentinel a Supabase

Define la variable de entorno con esa cadena (el código la traduce al DSN de
PDO y fuerza TLS automáticamente):

```powershell
$env:SENTINELA_DSN = "postgresql://postgres:TU_PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres"
```

No hace falta pegar la contraseña en ningún archivo del repo: vive solo en esa
variable de entorno de tu sesión. (Si prefieres un `.env`, no lo subas a git.)

## Paso 3: crear el esquema y los datos

Con `SENTINELA_DSN` puesto, elige una:

- **Empezar limpio** (recomendado): crea el esquema y siembra este equipo.
  ```powershell
  cd api-php
  php sql/seed-local.php
  ```
- **Conservar tus datos actuales** del SQLite local: cópialos a Supabase.
  ```powershell
  cd api-php
  php sql/migrate-to-pg.php
  ```

`Db::migrate()` detecta que el motor es Postgres y aplica `sql/schema.pg.sql`
(los tipos de Postgres); contra SQLite sigue usando `sql/schema.sql`.

## Paso 4: arrancar

Arranca como siempre. Como los procesos hijos heredan la variable, basta con
tenerla puesta antes de lanzar:

```powershell
$env:SENTINELA_DSN = "postgresql://postgres:TU_PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres"
powershell -ExecutionPolicy Bypass -File run-real.ps1
```

```bash
export SENTINELA_DNS="postgresql://postgres:TU_PASSWORD@db.xxxxxxxx.supabase.co:542/postrges" ./run-real.ps1
```

Ojo: `run-real.ps1` **re-siembra** en cada arranque (`seed-local.php`). Si
migraste datos que quieres conservar, no uses el script tal cual: arranca PHP,
el gateway y el agente a mano (o comenta la línea del seed en el script).

## Qué se cambió para esto

- `sql/schema.pg.sql` — esquema con tipos de Postgres (mismas tablas).
- `src/Db.php` — detecta el motor, acepta la cadena `postgresql://…` de Supabase
  (la traduce a DSN de PDO con `sslmode=require`), elige el esquema, y añade
  `Db::upsert()` que genera el SQL correcto por motor.
- `public/index.php` — los dos `INSERT OR REPLACE` (alerts, push_devices) pasan
  por `Db::upsert` (SQLite: `INSERT OR REPLACE`; Postgres: `ON CONFLICT`).
- `sql/migrate-to-pg.php` — copia opcional de SQLite al destino.

## Comprobado / no comprobado

- Comprobado: SQLite sigue intacto (el `upsert` reemplaza bien) y la sintaxis
  PHP de todo lo nuevo.
- No comprobado aquí: la conexión real a Supabase, porque este equipo no tiene
  `pdo_pgsql` habilitado ni acceso a tu proyecto. En cuanto lo habilites y
  pongas tu `SENTINELA_DSN`, corre `php sql/seed-local.php`: si crea el esquema
  y siembra sin error, está conectado. Si algo falla, mándame el mensaje.


# Glosario 
- Session pooler
  - Modo de conexion para bases de datos que gestiona como se reparten las conexiones entre clientes y la base de datos 
- DSN
  - Cadena de texto que contiene toda la informacion necesaria para que unaaplicacion se conecte a una base de datos
- TLS (Transport Layer Security)
  - Protocolo criptografico que cifra y autentica las comunicaciones entre dos puntos de una red