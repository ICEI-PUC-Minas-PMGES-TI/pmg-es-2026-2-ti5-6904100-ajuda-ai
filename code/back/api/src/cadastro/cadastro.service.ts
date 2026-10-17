import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { buscarCoordenadorPorEmail } from '../dados/dados.js';
import type {
  ParticipacaoEntity,
  RequisitoRespondido,
  RespostasCadastro,
} from '../participacoes/entities/participacao.entity.js';
import { ProgramasService } from '../programas/programas.service.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import {
  iniciaisDe,
  nomeDoEmail,
  perfilDoRegistro,
  serializarParticipacao,
} from '../participacoes/perfil.js';
import {
  StatusCadastro,
  TIPOS_PARTICIPACAO,
  TipoParticipacao,
  UsuarioEntity,
} from '../usuarios/entities/usuario.entity.js';
import {
  serializarUsuario,
  UsuariosService,
} from '../usuarios/usuarios.service.js';

export interface DadosCadastro {
  email: string;
  nome: string;
  curso: string;
  periodo: number;
  turno?: string | null;
  interesses?: string[] | null;
  tipoParticipacao: TipoParticipacao;
  /** Respostas do formulário da modalidade (motivação, áreas…). */
  respostas?: RespostasCadastro;
  programa?: string;
}

type DadosValidados = Required<
  Pick<
    DadosCadastro,
    'email' | 'nome' | 'curso' | 'periodo' | 'tipoParticipacao'
  >
> & {
  turno: string | null;
  interesses: string[];
  respostas: RespostasCadastro;
  programa?: string;
};

export const PERIODO_MAXIMO = 12;

const ROTULO_TIPO: Record<TipoParticipacao, string> = {
  padrinho: 'padrinho',
  apadrinhado: 'apadrinhado',
};

/**
 * Cadastro do aluno no programa (identidade + modalidade) e sua análise pela
 * coordenação.
 *
 * Cadastro × participação: o cadastro (tabela `usuarios`) é aprovado uma vez;
 * a participação (tabela `participacoes`) é a inscrição em cada ciclo. No
 * primeiro envio os dois nascem juntos e uma única decisão da coordenação
 * resolve ambos — aprovar o cadastro aprova a candidatura/inscrição do ciclo
 * e vice-versa (ver `refletirDecisaoDaCandidatura`).
 */
