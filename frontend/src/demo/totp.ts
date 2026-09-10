/**
 * TOTP RFC-6238 en el navegador, equivalente a `api-php/src/Totp.php`, para
 * que el modo demo mantenga el segundo paso del acceso sin backend. Usa
 * WebCrypto, que exige contexto seguro: https o localhost.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PERIOD = 30;
const DIGITS = 6;
const WINDOW = 1; // +-30 s de tolerancia por desfase de reloj

function base32Decode(b32: string): Uint8Array {
  const limpio = b32.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of limpio) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Codigo de 6 digitos para un contador concreto (epoch / 30). */
export async function totpAt(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  // Contador de 64 bits big-endian. Se parte en dos mitades de 32 porque
  // `setUint32` no sufre la perdida de precision de los enteros de JS.
  const mensaje = new ArrayBuffer(8);
  const vista = new DataView(mensaje);
  vista.setUint32(0, Math.floor(counter / 2 ** 32));
  vista.setUint32(4, counter >>> 0);

  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', key, mensaje));
  const offset = firma[19] & 0x0f;
  const valor =
    ((firma[offset] & 0x7f) << 24) |
    (firma[offset + 1] << 16) |
    (firma[offset + 2] << 8) |
    firma[offset + 3];
  return String(valor % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Codigo vigente ahora mismo. */
export function totpNow(secret: string): Promise<string> {
  return totpAt(secret, Math.floor(Date.now() / 1000 / PERIOD));
}

/** Segundos que le quedan de vida al codigo actual. */
export function totpExpiraEn(): number {
  return PERIOD - (Math.floor(Date.now() / 1000) % PERIOD);
}

/** Acepta el periodo actual y los dos vecinos, igual que el backend PHP. */
export async function totpVerify(secret: string, code: string): Promise<boolean> {
  const limpio = code.replace(/\D/g, '');
  if (limpio.length !== DIGITS) return false;
  const base = Math.floor(Date.now() / 1000 / PERIOD);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    if ((await totpAt(secret, base + i)) === limpio) return true;
  }
  return false;
}
