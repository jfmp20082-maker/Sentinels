package mx.sentinela.agent;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Sentinela - agente de host (Java 17+).
 *
 * Corre como servicio en cada maquina vigilada: mide, firma y envia. Nada mas.
 * Toda la logica de negocio (umbrales, alertas, correlacion) vive en el
 * gateway; asi actualizar reglas no obliga a redesplegar 300 agentes.
 *
 * Compilar y ejecutar:
 *   javac -d out $(find src -name '*.java')
 *   java -cp out mx.sentinela.agent.Agent agent.properties
 */
public final class Agent {

    private static final String VERSION = "1.0.0";

    private final String serverId;
    private final String secret;
    private final URI ingestUri;
    private final int intervalSeconds;
    private final Collector collector;
    private final HttpClient http;

    /**
     * Cola local de muestras que no se pudieron entregar. Si el gateway o la red
     * caen, el agente no pierde el historico: reintenta cuando vuelve el enlace.
     */
    private final Deque<String> spool = new ArrayDeque<>();
    private static final int SPOOL_MAX = 500;

    public Agent(Properties cfg) {
        this.serverId = required(cfg, "server.id");
        this.secret = required(cfg, "agent.secret");
        this.ingestUri = URI.create(cfg.getProperty("gateway.url", "http://127.0.0.1:8081") + "/ingest");
        this.intervalSeconds = Integer.parseInt(cfg.getProperty("interval.seconds", "5"));

        List<String> services = splitList(cfg.getProperty("services.watch", ""));
        List<Integer> ports = new ArrayList<>();
        for (String p : splitList(cfg.getProperty("ports.baseline", "22,80,443"))) {
            ports.add(Integer.parseInt(p));
        }
        this.collector = new Collector(serverId, services, ports);

        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    public void start() {
        System.out.printf("[sentinela-agent %s] %s -> %s cada %ds (%s)%n",
                VERSION, serverId, ingestUri, intervalSeconds, Collector.Platform.family());

        // Un solo hilo programado: el agente debe pesar lo menos posible en el
        // host que vigila; no tiene sentido un pool para una tarea periodica.
        ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sentinela-agent");
            t.setDaemon(false);
            return t;
        });
        exec.scheduleAtFixedRate(this::tick, 0, intervalSeconds, TimeUnit.SECONDS);
        Runtime.getRuntime().addShutdownHook(new Thread(exec::shutdownNow));
    }

    private void tick() {
        try {
            String payload = collector.sample();
            if (!send(payload)) {
                enqueue(payload);
            } else {
                drainSpool();
            }
        } catch (Throwable t) {
            // Nunca dejamos morir el temporizador: un fallo de lectura de un
            // sensor no puede tumbar la monitorizacion completa del host.
            System.err.println("[agent] error en el ciclo: " + t);
        }
    }

    /** Firma HMAC-SHA256 del cuerpo exacto: el gateway rechaza lo que no cuadre. */
    private String sign(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("no se pudo firmar la muestra", e);
        }
    }

    private boolean send(String body) {
        HttpRequest req = HttpRequest.newBuilder(ingestUri)
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("X-Sentinela-Signature", sign(body))
                .header("User-Agent", "sentinela-agent/" + VERSION)
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 == 2) {
                return true;
            }
            System.err.println("[agent] gateway respondio " + res.statusCode() + ": " + res.body());
            return false;
        } catch (IOException | InterruptedException e) {
            System.err.println("[agent] sin enlace con el gateway: " + e.getMessage());
            return false;
        }
    }

    private void enqueue(String payload) {
        if (spool.size() >= SPOOL_MAX) {
            spool.removeFirst();   // preferimos perder lo mas viejo
        }
        spool.addLast(payload);
    }

    /** Reenvia lo acumulado cuando vuelve la conexion, de lo mas viejo a lo nuevo. */
    private void drainSpool() {
        int sent = 0;
        while (!spool.isEmpty() && sent < 50) {
            String pending = spool.peekFirst();
            if (!send(pending)) {
                return;
            }
            spool.removeFirst();
            sent++;
        }
        if (sent > 0) {
            System.out.println("[agent] " + sent + " muestras diferidas reenviadas");
        }
    }

    // ------------------------------------------------------------------ arranque

    private static String required(Properties p, String key) {
        String v = p.getProperty(key);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException("falta la propiedad obligatoria: " + key);
        }
        return v.trim();
    }

    private static List<String> splitList(String csv) {
        List<String> out = new ArrayList<>();
        for (String s : csv.split(",")) {
            if (!s.isBlank()) {
                out.add(s.trim());
            }
        }
        return out;
    }

    public static void main(String[] args) throws Exception {
        Path cfgPath = Path.of(args.length > 0 ? args[0] : "agent.properties");
        Properties cfg = new Properties();
        if (Files.exists(cfgPath)) {
            try (var in = Files.newInputStream(cfgPath, StandardOpenOption.READ)) {
                cfg.load(in);
            }
        }
        // Las variables de entorno ganan al fichero: asi funciona en contenedores.
        for (String key : Arrays.asList("server.id", "agent.secret", "gateway.url", "interval.seconds", "services.watch", "ports.baseline")) {
            String env = System.getenv("SENTINELA_" + key.toUpperCase().replace('.', '_'));
            if (env != null && !env.isBlank()) {
                cfg.setProperty(key, env);
            }
        }
        new Agent(cfg).start();
    }
}
