const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

const TOKEN_KEY = 'ajudaai.accessToken';
const USER_KEY = 'ajudaai.usuario';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistSession({ accessToken, usuario }) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const auth = token ?? getStoredToken();
  if (auth) headers.Authorization = `Bearer ${auth}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const data = await response.json();
      message = data.message || data.error || message;
      if (Array.isArray(message)) message = message.join(', ');
    } catch {
      /* ignore */
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  loginDemo(email) {
    return request('/auth/login-demo', { method: 'POST', body: { email } });
  },
  me(token) {
    return request('/me', { token });
  },
  dashboard(programa) {
    const query = programa ? `?programa=${encodeURIComponent(programa)}` : '';
    return request(`/coordenacao/dashboard${query}`);
  },
  candidaturas(programa, status) {
    const params = new URLSearchParams();
    if (programa) params.set('programa', programa);
    if (status) params.set('status', status);
    const query = params.toString() ? `?${params}` : '';
    return request(`/coordenacao/candidaturas${query}`);
  },
  criarPrograma(codigo) {
    return request('/coordenacao/programas', {
      method: 'POST',
      body: { codigo },
    });
  },
};
