import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import type { MetricSample, WsMessage, ServerStatus } from '../../shared/types.ts';

/**
 * Hub de difusion. Una sola conexion WebSocket por pestaña recibe todas las
 * muestras y alertas; el navegador filtra por mosaico. Es mucho mas barato que
 * hacer polling por cada tile (9 mosaicos x 6 servidores = 54 peticiones/seg).
 */
export class Hub {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  /** Ultimas N muestras por servidor: alimenta los sparklines al conectar. */
  private history = new Map<string, MetricSample[]>();
  private readonly HISTORY = 60;

  private authorize: (token: string | null) => Promise<boolean>;

  constructor(server: Server, authorize: (token: string | null) => Promise<boolean>) {
    this.authorize = authorize;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', async (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/stream') {
        socket.destroy();
        return;
      }
      // El WS hereda la sesion del panel: sin token activo no hay upgrade.
      const ok = await this.authorize(url.searchParams.get('token'));
      if (!ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws, req));
    });

    // Ping de aplicacion: detecta clientes muertos (movil con pantalla apagada).
    setInterval(() => {
      for (const ws of this.clients) {
        if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
          ws.terminate();
          continue;
        }
        (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
        ws.ping();
      }
    }, 30_000).unref();
  }

  private attach(ws: WebSocket, _req: IncomingMessage) {
    this.clients.add(ws);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => ((ws as WebSocket & { isAlive?: boolean }).isAlive = true));
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));

    this.send(ws, { type: 'hello', server_count: this.history.size, ts: Date.now() });
    // Backfill: el dashboard pinta grafica completa desde el primer frame.
    for (const samples of this.history.values()) {
      for (const sample of samples) this.send(ws, { type: 'metric', sample });
    }
  }

  private send(ws: WebSocket, msg: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(msg: WsMessage) {
    const payload = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  record(sample: MetricSample) {
    const list = this.history.get(sample.server_id) ?? [];
    list.push(sample);
    if (list.length > this.HISTORY) list.shift();
    this.history.set(sample.server_id, list);
  }

  lastSample(serverId: string): MetricSample | undefined {
    return this.history.get(serverId)?.at(-1);
  }

  knownServers(): string[] {
    return [...this.history.keys()];
  }

  publishStatus(serverId: string, status: ServerStatus) {
    this.broadcast({ type: 'status', server_id: serverId, status });
  }

  get clientCount() {
    return this.clients.size;
  }
}
