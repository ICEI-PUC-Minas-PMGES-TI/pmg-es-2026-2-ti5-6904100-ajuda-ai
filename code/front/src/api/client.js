const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const feedEventsUrl = `${API_BASE}/publicacoes/events`;

const TOKEN_KEY = 'ajudaai.accessToken';
const USER_KEY = 'ajudaai.usuario';
/** Sessão do aluno, separada da coordenação (as duas podem coexistir). */
const ALUNO_TOKEN_KEY = 'ajudaai.aluno.token';
let alunoEmMemoria = null;
export let programaAluno = '';
export function selecionarProgramaAluno(codigo) { programaAluno = codigo || ''; }
export function getAlunoSession() {
  try { const s = alunoEmMemoria || JSON.parse(lerStorage(ALUNO_TOKEN_KEY) || 'null');
    return s && Date.now() < s.expiraEm - 60000 ? s : null;
  } catch { return null; }
}


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
    const salvo = getAlunoSession();
    const alvo = String(email || '').trim().toLowerCase();
    if (!salvo?.accessToken || salvo.email !== alvo) return null;
    // margem de 1 min antes de expirar
    if (Date.now() > salvo.expiraEm - 60000) return null;
    return salvo.accessToken;
  } catch {
    return null;
  }
}

export function persistAlunoSession({ accessToken, expiresIn, usuario, onboardingToken, nome, email, identidade }) {
  alunoEmMemoria = { accessToken, onboardingToken, usuario, email: usuario?.email || identidade?.email || email, nome: usuario?.nome || identidade?.nome || nome, expiraEm: Date.now() + (expiresIn || (onboardingToken ? 600 : 3600)) * 1000 };
  try {
    localStorage.setItem(ALUNO_TOKEN_KEY, JSON.stringify(alunoEmMemoria));
  } catch {
    /* Sem armazenamento: mantém a sessão somente nesta aba. */
  }
}

export function clearAlunoSession() {
  alunoEmMemoria = null;
  programaAluno = '';
  try {
    localStorage.removeItem(ALUNO_TOKEN_KEY);
    localStorage.removeItem('ajudaai.aluno');
    localStorage.removeItem('ajudaai.aluno.preferencias');
    localStorage.removeItem('ajudaai.aluno.avisosVistos');
  } catch {
    /* ignore */
  }
}

