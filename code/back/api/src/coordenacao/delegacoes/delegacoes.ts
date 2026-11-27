export const FUNCIONALIDADES_DELEGAVEIS = ['mapa', 'chats'] as const;
export type FuncionalidadeDelegavel =
  (typeof FUNCIONALIDADES_DELEGAVEIS)[number];

export function ehFuncionalidadeDelegavel(
  valor: string,
): valor is FuncionalidadeDelegavel {
  return (FUNCIONALIDADES_DELEGAVEIS as readonly string[]).includes(valor);
}

export interface DelegacaoDto {
  id: number;
  funcionalidade: FuncionalidadeDelegavel;
  concedidoPor: string;
  concedidoEm: string;
  revogadoPor: string | null;
  revogadoEm: string | null;
}

export interface ParticipacaoDoAluno {
  papel: string;
  status: string;
  programa: string;
}

export interface AlunoDto {
  id: number;
  nome: string;
  email: string;
  curso: string;
  periodo: number;
  statusCadastro: string;
  participacaoAtual: ParticipacaoDoAluno | null;
  delegacoes: FuncionalidadeDelegavel[];
}

export interface AlunoDetalheDto extends AlunoDto {
  historicoDelegacoes: DelegacaoDto[];
}
