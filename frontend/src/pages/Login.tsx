import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { api, ApiError, codigoDemo, MODO_DEMO } from '../lib/api';
import { useSession } from '../context/Session';
import { ThemeToggle } from '../components/ThemeToggle';
import logoNovara from '../assets/novara-logo.png';

/**
 * Acceso en dos pasos: identificador unico + contraseña, y despues el codigo
 * de 6 digitos. Se usa el patron de Acciones de React 19: la funcion que
 * procesa el formulario es asincrona y React se encarga del estado pendiente,
 * del error y de evitar envios duplicados. No hay un solo useState de "cargando".
 */

interface Paso1 { token: string | null; error: string | null }
interface Paso2 { ok: boolean; error: string | null }

/** Boton que sabe solo si su formulario esta enviando (useFormStatus). */
function BotonEnviar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary w-100 btn-lg" type="submit" disabled={pending}>
      {pending && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
      {pending ? 'Verificando...' : children}
    </button>
  );
}

/**
 * Ayuda para probar el segundo factor sin salir de la pantalla:
 *   - demo (sin backend): el codigo TOTP vigente, calculado en el navegador.
 *   - real (backend PHP): el codigo enviado al correo, PERO solo mientras no
 *     hay SMTP configurado (respaldo de desarrollo). Con Gmail puesto no aparece
 *     nada aqui: el codigo solo llega al correo.
 */
function AyudaDemo({ visible }: { visible: boolean }) {
  const [codigo, setCodigo] = useState<{ code: string; expira_en?: number } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const pedir = () =>
      codigoDemo()
        .then((d) => { if (vivo) setCodigo(d); })
        .catch(() => {});
    pedir();
    const t = setInterval(pedir, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [visible]);

  if (!visible || !codigo) return null;
  return (
    <p className="text-secondary small mt-4 text-center opacity-75">
      {MODO_DEMO ? 'Modo demo · código vigente ' : 'Modo desarrollo (sin correo configurado) · código '}
      <code className="fs-6 text-info">{codigo.code}</code>
      {MODO_DEMO && codigo.expira_en !== undefined && (
        <span className="ms-1">(caduca en {codigo.expira_en}s)</span>
      )}
    </p>
  );
}

export function Login() {
  const { entrar } = useSession();
  const [tokenParcial, setTokenParcial] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<string>('');
  const [correo, setCorreo] = useState<string>('');   // correo (enmascarado) del 2FA real
  const [reenvio, setReenvio] = useState<string>('');  // aviso tras reenviar el codigo
  const codigoRef = useRef<HTMLInputElement>(null);

  // Paso 1 -----------------------------------------------------------------
  const [estado1, accionPaso1] = useActionState<Paso1, FormData>(
    async (_prev, formData) => {
      const id = String(formData.get('id') ?? '').trim();
      const password = String(formData.get('password') ?? '');
      if (!id || !password) return { token: null, error: 'Completa ambos campos.' };
      try {
        const r = await api.login(id, password);
        if (r.stage === 'active') {
          entrar(r.token, r.user);   // cuenta sin 2FA activado
          return { token: null, error: null };
        }
        setUsuario(r.user?.name ?? id);
        setCorreo(r.sent_to ?? '');
        setReenvio('');
        setTokenParcial(r.token);
        return { token: r.token, error: null };
      } catch (e) {
        return { token: null, error: e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor.' };
      }
    },
    { token: null, error: null },
  );

  // Paso 2 -----------------------------------------------------------------
  const [estado2, accionPaso2] = useActionState<Paso2, FormData>(
    async (_prev, formData) => {
      const code = String(formData.get('code') ?? '').trim();
      if (!tokenParcial) return { ok: false, error: 'La sesión expiró, empieza de nuevo.' };
      try {
        const r = await api.verify2fa(tokenParcial, code);
        entrar(r.token, r.user);
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: e instanceof ApiError ? e.message : 'No se pudo verificar el código.' };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (tokenParcial) codigoRef.current?.focus();
  }, [tokenParcial]);

  return (
    <main className="login-shell">
      {/* React 19 sube estas etiquetas al <head> aunque esten aqui dentro. */}
      <title>Novara · Acceso</title>
      <meta name="description" content="Acceso al panel de monitoreo Novara" />

      <div className="position-absolute top-0 end-0 p-3">
        <ThemeToggle />
      </div>

      <div className="login-card card border-0 shadow-lg">
        <div className="card-body p-4 p-sm-5">
          <div className="text-center mb-4">
            {/* El logo ya incluye el nombre y el descriptor, asi que sustituye
                al icono, al titulo y al subtitulo que habia aqui. */}
            <img className="login-logo" src={logoNovara} alt="Novara - Monitoreo de servidores" />
          </div>

          {!tokenParcial ? (
            <form action={accionPaso1} noValidate>
              <div className="form-floating mb-3">
                <input
                  id="id" name="id" className="form-control" placeholder="SNT-0000"
                  autoComplete="username" defaultValue="SNT-4417" required
                />
                <label htmlFor="id">Identificador único</label>
              </div>
              <div className="form-floating mb-3">
                <input
                  id="password" name="password" type="password" className="form-control"
                  placeholder="Contraseña" autoComplete="current-password" defaultValue="Sentinela#2026" required
                />
                <label htmlFor="password">Contraseña</label>
              </div>

              {estado1.error && (
                <div className="alert alert-danger py-2 small" role="alert">
                  <i className="bi bi-exclamation-triangle me-1" />{estado1.error}
                </div>
              )}

              <BotonEnviar>Continuar</BotonEnviar>
              <p className="text-secondary small text-center mt-3 mb-0">
                Paso 1 de 2 · la sesión caduca a las 12 h
              </p>
            </form>
          ) : (
            <form action={accionPaso2} noValidate>
              <p className="text-center small text-secondary mb-3">
                Hola <span className="text-body fw-medium">{usuario}</span>.{' '}
                {MODO_DEMO
                  ? 'Escribe el código de tu aplicación de autenticación.'
                  : correo
                    ? <>Te enviamos un código a <span className="text-body fw-medium">{correo}</span>. Escríbelo aquí.</>
                    : 'Te enviamos un código de acceso a tu correo. Escríbelo aquí.'}
              </p>
              <div className="mb-3">
                <label htmlFor="code" className="form-label small text-secondary">Código de verificación</label>
                <input
                  ref={codigoRef} id="code" name="code" className="form-control form-control-lg text-center codigo-otp"
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" required
                />
              </div>

              {estado2.error && (
                <div className="alert alert-danger py-2 small" role="alert">
                  <i className="bi bi-exclamation-triangle me-1" />{estado2.error}
                </div>
              )}

              <BotonEnviar>Entrar</BotonEnviar>
              {!MODO_DEMO && (
                <button
                  type="button" className="btn btn-link w-100 mt-2 small"
                  onClick={async () => {
                    if (!tokenParcial) return;
                    try {
                      const r = await api.resend2fa(tokenParcial);
                      setReenvio(`Código reenviado${r.sent_to ? ' a ' + r.sent_to : ''}.`);
                    } catch {
                      setReenvio('No se pudo reenviar el código.');
                    }
                  }}
                >
                  Reenviar código
                </button>
              )}
              {reenvio && <p className="text-secondary small text-center mt-1 mb-0">{reenvio}</p>}
              <button
                type="button" className="btn btn-link w-100 mt-2 text-secondary small"
                onClick={() => setTokenParcial(null)}
              >
                Usar otra cuenta
              </button>
            </form>
          )}
        </div>
      </div>

      <AyudaDemo visible={Boolean(tokenParcial)} />
    </main>
  );
}
