import { FormulariosService } from '../formularios/formularios.service.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { buscarCoordenadorPorEmail } from '../dados/dados.js';
import {
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

/** Perfil pertence à conta; inscrições, respostas e decisões pertencem ao ciclo. */
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
   * Submete inscrição imutável após validar ciclo, formulário e requisitos.
   * Cria o perfil se necessário por compatibilidade com POST /cadastro.
   */
  async registrar(
    dados: DadosCadastro,
  ): Promise<{ usuario: UsuarioEntity; participacao: ParticipacaoEntity }> {
    const d = CadastroService.validar(dados);
    const ciclo = await this.programasService.resolverInscricao(d.programa);
    return this.usuariosService.transacao(async (manager) => {
      const programas = manager.getRepository(ProgramaEntity);
      const bloqueado = await programas.findOne({
        where: { codigo: ciclo.codigo },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bloqueado) throw new BadRequestException('Ciclo não cadastrado.');
      const programasService = new ProgramasService(programas);
      programasService.validarInscricoes(bloqueado);
      const participacoes = new ParticipacoesService(
        manager.getRepository(ParticipacaoEntity),
        programas,
      );
      if (await participacoes.registroPrincipal(d.email, ciclo.codigo)) {
        throw new ConflictException(
          'Já existe inscrição neste ciclo. Respostas submetidas não podem ser editadas.',
        );
      }
      const formularios = new FormulariosService(
        manager.getRepository(FormularioEntity),
        programasService,
      );
      const formulario = await formularios.validarRespostas(
        d.tipoParticipacao,
        ciclo.codigo,
        d.respostas.extras,
      );
      const requisitos =
        d.tipoParticipacao === 'padrinho'
          ? await this.avaliarRequisitosPadrinho(ciclo.codigo, d.respostas)
          : undefined;
      if (d.tipoParticipacao === 'padrinho') {
        const respostas = d.respostas;
        if (
          typeof respostas.motivacao !== 'string' ||
          !respostas.motivacao.trim() ||
          respostas.motivacao.length > 500 ||
          !Array.isArray(respostas.areas) ||
          !respostas.areas.length ||
          respostas.areas.some((v) => typeof v !== 'string' || !v.trim()) ||
          !Array.isArray(respostas.disponibilidade) ||
          !respostas.disponibilidade.length ||
          respostas.disponibilidade.some(
            (v) => typeof v !== 'string' || !v.trim(),
          ) ||
          typeof respostas.genero !== 'string' ||
          !respostas.genero.trim() ||
          typeof respostas.bolsistaProuni !== 'boolean' ||
          typeof respostas.deOutraCidade !== 'boolean'
        ) {
          throw new BadRequestException(
            'Preencha motivação, áreas de apoio, disponibilidade, gênero, ProUni e cidade.',
          );
        }
      } else {
        const respostas = d.respostas;
        if (respostas.declaraPrimeiroPeriodo !== true) {
          throw new BadRequestException(
            'Declare que você está no 1º período para se candidatar como apadrinhado.',
          );
        }
        if (
          typeof respostas.expectativa !== 'string' ||
          !respostas.expectativa.trim() ||
          respostas.expectativa.length > 500 ||
          !Array.isArray(respostas.areas) ||
          !respostas.areas.length ||
          respostas.areas.some((v) => typeof v !== 'string' || !v.trim()) ||
          !Array.isArray(respostas.disponibilidade) ||
          !respostas.disponibilidade.length ||
          respostas.disponibilidade.some(
            (v) => typeof v !== 'string' || !v.trim(),
          ) ||
          typeof respostas.genero !== 'string' ||
          !respostas.genero.trim() ||
          typeof respostas.bolsistaProuni !== 'boolean' ||
          typeof respostas.deOutraCidade !== 'boolean'
        ) {
          throw new BadRequestException(
            'Preencha expectativa, áreas de apoio, disponibilidade, gênero, ProUni e cidade.',
          );
        }
      }
      const usuarios = manager.getRepository(UsuarioEntity);
      let usuario = await usuarios.findOne({ where: { email: d.email } });
      // A candidatura é uma fotografia; não atualiza um perfil já persistido.
      usuario ??= await usuarios.save(
        usuarios.create({
          email: d.email,
          nome: d.nome,
          curso: d.curso,
          periodo: d.periodo,
          turno: d.turno,
          interesses: d.interesses,
          tipoParticipacao: 'nenhuma',
          statusCadastro: 'aprovado',
          motivoRejeicao: null,
          analisadoEm: null,
          analisadoPor: null,
        }),
      );
      const respostas: RespostasCadastro = {
        ...d.respostas,
        nome: d.nome,
        curso: d.curso,
        periodo: d.periodo,
        turno: d.turno ?? undefined,
        interesses: d.interesses,
        requisitos,
      };
      delete respostas._servidor;
      const participacao =
        d.tipoParticipacao === 'padrinho'
          ? await participacoes.registrarCandidaturaPadrinho({
              usuarioId: d.email,
              programa: ciclo.codigo,
              respostas,
              metadados: formulario ? { formulario } : undefined,
            })
          : await participacoes.cadastrarApadrinhado({
              usuarioId: d.email,
              programa: ciclo.codigo,
              respostas,
              metadados: formulario ? { formulario } : undefined,
            });
      return { usuario, participacao };
    });
  }

  /** POST /cadastro: registra e já devolve a sessão do aluno. */
  async cadastrar(dados: DadosCadastro, expiraAte?: number) {
    const { usuario, participacao } = await this.registrar(dados);
    const sessao = await this.authService.emitirSessao(usuario, expiraAte);
    return { ...sessao, participacao: serializarParticipacao(participacao) };
  }

  /** Estado do cadastro do próprio aluno (GET /cadastro/me). */
  async situacaoDoCadastro(email: string) {
    const usuario = await this.usuariosService.buscarPorEmail(email);
    if (!usuario) return { cadastrado: false, usuario: null };
    return { cadastrado: true, usuario: serializarUsuario(usuario) };
  }

  /** Vínculos reais do aluno aprovado no ciclo atual (padrinho ↔ grupo). */
  async vinculosDe(email: string, programa?: string) {
    if (!programa) throw new BadRequestException('Informe o programa.');
    const registro = await this.participacoesService.registroPrincipal(
      email,
      programa,
    );
    if (registro) {
      const canonicos =
        await this.participacoesService.listarVinculados(registro);
      if (canonicos.length)
        return canonicos.map(({ participacao, vinculoId }) => ({
          ...perfilDoRegistro(participacao),
          grupo: null,
          vinculoId,
        }));
    }
    const grupo = registro?.grupo?.trim();
    if (
      !registro ||
      !grupo ||
      !(await this.participacoesService.temVinculoValido(registro))
    )
      return [];
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

  private statusDoCiclo(participacao: ParticipacaoEntity): StatusCadastro {
    return participacao.status === 'nao_aprovado'
      ? 'rejeitado'
      : ['pendente', 'em_analise'].includes(participacao.status)
        ? 'pendente'
        : 'aprovado';
  }

  async listar(status?: string, programa?: string) {
    const filtro = this.validarFiltroStatus(status);
    const ciclo = await this.programasService.resolverConsulta(programa);
    if (!ciclo) return [];
    const usuarios = await this.usuariosService.listar();
    const participacoes = await this.participacoesService.listarPorPrograma({
      programa: ciclo.codigo,
    });
    return participacoes
      .filter((p) => !filtro || this.statusDoCiclo(p) === filtro)
      .map((participacao) => {
        const usuario = usuarios.find(
          (u) => u.email === participacao.usuarioId,
        );
        return {
          ...(usuario
            ? serializarUsuario(usuario)
            : { email: participacao.usuarioId }),
          statusCadastro: this.statusDoCiclo(participacao),
          tipoParticipacao:
            participacao.papel === 'candidato'
              ? 'padrinho'
              : participacao.papel,
          iniciais: iniciaisDe(
            usuario?.nome ?? participacao.respostas?.nome ?? '',
          ),
          participacao: serializarParticipacao(participacao),
        };
      });
  }

  async detalhar(id: number, programa?: string) {
    const usuario = await this.usuariosService.buscarPorId(id);
    const participacoes = await this.participacoesService.listarPorUsuario(
      usuario.email,
    );
    const participacao = this.participacaoDoCadastro(
      usuario,
      participacoes,
      programa,
    );
    return {
      ...serializarUsuario(usuario),
      iniciais: iniciaisDe(usuario.nome),
      statusCadastro: participacao
        ? this.statusDoCiclo(participacao)
        : 'aprovado',
      tipoParticipacao:
        participacao?.papel === 'candidato'
          ? 'padrinho'
          : (participacao?.papel ?? 'nenhuma'),
      motivoRejeicao:
        participacao?.status === 'nao_aprovado'
          ? (participacao.respostas?._servidor?.decisao?.justificativa ?? null)
          : null,
      analisadoPor: participacao?.respostas?._servidor?.decisao?.por ?? null,
      analisadoEm: participacao?.respostas?._servidor?.decisao?.em ?? null,
      formularioRespondido:
        participacao?.respostas?._servidor?.formulario ?? null,
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

  /** Compatibilidade da coordenação: decide a inscrição do ciclo, sem alterar a conta. */
  async aprovar(id: number, coordenador: string, programa?: string) {
    const usuario = await this.usuariosService.buscarPorId(id);
    const participacao = this.participacaoDoCadastro(
      usuario,
      await this.participacoesService.listarPorUsuario(usuario.email),
      programa,
    );
    if (!participacao)
      throw new BadRequestException(
        'Conta sem candidatura. Selecione uma participação.',
      );
    const periodo = Number(participacao.respostas?.periodo);
    if (participacao.papel === 'candidato') {
      if (Number.isInteger(periodo) && periodo < 2) {
        throw new BadRequestException(
          'Não é possível aprovar: padrinhos precisam estar a partir do 2º período.',
        );
      }
      await this.avaliarRequisitosPadrinho(
        participacao.programa,
        participacao.respostas ?? {},
      );
    } else if (participacao.papel === 'apadrinhado') {
      if (Number.isInteger(periodo) && periodo !== 1) {
        throw new BadRequestException(
          'Não é possível aprovar: apadrinhados precisam estar no 1º período.',
        );
      }
      if (
        participacao.respostas?.declaraPrimeiroPeriodo !== true &&
        periodo !== 1
      ) {
        throw new BadRequestException(
          'Não é possível aprovar sem declaração de 1º período.',
        );
      }
    }
    await this.participacoesService.aprovarCandidatura(
      participacao.id,
      coordenador,
    );
    return this.detalhar(id, participacao.programa);
  }

  async rejeitar(
    id: number,
    motivo: string | undefined,
    coordenador: string,
    programa?: string,
  ) {
    const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
    if (!justificativa) {
      throw new BadRequestException(
        'Justificativa de rejeição obrigatória (até 1000 caracteres).',
      );
    }
    const usuario = await this.usuariosService.buscarPorId(id);
    const participacao = this.participacaoDoCadastro(
      usuario,
      await this.participacoesService.listarPorUsuario(usuario.email),
      programa,
    );
    if (!participacao)
      throw new BadRequestException(
        'Conta sem candidatura. Selecione uma participação.',
      );
    await this.participacoesService.rejeitarCandidaturaPorId(
      participacao.id,
      justificativa,
      coordenador,
    );
    return this.detalhar(id, participacao.programa);
  }

  /** Compatibilidade: decisões de ciclo nunca alteram a conta global. */
  async refletirDecisaoDaCandidatura(
    _participacao: ParticipacaoEntity,
    _decisao: 'aprovado' | 'rejeitado',
    _coordenador?: string,
  ) {}

  private participacaoDoCadastro(
    usuario: UsuarioEntity,
    participacoes: ParticipacaoEntity[],
    programa?: string,
  ): ParticipacaoEntity | null {
    const registros = participacoes.filter(
      (p) =>
        p.usuarioId === usuario.email && (!programa || p.programa === programa),
    );
    if (registros.length > 1)
      throw new BadRequestException(
        'Mais de uma participação: informe o programa ou decida pelo ID da participação.',
      );
    return registros[0] ?? null;
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
