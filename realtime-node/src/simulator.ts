import { createHmac } from 'node:crypto';
import { FakeHost } from './fake-host.ts';

/**
 * Banco de pruebas: imita a los agentes Java para poder ver el dashboard sin
 * tener seis maquinas reales. Firma con el mismo HMAC y habla el mismo JSON,
 * asi que el gateway no distingue un agente simulado de uno de verdad.
 *
 * La generacion de metricas vive en `fake-host.ts` porque el modo demo del
 * navegador (GitHub Pages) reutiliza exactamente el mismo guion.
 *
 * Ejecutar:  npm run simulate
 */

const API = process.env.SENTINELA_API ?? 'http://127.0.0.1:8080';
const GATEWAY = process.env.SENTINELA_GATEWAY ?? 'http://127.0.0.1:8081';
const PERIOD_MS = Number(process.env.SENTINELA_PERIOD_MS ?? 2000);

// El simulador pide la flota a la API con este token, igual que el gateway. Sin
// default por la misma razon: no publicar una llave de servicio en el codigo.
const SERVICE_TOKEN = process.env.SENTINELA_SERVICE_TOKEN;
if (!SERVICE_TOKEN) {
  console.error('Falta SENTINELA_SERVICE_TOKEN. Definelo (mismo valor que la API PHP) antes de simular.');
  process.exit(1);
}

interface FleetRow { id: string; label: string; hostname: string; agent_secret: string }

async function main() {
  const res = await fetch(`${API}/internal/fleet`, { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } });
  if (!res.ok) throw new Error(`No pude leer la flota de ${API}: HTTP ${res.status}`);
  const fleet = (await res.json()) as FleetRow[];
  const hosts = fleet.map((f) => new FakeHost(f.id, f.agent_secret));
  console.log(`[sim] ${hosts.length} agentes simulados, una muestra cada ${PERIOD_MS} ms`);

  setInterval(async () => {
    for (const host of hosts) {
      const sample = host.next();
      const body = JSON.stringify(sample);
      const signature = createHmac('sha256', host.secret).update(body).digest('hex');
      try {
        const r = await fetch(`${GATEWAY}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Sentinela-Signature': signature },
          body,
        });
        if (!r.ok) console.error(`[sim] ${host.id}: HTTP ${r.status}`);
      } catch (err) {
        console.error(`[sim] ${host.id}: ${(err as Error).message}`);
      }
    }
  }, PERIOD_MS);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
