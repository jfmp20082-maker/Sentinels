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
### Autentificacion, automatizacion, parametros, manejo de credenciales
## Mantenimiento `Pendiente`
### Backups
### Logs
### Errores Comunes
### Sulciones
## Anexos `Pendiente`
### Glosario
### Referencias
### Diagrama