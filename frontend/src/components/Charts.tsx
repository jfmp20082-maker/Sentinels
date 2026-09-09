import { useId, useMemo } from 'react';

/**
 * Graficas en SVG puro, sin libreria de charting.
 *
 * Un medidor y una serie temporal son ~40 lineas de SVG; meter Chart.js o D3
 * añadiria 200 kB al bundle y un canvas que no escala en pantallas Retina.
 * El SVG ademas se lleva bien con el tema oscuro y con `prefers-reduced-motion`.
 */

export type Nivel = 'ok' | 'warning' | 'critical';

export function nivelPorValor(valor: number, aviso = 75, critico = 90): Nivel {
  if (valor >= critico) return 'critical';
  if (valor >= aviso) return 'warning';
  return 'ok';
}

const COLOR: Record<Nivel, string> = {
  ok: 'var(--snt-ok)',
  warning: 'var(--snt-warn)',
  critical: 'var(--snt-crit)',
};

interface GaugeProps {
  valor: number;          // 0..100
  etiqueta: string;
  detalle?: string;
  aviso?: number;
  critico?: number;
  tamano?: number;
}

/** Medidor circular tipo anillo (arco de 270 grados). */
export function Gauge({ valor, etiqueta, detalle, aviso = 75, critico = 90, tamano = 128 }: GaugeProps) {
  const v = Math.max(0, Math.min(100, valor));
  const nivel = nivelPorValor(v, aviso, critico);
  const r = 52;
  const circunferencia = 2 * Math.PI * r;
  const arco = 0.75;                                  // 270 de 360 grados
  const largo = circunferencia * arco;
  const avance = largo * (v / 100);

  return (
    <div className="gauge d-flex flex-column align-items-center" role="img"
         aria-label={`${etiqueta}: ${v.toFixed(0)} por ciento`}>
      <svg viewBox="0 0 128 128" width={tamano} height={tamano}>
        <g transform="rotate(135 64 64)">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--snt-track)" strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={`${largo} ${circunferencia}`} />
          <circle cx="64" cy="64" r={r} fill="none" stroke={COLOR[nivel]} strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={`${avance} ${circunferencia}`}
                  className="gauge-arc" />
        </g>
        <text x="64" y="62" textAnchor="middle" className="gauge-valor">{v.toFixed(0)}</text>
        <text x="64" y="80" textAnchor="middle" className="gauge-unidad">%</text>
      </svg>
      <div className="text-center mt-1">
        <div className="small fw-medium">{etiqueta}</div>
        {detalle && <div className="text-secondary" style={{ fontSize: '.72rem' }}>{detalle}</div>}
      </div>
    </div>
  );
}

interface SparklineProps {
  datos: number[];
  max?: number;
  alto?: number;
  nivel?: Nivel;
  unidad?: string;
}

/** Serie temporal corta con relleno degradado. */
export function Sparkline({ datos, max = 100, alto = 72, nivel = 'ok', unidad = '%' }: SparklineProps) {
  const gradId = useId();
  const ancho = 320;

  const { linea, area, ultimo } = useMemo(() => {
    if (datos.length === 0) return { linea: '', area: '', ultimo: 0 };
    const paso = datos.length > 1 ? ancho / (datos.length - 1) : ancho;
    const y = (v: number) => alto - (Math.max(0, Math.min(max, v)) / max) * (alto - 8) - 4;
    const puntos = datos.map((v, i) => `${(i * paso).toFixed(1)},${y(v).toFixed(1)}`);
    return {
      linea: `M${puntos.join(' L')}`,
      area: `M0,${alto} L${puntos.join(' L')} L${ancho},${alto} Z`,
      ultimo: datos[datos.length - 1] ?? 0,
    };
  }, [datos, max, alto]);

  if (datos.length === 0) {
    return <div className="text-secondary small py-4 text-center">Esperando datos del agente...</div>;
  }

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" width="100%" height={alto}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR[nivel]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={COLOR[nivel]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={linea} fill="none" stroke={COLOR[nivel]} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="d-flex justify-content-between small text-secondary mt-1">
        <span>{datos.length} muestras</span>
        <span className="fw-medium text-body">{ultimo.toFixed(1)}{unidad}</span>
      </div>
    </div>
  );
}

/** Barra de progreso compacta reutilizada en tablas y listas. */
export function Barra({ valor, max = 100, nivel }: { valor: number; max?: number; nivel?: Nivel }) {
  const pct = Math.max(0, Math.min(100, (valor / max) * 100));
  const n = nivel ?? nivelPorValor(pct);
  return (
    <div className="progress barra-mini" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${pct}%`, backgroundColor: COLOR[n] }} />
    </div>
  );
}
