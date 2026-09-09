import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { useSession } from '../context/Session';

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
 * Ayuda de la demo: muestra el codigo TOTP vigente para poder probar el segundo
 * factor sin instalar una app de autenticacion. El endpoint que lo entrega solo
 * existe cuando el backend arranca en modo demo.
 */
function AyudaDemo({ visible }: { visible: boolean }) {
  const [codigo, setCodigo] = useState<{ code: string; expira_en: number } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const pedir = () =>
      fetch('/api/demo/totp')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => vivo && setCodigo(d))
        .catch(() => {});
    pedir();
    const t = setInterval(pedir, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [visible]);

  if (!visible || !codigo) return null;
  return (
    <p className="text-secondary small mt-4 text-center opacity-75">
      Modo demo · código vigente <code className="fs-6 text-info">{codigo.code}</code>
      <span className="ms-1">(caduca en {codigo.expira_en}s)</span>
    </p>
  );
}

export function Login() {
  const { entrar } = useSession();
  const [tokenParcial, setTokenParcial] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<string>('');
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
      <title>Sentinela · Acceso</title>
      <meta name="description" content="Acceso al panel de monitoreo Sentinela" />

      <div className="login-card card border-0 shadow-lg">
        <div className="card-body p-4 p-sm-5">
          <div className="text-center mb-4">
            <div className="brand-mark mx-auto mb-3" aria-hidden="true">
              <i className="bi bi-shield-check" />
            </div>
            <h1 className="h4 fw-semibold mb-1">Sentinela</h1>
            <p className="text-secondary small mb-0">Monitoreo de servidores en tiempo real</p>
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
                Hola <span className="text-body fw-medium">{usuario}</span>. Escribe el código de tu
                aplicación de autenticación.
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
