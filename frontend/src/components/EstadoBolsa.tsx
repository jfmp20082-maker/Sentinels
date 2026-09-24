import { useEffect, useState } from 'react';

/**
 * Tablero estilo bolsa para la pantalla de acceso: una fila por servidor con su
 * estado, CPU, memoria, una mini grafica y la variacion desde la lectura anterior.
 *
 * Los datos son SIMULADOS a proposito. Antes de iniciar sesion la API no expone
 * servidores (GET /api/servers responde 401), y no debe: enseñar a un anonimo
 * cuales son tus maquinas y como estan seria una fuga. Es una vista ilustrativa.
 */

interface Fila {
  nombre: string;
  region: string;
  cpu: number;
  mem: number;
  hist: number[];
  delta: number;
}

const PUNTOS = 24;

const BASE: Array<Pick<Fila, 'nombre' | 'region'> & { cpu: number; mem: number }> = [
  { nombre: 'core-api-01', region: 'MX-CDMX', cpu: 42, mem: 58 },
  { nombre: 'core-api-02', region: 'MX-CDMX', cpu: 35, mem: 51 },
  { nombre: 'postgres-01', region: 'US-Dallas', cpu: 63, mem: 82 },
  { nombre: 'file-server', region: 'MX-GDL', cpu: 21, mem: 44 },
  { nombre: 'edge-dallas', region: 'US-Dallas', cpu: 74, mem: 67 },
  { nombre: 'backup-nas', region: 'MX-MTY', cpu: 12, mem: 33 },
];

const limitar = (n: number) => Math.min(99, Math.max(3, n));
const paso = (n: number, amp: number) => limitar(n + (Math.random() - 0.5) * amp);

function inicial(): Fila[] {
  return BASE.map((b) => {
    const hist: number[] = [];
    let v = b.cpu;
    for (let i = 0; i < PUNTOS; i++) {
      v = paso(v, 12);
      hist.push(v);
    }
    return { ...b, cpu: hist[PUNTOS - 1], hist, delta: 0 };
  });
}

/** Semaforo por CPU y memoria: mismos umbrales de lectura que el tablero real. */
function estadoDe(f: Fila): { clase: string; texto: string } {
  const peor = Math.max(f.cpu, f.mem);
  if (peor >= 85) return { clase: 'critico', texto: 'Crítico' };
  if (peor >= 70) return { clase: 'atencion', texto: 'Atención' };
  return { clase: 'ok', texto: 'Estable' };
}

function Mini({ datos, sube }: { datos: number[]; sube: boolean }) {
  const w = 96;
  const h = 28;
  const pts = datos
    .map((v, i) => `${(i / (datos.length - 1)) * w},${h - (v / 100) * h}`)
    .join(' ');
  return (
    <svg className={`bolsa-mini ${sube ? 'sube' : 'baja'}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function EstadoBolsa() {
  const [filas, setFilas] = useState<Fila[]>(inicial);

  useEffect(() => {
    // Sin animacion si el usuario pidio menos movimiento: se queda la primera lectura.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setFilas((prev) =>
        prev.map((f) => {
          const cpu = paso(f.cpu, 10);
          return {
            ...f,
            cpu,
            mem: paso(f.mem, 3),
            delta: cpu - f.cpu,
            hist: [...f.hist.slice(1), cpu],
          };
        }),
      );
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const criticos = filas.filter((f) => estadoDe(f).clase === 'critico').length;
  const atencion = filas.filter((f) => estadoDe(f).clase === 'atencion').length;

  return (
    <section className="bolsa" aria-label="Estado de servidores, vista ilustrativa">
      <header className="bolsa-cab">
        <div>
          <h2 className="bolsa-titulo">Estado de servidores</h2>
          <p className="bolsa-sub">Vista ilustrativa · datos simulados</p>
        </div>
        <div className="bolsa-resumen">
          <span className="chip ok">{filas.length - criticos - atencion} estables</span>
          {atencion > 0 && <span className="chip atencion">{atencion} atención</span>}
          {criticos > 0 && <span className="chip critico">{criticos} crítico</span>}
        </div>
      </header>

      <div className="table-responsive">
        <table className="bolsa-tabla">
          <thead>
            <tr>
              <th>Servidor</th>
              <th>Estado</th>
              <th className="num">CPU</th>
              <th className="num">Mem</th>
              <th className="d-none d-md-table-cell">Últimos 24 pts</th>
              <th className="num">Var.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const e = estadoDe(f);
              const sube = f.delta >= 0;
              return (
                <tr key={f.nombre}>
                  <td>
                    <span className="bolsa-nombre">{f.nombre}</span>
                    <span className="bolsa-region">{f.region}</span>
                  </td>
                  <td><span className={`estado ${e.clase}`}><i />{e.texto}</span></td>
                  <td className="num">{f.cpu.toFixed(1)}%</td>
                  <td className="num">{f.mem.toFixed(1)}%</td>
                  <td className="d-none d-md-table-cell"><Mini datos={f.hist} sube={sube} /></td>
                  <td className={`num var ${sube ? 'sube' : 'baja'}`}>
                    {sube ? '▲' : '▼'} {Math.abs(f.delta).toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="bolsa-pie">Inicia sesión para ver tus servidores reales.</p>
    </section>
  );
}
