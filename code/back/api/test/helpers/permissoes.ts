import type { AccessTokenPayload } from '../../src/auth/authenticated-request.js';
import type { ParticipacoesService } from '../../src/participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../../src/participacoes/permissoes-aluno.service.js';
import type { ProgramasService } from '../../src/programas/programas.service.js';

/**
 * Para testes de SQL da lojinha e dos totens, que montam bancos sem o ciclo
 * atual: trata `perfil` padrinho/apadrinhado do JWT como participante ativo.
 * A regra real (participação no ciclo) é testada em
 * `src/participacoes/permissoes-aluno.service.spec.ts`.
 */
export function permissoesPeloToken() {
  const participacoes = {
    registroPrincipal: async (email: string) => {
      const perfil = ultimoPerfil.get(email);
      return perfil
        ? { papel: perfil, status: 'em_andamento', terminoEm: null }
        : null;
    },
    situacaoDoRegistro: async (registro: { papel: string } | null) =>
      registro ? `${registro.papel}_ativo` : 'nenhuma',
  } as unknown as ParticipacoesService;
  const programas = {
    buscarPorCodigo: async () => ({ etapaAtual: 'andamento' }),
  } as unknown as ProgramasService;
  const ultimoPerfil = new Map<string, string>();
  const servico = new PermissoesAlunoService(participacoes, programas);
  const doUsuario = servico.doUsuario.bind(servico);
  servico.doUsuario = (usuario: AccessTokenPayload) => {
    const email = String(usuario.email ?? '');
    if (usuario.perfil === 'padrinho' || usuario.perfil === 'apadrinhado')
      ultimoPerfil.set(email, usuario.perfil);
    else ultimoPerfil.delete(email);
    return doUsuario(usuario);
  };
  return { provide: PermissoesAlunoService, useValue: servico };
}
