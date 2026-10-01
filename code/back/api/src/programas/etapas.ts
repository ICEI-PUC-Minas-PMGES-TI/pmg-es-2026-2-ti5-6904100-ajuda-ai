import type { EtapaPrograma, ProgramaEntity } from './entities/programa.entity.js';

export const ORDEM_ETAPAS: EtapaPrograma[] = [
  'inscricoes',
  'analise',
  'formacao',
  'andamento',
  'encerramento',
];

export const TITULOS_ETAPAS: Record<EtapaPrograma, string> = {
  inscricoes: 'Inscrições abertas',
  analise: 'Análise de candidaturas',
  formacao: 'Formação dos grupos',
  andamento: 'Programa em andamento',
  encerramento: 'Encerramento',
};

export const ROTULOS_STATUS_PROGRAMA: Record<EtapaPrograma, string> = {
  inscricoes: 'Inscrições',
  analise: 'Em análise',
  formacao: 'Formação',
  andamento: 'Em andamento',
  encerramento: 'Encerrado',
};

const MESES = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
];

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes) return iso;
  return `${String(dia || 1).padStart(2, '0')} ${MESES[mes - 1]} de ${ano}`;
}

export function formatarPeriodo(
  inicio?: string | null,
  fim?: string | null,
): string {
  if (!inicio && !fim) return 'A definir';
  if (inicio && fim && inicio === fim) return formatarData(inicio);
  if (inicio && fim) return `${formatarData(inicio)} a ${formatarData(fim)}`;
  return formatarData(inicio || fim || '');
}

export function montarEtapas(programa: ProgramaEntity) {
  const atualIdx = ORDEM_ETAPAS.indexOf(programa.etapaAtual);
  const periodos: Record<EtapaPrograma, [string | null, string | null]> = {
    inscricoes: [programa.inscricoesInicio, programa.inscricoesFim],
    analise: [programa.analiseInicio, programa.analiseFim],
    formacao: [programa.formacaoInicio, programa.formacaoFim],
    andamento: [programa.andamentoInicio, programa.andamentoFim],
    encerramento: [programa.encerramentoEm, programa.encerramentoEm],
  };

  return ORDEM_ETAPAS.map((chave, index) => {
    const [inicio, fim] = periodos[chave];
    return {
      id: chave,
      titulo: TITULOS_ETAPAS[chave],
      estado:
        index < atualIdx ? 'concluida' : index === atualIdx ? 'atual' : 'futura',
      periodoTexto: formatarPeriodo(inicio, fim),
    };
  });
}
