import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerRecord, Tile } from '../../shared/types';

/**
 * El backend simulado del modo demo. No basta con que devuelva datos: tiene
 * que reproducir las reglas que la interfaz da por ciertas, sobre todo las dos
 * que el prototipo presume — que el token del primer paso no sirve para leer
 * nada, y que ocultar una IP significa no enviarla.
 *
 * Si esto se desvia de `api-php/public/index.php`, el modo demo enseña un
 * comportamiento que el sistema real no tiene, que es la peor forma de mentir
 * en una maqueta.
 */

/** localStorage/sessionStorage no existen en Node; el runtime los usa al cargarse. */
class Memoria implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

type Peticion = typeof import('../src/demo/runtime').peticion;
let peticion: Peticion;
let totpNow: (secreto: string) => Promise<string>;

const SECRETO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const USUARIO = 'SNT-4417';
const CLAVE = 'Sentinela#2026';

const get = (ruta: string, token: string | null = null) => peticion(ruta, {}, token);
const post = (ruta: string, cuerpo: unknown, token: string | null = null) =>
  peticion(ruta, { method: 'POST', body: JSON.stringify(cuerpo) }, token);
const patch = (ruta: string, cuerpo: unknown, token: string | null) =>
  peticion(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) }, token);
const put = (ruta: string, cuerpo: unknown, token: string | null) =>
  peticion(ruta, { method: 'PUT', body: JSON.stringify(cuerpo) }, token);

/** Recorre los dos pasos y devuelve un token utilizable. */
async function sesionActiva(): Promise<string> {
  const paso1 = await post('/auth/login', { id: USUARIO, password: CLAVE });
  const { token } = paso1.data as { token: string };
  const paso2 = await post('/auth/2fa', { token, code: await totpNow(SECRETO) });
  return (paso2.data as { token: string }).token;
}

