/**
 * Identidade demo do aluno. Ainda não há login real: o aluno é identificado
 * pelo e-mail institucional (padrão Fernanda, ou `?email=` na URL) e os
 * dados do cadastro ficam salvos neste navegador.
 */
export const EMAIL_PADRAO = 'fernanda.soares@pucminas.edu.br';

const SESSAO_KEY = 'ajudaai.aluno';
const PREFS_KEY = 'ajudaai.aluno.preferencias';

function ler(chave) {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

function remover(chave) {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* ignore */
  }
}

export function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** E-mail vindo de `?email=`, se for válido. */
export function emailDaUrl(searchParams) {
  const valor = normalizarEmail(searchParams?.get('email'));
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) ? valor : '';
}

export function nomeDoEmail(email) {
  const local = normalizarEmail(email).split('@')[0] || '';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

export function iniciaisDe(nome) {
  return String(nome || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('') || 'A';
}

/**
 * Sessão salva: { email, perfil: {nome, curso, periodo, turno, interesses},
 * escolha: 'padrinho'|'apadrinhado'|'explorar', respostas, atualizadoEm }
 */
export function lerSessaoAluno() {
  const sessao = ler(SESSAO_KEY);
  return sessao && sessao.email ? sessao : null;
}

export function salvarSessaoAluno(sessao) {
  const completa = { ...sessao, email: normalizarEmail(sessao.email), atualizadoEm: new Date().toISOString() };
  gravar(SESSAO_KEY, completa);
  return completa;
}

export function limparSessaoAluno() {
  remover(SESSAO_KEY);
}

/* ===== Preferências locais (Configurações do aluno) ===== */
export const PREFERENCIAS_PADRAO = {
  notificacoesApp: true,
  resumoEmail: false,
  lembretesEncontros: true,
  perfilVisivelGrupo: true,
  mostrarCurso: true,
  fonteMaior: false,
  altoContraste: false,
  reduzirAnimacoes: false,
};

export function lerPreferencias() {
  return { ...PREFERENCIAS_PADRAO, ...(ler(PREFS_KEY) || {}) };
}

export function salvarPreferencias(prefs) {
  gravar(PREFS_KEY, prefs);
  aplicarAparencia(prefs);
}

export function limparPreferencias() {
  remover(PREFS_KEY);
  aplicarAparencia(PREFERENCIAS_PADRAO);
}

/** Aplica as preferências de aparência como classes no <html>. */
export function aplicarAparencia(prefs = lerPreferencias()) {
  const raiz = document.documentElement;
  raiz.classList.toggle('a11y-fonte-maior', Boolean(prefs.fonteMaior));
  raiz.classList.toggle('a11y-alto-contraste', Boolean(prefs.altoContraste));
  raiz.classList.toggle('a11y-sem-animacao', Boolean(prefs.reduzirAnimacoes));
}

/** Período "6º período" → 6. */
export function periodoNumero(periodo) {
  const numero = parseInt(String(periodo ?? ''), 10);
  return Number.isFinite(numero) ? numero : null;
}

export function rotuloPeriodo(periodo) {
  const numero = periodoNumero(periodo);
  return numero ? `${numero}º período` : 'Período não informado';
}