/** Aluno exige seu próprio JWT; consultas não usam identidade livre por e-mail. */
async function request(path, { method = 'GET', body, token, aluno, anonimo = false, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (aluno) {
    const tokenAluno = getAlunoToken(aluno);
    if (tokenAluno) headers.Authorization = `Bearer ${tokenAluno}`;
    else throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'), { status: 401 });
  } else if (!anonimo) {
    const auth = token ?? getStoredToken();
    if (auth) headers.Authorization = `Bearer ${auth}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...(signal ? { signal } : {}),
    });
  } catch {
    const error = new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
    error.status = 0;
    throw error;
  }

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    let motivo;
    try {
      const data = await response.json();
      message = data.message || data.error || message;
      if (Array.isArray(message)) message = message.join(', ');
      motivo = data.motivo;
    } catch {
      /* ignore */
    }
    const error = new Error(message);
    error.status = response.status;
    // Código estável enviado pelo servidor (ex.: 'fora-do-campus'), quando houver.
    if (motivo) error.motivo = motivo;
    throw error;
  }

  if (response.status === 204) return null;
  const texto = await response.text();
  return texto ? JSON.parse(texto) : null;
}

/** Limita a espera dos fluxos do mapa, inclusive a leitura do corpo. */
async function requestMapa(path, options = {}) {
  const controller = new AbortController();
  let timer;
  const upload = typeof FormData !== 'undefined' && options.body instanceof FormData;
  try {
    return await Promise.race([
      request(path, { ...options, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const mensagem = options.method && options.method !== 'GET'
            ? 'O servidor demorou para responder. Não foi possível confirmar a operação. Recarregue a lista antes de tentar novamente.'
            : 'O servidor demorou para responder. Tente novamente.';
          reject(Object.assign(new Error(mensagem), { status: 0 }));
          controller.abort();
        }, upload ? 60_000 : 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  feed(email) { return request('/publicacoes', { aluno: email }); },
  permissoesFeed(email) { return request('/publicacoes/permissoes', { aluno: email }); },
  criarPublicacao(dados, email) { return request('/publicacoes', { method: 'POST', body: dados, aluno: email }); },
  atualizarPublicacao(id, dados, email) { return request(`/publicacoes/${id}`, { method: 'PATCH', body: dados, aluno: email }); },
  excluirPublicacao(id, email) { return request(`/publicacoes/${id}`, { method: 'DELETE', aluno: email }); },
  comentarPublicacao(id, texto, email) { return request(`/publicacoes/${id}/comentarios`, { method: 'POST', body: { texto }, aluno: email }); },
  excluirComentario(id, comentarioId, email) { return request(`/publicacoes/${id}/comentarios/${comentarioId}`, { method: 'DELETE', aluno: email }); },
  curtirPublicacao(id, delta, email) { return request(`/publicacoes/${id}/curtidas`, { method: 'POST', body: { delta }, aluno: email }); },
  uploadFeed(arquivo, email) { const body = new FormData(); body.append('arquivo', arquivo); return requestMapa('/publicacoes/midias', { method: 'POST', body, aluno: email }); },
  loginMicrosoft(idToken) { return request('/auth/login', { method: 'POST', body: {idToken}, anonimo: true }); },
  perfilAluno() { return request('/me', { aluno: getAlunoSession()?.email || '__sem_sessao__' }); },
  atualizarPerfil(dados) { return request('/me', {method: 'PATCH', body: dados, aluno: getAlunoSession()?.email || '__sem_sessao__'}); },
  async completarPerfil(dados) {
    const s = getAlunoSession();
    const resultado = await request('/cadastro/perfil', {method: 'PUT', body: dados, token: s?.onboardingToken || s?.accessToken});
    persistAlunoSession(resultado); return resultado.usuario;
  },
  fotoAluno() { return request('/me/foto', {aluno: getAlunoSession()?.email || '__sem_sessao__'}); },
  salvarFoto(file) { const body = new FormData(); body.append('foto', file); return request('/me/foto', {method: 'PUT', body, aluno: getAlunoSession()?.email || '__sem_sessao__'}); },
  programasAluno() { return request('/participacoes/programas', {aluno: getAlunoSession()?.email || '__sem_sessao__'}); },

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
      body: { ...dados, programa: dados.programa || programaAluno },
      aluno: getAlunoSession()?.email || '__sem_sessao__',
    });
    persistAlunoSession(sessao);
    return sessao;
  },
  /**
   * Garante a sessão do aluno já cadastrado (login demo por e-mail, no lugar
   * do login Microsoft). Devolve `true` se houver sessão e `false` se o
   * e-mail ainda não tem cadastro.
   */
  async entrarAluno(email) { return Boolean(getAlunoToken(email)); },

  /* ===== Aluno (token do aluno ou e-mail em x-user-id) ===== */
  historico(email) {
    return request(`/participacoes${query({ usuarioId: email })}`, { aluno: email });
  },
  situacao(email, programa = programaAluno) {
    return request(`/participacoes/situacao${query({ usuarioId: email, programa })}`, { aluno: email });
  },
  formularioPublico(tipo, programa = programaAluno) {
    return request(`/formularios/${tipo}${query({programa})}`, { anonimo: true });
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
  rejeitarCandidatura(id, justificativa) {
    return request(`/coordenacao/candidaturas/${id}/rejeitar`, { method: 'POST', body: {justificativa} });
  },
  cadastros(status, programa) {
    return request(`/coordenacao/cadastros${query({ status, programa })}`);
  },
  cadastroCoordenacao(id, programa) {
    return request(`/coordenacao/cadastros/${id}${query({programa})}`);
  },
  aprovarCadastro(id, programa) {
    return request(`/coordenacao/cadastros/${id}/aprovar${query({programa})}`, { method: 'POST' });
  },
  rejeitarCadastro(id, motivo, programa) {
    return request(`/coordenacao/cadastros/${id}/rejeitar${query({programa})}`, {
      method: 'POST',
      body: motivo ? { motivo } : {},
    });
  },
  acaoEmMassa(ids, acao, justificativa) {
    return request('/coordenacao/candidaturas/acoes', { method: 'POST', body: { ids, acao, justificativa } });
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
  excluirPrograma(codigo, confirmacao) {
    return request(`/coordenacao/programas${query({codigo})}`, {method: 'DELETE', body: {confirmacao}});
  },
  criarPrograma(codigo, configuracao = {}) {
    return request('/coordenacao/programas', {
      method: 'POST',
      body: { ...(codigo ? { codigo } : {}), ...configuracao },
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

  /* ===== PucStops (coordenação; não dependem de programa/ciclo) ===== */
  /** Todos os PucStops, ativos e inativos, ordenados por nome. */
  pucstops() {
    return requestMapa('/coordenacao/pucstops');
  },
  /** Área do campus onde o servidor aceita PucStops (limite, bbox e centro). */
  campusPucStops() {
    return requestMapa('/coordenacao/pucstops/campus');
  },
  pucstop(id) {
    return requestMapa(`/coordenacao/pucstops/${encodeURIComponent(id)}`);
  },
  criarPucStop(dados) {
    return requestMapa('/coordenacao/pucstops', { method: 'POST', body: dados });
  },
  /** Envie só os campos alterados; latitude e longitude vão sempre juntas. */
  atualizarPucStop(id, dados) {
    return requestMapa(`/coordenacao/pucstops/${encodeURIComponent(id)}`, { method: 'PATCH', body: dados });
  },
  /** "Excluir" = desativação lógica: some do mapa dos alunos, histórico preservado. */
  desativarPucStop(id) {
    return requestMapa(`/coordenacao/pucstops/${encodeURIComponent(id)}/desativar`, { method: 'POST' });
  },
  ativarPucStop(id) {
    return requestMapa(`/coordenacao/pucstops/${encodeURIComponent(id)}/ativar`, { method: 'POST' });
  },

  /* ===== Mapa do campus (seletores de local da coordenação) ===== */
  /** Área do campus (limite, margem, bbox e centro) para eventos e restaurantes. */
  campus() {
    return requestMapa('/coordenacao/campus');
  },
  /** Prédios da versão ativa do mapa (público). */
  predios() {
    return requestMapa('/mapa/predios');
  },
  /** Áreas da versão ativa do mapa, com a geometria (público). */
  areas() {
    return requestMapa('/mapa/areas');
  },

  /* ===== Eventos do campus (coordenação; não dependem de programa/ciclo) ===== */
  /** Todos os eventos, ativos e inativos, do início mais recente para o mais antigo. */
  eventos() {
    return requestMapa('/coordenacao/eventos');
  },
  evento(id) {
    return requestMapa(`/coordenacao/eventos/${encodeURIComponent(id)}`);
  },
  /** `inicio`/`fim` em ISO 8601 com fuso; `local` com exatamente uma forma (predioId, areaId ou latitude+longitude). */
  criarEvento(dados) {
    return requestMapa('/coordenacao/eventos', { method: 'POST', body: dados });
  },
  /** Envie só os campos alterados; `local: null` remove o local. */
  atualizarEvento(id, dados) {
    return requestMapa(`/coordenacao/eventos/${encodeURIComponent(id)}`, { method: 'PATCH', body: dados });
  },
  /** "Excluir" = desativação lógica: some do mapa dos alunos e pode ser reativado. */
  desativarEvento(id) {
    return requestMapa(`/coordenacao/eventos/${encodeURIComponent(id)}/desativar`, { method: 'POST' });
  },
  ativarEvento(id) {
    return requestMapa(`/coordenacao/eventos/${encodeURIComponent(id)}/ativar`, { method: 'POST' });
  },

  /* ===== Restaurantes e cantinas (coordenação) ===== */
  restaurantes() {
    return requestMapa('/coordenacao/restaurantes');
  },
  restaurante(id) {
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(id)}`);
  },
  /** Prédios CAFETERIA do mapa ativo, com `cadastrado` quando já há restaurante neles. */
  sugestoesRestaurantes() {
    return requestMapa('/coordenacao/restaurantes/sugestoes');
  },
  criarRestaurante(dados) {
    return requestMapa('/coordenacao/restaurantes', { method: 'POST', body: dados });
  },
  /** Envie só os campos alterados; o local não pode ser removido. */
  atualizarRestaurante(id, dados) {
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(id)}`, { method: 'PATCH', body: dados });
  },
  desativarRestaurante(id) {
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(id)}/desativar`, { method: 'POST' });
  },
  ativarRestaurante(id) {
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(id)}/ativar`, { method: 'POST' });
  },
  /** Cardápios do restaurante (arquivos públicos), da vigência mais recente para a mais antiga. */
  cardapios(restauranteId) {
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(restauranteId)}/cardapios`);
  },
  /**
   * Envia o arquivo do cardápio (imagem ou PDF) em multipart. O servidor grava
   * no armazenamento público; com `substitui`, remove o cardápio antigo depois.
   */
  enviarCardapio(restauranteId, { arquivo, validoDe, validoAte, substitui } = {}) {
    const body = new FormData();
    body.append('arquivo', arquivo);
    body.append('validoDe', validoDe);
    body.append('validoAte', validoAte);
    if (substitui) body.append('substitui', substitui);
    return requestMapa(`/coordenacao/restaurantes/${encodeURIComponent(restauranteId)}/cardapios`, { method: 'POST', body });
  },
  /** Remove o cardápio e o arquivo (definitivo). */
  removerCardapio(id) {
    return requestMapa(`/coordenacao/cardapios/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
