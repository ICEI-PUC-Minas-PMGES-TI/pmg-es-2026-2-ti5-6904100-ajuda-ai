const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** ISO → "22 de set de 2026 • 14:32" */
export function formatarDataHora(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()} • ${hora}`;
}

/** "AAAA-MM-DD" ou ISO → "12 de set de 2026" */
export function formatarData(valor) {
  if (!valor) return '';
  const [ano, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
  if (!ano || !mes) return String(valor);
  return `${dia || 1} de ${MESES[mes - 1]} de ${ano}`;
}

export const ROTULO_STATUS = {
  pendente: 'Enviada',
  em_analise: 'Em análise',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  nao_aprovado: 'Não aprovado',
};

export const ROTULO_PAPEL = {
  candidato: 'Candidato a padrinho',
  padrinho: 'Padrinho',
  apadrinhado: 'Apadrinhado',
};

/** Papel "efetivo" do aluno no ciclo, para textos e filtros de avisos. */
export function papelDaSituacao(situacao) {
  if (!situacao) return null;
  if (situacao.startsWith('apadrinhado')) return 'apadrinhado';
  if (situacao.startsWith('candidatura') || situacao === 'padrinho_ativo') return 'padrinho';
  return null;
}

export const SITUACOES_CANDIDATURA = ['candidatura_pendente', 'candidatura_em_analise', 'candidatura_rejeitada', 'padrinho_ativo'];
