import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { api, ApiError, codigoDemo, MODO_DEMO } from '../lib/api';
import { useSession } from '../context/Session';
import { ThemeToggle } from '../components/ThemeToggle';
import { EstadoBolsa } from '../components/EstadoBolsa';

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
  const [vista, setVista] = useState<'login' | 'signup'>('login');
  const [abierto, setAbierto] = useState(false);   // ventana emergente de acceso
  const codigoRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const formCodigoRef = useRef<HTMLFormElement>(null);
  const [verClave, setVerClave] = useState(false);
  const [mayusc, setMayusc] = useState(false);       // Bloq Mayus activo al escribir la clave
  const [espera, setEspera] = useState(0);            // segundos hasta poder reenviar el codigo

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

  // Al abrir el login, el cursor cae en el identificador.
  useEffect(() => {
    if (abierto && vista === 'login' && !tokenParcial) idRef.current?.focus();
  }, [abierto, vista, tokenParcial]);

  // Cuenta atras del reenvio: evita pedir codigos en rafaga.
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  useEffect(() => {
    if (tokenParcial) setEspera(30);
  }, [tokenParcial]);

  // Esc cierra la ventana emergente.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  return (
    <main className="login-shell">
      {/* React 19 sube estas etiquetas al <head> aunque esten aqui dentro. */}
      <title>Novara · Acceso</title>
      <meta name="description" content="Acceso al panel de monitoreo Novara" />

      <header className="login-cab">
        <a className="login-marca" href="/" aria-label="Novara, inicio">
          <span className="login-marca-nombre">Novara</span>
        </a>
        <nav className="login-nav" aria-label="Acceso">
          <ThemeToggle />
          <button
            type="button" className={`btn ${abierto && vista === 'login' ? 'btn-primary' : 'btn-outline-secondary'}`}
            aria-pressed={abierto && vista === 'login'} onClick={() => { setVista('login'); setAbierto(true); }}
          >
            Login
          </button>
          <button
            type="button" className={`btn ${abierto && vista === 'signup' ? 'btn-primary' : 'btn-outline-secondary'}`}
            aria-pressed={abierto && vista === 'signup'} onClick={() => { setVista('signup'); setAbierto(true); }}
          >
            Sign up
          </button>
        </nav>
      </header>

      <div className="login-cuerpo">
      <div className="login-col">
        <div className="logo-circulo grande" role="img" aria-label="Novara, monitoreo de servidores" />
      </div>
      <EstadoBolsa />
      </div>

      {abierto && (
      <div className="login-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className="login-card card border-0 shadow-lg" role="dialog" aria-modal="true" aria-label={vista === 'signup' ? 'Solicitar acceso' : 'Iniciar sesión'}>
        <div className="card-body p-4 p-sm-5">
          <button type="button" className="btn-close login-cerrar" aria-label="Cerrar" onClick={() => setAbierto(false)} />
          <div className="login-encabezado">
            <span className="logo-circulo chico" role="img" aria-label="Novara" />
            <h2 className="login-titulo">
              {vista === 'signup' ? 'Solicitar acceso' : tokenParcial ? 'Verifica tu identidad' : 'Bienvenido de vuelta'}
            </h2>
            <p className="login-subtitulo">
              {vista === 'signup'
                ? 'Las cuentas las crea un administrador.'
                : tokenParcial
                  ? 'Un segundo paso protege tu cuenta.'
                  : 'Entra para ver tus servidores en tiempo real.'}
            </p>
            {vista === 'login' && (
              <ol className="pasos" aria-label={`Paso ${tokenParcial ? 2 : 1} de 2`}>
                <li className={tokenParcial ? 'hecho' : 'actual'}><span>{tokenParcial ? '✓' : '1'}</span>Credenciales</li>
                <li className="sep" aria-hidden="true" />
                <li className={tokenParcial ? 'actual' : ''}><span>2</span>Verificación</li>
              </ol>
            )}
          </div>
          {vista === 'signup' ? (
            <div>
              <ul className="login-lista">
                <li><i className="bi bi-person-badge" />Cada persona recibe un identificador único.</li>
                <li><i className="bi bi-shield-lock" />El acceso exige verificación en dos pasos.</li>
                <li><i className="bi bi-envelope" />Pide el alta a tu administrador.</li>
              </ul>
              <button type="button" className="btn btn-primary w-100" onClick={() => setVista('login')}>
                Ya tengo cuenta · Login
              </button>
            </div>
          ) : !tokenParcial ? (
            <form action={accionPaso1} noValidate>
              <div className="form-floating mb-3">
                <input
                  ref={idRef} id="id" name="id" className="form-control" placeholder="SNT-0000"
                  autoComplete="username" autoCapitalize="characters" spellCheck={false} required
                />
                <label htmlFor="id">Identificador único</label>
              </div>
              <div className="form-floating mb-1 campo-clave">
                <input
                  id="password" name="password" type={verClave ? 'text' : 'password'} className="form-control"
                  placeholder="Contraseña" autoComplete="current-password" required
                  onKeyUp={(e) => setMayusc(e.getModifierState('CapsLock'))}
                  onBlur={() => setMayusc(false)}
                />
                <label htmlFor="password">Contraseña</label>
                <button
                  type="button" className="ver-clave" onClick={() => setVerClave((v) => !v)}
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
                >
                  <i className={`bi ${verClave ? 'bi-eye-slash' : 'bi-eye'}`} />
                </button>
              </div>
              <p className="aviso-mayusc" role="status" hidden={!mayusc}>
                <i className="bi bi-capslock" /> Bloq Mayús está activado
              </p>

              {estado1.error && (
                <div key={estado1.error} className="alert alert-danger py-2 small mt-3 sacudir" role="alert">
                  <i className="bi bi-exclamation-triangle me-1" />{estado1.error}
                </div>
              )}

              <BotonEnviar>Continuar</BotonEnviar>
              <p className="text-secondary small text-center mt-3 mb-0">
                <i className="bi bi-lock me-1" />Sesión protegida · caduca a las 12 h
              </p>
            </form>
          ) : (
            <form ref={formCodigoRef} action={accionPaso2} noValidate>
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
                  onChange={(e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    if (e.target.value.length === 6) formCodigoRef.current?.requestSubmit();
                  }}
                />
              </div>

              {estado2.error && (
                <div key={estado2.error} className="alert alert-danger py-2 small sacudir" role="alert">
                  <i className="bi bi-exclamation-triangle me-1" />{estado2.error}
                </div>
              )}

              <BotonEnviar>Entrar</BotonEnviar>
              {!MODO_DEMO && (
                <button
                  type="button" className="btn btn-link w-100 mt-2 small" disabled={espera > 0}
                  onClick={async () => {
                    if (!tokenParcial) return;
                    setEspera(30);
                    try {
                      const r = await api.resend2fa(tokenParcial);
                      setReenvio(`Código reenviado${r.sent_to ? ' a ' + r.sent_to : ''}.`);
                    } catch {
                      setReenvio('No se pudo reenviar el código.');
                    }
                  }}
                >
                  {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
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
      </div>
      )}
    </main>
  );
}
