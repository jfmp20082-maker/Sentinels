import { afterEach, describe, expect, it, vi } from 'vitest';
import { totpAt, totpExpiraEn, totpNow, totpVerify } from '../src/demo/totp';

/**
 * El TOTP del modo demo tiene que dar exactamente los mismos codigos que
 * `api-php/src/Totp.php` y que Google Authenticator, o el segundo paso del
 * acceso seria una imitacion que no sirve para nada. Se comprueba contra los
 * vectores del RFC 6238 (apendice B, SHA-1), que es la unica referencia que no
 * depende de ninguna de las dos implementaciones.
 */

// base32("12345678901234567890"), el secreto de los vectores del RFC.
const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const SECRETO_DEMO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

afterEach(() => {
  vi.useRealTimers();
});

describe('vectores del RFC 6238', () => {
  // [segundos epoch, codigo de 6 digitos]
  const vectores: Array<[number, string]> = [
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
    [20_000_000_000, '353130'],
  ];

  for (const [t, esperado] of vectores) {
    it(`t=${t} produce ${esperado}`, async () => {
      expect(await totpAt(SECRETO_RFC, Math.floor(t / 30))).toBe(esperado);
    });
  }
});

describe('verificacion', () => {
  it('acepta el codigo del periodo vigente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    expect(await totpVerify(SECRETO_DEMO, await totpNow(SECRETO_DEMO))).toBe(true);
  });

  it('acepta el periodo anterior y el siguiente, por desfase de reloj', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const contador = Math.floor(Date.now() / 1000 / 30);
    const anterior = await totpAt(SECRETO_DEMO, contador - 1);
    const siguiente = await totpAt(SECRETO_DEMO, contador + 1);

    expect(await totpVerify(SECRETO_DEMO, anterior)).toBe(true);
    expect(await totpVerify(SECRETO_DEMO, siguiente)).toBe(true);
  });

  it('rechaza dos periodos atras: la ventana es de uno', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const lejano = await totpAt(SECRETO_DEMO, Math.floor(Date.now() / 1000 / 30) - 2);
    expect(await totpVerify(SECRETO_DEMO, lejano)).toBe(false);
  });

  it('rechaza un codigo que no tiene seis digitos', async () => {
    expect(await totpVerify(SECRETO_DEMO, '12345')).toBe(false);
    expect(await totpVerify(SECRETO_DEMO, '')).toBe(false);
    expect(await totpVerify(SECRETO_DEMO, 'abcdef')).toBe(false);
  });

  it('ignora los separadores que copia la gente desde el autenticador', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const codigo = await totpNow(SECRETO_DEMO);
    const conEspacio = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
    expect(await totpVerify(SECRETO_DEMO, conEspacio)).toBe(true);
  });
});

describe('caducidad', () => {
  it('cuenta atras dentro del periodo de 30 s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:07Z'));
    expect(totpExpiraEn()).toBe(23);
    vi.setSystemTime(new Date('2026-03-01T12:00:30Z'));
    expect(totpExpiraEn()).toBe(30);
  });
});