@Injectable()
export class CadastroService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly participacoesService: ParticipacoesService,
    private readonly authService: AuthService,
    private readonly programasService: ProgramasService,
  ) {}

  /**
   * Elegibilidade do candidato a padrinho no ciclo (o período ≥ 2 já foi
   * validado em `validar`). Monta a foto dos requisitos do ciclo com a
   * declaração do aluno para cada um e RECUSA (400) se algum requisito
   * obrigatório não foi declarado como cumprido. Cumprir os requisitos não
   * aprova ninguém: a candidatura continua PENDENTE para a coordenação.
   *
   * A resposta do aluno vem em `respostas.requisitos` como
   * `[{ id, cumpre }]`; a descrição/obrigatoriedade vêm sempre do ciclo.
   */
  async avaliarRequisitosPadrinho(
    programa: string | undefined,
    respostas: RespostasCadastro,
  ): Promise<RequisitoRespondido[]> {
    const codigo = programa?.trim() || ParticipacoesService.programaAtual();
    const ciclo = await this.programasService.buscarPorCodigo(codigo);
    if (!ciclo) {
      throw new BadRequestException(
        `Ciclo ${codigo} não cadastrado. A coordenação precisa abrir o ciclo em Programas.`,
      );
    }
    const declarados = new Map<string, boolean>();
    for (const item of Array.isArray(respostas.requisitos)
      ? respostas.requisitos
      : []) {
      if (item && typeof item.id === 'string') {
        declarados.set(item.id, item.cumpre === true);
      }
    }
    const foto = (ciclo.requisitosPadrinho ?? []).map((r) => ({
      id: r.id,
      descricao: r.descricao,
      obrigatorio: r.obrigatorio,
      cumpre: declarados.get(r.id) === true,
    }));
    const faltando = foto.filter((r) => r.obrigatorio && !r.cumpre);
    if (faltando.length) {
      throw new BadRequestException(
        `Para se candidatar a padrinho no ciclo ${codigo} é preciso cumprir: ${faltando
          .map((r) => r.descricao)
          .join('; ')}.`,
      );
    }
    return foto;
  }

  /**
   * Regras de negócio do cadastro. Valem para qualquer rota de entrada
   * (POST /cadastro e as rotas antigas de /participacoes usadas pelo app).
   */
  static validar(dados: DadosCadastro): DadosValidados {
    const email = UsuariosService.normalizarEmail(dados.email);
    const dominio = (
      process.env.AUTH_ALLOWED_DOMAIN ?? 'pucminas.edu.br'
    ).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Informe um e-mail válido.');
    }
    if (!email.endsWith(`@${dominio}`)) {
      throw new BadRequestException(
        `Use seu e-mail institucional @${dominio}.`,
      );
    }

    if (buscarCoordenadorPorEmail(email)) {
      throw new BadRequestException(
        'A coordenação não se cadastra como padrinho ou apadrinhado.',
      );
    }

    const nome = String(dados.nome ?? '')
      .trim()
      .slice(0, 120);
    if (!nome) throw new BadRequestException('Informe seu nome completo.');

    const curso = String(dados.curso ?? '')
      .trim()
      .slice(0, 120);
    if (!curso) throw new BadRequestException('Informe seu curso.');

    const periodo = Number(dados.periodo);
    if (!Number.isInteger(periodo) || periodo < 1 || periodo > PERIODO_MAXIMO) {
      throw new BadRequestException(
        `Informe um período entre 1 e ${PERIODO_MAXIMO}.`,
      );
    }

    const tipo = dados.tipoParticipacao;
    if (!TIPOS_PARTICIPACAO.includes(tipo)) {
      throw new BadRequestException(
        'Escolha participar como padrinho ou apadrinhado.',
      );
    }

    // Regra do programa: 1º período → só apadrinhado; 2º em diante → só padrinho.
    if (periodo === 1 && tipo === 'padrinho') {
      throw new BadRequestException(
        'Alunos do 1º período não podem se cadastrar como padrinho. Escolha participar como apadrinhado.',
      );
    }
    if (periodo > 1 && tipo === 'apadrinhado') {
      throw new BadRequestException(
        'A partir do 2º período não é possível se cadastrar como apadrinhado. Alunos do 2º período em diante participam como padrinho.',
      );
    }

    const turno =
      typeof dados.turno === 'string' && dados.turno.trim()
        ? dados.turno.trim().slice(0, 40)
        : null;
    const interesses = Array.isArray(dados.interesses)
      ? dados.interesses
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 20)
      : [];

    return {
      email,
      nome,
      curso,
      periodo,
      tipoParticipacao: tipo,
      turno,
      interesses,
      respostas: dados.respostas ?? {},
      programa: dados.programa?.trim() || undefined,
    };
  }

  /** Monta os dados do cadastro a partir das rotas antigas (só `respostas`). */
  static dadosDasRespostas(
    email: string,
    tipoParticipacao: TipoParticipacao,
    respostas: RespostasCadastro = {},
    programa?: string,
  ): DadosCadastro {
    return {
      email,
      nome: respostas.nome || nomeDoEmail(email),
      curso: respostas.curso ?? '',
      periodo: Number(respostas.periodo),
      turno: respostas.turno ?? null,
      interesses: respostas.interesses ?? null,
      tipoParticipacao,
      respostas,
      programa,
    };
  }

  /**
   * Cria (ou atualiza, enquanto pendente) o cadastro e a inscrição do ciclo.
   * O usuário nasce PENDENTE: cadastro não é aprovação.
   */
  async registrar(
    dados: DadosCadastro,
  ): Promise<{ usuario: UsuarioEntity; participacao: ParticipacaoEntity }> {
    const d = CadastroService.validar(dados);
    let usuario = await this.usuariosService.buscarPorEmail(d.email);
    if (usuario) this.verificarPodeEnviar(usuario, d.tipoParticipacao);
    // O ciclo precisa existir ANTES de gravar o usuário (padrinho e
    // apadrinhado): sem isso ficaria um cadastro pendente sem participação.
    await this.participacoesService.exigirCiclo(
      d.programa ?? ParticipacoesService.programaAtual(),
    );

    // Requisitos do ciclo valem só para padrinho; o apadrinhado não os responde.
    const {
      requisitos: _ignorado,
      declaraPreRequisitos: _legado,
      ...demais
    } = d.respostas;
    const requisitos =
      d.tipoParticipacao === 'padrinho'
        ? await this.avaliarRequisitosPadrinho(d.programa, d.respostas)
        : undefined;

    usuario ??= this.usuariosService.criar({
      email: d.email,
      tipoParticipacao: d.tipoParticipacao,
      statusCadastro: 'pendente',
      motivoRejeicao: null,
      analisadoEm: null,
      analisadoPor: null,
    });
    usuario.nome = d.nome;
    usuario.curso = d.curso;
    usuario.periodo = d.periodo;
    usuario.turno = d.turno;
    usuario.interesses = d.interesses.length ? d.interesses : null;
    usuario = await this.usuariosService.salvar(usuario);

    // Perfil junto das respostas: é o que a coordenação vê na análise.
    const respostas: RespostasCadastro = {
      ...demais,
      ...(requisitos ? { requisitos } : {}),
      nome: d.nome,
      curso: d.curso,
      periodo: d.periodo,
      ...(d.turno ? { turno: d.turno } : {}),
      ...(d.interesses.length ? { interesses: d.interesses } : {}),
    };
    const participacao =
      d.tipoParticipacao === 'padrinho'
        ? await this.participacoesService.registrarCandidaturaPadrinho({
            usuarioId: d.email,
            programa: d.programa,
            respostas,
          })
        : await this.participacoesService.cadastrarApadrinhado({
            usuarioId: d.email,
            programa: d.programa,
            respostas,
            statusInicial:
              usuario.statusCadastro === 'aprovado'
                ? 'em_andamento'
                : 'pendente',
          });

    return { usuario, participacao };
  }

  /**
   * Política de reenvio para quem já tem cadastro. Hoje:
   * - REJEITADO → 409 (não reenvia);
   * - APROVADO como apadrinhado pedindo PADRINHO → permitido (transição de
   *   modalidade num novo ciclo; o período ≥ 2 e os requisitos do ciclo já
   *   foram/serão validados). Nasce uma candidatura PENDENTE; o cadastro
   *   global continua APROVADO;
   * - outra troca de modalidade → 409;
   * - PENDENTE/APROVADO da mesma modalidade → atualiza dados/inscrição.
   *
   * Ponto único de extensão para um futuro "corrigir dados e reenviar para
   * análise": bastaria, no ramo REJEITADO, devolver o cadastro a PENDENTE
   * (limpando motivo/analisadoEm/analisadoPor) e reabrir a participação do
   * ciclo — a modelagem (status + motivo + analisadoEm/Por) já comporta isso.
   */
  private verificarPodeEnviar(usuario: UsuarioEntity, tipo: TipoParticipacao) {
    if (usuario.statusCadastro === 'rejeitado') {
      throw new ConflictException(
        `Seu cadastro não foi aprovado pela coordenação${
          usuario.motivoRejeicao ? `: ${usuario.motivoRejeicao}` : '.'
        } Procure a coordenação do programa para uma nova análise.`,
      );
    }
    const transicaoParaPadrinho =
      usuario.statusCadastro === 'aprovado' &&
      usuario.tipoParticipacao === 'apadrinhado' &&
      tipo === 'padrinho';
    if (usuario.tipoParticipacao !== tipo && !transicaoParaPadrinho) {
      throw new ConflictException(
        `Você já está cadastrado(a) como ${ROTULO_TIPO[usuario.tipoParticipacao]}${
          usuario.statusCadastro === 'pendente' ? ' (aguardando análise)' : ''
        }. Não é possível trocar de modalidade pelo cadastro.`,
      );
    }
  }

  /** POST /cadastro: registra e já devolve a sessão do aluno. */
  async cadastrar(dados: DadosCadastro) {
    const { usuario, participacao } = await this.registrar(dados);
    const sessao = await this.authService.emitirSessao(usuario);
    return { ...sessao, participacao: serializarParticipacao(participacao) };
  }

  /** Estado do cadastro do próprio aluno (GET /cadastro/me). */
  async situacaoDoCadastro(email: string) {
    const usuario = await this.usuariosService.buscarPorEmail(email);
    if (!usuario) return { cadastrado: false, usuario: null };
    return { cadastrado: true, usuario: serializarUsuario(usuario) };
  }

  /** Vínculos reais do aluno aprovado no ciclo atual (padrinho ↔ grupo). */
  async vinculosDe(email: string) {
    const programa = ParticipacoesService.programaAtual();
    const registro = await this.participacoesService.registroPrincipal(
      email,
      programa,
    );
    const grupo = registro?.grupo?.trim();
    if (!registro || !grupo) return [];
    if (registro.papel === 'apadrinhado') {
      const padrinho = await this.participacoesService.buscarPadrinhoDoGrupo(
        programa,
        grupo,
      );
      return padrinho ? [{ ...perfilDoRegistro(padrinho), grupo }] : [];
    }
    if (registro.papel === 'padrinho') {
      const lista = await this.participacoesService.listarApadrinhadosDoGrupo(
        programa,
        grupo,
      );
      return lista.map((item) => ({ ...perfilDoRegistro(item), grupo }));
    }
    return [];
  }

  /* ===================== Coordenação ===================== */

  async listar(status?: string) {
    const filtro = this.validarFiltroStatus(status);
    const usuarios = await this.usuariosService.listar(filtro);
    const participacoes = await this.participacoesService.listarPorUsuarios(
      usuarios.map((u) => u.email),
    );
    return usuarios.map((usuario) => {
      const participacao = this.participacaoDoCadastro(usuario, participacoes);
      return {
        ...serializarUsuario(usuario),
        iniciais: iniciaisDe(usuario.nome),
        participacao: participacao
          ? {
              id: participacao.id,
              programa: participacao.programa,
              papel: participacao.papel,
              status: participacao.status,
              grupo: participacao.grupo ?? null,
            }
          : null,
      };
    });
  }

  async detalhar(id: number) {
    const usuario = await this.usuariosService.buscarPorId(id);
    const participacoes = await this.participacoesService.listarPorUsuario(
      usuario.email,
    );
    const participacao = this.participacaoDoCadastro(usuario, participacoes);
    return {
      ...serializarUsuario(usuario),
      iniciais: iniciaisDe(usuario.nome),
      analisadoPor: usuario.analisadoPor ?? null,
      participacao: participacao ? serializarParticipacao(participacao) : null,
      respostas: participacao?.respostas ?? {},
      historico: participacoes
        .filter((p) => p.id !== participacao?.id)
        .map((p) => ({
          id: p.id,
          programa: p.programa,
          papel: p.papel,
          status: p.status,
        })),
    };
  }

  /** Aprova o cadastro e a inscrição do ciclo que veio com ele. */
  async aprovar(id: number, coordenador: string) {
    const usuario = await this.usuariosService.buscarPorId(id);
    if (usuario.statusCadastro !== 'aprovado') {
      const participacao = this.participacaoDoCadastro(
        usuario,
        await this.participacoesService.listarPorUsuario(usuario.email),
      );
      if (participacao) {
        await this.participacoesService.aprovarCandidatura(participacao.id);
      }
      this.registrarDecisao(usuario, 'aprovado', coordenador);
      await this.usuariosService.salvar(usuario);
    }
    return this.detalhar(id);
  }

  /** Rejeita um cadastro pendente (com motivo opcional, visível ao aluno). */
  async rejeitar(id: number, motivo: string | undefined, coordenador: string) {
    const usuario = await this.usuariosService.buscarPorId(id);
    if (usuario.statusCadastro === 'aprovado') {
      throw new BadRequestException(
        'Este cadastro já foi aprovado e não pode ser rejeitado.',
      );
    }
    if (usuario.statusCadastro === 'pendente') {
      const participacao = this.participacaoDoCadastro(
        usuario,
        await this.participacoesService.listarPorUsuario(usuario.email),
      );
      if (
        participacao &&
        (participacao.papel === 'candidato' ||
          participacao.papel === 'apadrinhado')
      ) {
        await this.participacoesService.rejeitarCandidaturaPorId(
          participacao.id,
        );
      }
      this.registrarDecisao(usuario, 'rejeitado', coordenador);
      const texto = motivo?.trim() ?? '';
      usuario.motivoRejeicao = texto ? texto.slice(0, 500) : null;
      await this.usuariosService.salvar(usuario);
    }
    return this.detalhar(id);
  }

  /**
   * Decisão tomada na tela de Candidaturas (por participação). Só vale para o
   * INGRESSO INICIAL: se o cadastro global ainda está PENDENTE e esta é a
   * inscrição que veio com ele, o cadastro recebe a mesma decisão (sem
   * aprovação dupla). Depois que o cadastro foi decidido, aprovações e
   * rejeições de ciclos seguintes afetam só `participacoes`.
   */
  async refletirDecisaoDaCandidatura(
    participacao: ParticipacaoEntity,
    decisao: 'aprovado' | 'rejeitado',
    coordenador?: string,
  ) {
    const usuario = await this.usuariosService.buscarPorEmail(
      participacao.usuarioId,
    );
    if (!usuario) return;
    // Cadastro já aprovado: decisões de ciclos seguintes ficam só na
    // participação. Única exceção: a candidatura de padrinho APROVADA de um
    // ex-apadrinhado atualiza a modalidade atual (sem mexer em status/datas
    // do cadastro nem no histórico de participações).
    if (usuario.statusCadastro === 'aprovado') {
      if (
        decisao === 'aprovado' &&
        participacao.papel === 'padrinho' &&
        usuario.tipoParticipacao === 'apadrinhado'
      ) {
        usuario.tipoParticipacao = 'padrinho';
        await this.usuariosService.salvar(usuario);
      }
      return;
    }
    if (usuario.statusCadastro !== 'pendente') return;
    const doCadastro = this.participacaoDoCadastro(
      usuario,
      await this.participacoesService.listarPorUsuario(usuario.email),
    );
    if (doCadastro?.id !== participacao.id) return;
    this.registrarDecisao(usuario, decisao, coordenador ?? null);
    await this.usuariosService.salvar(usuario);
  }

  private registrarDecisao(
    usuario: UsuarioEntity,
    status: StatusCadastro,
    coordenador: string | null,
  ) {
    usuario.statusCadastro = status;
    usuario.analisadoEm = new Date();
    usuario.analisadoPor = coordenador;
    if (status === 'aprovado') usuario.motivoRejeicao = null;
  }

  /** Inscrição mais recente da modalidade do cadastro. */
  private participacaoDoCadastro(
    usuario: UsuarioEntity,
    participacoes: ParticipacaoEntity[],
  ): ParticipacaoEntity | null {
    const papeis =
      usuario.tipoParticipacao === 'padrinho'
        ? ['candidato', 'padrinho']
        : ['apadrinhado'];
    return (
      participacoes
        .filter(
          (p) => p.usuarioId === usuario.email && papeis.includes(p.papel),
        )
        .sort(
          (a, b) =>
            b.programa.localeCompare(a.programa) ||
            new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
        )[0] ?? null
    );
  }

  private validarFiltroStatus(status?: string): StatusCadastro | undefined {
    const valor = status?.trim();
    if (!valor) return undefined;
    if (valor === 'pendente' || valor === 'aprovado' || valor === 'rejeitado') {
      return valor;
    }
    throw new BadRequestException(
      'Status inválido: use pendente, aprovado ou rejeitado.',
    );
  }
}
