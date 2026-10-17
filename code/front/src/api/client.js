const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

const TOKEN_KEY = 'ajudaai.accessToken';
const USER_KEY = 'ajudaai.usuario';
/** Sessão do aluno, separada da coordenação (as duas podem coexistir). */
const ALUNO_TOKEN_KEY = 'ajudaai.aluno.token';

function lerStorage(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return lerStorage(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = lerStorage(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistSession({ accessToken, usuario }) {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  } catch {
    /* armazenamento indisponível: a sessão vale só nesta aba */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Token do aluno salvo para este e-mail, se ainda válido. */
export function getAlunoToken(email) {
  try {
    const raw = lerStorage(ALUNO_TOKEN_KEY);
    const salvo = raw ? JSON.parse(raw) : null;
    const alvo = String(email || '').trim().toLowerCase();
    if (!salvo?.accessToken || salvo.email !== alvo) return null;
    // margem de 1 min antes de expirar
    if (Date.now() > salvo.expiraEm - 60000) return null;
    return salvo.accessToken;
  } catch {
    return null;
  }
}

function persistAlunoSession({ accessToken, expiresIn, usuario }) {
  try {
    localStorage.setItem(ALUNO_TOKEN_KEY, JSON.stringify({
      accessToken,
      email: String(usuario?.email || '').toLowerCase(),
      expiraEm: Date.now() + (expiresIn || 3600) * 1000,
    }));
  } catch {
    /* sem armazenamento: o aluno segue no modo por e-mail */
  }
}

export function clearAlunoSession() {
  try {
    localStorage.removeItem(ALUNO_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * `aluno`: e-mail do aluno. Se houver sessão do aluno (login demo/cadastro),
 * vai o token dele; senão, o e-mail em `x-user-id` (modo antigo).
 * O token da coordenação só é enviado quando `aluno` não é informado.
 * `anonimo` não manda nenhum dos dois.
 */
async function request(path, { method = 'GET', body, token, aluno, anonimo = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (aluno) {
    const tokenAluno = getAlunoToken(aluno);
    if (tokenAluno) headers.Authorization = `Bearer ${tokenAluno}`;
    else headers['x-user-id'] = aluno.trim().toLowerCase();
  } else if (!anonimo) {
    const auth = token ?? getStoredToken();
    if (auth) headers.Authorization = `Bearer ${auth}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
    error.status = 0;
    throw error;
  }

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
  const texto = await response.text();
  return texto ? JSON.parse(texto) : null;
}

function query(params) {
  const busca = new URLSearchParams();
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') busca.set(chave, valor);
  });
  const texto = busca.toString();
  return texto ? `?${texto}` : '';
}

export const api = {
  /* ===== Autenticação (coordenação) ===== */
  loginDemo(email) {
    return request('/auth/login-demo', { method: 'POST', body: { email } });
  },
  me(token) {
    return request('/me', { token });
  },

  /* ===== Cadastro e sessão do aluno ===== */
  /** Cria a solicitação de cadastro (fica PENDENTE) e guarda a sessão do aluno. */
  async cadastrar(dados) {
    const sessao = await request('/cadastro', {
      method: 'POST',
      body: dados,
      aluno: dados?.email,
    });
    persistAlunoSession(sessao);
    return sessao;
  },
  /**
   * Garante a sessão do aluno já cadastrado (login demo por e-mail, no lugar
   * do login Microsoft). Devolve `true` se houver sessão e `false` se o
   * e-mail ainda não tem cadastro.
   */
  async entrarAluno(email) {
    if (getAlunoToken(email)) return true;
    try {
      const sessao = await request('/auth/login-demo', { method: 'POST', body: { email }, anonimo: true });
      if (sessao?.usuario?.perfil === 'coordenador') return false;
      persistAlunoSession(sessao);
      return true;
    } catch (error) {
      if (error.status === 401) return false;
      throw error;
    }
  },

  /* ===== Aluno (token do aluno ou e-mail em x-user-id) ===== */
  historico(email) {
    return request(`/participacoes${query({ usuarioId: email })}`, { aluno: email });
  },
  situacao(email, programa) {
    return request(`/participacoes/situacao${query({ usuarioId: email, programa })}`, { aluno: email });
  },
  enviarCandidaturaPadrinho(email, respostas) {
    return request('/participacoes/candidatura-padrinho', {
      method: 'POST',
      aluno: email,
      body: { usuarioId: email, respostas },
    });
  },
  cadastrarApadrinhado(email, respostas) {
    return request('/participacoes/cadastro-apadrinhado', {
      method: 'POST',
      aluno: email,
      body: { usuarioId: email, respostas },
    });
  },
  formularioPublico(tipo) {
    return request(`/formularios/${tipo}`, { anonimo: true });
  },
  avisos(publico) {
    return request(`/avisos${query({ publico })}`, { anonimo: true });
  },

  /* ===== Coordenação (Bearer do login demo) ===== */
  dashboard(programa) {
    return request(`/coordenacao/dashboard${query({ programa })}`);
  },
  candidaturas(programa, status) {
    return request(`/coordenacao/candidaturas${query({ programa, status })}`);
  },
  candidatura(id) {
    return request(`/coordenacao/candidaturas/${id}`);
  },
  atualizarCandidatura(id, dados) {
    return request(`/coordenacao/candidaturas/${id}`, { method: 'PATCH', body: dados });
  },
  aprovarCandidatura(id) {
    return request(`/coordenacao/candidaturas/${id}/aprovar`, { method: 'POST' });
  },
  rejeitarCandidatura(id) {
    return request(`/coordenacao/candidaturas/${id}/rejeitar`, { method: 'POST' });
  },
  cadastros(status) {
    return request(`/coordenacao/cadastros${query({ status })}`);
  },
  cadastroCoordenacao(id) {
    return request(`/coordenacao/cadastros/${id}`);
  },
  aprovarCadastro(id) {
    return request(`/coordenacao/cadastros/${id}/aprovar`, { method: 'POST' });
  },
  rejeitarCadastro(id, motivo) {
    return request(`/coordenacao/cadastros/${id}/rejeitar`, {
      method: 'POST',
      body: motivo ? { motivo } : {},
    });
  },
  acaoEmMassa(ids, acao) {
    return request('/coordenacao/candidaturas/acoes', { method: 'POST', body: { ids, acao } });
  },
  usuarios(programa, papel) {
    return request(`/coordenacao/usuarios${query({ programa, papel })}`);
  },
  vincular(apadrinhadoId, padrinhoId) {
    return request('/coordenacao/vinculos', { method: 'POST', body: { apadrinhadoId, padrinhoId } });
  },
  programas() {
    return request('/coordenacao/programas');
  },
  criarPrograma(codigo) {
    return request('/coordenacao/programas', {
      method: 'POST',
      body: codigo ? { codigo } : {},
    });
  },
  atualizarPrograma(codigo, dados) {
    return request(`/coordenacao/programas${query({ codigo })}`, { method: 'PATCH', body: dados });
  },
  formularioCoordenacao(tipo, programa) {
    return request(`/coordenacao/formularios/${tipo}${query({ programa })}`);
  },
  salvarFormulario(tipo, dados) {
    return request(`/coordenacao/formularios/${tipo}`, { method: 'PUT', body: dados });
  },
  criarComunicado(dados) {
    return request('/coordenacao/comunicados', { method: 'POST', body: dados });
  },
};
