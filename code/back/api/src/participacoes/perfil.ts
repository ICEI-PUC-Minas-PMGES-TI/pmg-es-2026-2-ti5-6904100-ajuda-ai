import { buscarUsuarioPorEmail, USUARIOS } from '../dados/dados.js';
import type { ParticipacaoEntity } from './entities/participacao.entity.js';

export function nomeDoEmail(email: string): string {
  const local = email.split('@')[0] || email;
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export function iniciaisDe(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Dados de exibição do participante. As respostas do cadastro têm prioridade;
 * sem elas, usa a base demo de usuários e, por último, o e-mail.
 */
export function perfilDoRegistro(item: ParticipacaoEntity) {
  const usuario =
    buscarUsuarioPorEmail(item.usuarioId) ||
    Object.values(USUARIOS).find((u) => String(u.id) === item.usuarioId);
  const respostas = item.respostas ?? {};
  const nome = respostas.nome || usuario?.nome || nomeDoEmail(item.usuarioId);
  return {
    nome,
    email: usuario?.email ?? item.usuarioId,
    curso: respostas.curso || usuario?.curso || 'Curso não informado',
    periodo: respostas.periodo ?? usuario?.periodo ?? null,
    interesses: respostas.interesses ?? [],
    fotoUrl: usuario?.fotoUrl ?? null,
    iniciais: iniciaisDe(nome),
  };
}

/** Participação no formato da API (o que o app e o web consomem). */
export function serializarParticipacao(item: ParticipacaoEntity) {
  return {
    id: item.id,
    usuarioId: item.usuarioId,
    programa: item.programa,
    papel: item.papel,
    status: item.status,
    grupo: item.grupo ?? null,
    apadrinhados: item.apadrinhados,
    inicioEm: item.inicioEm ?? null,
    terminoEm: item.terminoEm ?? null,
    criadoEm: item.criadoEm,
    atualizadoEm: item.atualizadoEm,
    respostas: item.respostas ?? null,
    decisao: item.respostas?._servidor?.decisao ?? null,
  };
}
