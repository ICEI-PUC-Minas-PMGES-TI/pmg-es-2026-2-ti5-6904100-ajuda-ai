import type { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import type { ParticipacaoEntity } from './entities/participacao.entity.js';

export function participacaoEmVinculo(p: ParticipacaoEntity | undefined) {
  return (
    !!p &&
    p.status === 'em_andamento' &&
    !p.terminoEm &&
    ['padrinho', 'apadrinhado'].includes(p.papel)
  );
}

/** Mesma regra de identidade, elegibilidade e ciclo para chat e permissões. */
export function parAtualValido(
  v: MatchingVinculoEntity,
  p: ParticipacaoEntity | undefined,
  a: ParticipacaoEntity | undefined,
  ciclo: Pick<ProgramaEntity, 'id' | 'codigo'>,
  historicoEncerrado = false,
) {
  return (
    v.ativo &&
    v.programaId === ciclo.id &&
    p?.id === v.padrinhoParticipacaoId &&
    a?.id === v.apadrinhadoParticipacaoId &&
    p?.papel === 'padrinho' &&
    a?.papel === 'apadrinhado' &&
    p.programa === ciclo.codigo &&
    a.programa === ciclo.codigo &&
    p.usuarioId !== a.usuarioId &&
    (participacaoEmVinculo(p) ||
      (historicoEncerrado && p.status === 'concluido')) &&
    (participacaoEmVinculo(a) ||
      (historicoEncerrado && a.status === 'concluido'))
  );
}

export function registroPrincipalDos(registros: ParticipacaoEntity[]) {
  const ordenados = [...registros].sort((a, b) => b.id - a.id);
  const ativo = ordenados.find(participacaoEmVinculo);
  if (ativo) return ativo;
  for (const papel of ['padrinho', 'candidato', 'apadrinhado']) {
    const r = ordenados.find((p) => p.papel === papel);
    if (r) return r;
  }
  return null;
}
