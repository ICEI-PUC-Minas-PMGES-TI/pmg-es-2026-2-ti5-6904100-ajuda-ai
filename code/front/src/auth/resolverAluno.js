export const ESTADOS_ALUNO = {
  nenhuma: ['Sem participação', 'Escolha como participar ou explore o campus.'],
  candidatura_pendente: ['Candidatura recebida', 'Aguardando início da análise da coordenação.'],
  candidatura_em_analise: ['Candidatura em análise', 'A coordenação está verificando suas informações acadêmicas.'],
  candidatura_rejeitada: ['Candidatura não aprovada', 'Você pode participar de outro ciclo elegível.'],
  candidatura_aprovada_aguardando_matching: ['Candidatura aprovada', 'Aguardando definição do seu grupo.'],
  padrinho_ativo: ['Padrinho ativo', 'Vínculo confirmado. Acompanhe seus apadrinhados.'],
  apadrinhado_pendente: ['Cadastro recebido', 'Aguardando aprovação da coordenação.'],
  apadrinhado_rejeitado: ['Cadastro não aprovado', 'Consulte a justificativa da coordenação.'],
  apadrinhado_aguardando: ['Aprovado — aguardando matching', 'A coordenação está formando os grupos.'],
  apadrinhado_ativo: ['Apadrinhado ativo', 'Seu padrinho foi definido.'],
  concluido: ['Participação concluída', 'Consulte o histórico deste ciclo.'],
};
export function resolverAluno(perfil, situacao, ciclo) {
  const completo = Boolean(perfil?.nome?.trim() && perfil?.curso?.trim() && perfil.curso !== 'Curso não informado' && Number(perfil.periodo) > 0);
  const estado = situacao?.situacao;
  const conhecido = Object.hasOwn(ESTADOS_ALUNO, estado || '');
  const ativo = estado === 'padrinho_ativo' || estado === 'apadrinhado_ativo';
  const candidatura = conhecido && estado.startsWith('candidatura_');
  const semInscricao = conhecido && estado === 'nenhuma';
  return {
    completo, estado, conhecido, ativo, candidatura,
    titulo: ESTADOS_ALUNO[estado]?.[0] || 'Situação indisponível',
    descricao: ESTADOS_ALUNO[estado]?.[1] || 'Atualize a consulta para continuar.',
    justificativa: situacao?.registro?.decisao?.justificativa || situacao?.cadastro?.motivoRejeicao || '',
    podePadrinho: completo && semInscricao && ciclo?.inscricoesDisponiveis === true && Number(perfil.periodo) > 1,
    podeApadrinhado: completo && semInscricao && ciclo?.inscricoesDisponiveis === true && Number(perfil.periodo) === 1,
    destino: !completo ? '/' : candidatura ? '/aluno/candidatura' : '/aluno/perfil',
  };
}
export function escolherCiclo(programas) {
  const atuais = programas.filter(p => p.atual);
  return atuais.length === 1 ? atuais[0].codigo : programas.length === 1 ? programas[0].codigo : '';
}
