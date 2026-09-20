# Analisis y Diseño

## Introduccion
Aplicacion de gestion de monitoreo de servidores que muestra el estatus sobre el hardware en tiempo real con alertas via LAN o remoto por medio de la aplicacion movil; sobre la utilizacion de recursos, apagones, colapsos o intentos de vulneracion. La aplcacion esta en base a las normativas y estandares de apple con disponibilidad para descargar en computadores(windows, linux, mac) y celulares(Android, iOS)

## Planteamiento del problema/Justificacion

La gestión de servidores suele ser muy agobiante para gente que no es técnica en el área, y monitorearlos requiere estar presente para evitar que colapsen, lo que provoca un mayor esfuerzo para la persona u organismo al tratar de impedir que no colapsen, caigan o sean vulnerados. En la actualidad, esto hace que se pierda eficiencia en los procesos. Esto implica que gestionarlos sea una tarea más compleja que afecta tanto a los usuarios como al servidor. Meta y resultado
Meta: Simplificar el proceso de registro para aumentar las tasas de conversión manteniendo la seguridad.
Facilidad de visualización de los procesos que gestiona los servidores o servicios del mismo

### Métricas de éxito: (tiempo y % de mejora)
- Aumentar la productividad del organismo o persona responsable
- Notificar al encargado antes que un servidor se sobrecargue o sea vulnerado
- Llegar en ganancias al costo de producción

### Usuarios objetivo y casos de uso 
#### Usuarios principales:
- Startup o pymes con gestion de datos, empresas consolidadas
- Tecnicos
- creadores de contenido del area de TI

#### Casos de uso clave:

- Facilidad de uso para gente no tecnica 
- Registro de recursos por servicio y/o servidor 
- Registro de historial de colapsos 
- Registro de historial de vulneraciones 

## Solucion - propuesta
### Caracteristicas principales:
1. Seguridad
    - Integracion de registro de inicio de sesion social(Google, Microsoft, SAP, Slack)
    - Verificacion de 2 pasos por medio de aplicaciones(Authy, Authenticator, etc)
    - Desbloqueo por huella o FaceId para dispositivos moviles
    - Encriptacion y resguardo de direcciones ip/MAC por medio de encrptacion avanzada y gestionada por cloudfire

2. Flujo de trabajo optimizado
    - Campos minimos requeridos para el acceso inicial
    - Establecimiento de objetivos para preferencias opcionales 
    - Completar el perfil de manera progresiva
    - Presonalizacion a preferencias y necesidades del usuario

# Objetivo general

Asegurar y monitorear todos los servicios y/o servidores que esten vinculados a la aplicacion, para un mayor flujo de trabajo; cuantificando el uso de los recursos asignados a estos mismos, asi como tambien la afluencia de informacion que estos les requieren

## Organizacion 
### Roles

| Persona | Rol | Responsabilidad   |
|---------|-----|-------------------|
|Fernando |PM, Analista, QA|Manejar los flujos de trabajo, documentar todo el proceso elaborado y probar el sistema|
|Juan     |Desarrollador, Diseñador Ux/Ui|  Desarollar y diseñar la aplicacion en base de los requerimientos que designe el analista|
|Erick    |Consultor| Dirige, corrige y contribuye con toda la elaboracion de la aplicacion|

Se establecieron los roles buscando que las responsabilidades de las areas asignadas fueran de mayor facilidad para cada integrante, tambien pensado en sus fortalzas y areas de oportunidad 

### Forma de trabajo
Se llego a la conclusion que el metodo Kanban era el mas ideoneo por su rapidez y versatilidad para los cambios imprevistos
[Sentinel.kanban.md](Sentinel.kanban.md)

# Alcance 

### PMF

### Lo que puede tambien ser
1. Consola Remota
2. Seleccion de agentes
3. IA Managment
4. VPN dedicada
5. Firewall dedicado 

### Fuera del alcance inicial

- Personalizacion compleja del perfil durante el registro inicial
- Configuracion avanzada de preferencias 
- Gestion de multiples cuentas
- Metodos de autentificacion personalizados 
- Gestion para servidores y/o servicios pesados o complejos

## Requisitos iniciales
- Para correr el programa 
    1. Bootstrap 5
    2. Node.js 22
    3. PHP 8.3
    4. JDK 17
    5. React 19
- Para correrlo desde celular
    1. dkdk

## Plataforma 
### Sistema operativo
Se opto por hacerlo multiplataforma usando las normativas de apple como un estandar, teniendo en el apartado de  [ARQUITECTURA](ARQUITECTURA.md) 


Buscamos el tener el mayor numero de publico para la aplicacion, sin dejar la calidad de lado, aprovechando los beneficios de las normativas de apple, teniendo como resultado una interfaz con buen diseño y muy fluida 
# Estrategia de desarrollo 
Se decidio hacer la aplicacion web primero para que se pueda visualizar en navegadores web, para que posteriormente se pueda convertir para aplicaciones de escritorio  y despositivos moviles


# Hardware y tecnologia
### Componentes minimios
# Lenguaje y tecnologia 
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
lorem

### Frameworks
1. Bootstrap
2. React
3. Node.Js

### Justificacion
lorem
### Requisitos 
1. Bootstrap 5
2. Node.js 22
3. PHP 8.3
4. JDK 17
5. React 19

# Entorno de desarrollo
### Herramientas seleccionadas
1. Visual Studio Codium (Code OSS)
2. Sublime Text
3. Android Studio
4. SupaBase

La configuracion inicial y las evidencias estan en el [README](/README.md)

