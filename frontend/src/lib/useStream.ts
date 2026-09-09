import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Alert, MetricSample, ServerStatus, WsMessage } from '../../../shared/types';
import { getToken } from './api';

/**
 * Store del tiempo real.
 *
 * Las muestras llegan hasta 6 veces por segundo. Si cada una provocara un
 * `setState` en el componente raiz, React re-renderizaria el arbol completo y
 * la UI se arrastraria. En vez de eso guardamos los datos en un store externo
 * y cada mosaico se suscribe SOLO a su servidor con useSyncExternalStore: un
 * dato nuevo de srv-db-01 no re-renderiza el mosaico de srv-core-01.
 */

const HISTORY = 60;

type Listener = () => void;

class StreamStore {
  private latest = new Map<string, MetricSample>();
  private history = new Map<string, MetricSample[]>();
  private statuses = new Map<string, ServerStatus>();
  private alerts: Alert[] = [];

  /** Un conjunto de suscriptores por clave: 'server:<id>', 'alerts', 'status'. */
  private listeners = new Map<string, Set<Listener>>();
  /** Snapshots memorizados: useSyncExternalStore exige identidad estable. */
  private snapshots = new Map<string, unknown>();

  subscribe(key: string, fn: Listener): () => void {
    const set = this.listeners.get(key) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(key, set);
    return () => set.delete(fn);
  }

  private emit(key: string) {
    this.listeners.get(key)?.forEach((fn) => fn());
  }

  ingest(msg: WsMessage) {
    switch (msg.type) {
      case 'metric': {
        const s = msg.sample;
        this.latest.set(s.server_id, s);
        const h = this.history.get(s.server_id) ?? [];
        h.push(s);
        if (h.length > HISTORY) h.shift();
        this.history.set(s.server_id, [...h]);
        this.snapshots.delete(`server:${s.server_id}`);
        this.emit(`server:${s.server_id}`);
        this.snapshots.delete('fleet');
        this.emit('fleet');
        break;
      }
      case 'alert': {
        this.alerts = [msg.alert, ...this.alerts].slice(0, 100);
        this.snapshots.delete('alerts');
        this.emit('alerts');
        break;
      }
      case 'status': {
        if (this.statuses.get(msg.server_id) === msg.status) return;
        this.statuses.set(msg.server_id, msg.status);
        this.snapshots.delete('fleet');
        this.emit('fleet');
        break;
      }
      default:
        break;
    }
  }

  seedAlerts(list: Alert[]) {
    this.alerts = list;
    this.snapshots.delete('alerts');
    this.emit('alerts');
  }

  ackLocal(id: string) {
    this.alerts = this.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a));
    this.snapshots.delete('alerts');
    this.emit('alerts');
  }

  serverSnapshot(id: string) {
    const key = `server:${id}`;
    if (!this.snapshots.has(key)) {
      this.snapshots.set(key, {
        sample: this.latest.get(id) ?? null,
        history: this.history.get(id) ?? [],
      });
    }
    return this.snapshots.get(key) as { sample: MetricSample | null; history: MetricSample[] };
  }

  fleetSnapshot() {
    if (!this.snapshots.has('fleet')) {
      this.snapshots.set('fleet', {
        statuses: new Map(this.statuses),
        samples: new Map(this.latest),
      });
    }
    return this.snapshots.get('fleet') as { statuses: Map<string, ServerStatus>; samples: Map<string, MetricSample> };
  }

  alertsSnapshot() {
    if (!this.snapshots.has('alerts')) this.snapshots.set('alerts', this.alerts);
    return this.snapshots.get('alerts') as Alert[];
  }
}

export const stream = new StreamStore();

/** Datos de un servidor concreto: solo re-renderiza cuando ESE servidor cambia. */
export function useServerStream(serverId: string | null) {
  return useSyncExternalStore(
    (fn) => (serverId ? stream.subscribe(`server:${serverId}`, fn) : () => {}),
    () => (serverId ? stream.serverSnapshot(serverId) : EMPTY),
  );
}
const EMPTY = { sample: null, history: [] as MetricSample[] };

export function useFleetStream() {
  return useSyncExternalStore((fn) => stream.subscribe('fleet', fn), () => stream.fleetSnapshot());
}

export function useAlertStream() {
  return useSyncExternalStore((fn) => stream.subscribe('alerts', fn), () => stream.alertsSnapshot());
}

export type ConnState = 'conectando' | 'en vivo' | 'reconectando' | 'sin conexion';

/**
 * Mantiene viva la conexion WebSocket con reintento exponencial. Se monta una
 * sola vez en la raiz; el store hace el reparto a los mosaicos.
 */
export function useStreamConnection(enabled: boolean): ConnState {
  const [state, setState] = useState<ConnState>('conectando');
  const retry = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/stream?token=${encodeURIComponent(getToken() ?? '')}`);

      ws.onopen = () => {
        retry.current = 0;
        setState('en vivo');
      };
      ws.onmessage = (ev) => {
        try {
          stream.ingest(JSON.parse(ev.data as string) as WsMessage);
        } catch {
          // Un frame corrupto no debe tirar la conexion entera.
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        // Backoff exponencial con techo: 1s, 2s, 4s... hasta 15s.
        const wait = Math.min(15000, 1000 * 2 ** retry.current++);
        setState(retry.current > 3 ? 'sin conexion' : 'reconectando');
        timer = window.setTimeout(connect, wait);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [enabled]);

  return state;
}
