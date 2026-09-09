# Agente Java

Se instala en cada maquina vigilada. Mide, firma y envia; nada mas.

## Compilar

```
javac -d out $(find src -name '*.java')          # Linux / macOS
javac -d out (Get-ChildItem -Recurse src -Filter *.java).FullName   # PowerShell
```

## Ejecutar

```
cp agent.properties.example agent.properties     # y poner el secreto real
java -cp out mx.sentinela.agent.Agent agent.properties
```

## Empaquetar como servicio

- Linux: unidad systemd con `Restart=always` y `User=sentinela` (sin root).
- Windows: `sc create SentinelaAgent binPath= "..."`, o WinSW.
- macOS: `launchd` plist en `/Library/LaunchDaemons`.
- Contenedor: imagen `eclipse-temurin:21-jre-alpine`, configuracion por env.

## Permisos minimos

El agente solo necesita leer. En Linux basta con anadir al usuario a
`systemd-journal` para el conteo de logins fallidos; no requiere root.
