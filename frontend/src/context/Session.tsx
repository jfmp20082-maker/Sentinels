import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '../../../shared/types';
import { api, getToken, setToken } from '../lib/api';

interface SessionValue {
  user: AuthUser | null;
  cargando: boolean;
  entrar: (token: string, user: AuthUser) => void;
  salir: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al recargar la pagina el token sigue en sessionStorage: preguntamos a la
  // API si la sesion sigue viva en vez de confiar en el cliente.
  useEffect(() => {
    if (!getToken()) {
      setCargando(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setCargando(false));
  }, []);

  const entrar = useCallback((token: string, u: AuthUser) => {
    setToken(token);
    setUser(u);
  }, []);

  const salir = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  return <SessionContext value={{ user, cargando, entrar, salir }}>{children}</SessionContext>;
}

/**
 * React 19 permite leer un contexto con `use()`, sin `useContext`. Ademas
 * `use()` puede llamarse dentro de condicionales, cosa que los hooks clasicos
 * prohiben.
 */
export function useSession(): SessionValue {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession requiere <SessionProvider>');
  return ctx;
}