beforeAll(async () => {
  for (const nombre of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, nombre, { value: new Memoria(), configurable: true, writable: true });
  }
  // Despues de los sustitutos: el modulo lee el almacenamiento al importarse.
  ({ peticion } = await import('../src/demo/runtime'));
  ({ totpNow } = await import('../src/demo/totp'));
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('acceso en dos pasos', () => {
  it('rechaza una contraseña incorrecta', async () => {
    const r = await post('/auth/login', { id: USUARIO, password: 'lo-que-sea' });
    expect(r.status).toBe(401);
    expect(r.data).toEqual({ error: 'invalid_credentials' });
  });

  it('rechaza un identificador que no existe, con el mismo error', async () => {
    // No debe distinguirse de una contraseña mala: revelaria que el id es valido.
    const r = await post('/auth/login', { id: 'SNT-0000', password: CLAVE });
    expect(r.data).toEqual({ error: 'invalid_credentials' });
  });

  it('acepta tambien el correo como identificador', async () => {
    const r = await post('/auth/login', { id: 'admin@sentinela.mx', password: CLAVE });
    expect(r.status).toBe(200);
  });

  it('deja la sesion a medias hasta el segundo factor', async () => {
    const r = await post('/auth/login', { id: USUARIO, password: CLAVE });
    expect(r.data).toMatchObject({ stage: 'pending_2fa', user: { id: USUARIO, role: 'admin' } });
  });

  it('el token del primer paso NO sirve para leer datos', async () => {
    const { token } = (await post('/auth/login', { id: USUARIO, password: CLAVE })).data as { token: string };

    for (const ruta of ['/me', '/servers', '/tiles', '/alerts']) {
      const r = await get(ruta, token);
      expect(r.status, ruta).toBe(401);
      expect(r.data, ruta).toEqual({ error: 'unauthorized' });
    }
  });

  it('rechaza un codigo TOTP equivocado', async () => {
    const { token } = (await post('/auth/login', { id: USUARIO, password: CLAVE })).data as { token: string };
    const r = await post('/auth/2fa', { token, code: '000000' });

    expect(r.status).toBe(401);
    expect(r.data).toEqual({ error: 'invalid_code' });
  });

  it('activa la sesion con el codigo correcto', async () => {
    const token = await sesionActiva();
    const yo = await get('/me', token);

    expect(yo.status).toBe(200);
    expect(yo.data).toMatchObject({ id: USUARIO, role: 'admin', totp_enabled: true });
  });

  it('una cuenta sin 2FA entra de un solo paso', async () => {
    const r = await post('/auth/login', { id: 'SNT-9002', password: 'Noc#2026' });
    const { token, stage } = r.data as { token: string; stage: string };

    expect(stage).toBe('active');
    expect((await get('/me', token)).status).toBe(200);
  });

  it('cerrar sesion invalida el token', async () => {
    const token = await sesionActiva();
    await post('/auth/logout', {}, token);

    expect((await get('/me', token)).status).toBe(401);
  });

  it('sin token no se llega a ningun sitio', async () => {
    expect((await get('/servers')).status).toBe(401);
    expect((await get('/servers', 'inventado')).status).toBe(401);
  });
});

describe('visibilidad de las IP', () => {
  it('no envia la direccion cuando esta oculta, en vez de enmascararla', async () => {
    const token = await sesionActiva();

    const antes = ((await get('/servers', token)).data as ServerRecord[]).find((s) => s.id === 'srv-core-01');
    expect(antes?.ip_private).toBe('10.20.4.11');

    await patch('/servers/srv-core-01', { ip_visible: false }, token);

    const despues = ((await get('/servers', token)).data as ServerRecord[]).find((s) => s.id === 'srv-core-01');
    expect(despues?.ip_visible).toBe(false);
    expect(despues?.ip_private).toBeNull();
    expect(despues?.ip_public).toBeNull();
  });

  it('devuelve la direccion real al volver a mostrarla', async () => {
    const token = await sesionActiva();
    await patch('/servers/srv-core-02', { ip_visible: true }, token);

    const s = ((await get('/servers', token)).data as ServerRecord[]).find((x) => x.id === 'srv-core-02');
    expect(s?.ip_private).toBe('10.20.4.12');
  });

  it('la ficha de detalle respeta lo mismo y trae los servicios', async () => {
    const token = await sesionActiva();
    await patch('/servers/srv-db-01', { ip_visible: false }, token);

    const r = await get('/servers/srv-db-01', token);
    const ficha = r.data as ServerRecord & { services: Array<{ name: string }> };

    expect(ficha.ip_private).toBeNull();
    expect(ficha.services.map((s) => s.name)).toEqual(['barman', 'pgbouncer', 'postgresql']);
  });

  it('un servidor inexistente da 404', async () => {
    const token = await sesionActiva();
    expect((await get('/servers/no-existe', token)).status).toBe(404);
  });

  it('rechaza un PATCH sin nada que cambiar', async () => {
    const token = await sesionActiva();
    const r = await patch('/servers/srv-core-01', {}, token);

    expect(r.status).toBe(422);
    expect(r.data).toEqual({ error: 'nothing_to_update' });
  });
});

describe('autorizacion por rol', () => {
  it('el operator puede editar la ficha de un servidor', async () => {
    const { token } = (await post('/auth/login', { id: 'SNT-9002', password: 'Noc#2026' })).data as { token: string };
    const r = await patch('/servers/srv-core-01', { label: 'Renombrado por NOC' }, token);

    expect(r.status).toBe(200);
    expect((r.data as ServerRecord).label).toBe('Renombrado por NOC');
  });

  it('el viewer NO puede editar: PATCH devuelve 403', async () => {
    // Sin este usuario en la semilla, la rama role==='viewer' no la recorria
    // nadie. Es el hallazgo 2 de la revision de seguridad.
    const r0 = await post('/auth/login', { id: 'SNT-7003', password: 'Lectura#2026' });
    const { token, stage } = r0.data as { token: string; stage: string };
    expect(stage).toBe('active');

    const r = await patch('/servers/srv-core-01', { label: 'intento del viewer' }, token);
    expect(r.status).toBe(403);
    expect(r.data).toEqual({ error: 'forbidden' });
  });

  it('el viewer SI puede leer: el catalogo no le esta vedado', async () => {
    const { token } = (await post('/auth/login', { id: 'SNT-7003', password: 'Lectura#2026' })).data as { token: string };
    expect((await get('/servers', token)).status).toBe(200);
    expect((await get('/tiles', token)).status).toBe(200);
  });
});

describe('tablero de mosaicos', () => {
  it('empieza con el tablero de la semilla', async () => {
    const token = await sesionActiva();
    const tiles = (await get('/tiles', token)).data as Tile[];

    expect(tiles).toHaveLength(9);
    expect(tiles[0]).toMatchObject({ id: 't1', kind: 'fleet', w: 12 });
  });

  it('guarda el layout completo y renumera el orden', async () => {
    const token = await sesionActiva();
    const tiles = (await get('/tiles', token)).data as Tile[];

    const alReves = [...tiles].reverse();
    const guardado = await put('/tiles', { tiles: alReves }, token);
    expect(guardado.data).toEqual({ ok: true, count: 9 });

    const nuevos = (await get('/tiles', token)).data as Tile[];
    expect(nuevos[0].id).toBe('t9');
    expect(nuevos.map((t) => t.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('un tablero vacio es valido: el usuario puede quitarlo todo', async () => {
    const token = await sesionActiva();
    await put('/tiles', { tiles: [] }, token);

    expect((await get('/tiles', token)).data).toEqual([]);
  });
});

describe('alertas', () => {
  it('respeta el limite pedido', async () => {
    const token = await sesionActiva();
    const r = await get('/alerts?limit=5', token);

    expect(r.status).toBe(200);
    expect((r.data as unknown[]).length).toBeLessThanOrEqual(5);
  });

  it('una ruta que no existe da 404, no 200 con vacio', async () => {
    const token = await sesionActiva();
    expect((await get('/loquesea', token)).status).toBe(404);
  });
});
