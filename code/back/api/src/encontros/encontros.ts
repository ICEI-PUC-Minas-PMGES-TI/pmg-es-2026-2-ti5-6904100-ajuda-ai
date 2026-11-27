import { HttpException, HttpStatus } from '@nestjs/common';

export const DESCRICAO_ENCONTRO_MAX = 1000;

export const CONVIDADOS_MAX = 20;

export const DURACAO_ENCONTRO_MAX_HORAS = 12;

export const TOLERANCIA_FIM_ENCONTRO_MIN = 60;

export const ACAO_XP_ENCONTRO = 'ENCONTRO_REALIZADO';

export const ID_ENCONTRO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type StatusEncontro = 'agendado' | 'cancelado';
export type RespostaConvite = 'pendente' | 'aceito' | 'recusado';

export type MotivoEncontro =
  | 'nao-vinculado'
  | 'pucstop-inativo'
  | 'encontro-cancelado'
  | 'encontro-com-presenca'
  | 'encontro-em-andamento'
  | 'periodo-invalido'
  | 'convite-nao-aceito'
  | 'fora-da-janela'
  | 'fora-do-local'
  | 'localizacao-obrigatoria'
  | 'precisao-insuficiente';

export function recusa(
  motivo: MotivoEncontro,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  const status =
    motivo === 'nao-vinculado'
      ? HttpStatus.FORBIDDEN
      : motivo === 'encontro-cancelado' ||
          motivo === 'encontro-com-presenca' ||
          motivo === 'encontro-em-andamento' ||
          motivo === 'convite-nao-aceito'
        ? HttpStatus.CONFLICT
        : HttpStatus.UNPROCESSABLE_ENTITY;
  return new HttpException(
    { statusCode: status, message, motivo, ...extra },
    status,
  );
}

export interface ConviteDto {
  usuarioId: number;
  nome: string;
  resposta: RespostaConvite;
  respondidoEm: string | null;
  presenteEm: string | null;
}

export type TipoAlteracaoEncontro = 'remarcacao' | 'edicao' | 'cancelamento';

export interface EstadoEncontroDto {
  inicio: string;
  fim: string;
  local: { pucstopId: string; nome: string };
  descricao: string | null;
}

export interface AlteracaoEncontroDto {
  tipo: TipoAlteracaoEncontro;
  autor: { usuarioId: number; nome: string };
  em: string;
  anterior: EstadoEncontroDto;
  novo: EstadoEncontroDto | null;
  respostasAnteriores: Array<{
    usuarioId: number;
    nome: string;
    resposta: RespostaConvite;
    respondidoEm: string | null;
  }>;
}

export interface EncontroDto {
  id: string;
  programa: string;
  organizador: { usuarioId: number; nome: string; presenteEm: string | null };
  local: {
    pucstopId: string;
    nome: string;
    ativo: boolean;
  };
  inicio: string;
  fim: string;
  descricao: string | null;
  status: StatusEncontro;
  canceladoEm: string | null;
  convites: ConviteDto[];
  realizado: boolean;
  historico: AlteracaoEncontroDto[];
  meuConvite: ConviteDto | null;
  checkinAbre: string;
  checkinFecha: string;
  podeConfirmarPresenca: boolean;
  podeResponder: boolean;
  podeRemarcar: boolean;
  souOrganizador: boolean;
}
