import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  api,
  clearSession,
  getStoredToken,
  getStoredUser,
  persistSession,
} from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [usuario, setUsuario] = useState(() => getStoredUser());
  const [carregando, setCarregando] = useState(false);

  const loginDemo = useCallback(async (email) => {
    setCarregando(true);
    try {
      const sessao = await api.loginDemo(email);
      persistSession(sessao);
      setToken(sessao.accessToken);
      setUsuario(sessao.usuario);
      return sessao.usuario;
    } finally {
      setCarregando(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUsuario(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      usuario,
      carregando,
      autenticado: Boolean(token && usuario),
      ehCoordenador: usuario?.perfil === 'coordenador',
      loginDemo,
      logout,
    }),
    [token, usuario, carregando, loginDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
