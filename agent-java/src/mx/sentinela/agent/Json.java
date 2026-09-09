package mx.sentinela.agent;

import java.util.ArrayList;
import java.util.List;

/**
 * Serializador JSON minimo. El agente se instala en cientos de maquinas ajenas:
 * cuantas menos dependencias (y menos superficie de CVE) arrastre, mejor.
 * Solo necesitamos escribir, nunca leer, asi que 60 lineas bastan.
 */
public final class Json {

    private final List<String> parts = new ArrayList<>();

    public static Json obj() {
        return new Json();
    }

    public Json put(String key, String value) {
        parts.add(quote(key) + ":" + (value == null ? "null" : quote(value)));
        return this;
    }

    public Json put(String key, long value) {
        parts.add(quote(key) + ":" + value);
        return this;
    }

    public Json put(String key, double value) {
        // Redondeo a 2 decimales: evita ruido de coma flotante en el JSON.
        parts.add(quote(key) + ":" + (Double.isFinite(value) ? String.format(java.util.Locale.ROOT, "%.2f", value) : "null"));
        return this;
    }

    public Json put(String key, boolean value) {
        parts.add(quote(key) + ":" + value);
        return this;
    }

    public Json putNull(String key) {
        parts.add(quote(key) + ":null");
        return this;
    }

    /** Inserta un objeto o array ya construido, sin volver a escaparlo. */
    public Json putRaw(String key, String rawJson) {
        parts.add(quote(key) + ":" + rawJson);
        return this;
    }

    public static String array(List<String> rawItems) {
        return "[" + String.join(",", rawItems) + "]";
    }

    public static String strArray(List<String> values) {
        List<String> quoted = new ArrayList<>(values.size());
        for (String v : values) {
            quoted.add(quote(v));
        }
        return "[" + String.join(",", quoted) + "]";
    }

    public static String intArray(List<Integer> values) {
        List<String> out = new ArrayList<>(values.size());
        for (Integer v : values) {
            out.add(String.valueOf(v));
        }
        return "[" + String.join(",", out) + "]";
    }

    @Override
    public String toString() {
        return "{" + String.join(",", parts) + "}";
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append('"').toString();
    }
}
