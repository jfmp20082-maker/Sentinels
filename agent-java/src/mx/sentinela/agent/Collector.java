package mx.sentinela.agent;

import com.sun.management.OperatingSystemMXBean;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Recolector de metricas del host.
 *
 * Aqui es donde Java se gana su lugar: OperatingSystemMXBean da CPU, memoria y
 * carga del sistema con la MISMA llamada en Linux, Windows y macOS. Lo que no
 * cubre la JVM (sensores, servicios, logs de autenticacion) se resuelve con una
 * rama por sistema operativo, y el resto del agente ni se entera.
 */
public class Collector {

    private final OperatingSystemMXBean os =
            (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    private final String serverId;
    private final List<String> watchedServices;
    private final List<Integer> baselinePorts;

    /** Contadores de red previos, para calcular kbps por diferencia. */
    private long prevRxBytes = -1;
    private long prevTxBytes = -1;
    private long prevSampleNanos = 0;

    public Collector(String serverId, List<String> watchedServices, List<Integer> baselinePorts) {
        this.serverId = serverId;
        this.watchedServices = watchedServices;
        this.baselinePorts = baselinePorts;
    }

    public String sample() {
        long now = System.currentTimeMillis();

        double cpu = os.getCpuLoad() * 100.0;               // -1 en la primera lectura
        if (cpu < 0) {
            cpu = 0;
        }
        long totalMem = os.getTotalMemorySize() / (1024 * 1024);
        long freeMem = os.getFreeMemorySize() / (1024 * 1024);
        long swapUsed = (os.getTotalSwapSpaceSize() - os.getFreeSwapSpaceSize()) / (1024 * 1024);

        Json root = Json.obj()
                .put("server_id", serverId)
                .put("ts", now)
                .put("cpu_pct", cpu)
                .put("mem_used_mb", totalMem - freeMem)
                .put("mem_total_mb", totalMem)
                .put("swap_used_mb", Math.max(0, swapUsed))
                .putRaw("disks", disks())
                .put("load_1m", Math.max(0, os.getSystemLoadAverage()))
                .put("uptime_s", uptimeSeconds())
                .putRaw("power", power())
                .putRaw("services", services())
                .putRaw("security", security());

        long[] net = netCounters();
        double elapsedS = prevSampleNanos == 0 ? 1 : (System.nanoTime() - prevSampleNanos) / 1e9;
        if (prevRxBytes >= 0 && net[0] >= prevRxBytes) {
            root.put("net_rx_kbps", (net[0] - prevRxBytes) * 8 / 1000.0 / elapsedS);
            root.put("net_tx_kbps", (net[1] - prevTxBytes) * 8 / 1000.0 / elapsedS);
        } else {
            root.put("net_rx_kbps", 0).put("net_tx_kbps", 0);
        }
        prevRxBytes = net[0];
        prevTxBytes = net[1];
        prevSampleNanos = System.nanoTime();

        Double temp = temperature();
        if (temp == null) {
            root.putNull("temp_c");
        } else {
            root.put("temp_c", temp);
        }
        return root.toString();
    }

    // ------------------------------------------------------------------ disco

    private String disks() {
        List<String> out = new ArrayList<>();
        for (File root : File.listRoots()) {
            long total = root.getTotalSpace();
            if (total <= 0) {
                continue;
            }
            out.add(Json.obj()
                    .put("mount", root.getAbsolutePath())
                    .put("used_gb", (total - root.getUsableSpace()) / 1024.0 / 1024 / 1024)
                    .put("total_gb", total / 1024.0 / 1024 / 1024)
                    .put("io_wait_pct", ioWaitPct())
                    .toString());
        }
        return Json.array(out);
    }

    /** iowait solo esta disponible en Linux (/proc/stat, columna 6). */
    private double ioWaitPct() {
        if (!Platform.isLinux()) {
            return 0;
        }
        try {
            String cpuLine = Files.readAllLines(Path.of("/proc/stat")).get(0);
            String[] f = cpuLine.trim().split("\\s+");
            double iowait = Double.parseDouble(f[5]);
            double total = 0;
            for (int i = 1; i < f.length; i++) {
                total += Double.parseDouble(f[i]);
            }
            return total > 0 ? iowait / total * 100 : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    // ------------------------------------------------------------------- red

    private long[] netCounters() {
        if (Platform.isLinux()) {
            try {
                long rx = 0;
                long tx = 0;
                for (String line : Files.readAllLines(Path.of("/proc/net/dev"))) {
                    if (!line.contains(":") || line.contains("lo:")) {
                        continue;
                    }
                    String[] f = line.split(":")[1].trim().split("\\s+");
                    rx += Long.parseLong(f[0]);
                    tx += Long.parseLong(f[8]);
                }
                return new long[]{rx, tx};
            } catch (Exception ignored) {
                // cae al valor neutro
            }
        }
        return new long[]{-1, -1};
    }

    // ------------------------------------------------------------ temperatura

    private Double temperature() {
        if (Platform.isLinux()) {
            try {
                for (File zone : new File("/sys/class/thermal").listFiles()) {
                    File f = new File(zone, "temp");
                    if (f.exists()) {
                        return Long.parseLong(Files.readString(f.toPath()).trim()) / 1000.0;
                    }
                }
            } catch (Exception ignored) {
                // sin sensores expuestos
            }
        }
        if (Platform.isWindows()) {
            String out = exec(10, "powershell", "-NoProfile", "-Command",
                    "(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue).CurrentTemperature");
            try {
                // WMI devuelve decimas de kelvin.
                return Long.parseLong(out.trim().split("\\R")[0]) / 10.0 - 273.15;
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    // -------------------------------------------------------------- energia

    /** Detecta apagones: si el host pasa a bateria/UPS avisamos antes del colapso. */
    private String power() {
        if (Platform.isLinux()) {
            File bat = new File("/sys/class/power_supply/BAT0");
            File ac = new File("/sys/class/power_supply/AC/online");
            if (bat.exists() || ac.exists()) {
                try {
                    boolean onAc = !ac.exists() || "1".equals(Files.readString(ac.toPath()).trim());
                    Integer pct = null;
                    File cap = new File(bat, "capacity");
                    if (cap.exists()) {
                        pct = Integer.parseInt(Files.readString(cap.toPath()).trim());
                    }
                    Json p = Json.obj().put("source", onAc ? "ac" : "battery");
                    if (pct == null) {
                        p.putNull("battery_pct");
                    } else {
                        p.put("battery_pct", (long) pct);
                    }
                    return p.putNull("runtime_left_s").toString();
                } catch (Exception ignored) {
                    // cae a unknown
                }
            }
            // Servidor de rack: preguntamos al demonio del UPS si esta instalado.
            String upsc = exec(5, "upsc", "ups@localhost");
            if (!upsc.isBlank()) {
                boolean onBattery = upsc.contains("OB");
                Json p = Json.obj().put("source", onBattery ? "battery" : "ac");
                p.put("battery_pct", (long) parseKey(upsc, "battery.charge", 100));
                p.put("runtime_left_s", (long) parseKey(upsc, "battery.runtime", 0));
                return p.toString();
            }
        }
        if (Platform.isWindows()) {
            String out = exec(10, "powershell", "-NoProfile", "-Command",
                    "(Get-CimInstance Win32_Battery | Select-Object -First 1 -ExpandProperty BatteryStatus)");
            String s = out.trim();
            if (!s.isEmpty()) {
                // 2 = conectado a la red, 1 = descargando bateria.
                return Json.obj().put("source", "2".equals(s) ? "ac" : "battery")
                        .putNull("battery_pct").putNull("runtime_left_s").toString();
            }
        }
        return Json.obj().put("source", "unknown").putNull("battery_pct").putNull("runtime_left_s").toString();
    }

    private int parseKey(String block, String key, int fallback) {
        for (String line : block.split("\\R")) {
            if (line.startsWith(key + ":")) {
                try {
                    return (int) Double.parseDouble(line.split(":")[1].trim());
                } catch (Exception ignored) {
                    return fallback;
                }
            }
        }
        return fallback;
    }

    // ------------------------------------------------------------- servicios

    /**
     * Estado de los servicios vigilados. Cada sistema tiene su gestor
     * (systemd / SCM de Windows / launchd), pero el JSON de salida es identico:
     * el gateway y el frontend nunca saben en que SO corre el agente.
     */
    private String services() {
        List<String> out = new ArrayList<>();
        for (String name : watchedServices) {
            boolean running;
            String managedBy;
            if (Platform.isWindows()) {
                managedBy = "windows-sc";
                running = exec(10, "sc", "query", name).contains("RUNNING");
            } else if (Platform.isMac()) {
                managedBy = "launchd";
                running = !exec(10, "launchctl", "list", name).isBlank();
            } else {
                managedBy = "systemd";
                running = "active".equals(exec(10, "systemctl", "is-active", name).trim());
            }
            out.add(Json.obj()
                    .put("name", name)
                    .put("managed_by", managedBy)
                    .put("running", running)
                    .putNull("pid")
                    .put("cpu_pct", 0)
                    .put("mem_mb", 0)
                    .putNull("port")
                    .put("restarts_24h", 0)
                    .toString());
        }
        return Json.array(out);
    }

    // -------------------------------------------------------------- seguridad

    /** Señales de intento de vulneracion leidas de los logs del sistema. */
    private String security() {
        int failed = 0;
        int sudo = 0;
        List<String> banned = new ArrayList<>();

        if (Platform.isLinux()) {
            String log = exec(15, "journalctl", "-u", "sshd", "--since", "-5min", "--no-pager");
            for (String line : log.split("\\R")) {
                if (line.contains("Failed password") || line.contains("Invalid user")) {
                    failed++;
                }
                if (line.contains("session opened for user root")) {
                    sudo++;
                }
            }
            String f2b = exec(10, "fail2ban-client", "status", "sshd");
            for (String line : f2b.split("\\R")) {
                if (line.contains("Banned IP list:")) {
                    for (String ip : line.split(":")[1].trim().split("\\s+")) {
                        if (!ip.isBlank()) {
                            banned.add(ip);
                        }
                    }
                }
            }
        } else if (Platform.isWindows()) {
            // Evento 4625 = intento de inicio de sesion fallido.
            String out = exec(20, "powershell", "-NoProfile", "-Command",
                    "(Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625;StartTime=(Get-Date).AddMinutes(-5)} -ErrorAction SilentlyContinue).Count");
            try {
                failed = Integer.parseInt(out.trim());
            } catch (Exception ignored) {
                failed = 0;
            }
        }

        return Json.obj()
                .put("failed_logins_5m", failed)
                .put("new_sudo_sessions_5m", sudo)
                .putRaw("banned_ips", Json.strArray(banned))
                .putRaw("open_ports_unexpected", Json.intArray(unexpectedPorts()))
                .toString();
    }

    /** Puertos a la escucha que no estan en la linea base declarada. */
    private List<Integer> unexpectedPorts() {
        List<Integer> found = new ArrayList<>();
        String out = Platform.isWindows()
                ? exec(15, "netstat", "-an")
                : exec(15, "ss", "-ltn");
        for (String line : out.split("\\R")) {
            if (Platform.isWindows() && !line.contains("LISTENING")) {
                continue;
            }
            java.util.regex.Matcher m = java.util.regex.Pattern.compile(":(\\d{1,5})\\b").matcher(line);
            while (m.find()) {
                int port = Integer.parseInt(m.group(1));
                if (port > 0 && !baselinePorts.contains(port) && !found.contains(port) && port < 49152) {
                    found.add(port);
                }
            }
        }
        return found.size() > 20 ? found.subList(0, 20) : found;
    }

    // ------------------------------------------------------------- utilidades

    private long uptimeSeconds() {
        if (Platform.isLinux()) {
            try {
                return (long) Double.parseDouble(Files.readString(Path.of("/proc/uptime")).split("\\s+")[0]);
            } catch (Exception ignored) {
                // cae al uptime de la JVM
            }
        }
        return ManagementFactory.getRuntimeMXBean().getUptime() / 1000;
    }

    /** Ejecuta un comando con limite de tiempo; nunca lanza, devuelve "" si falla. */
    private String exec(int timeoutSeconds, String... cmd) {
        Process p = null;
        try {
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    sb.append(line).append('\n');
                }
            }
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        } finally {
            if (p != null && p.isAlive()) {
                p.destroyForcibly();
            }
        }
    }

    /** Deteccion de plataforma en un solo sitio. */
    static final class Platform {
        private static final String NAME = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);

        static boolean isWindows() { return NAME.contains("win"); }
        static boolean isMac() { return NAME.contains("mac"); }
        static boolean isLinux() { return !isWindows() && !isMac(); }

        static String family() {
            if (isWindows()) { return "windows"; }
            if (isMac()) { return "macos"; }
            return "linux";
        }
    }
}
