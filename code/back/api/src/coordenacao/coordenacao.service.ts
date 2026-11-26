import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ParticipacaoEntity,
  StatusParticipacaoRegistro,
} from '../participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  formatarData,
  matchingLiberado,
  montarEtapas,
  ROTULOS_STATUS_PROGRAMA,
} from '../programas/etapas.js';
import { perfilDoRegistro } from '../participacoes/perfil.js';
import { ProgramasService } from '../programas/programas.service.js';
import { AvisosService } from '../avisos/avisos.service.js';
import { FormulariosService } from '../formularios/formularios.service.js';
import {
  PAPEIS_DO_FORMULARIO,
  respostasIndividuais,
  respostasPorPergunta,
} from '../formularios/respostas-formulario.js';
import { CadastroService } from '../cadastro/cadastro.service.js';
import { seedDemoHabilitado } from '../config/seguranca.js';
import { CriterioCatalogoService } from '../matching/criterio-catalogo.service.js';
import { MatchingService } from '../matching/matching.service.js';
import { notificacaoCandidatura } from '../notificacoes/notificacoes.js';
import { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { EntradaVerificacao } from '../participacoes/verificacao-academica.js';
/** "Situação da análise" na listagem: conferência acadêmica registrada ou não. */
const FILTROS_CONFERENCIA = [
  'pendente',
  'requisitos_atendidos',
  'requisitos_nao_atendidos',
];

@Injectable()
export class CoordenacaoService implements OnModuleInit {
  constructor(
    private readonly programasService: ProgramasService,
    private readonly participacoesService: ParticipacoesService,
    private readonly formulariosService: FormulariosService,
    private readonly avisosService: AvisosService,
    private readonly cadastroService: CadastroService,
    private readonly usuariosService: UsuariosService,
    private readonly matchingService: MatchingService,
    private readonly criterioCatalogoService: CriterioCatalogoService,
    @InjectRepository(ParticipacaoEntity)
    private readonly participacoes: Repository<ParticipacaoEntity>,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /** Depois do commit da decisão: o aviso nunca desfaz nem trava a decisão. */
  private async avisarDecisao(
    registro: ParticipacaoEntity,
    resultado: 'aprovado' | 'nao_aprovado' | 'revogado',
  ): Promise<void> {
    await this.notificacoes?.criarParaEmail(
      registro.usuarioId,
      notificacaoCandidatura(resultado, {
        programa: registro.programa,
        em:
          registro.respostas?._servidor?.decisao?.em ??
          new Date().toISOString(),
      }),
    );
  }

  /** Base demo (ciclos, requisitos, participações): só com SEED_DEMO_DATA=true. */
  async onModuleInit() {
    if (!seedDemoHabilitado()) return;
    await this.semearBaseDemo();
  }

  /**
   * Conjunto fixo e idempotente de programa, requisitos e participações demo.
   * A subida da API só chama isto com SEED_DEMO_DATA=true em banco local.
   * O comando `npm run seed:demo` chama de propósito, uma vez, no ambiente alvo.
   */
  async semearBaseDemo() {
    await this.programasService.garantirProgramaAtual();
    await this.programasService.garantirProgramaHistoricoDemo();
    await this.semearRequisitosDemo();
    await this.semearFormulariosDemo();
    await this.semearParticipacoesDemo();
    await this.semearMatchingDemo();
  }

  /**
   * Publica as perguntas sugeridas do ciclo atual quando ainda não há
   * formulário salvo/publicado — senão o aluno vê perguntas=[] na demo.
   * Não sobrescreve rascunho ou publicação já persistidos pela coordenação.
   */
  private async semearFormulariosDemo() {
    const programa = await this.programasService.garantirProgramaAtual();
    for (const tipo of ['padrinho', 'apadrinhado'] as const) {
      const atual = await this.formulariosService.obter(tipo, programa.codigo);
      if (atual.salvo || atual.publicado) continue;
      await this.formulariosService.salvar(tipo, {
        programa: programa.codigo,
        publicado: true,
        perguntas: atual.perguntas,
      });
    }
  }

  /**
   * Habilita matching na demo: catálogo mínimo, pergunta vinculada nos dois
   * formulários, configuração liberada e extras nas participações elegíveis.
   * Idempotente — não sobrescreve configuração já salva pela coordenação.
   */
  private async semearMatchingDemo() {
    const programa = await this.programasService.garantirProgramaAtual();
    let catalogo =
      await this.criterioCatalogoService.listarAtivosParaFormulario();
    if (!catalogo.length) {
      await this.criterioCatalogoService.criar(
        {
          nome: 'Áreas de apoio',
          descricao:
            'Áreas em que o padrinho pode apoiar ou o apadrinhado precisa de apoio.',
          enunciadoPadrao: 'Quais áreas de apoio são relevantes para você?',
          tipo: 'multipla_escolha',
          alternativas: [
            { id: 'academico', rotulo: 'Acadêmico' },
            { id: 'carreira', rotulo: 'Carreira' },
            { id: 'pessoal', rotulo: 'Pessoal' },
            { id: 'social', rotulo: 'Social' },
          ],
          ativo: true,
        },
        'seed:demo',
      );
      catalogo =
        await this.criterioCatalogoService.listarAtivosParaFormulario();
    }
    const criterio =
      catalogo.find((c) => c.versao?.tipo === 'multipla_escolha') ??
      catalogo[0];
    if (!criterio?.versao) return;

    const perguntaId = `match-criterio-${criterio.id}`;
    const perguntaMatching = {
      id: perguntaId,
      enunciado: criterio.versao.enunciadoPadrao,
      tipo: criterio.versao.tipo,
      opcoes: [] as string[],
      alternativas: criterio.versao.alternativas,
      obrigatoria: false,
      criterioId: criterio.id,
      criterioVersao: criterio.versao.versao,
    };

    for (const tipo of ['padrinho', 'apadrinhado'] as const) {
      const form = await this.formulariosService.obter(tipo, programa.codigo);
      const jaTem = (form.perguntas ?? []).some(
        (p) => Number(p.criterioId) === criterio.id,
      );
      if (jaTem) continue;
      await this.formulariosService.salvar(tipo, {
        programa: programa.codigo,
        publicado: true,
        perguntas: [...(form.perguntas ?? []), perguntaMatching],
      });
    }

    const config = await this.matchingService.obterConfiguracao(
      programa.codigo,
    );
    if (!config) {
      await this.matchingService.salvarConfiguracao(
        {
          programa: programa.codigo,
          liberado: true,
          capacidadePorPadrinho: 3,
          capacidadePorApadrinhado: 1,
          criterios: [
            {
              criterioPadrinhoId: criterio.id,
              criterioApadrinhadoId: criterio.id,
              operacao: 'intersecao',
              peso: 100,
            },
          ],
        },
        'seed:demo',
      );
    } else if (!config.liberado) {
      await this.matchingService.liberar(
        programa.codigo,
        true,
        'seed:demo',
      );
    }

    const alternativa =
      criterio.versao.alternativas?.[0]?.id ?? 'academico';
    const elegiveis = [
      'thiago@pucminas.edu.br',
      'camila@pucminas.edu.br',
      'lucas.almeida@pucminas.edu.br',
    ];
    for (const email of elegiveis) {
      const registros = await this.participacoes.find({
        where: { usuarioId: email, programa: programa.codigo },
      });
      for (const registro of registros) {
        if (
          registro.papel !== 'padrinho' &&
          registro.papel !== 'apadrinhado' &&
          !(registro.papel === 'candidato' && registro.status === 'aprovado')
        ) {
          continue;
        }
        const extras: Record<string, string | string[] | boolean> = {
          ...(registro.respostas?.extras ?? {}),
        };
        if (extras[perguntaId] != null) continue;
        extras[perguntaId] = [alternativa];
        registro.respostas = { ...registro.respostas, extras };
        await this.participacoes.save(registro);
      }
    }
  }

  /**
   * Base demo: requisitos iniciais do ciclo atual, gravados como DADO do
   * ciclo (a coordenação edita em Programas). Só preenche se o ciclo nunca
   * foi configurado (null); [] ou qualquer lista salva é respeitada.
   */
  private async semearRequisitosDemo() {
    const programa = await this.programasService.garantirProgramaAtual();
    if (
      programa.requisitosPadrinho !== null &&
      programa.requisitosPadrinho !== undefined
    ) {
      return;
    }
    await this.programasService.atualizar(programa.codigo, {
      requisitosPadrinho: REQUISITOS_INICIAIS_DEMO,
    });
  }

  async obterDashboard(programaCodigo?: string) {
    const programas = await this.programasService.listar();
    if (!programas.length) {
      return {
        programa: null,
        programas: [],
        atualizadoEm: new Date().toISOString(),
        vazio: true,
        mensagem: 'Nenhum programa cadastrado.',
      };
    }

    const codigoAtual = ParticipacoesService.programaAtual();
    const programa =
      await this.programasService.resolverConsulta(programaCodigo);
    if (!programa) throw new NotFoundException('Nenhum programa cadastrado.');
    const codigo = programa.codigo;

    const registros = await this.participacoesService.listarPorPrograma({
      programa: codigo,
    });

    const candidatos = registros.filter((r) => r.papel === 'candidato');
    const padrinhos = registros.filter((r) => r.papel === 'padrinho');
    const apadrinhados = registros.filter(
      (r) => r.papel === 'apadrinhado' && r.status === 'em_andamento',
    );
    const cadastrosApadrinhadoPendentes = registros.filter(
      (r) => r.papel === 'apadrinhado' && r.status === 'pendente',
    ).length;

    const pendentesLista = candidatos.filter((r) => r.status === 'pendente');
    const emAnaliseLista = candidatos.filter((r) => r.status === 'em_analise');
    const pendentes = pendentesLista.length;
    const emAnalise = emAnaliseLista.length;
    const aguardandoDecisao = pendentes + emAnalise;
    const rejeitadas = candidatos.filter(
      (r) => r.status === 'nao_aprovado',
    ).length;
    const aprovadas = [
      ...padrinhos,
      ...candidatos.filter((r) => r.status === 'aprovado'),
    ].filter(
      (r) =>
        r.status === 'aprovado' ||
        r.status === 'em_andamento' ||
        r.status === 'concluido',
    ).length;
    const ativos = [];
    for (const padrinho of padrinhos) {
      if (await this.participacoesService.temVinculoValido(padrinho))
        ativos.push(padrinho);
    }
    const padrinhosComVinculo = ativos.length;
    const gruposFormados = ativos.length;

    const candidaturasInscritas =
      pendentes + emAnalise + rejeitadas + aprovadas;

    const recentes = [...candidatos]
      .sort(
        (a, b) =>
          new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
      )
      .slice(0, 6)
      .map((item) => this.enriquecerCandidatura(item));

    const semVinculoLista: ParticipacaoEntity[] = [];
    for (const apadrinhado of apadrinhados) {
      if (!(await this.participacoesService.temVinculoValido(apadrinhado)))
        semVinculoLista.push(apadrinhado);
    }
    const gruposIncompletos = Math.max(
      0,
      (programa.gruposPrevistos || 0) - gruposFormados,
    );
    const pontosAtencao = this.montarPontosAtencao({
      aguardando: [...pendentesLista, ...emAnaliseLista],
      pendentes,
      emAnalise,
      semVinculo: semVinculoLista.length,
      cadastrosApadrinhadoPendentes,
      gruposIncompletos,
      programa,
    });

    const encerrado = programa.etapaAtual === 'encerramento';

    return {
      programa: this.serializarPrograma(programa, codigoAtual),
      programas: programas.map((p) => this.serializarPrograma(p, codigoAtual)),
      atualizadoEm: new Date().toISOString(),
      vazio: false,
      indicadores: {
        candidaturasPendentes: {
          valor: aguardandoDecisao,
          total: candidaturasInscritas,
          rotulo: 'de candidaturas a padrinho',
          detalhe:
            aguardandoDecisao === 0
              ? `0 de ${candidaturasInscritas} inscritas`
              : `${pendentes} nova${pendentes === 1 ? '' : 's'} · ${emAnalise} em análise`,
          pendentes,
          emAnalise,
        },
        padrinhosAprovados: {
          valor: aprovadas,
          total: candidaturasInscritas || aprovadas,
          rotulo: 'de candidaturas a padrinho',
          detalhe:
            aprovadas === 0
              ? `0 de ${candidaturasInscritas || 0} candidaturas`
              : `${padrinhosComVinculo} com vínculo ativo`,
          comVinculo: padrinhosComVinculo,
        },
        apadrinhadosAtivos: {
          valor: apadrinhados.length,
          total: programa.vagasApadrinhados,
          rotulo: 'de vagas',
          detalhe:
            semVinculoLista.length > 0
              ? `${semVinculoLista.length} sem vínculo confirmado`
              : 'Todos com vínculo definido',
        },
        gruposFormados: {
          valor: gruposFormados,
          total: programa.gruposPrevistos,
          rotulo: 'previstos',
          detalhe: `${gruposFormados} de ${programa.gruposPrevistos} previstos`,
        },
      },
      candidaturasVisaoGeral: {
        titulo: 'Candidaturas a padrinho',
        descricao:
          'Contagem por status da candidatura a padrinho (apadrinhados não entram aqui).',
        pendentes,
        emAnalise,
        aprovadas,
        rejeitadas,
        total: candidaturasInscritas,
      },
      etapas: montarEtapas(programa),
      candidaturasRecentes: recentes,
      pontosAtencao,
      acoes: {
        podeAbrirNovoCiclo: true,
        podeGerenciarFormularios: !encerrado,
        podeCriarComunicado: !encerrado,
        somenteLeitura: encerrado,
      },
      resumo: {
        mentoriaAtiva:
          programa.etapaAtual === 'andamento' ||
          apadrinhados.length > 0 ||
          padrinhosComVinculo > 0,
        formularioPublicado: programa.formularioPublicado,
        matchingEmBreve:
          programa.matchingPendente && programa.etapaAtual !== 'encerramento',
        inscricoesAbertas: programa.inscricoesAbertas,
        programaEmAndamento: programa.etapaAtual === 'andamento',
        encerrado,
      },
    };
  }

  /**
   * Candidaturas do ciclo. `papel`: candidato (padrão, padrinhos) ou
   * apadrinhado; `status`: situação da inscrição; `conferencia`: pendente,
   * requisitos_atendidos ou requisitos_nao_atendidos.
   */
  async listarCandidaturas(
    programa: string,
    status?: string,
    papel?: string,
    conferencia?: string,
  ) {
    const publico = papel?.trim() || 'candidato';
    if (!['candidato', 'padrinho', 'apadrinhado'].includes(publico)) {
      throw new BadRequestException(
        'Papel inválido: use candidato (padrinho) ou apadrinhado.',
      );
    }
    const conf = conferencia?.trim();
    if (conf && !FILTROS_CONFERENCIA.includes(conf)) {
      throw new BadRequestException(
        'Conferência inválida: use pendente, requisitos_atendidos ou requisitos_nao_atendidos.',
      );
    }
    const registros =
      publico === 'apadrinhado'
        ? await this.apadrinhadosPorStatus(programa, status)
        : await this.candidatosPorStatus(programa, status);
    return registros
      .filter((r) =>
        !conf
          ? true
          : conf === 'pendente'
            ? !r.verificacao?.atual
            : r.verificacao?.atual?.resultado === conf,
      )
      .map((item) => this.enriquecerCandidatura(item));
  }

  private async candidatosPorStatus(programa: string, status?: string) {
    const filtro = status?.trim();

    if (filtro === 'aprovadas') {
      const registros = await this.participacoesService.listarPorPrograma({
        programa,
      });
      return registros.filter(
        (r) =>
          (r.papel === 'candidato' && r.status === 'aprovado') ||
          (r.papel === 'padrinho' &&
            ['em_andamento', 'concluido'].includes(r.status)),
      );
    }

    // Compatibilidade: a tela pede `sem_vinculo` sem informar o papel.
    if (filtro === 'sem_vinculo')
      return this.apadrinhadosPorStatus(programa, filtro);

    if (filtro === 'aguardando') {
      const registros = await this.participacoesService.listarPorPrograma({
        programa,
        papel: 'candidato',
      });
      return registros.filter(
        (r) => r.status === 'pendente' || r.status === 'em_analise',
      );
    }

    return this.participacoesService.listarPorPrograma({
      programa,
      papel: 'candidato',
      ...(filtro ? { status: filtro as StatusParticipacaoRegistro } : {}),
    });
  }

  private async apadrinhadosPorStatus(programa: string, status?: string) {
    const filtro = status?.trim();
    const apadrinhados = await this.participacoesService.listarPorPrograma({
      programa,
      papel: 'apadrinhado',
    });
    if (filtro === 'sem_vinculo') {
      const semVinculo: ParticipacaoEntity[] = [];
      for (const registro of apadrinhados) {
        if (
          registro.status === 'em_andamento' &&
          !(await this.participacoesService.temVinculoValido(registro))
        )
          semVinculo.push(registro);
      }
      return semVinculo;
    }
    if (filtro === 'aguardando')
      return apadrinhados.filter((r) =>
        ['pendente', 'em_analise'].includes(r.status),
      );
    if (filtro === 'aprovadas')
      return apadrinhados.filter((r) =>
        ['em_andamento', 'concluido'].includes(r.status),
      );
    return filtro
      ? apadrinhados.filter((r) => r.status === filtro)
      : apadrinhados;
  }

  async criarNovoCiclo(
    codigo?: string,
    configuracao: Record<string, unknown> = {},
  ) {
    return this.serializarPrograma(
      await this.programasService.criarNovoCiclo(codigo, configuracao),
    );
  }

  private enriquecerCandidatura(item: ParticipacaoEntity) {
    const perfil = perfilDoRegistro(item);
    return {
      id: item.id,
      usuarioId: item.usuarioId,
      programa: item.programa,
      papel: item.papel,
      status: item.status,
      grupo: item.grupo ?? null,
      apadrinhados: item.apadrinhados,
      criadoEm: item.criadoEm,
      nome: perfil.nome,
      email: perfil.email,
      curso: perfil.curso,
      periodo: perfil.periodo,
      fotoUrl: perfil.fotoUrl,
      iniciais: perfil.iniciais,
      statusRotulo: this.rotuloStatus(item),
      /** Resultado da última conferência acadêmica; null = não conferida. */
      conferencia: item.verificacao?.atual?.resultado ?? null,
    };
  }

  private rotuloStatus(item: ParticipacaoEntity): string {
    if (item.papel === 'padrinho') return 'Aprovada';
    if (item.papel === 'apadrinhado') {
      return {
        aprovado: 'Aprovado — aguardando matching',
        pendente: 'Aguardando aprovação',
        em_analise: 'Em análise',
        nao_aprovado: 'Rejeitado',
        em_andamento: 'Aprovado',
        concluido: 'Concluído',
      }[item.status];
    }
    return {
      aprovado: 'Aprovado — aguardando matching',
      pendente: 'Nova',
      em_analise: 'Em análise',
      nao_aprovado: 'Rejeitada',
      em_andamento: 'Em andamento',
      concluido: 'Concluída',
    }[item.status];
  }

  private montarPontosAtencao(input: {
    aguardando: ParticipacaoEntity[];
    pendentes: number;
    emAnalise: number;
    semVinculo: number;
    cadastrosApadrinhadoPendentes: number;
    gruposIncompletos: number;
    programa: ProgramaEntity;
  }) {
    type Alerta = {
      id: string;
      titulo: string;
      descricao: string;
      texto: string;
      icon: string;
      destino: string;
      query: Record<string, string>;
      severidade: 'alta' | 'media' | 'baixa';
      urgencia: number;
    };
    const itens: Alerta[] = [];
    const totalAguardando = input.pendentes + input.emAnalise;

    if (totalAguardando > 0) {
      const maisAntiga = input.aguardando
        .map((r) => new Date(r.criadoEm).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b)[0];
      const diasEspera =
        maisAntiga != null
          ? Math.max(
              0,
              Math.floor((Date.now() - maisAntiga) / (1000 * 60 * 60 * 24)),
            )
          : null;
      const esperaTexto =
        diasEspera == null
          ? 'Revise as candidaturas a padrinho.'
          : diasEspera === 0
            ? 'Há candidaturas recebidas hoje.'
            : `A mais antiga aguarda há ${diasEspera} dia${diasEspera === 1 ? '' : 's'}.`;
      itens.push({
        id: 'revisao',
        titulo: 'Candidaturas aguardando análise',
        descricao: `${totalAguardando} aguardando decisão (${input.pendentes} nova${input.pendentes === 1 ? '' : 's'} · ${input.emAnalise} em análise). ${esperaTexto}`,
        texto: `${totalAguardando} candidatura${totalAguardando === 1 ? '' : 's'} aguardando análise`,
        icon: 'clipboard',
        destino: 'candidaturas',
        query: { status: 'aguardando' },
        severidade: 'alta',
        urgencia: 100 + totalAguardando,
      });
    }

    if (input.cadastrosApadrinhadoPendentes > 0) {
      const n = input.cadastrosApadrinhadoPendentes;
      itens.push({
        id: 'cadastros',
        titulo: 'Apadrinhados aguardando aprovação',
        descricao: `${n} apadrinhado${n === 1 ? '' : 's'} aguardando aprovação da coordenação.`,
        texto: `${n} apadrinhado${n === 1 ? '' : 's'} pendente${n === 1 ? '' : 's'}`,
        icon: 'clipboard',
        destino: 'candidaturas',
        query: { publico: 'apadrinhado', status: 'pendente' },
        severidade: 'alta',
        urgencia: 95 + n,
      });
    }

    if (input.semVinculo > 0) {
      itens.push({
        id: 'vinculo',
        titulo: 'Apadrinhados sem vínculo confirmado',
        descricao: `${input.semVinculo} apadrinhado${input.semVinculo === 1 ? '' : 's'} aguardando definição de padrinho/grupo.`,
        texto: `${input.semVinculo} apadrinhado${input.semVinculo === 1 ? '' : 's'} sem vínculo`,
        icon: 'users',
        destino: 'candidaturas',
        query: { status: 'sem_vinculo' },
        severidade: 'alta',
        urgencia: 90 + input.semVinculo,
      });
    }

    if (
      input.gruposIncompletos > 0 &&
      input.programa.etapaAtual !== 'inscricoes' &&
      input.programa.etapaAtual !== 'encerramento'
    ) {
      itens.push({
        id: 'grupos',
        titulo: 'Grupos com formação incompleta',
        descricao: `${input.gruposIncompletos} de ${input.programa.gruposPrevistos} grupos previstos ainda sem formação completa.`,
        texto: `${input.gruposIncompletos} grupo${input.gruposIncompletos === 1 ? '' : 's'} incompleto${input.gruposIncompletos === 1 ? '' : 's'}`,
        icon: 'groups',
        destino: 'programas',
        query: { pendencia: 'grupos' },
        severidade: 'media',
        urgencia: 70 + input.gruposIncompletos,
      });
    }

    if (input.programa.inscricoesAbertas && input.programa.inscricoesFim) {
      const dias = this.diasAte(input.programa.inscricoesFim);
      if (dias !== null && dias >= 0 && dias <= 7) {
        itens.push({
          id: 'prazo',
          titulo: 'Prazo de inscrições próximo',
          descricao:
            dias === 0
              ? `Inscrições encerram hoje (${formatarData(input.programa.inscricoesFim)}).`
              : `Encerramento em ${dias} dia${dias === 1 ? '' : 's'} (${formatarData(input.programa.inscricoesFim)}).`,
          texto:
            dias === 0
              ? 'Prazo de inscrições encerra hoje'
              : `Prazo de inscrições encerra em ${dias} dia${dias === 1 ? '' : 's'}`,
          icon: 'clock',
          destino: 'programas',
          query: { pendencia: 'prazo' },
          severidade: dias <= 2 ? 'alta' : 'media',
          urgencia: 80 + (7 - dias),
        });
      }
    }

    return itens.sort((a, b) => b.urgencia - a.urgencia).slice(0, 4);
  }

  private serializarPrograma(programa: ProgramaEntity, codigoVigente?: string) {
    const vigente =
      programa.codigo === codigoVigente ||
      (programa.etapaAtual !== 'encerramento' &&
        programa.codigo === ParticipacoesService.programaAtual());
    return {
      id: programa.id,
      codigo: programa.codigo,
      titulo: programa.titulo || `Programa ${programa.codigo}`,
      nome: programa.titulo || `Programa ${programa.codigo}`,
      etapaAtual: programa.etapaAtual,
      matchingLiberado: matchingLiberado(programa),
      statusRotulo:
        ROTULOS_STATUS_PROGRAMA[programa.etapaAtual] ?? programa.etapaAtual,
      vigente,
      encerrado: programa.etapaAtual === 'encerramento',
      inscricoesAbertas: programa.inscricoesAbertas,
      podeEncerrarInscricoes:
        programa.etapaAtual === 'inscricoes' && programa.inscricoesAbertas,
      formularioPublicado: programa.formularioPublicado,
      matchingPendente: programa.matchingPendente,
      vagasApadrinhados: programa.vagasApadrinhados,
      gruposPrevistos: programa.gruposPrevistos,
      inscricoesFim: programa.inscricoesFim,
      datas: {
        inscricoesInicio: programa.inscricoesInicio,
        inscricoesFim: programa.inscricoesFim,
        analiseInicio: programa.analiseInicio,
        analiseFim: programa.analiseFim,
        formacaoInicio: programa.formacaoInicio,
        formacaoFim: programa.formacaoFim,
        andamentoInicio: programa.andamentoInicio,
        andamentoFim: programa.andamentoFim,
        encerramentoEm: programa.encerramentoEm,
      },
      requisitosPadrinho: programa.requisitosPadrinho ?? [],
    };
  }

  private diasAte(iso: string): number | null {
    const alvo = new Date(`${iso}T23:59:59`);
    if (Number.isNaN(alvo.getTime())) return null;
    const hoje = new Date();
    const diff = alvo.getTime() - hoje.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /** Detalhe completo da candidatura/participação para a tela de análise. */
  async detalharCandidatura(id: number) {
    const item = await this.participacoesService.buscarPorId(id);
    const historico = (
      await this.participacoesService.listarPorUsuario(item.usuarioId)
    )
      .filter((r) => r.id !== item.id)
      .map((r) => ({
        id: r.id,
        programa: r.programa,
        papel: r.papel,
        status: r.status,
        statusRotulo: this.rotuloStatus(r),
      }));
    const jaApadrinhado = historico.find((r) => r.papel === 'apadrinhado');
    const candidaturasAnteriores = historico.filter(
      (r) => r.papel === 'candidato' || r.papel === 'padrinho',
    ).length;
    // Requisitos: a foto respondida pelo candidato (histórico preservado);
    // registros antigos sem foto mostram os do ciclo DA candidatura.
    const respondidos = item.respostas?.requisitos;
    const requisitos =
      respondidos ??
      (await this.programasService.requisitosPadrinho(item.programa)).map(
        (r) => ({ ...r, cumpre: null }),
      );
    const resumo = this.enriquecerCandidatura(item);
    return {
      ...resumo,
      conferencia: {
        itens: await this.participacoesService.itensDaConferencia(item),
        verificacao: item.verificacao?.atual ?? null,
        anteriores: item.verificacao?.anteriores ?? [],
        podeRegistrar:
          item.papel !== 'padrinho' &&
          ['pendente', 'em_analise'].includes(item.status),
        /** O que a coordenação procura no sistema da faculdade. */
        dadosParaConsulta: {
          nome: resumo.nome,
          email: resumo.email,
          curso: resumo.curso,
          periodo: resumo.periodo,
          turno: item.respostas?.turno ?? null,
          papel:
            item.papel === 'apadrinhado'
              ? 'Apadrinhado'
              : item.papel === 'padrinho'
                ? 'Padrinho'
                : 'Candidato a padrinho',
          programa: item.programa,
        },
      },
      vinculos: await this.vinculosDe(item),
      respostas: item.respostas ?? {},
      observacoes: item.observacoes ?? '',
      decisao: item.respostas?._servidor?.decisao ?? null,
      formularioRespondido: item.respostas?._servidor?.formulario ?? null,
      requisitos,
      requisitosRespondidos: Boolean(respondidos),
      criterios: [
        'A partir do 2º período',
        ...requisitos.map((r) => r.descricao),
      ],
      historico,
      jaFoiApadrinhadoEm: jaApadrinhado?.programa ?? null,
      numeroCandidatura: candidaturasAnteriores + 1,
    };
  }

  /**
   * Vínculos ativos da participação: pares do matching (F11/F12) e, para
   * registros antigos, o grupo legado. Precisam ser tratados antes de revogar.
   */
  private async vinculosDe(item: ParticipacaoEntity) {
    const pessoa = (p: ParticipacaoEntity) => {
      const perfil = perfilDoRegistro(p);
      return {
        participacaoId: p.id,
        papel: p.papel,
        nome: perfil.nome,
        email: perfil.email,
        curso: perfil.curso,
        iniciais: perfil.iniciais,
      };
    };
    const lista: Array<
      ReturnType<typeof pessoa> & {
        vinculoId: number | null;
        origem: 'matching' | 'grupo';
        grupo: string | null;
      }
    > = (await this.participacoesService.listarVinculados(item)).map(
      ({ participacao, vinculoId }) => ({
        ...pessoa(participacao),
        vinculoId,
        origem: 'matching',
        grupo: null,
      }),
    );
    const grupo = item.grupo?.trim();
    if (grupo && (item.papel === 'padrinho' || item.papel === 'apadrinhado')) {
      const membros =
        item.papel === 'padrinho'
          ? (
              await this.participacoesService.listarApadrinhadosDoGrupo(
                item.programa,
                grupo,
              )
            ).filter((m) => m.status === 'em_andamento')
          : [
              await this.participacoesService.buscarPadrinhoDoGrupo(
                item.programa,
                grupo,
              ),
            ].filter((m): m is ParticipacaoEntity => Boolean(m));
      for (const membro of membros) {
        if (lista.some((v) => v.participacaoId === membro.id)) continue;
        lista.push({
          ...pessoa(membro),
          vinculoId: null,
          origem: 'grupo',
          grupo,
        });
      }
    }
    return lista;
  }

  /** Registra a conferência feita no sistema da faculdade (F09). */
  async registrarVerificacao(
    id: number,
    corpo: EntradaVerificacao,
    coordenador?: string,
  ) {
    await this.participacoesService.registrarVerificacao(
      id,
      corpo ?? {},
      coordenador,
    );
    return this.detalharCandidatura(id);
  }

  /** Encerra um vínculo do matching para permitir revogar a aprovação. */
  async encerrarVinculo(id: number, vinculoId: number) {
    await this.participacoesService.encerrarVinculo(id, vinculoId);
    return this.detalharCandidatura(id);
  }

  /**
   * Confere requisitos do papel (e critérios do ciclo para padrinho) antes de
   * aprovar. A conferência acadêmica no sistema da faculdade continua manual;
   * aqui bloqueamos declarações incompatíveis.
   */
  private async garantirRequisitosParaAprovar(id: number) {
    const registro = await this.participacoesService.buscarPorId(id);
    const periodo = Number(registro.respostas?.periodo);
    const periodoOk = Number.isInteger(periodo) ? periodo : null;

    if (registro.papel === 'candidato') {
      if (periodoOk !== null && periodoOk < 2) {
        throw new BadRequestException(
          'Não é possível aprovar: padrinhos precisam estar a partir do 2º período.',
        );
      }
      const respostas = registro.respostas ?? {};
      // Foto por requisito (envios novos): bloqueia se faltou declaração.
      // Legado só com `declaraPreRequisitos`: a coordenação confere e decide.
      if (Array.isArray(respostas.requisitos)) {
        await this.cadastroService.avaliarRequisitosPadrinho(
          registro.programa,
          respostas,
        );
      } else if (respostas.declaraPreRequisitos !== true) {
        throw new BadRequestException(
          'Não é possível aprovar: o candidato não declarou cumprir os pré-requisitos do ciclo.',
        );
      }
      return;
    }

    if (registro.papel === 'apadrinhado') {
      if (periodoOk !== null && periodoOk !== 1) {
        throw new BadRequestException(
          'Não é possível aprovar: apadrinhados precisam estar no 1º período.',
        );
      }
      if (registro.respostas?.declaraPrimeiroPeriodo !== true) {
        // Envios legados sem declaração: ainda exigem período 1.
        if (periodoOk !== 1) {
          throw new BadRequestException(
            'Não é possível aprovar sem declaração de 1º período.',
          );
        }
      }
    }
  }

  /** Decisão acadêmica da candidatura; conta e permissões ativas são independentes. */
  async aprovarCandidatura(id: number, coordenador?: string) {
    await this.garantirRequisitosParaAprovar(id);
    const registro = await this.participacoesService.aprovarCandidatura(
      id,
      coordenador,
    );
    await this.cadastroService.refletirDecisaoDaCandidatura(
      registro,
      'aprovado',
      coordenador,
    );
    await this.avisarDecisao(registro, 'aprovado');
    return this.detalharCandidatura(id);
  }

  async desvincularCandidatura(id: number) {
    const { apadrinhado, padrinho } =
      await this.participacoesService.desvincular(id);
    return {
      apadrinhado: this.enriquecerCandidatura(apadrinhado),
      padrinho: padrinho ? this.enriquecerCandidatura(padrinho) : null,
    };
  }

  async revogarAprovacao(
    id: number,
    coordenador?: string,
    justificativa?: string,
  ) {
    const registro = await this.participacoesService.revogarAprovacao(
      id,
      justificativa,
      coordenador,
    );
    await this.cadastroService.refletirDecisaoDaCandidatura(
      registro,
      'rejeitado',
      coordenador,
    );
    await this.avisarDecisao(registro, 'revogado');
    return this.detalharCandidatura(id);
  }

  async rejeitarCandidatura(
    id: number,
    coordenador?: string,
    justificativa?: string,
  ) {
    const registro = await this.participacoesService.rejeitarCandidaturaPorId(
      id,
      justificativa,
      coordenador,
    );
    await this.cadastroService.refletirDecisaoDaCandidatura(
      registro,
      'rejeitado',
      coordenador,
    );
    await this.avisarDecisao(registro, 'nao_aprovado');
    return this.detalharCandidatura(id);
  }

  async atualizarCandidatura(
    id: number,
    corpo: { status?: string; observacoes?: string | null },
  ) {
    const status =
      corpo.status === 'pendente' || corpo.status === 'em_analise'
        ? corpo.status
        : undefined;
    if (corpo.status !== undefined && !status) {
      throw new BadRequestException(
        'Use aprovar/rejeitar para decidir; aqui só "pendente" ou "em_analise".',
      );
    }
    await this.participacoesService.atualizarCandidatura(id, {
      status,
      observacoes: corpo.observacoes,
    });
    return this.detalharCandidatura(id);
  }

  /** Aprovar/rejeitar/colocar em análise várias candidaturas de uma vez. */
  async acaoEmMassa(
    corpo: { ids?: unknown; acao?: string; justificativa?: string },
    coordenador?: string,
  ) {
    const ids = Array.isArray(corpo.ids)
      ? [...new Set(corpo.ids.map(Number).filter(Number.isInteger))].slice(
          0,
          100,
        )
      : [];
    if (!ids.length) {
      throw new BadRequestException('Selecione ao menos uma candidatura.');
    }
    const acao = corpo.acao;
    if (acao === 'rejeitar' && !corpo.justificativa?.trim())
      throw new BadRequestException('Justificativa obrigatória.');
    if (acao !== 'aprovar' && acao !== 'rejeitar' && acao !== 'em_analise') {
      throw new BadRequestException('Ação em massa inválida.');
    }
    const resultados: Array<{ id: number; ok: boolean; erro?: string }> = [];
    for (const id of ids) {
      try {
        if (acao === 'aprovar') {
          await this.aprovarCandidatura(id, coordenador);
        } else if (acao === 'rejeitar') {
          await this.rejeitarCandidatura(id, coordenador, corpo.justificativa);
        } else {
          await this.participacoesService.atualizarCandidatura(id, {
            status: 'em_analise',
          });
        }
        resultados.push({ id, ok: true });
      } catch (erro) {
        resultados.push({
          id,
          ok: false,
          erro: erro instanceof Error ? erro.message : 'Falha ao atualizar.',
        });
      }
    }
    return {
      acao,
      sucesso: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok),
    };
  }

  /** Participantes do programa (padrinhos, apadrinhados e candidatos). */
  async listarUsuarios(programaCodigo?: string, papel?: string) {
    const programa = await this.resolverPrograma(programaCodigo);
    const registros = await this.participacoesService.listarPorPrograma({
      programa: programa.codigo,
    });
    const filtro = papel?.trim();
    const usuarios = await this.usuariosService.mapaPorEmail();
    const lista = await Promise.all(
      registros
        .filter(
          (r) =>
            !filtro ||
            r.papel === filtro ||
            (filtro === 'padrinho' &&
              r.papel === 'candidato' &&
              r.status === 'aprovado'),
        )
        .map(async (r) => {
          const usuario = usuarios.get(r.usuarioId);
          return {
            ...this.enriquecerCandidatura(r),
            situacao: await this.participacoesService.situacaoDoRegistro(r),
            usuarioCadastroId: usuario?.id ?? null,
            statusCadastro: usuario?.statusCadastro ?? null,
          };
        }),
    );
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async vincular(
    corpo: { apadrinhadoId?: unknown; padrinhoId?: unknown },
    responsavel?: string,
  ) {
    const apadrinhadoId = Number(corpo.apadrinhadoId);
    const padrinhoId = Number(corpo.padrinhoId);
    if (!Number.isInteger(apadrinhadoId) || !Number.isInteger(padrinhoId)) {
      throw new BadRequestException('Informe apadrinhado e padrinho.');
    }
    const { apadrinhado, padrinho } = await this.participacoesService.vincular(
      apadrinhadoId,
      padrinhoId,
      responsavel,
    );
    return {
      apadrinhado: this.enriquecerCandidatura(apadrinhado),
      padrinho: this.enriquecerCandidatura(padrinho),
    };
  }

  /** Programas com os números principais para a tela "Programas". */
  async listarProgramas() {
    const codigoAtual = ParticipacoesService.programaAtual();
    const programas = await this.programasService.listar();
    return Promise.all(
      programas.map(async (programa) => {
        const registros = await this.participacoesService.listarPorPrograma({
          programa: programa.codigo,
        });
        const padrinhos = registros.filter((r) => r.papel === 'padrinho');
        return {
          ...this.serializarPrograma(programa, codigoAtual),
          podeLiberarMatching: this.podeLiberarMatching(
            programa,
            registros,
          ),
          etapas: montarEtapas(programa),
          datas: {
            inscricoesInicio: programa.inscricoesInicio,
            inscricoesFim: programa.inscricoesFim,
            analiseInicio: programa.analiseInicio,
            analiseFim: programa.analiseFim,
            formacaoInicio: programa.formacaoInicio,
            formacaoFim: programa.formacaoFim,
            andamentoInicio: programa.andamentoInicio,
            andamentoFim: programa.andamentoFim,
            encerramentoEm: programa.encerramentoEm,
          },
          totais: {
            candidaturas: registros.filter((r) => r.papel === 'candidato')
              .length,
            padrinhos: padrinhos.length,
            apadrinhados: registros.filter((r) => r.papel === 'apadrinhado')
              .length,
            grupos: new Set(
              padrinhos
                .filter((r) => ParticipacoesService.vinculoValido(r, registros))
                .map((r) => r.grupo),
            ).size,
          },
        };
      }),
    );
  }

  async obterPrograma(codigo: string) {
    const programa = await this.resolverPrograma(codigo);
    const registros = await this.participacoesService.listarPorPrograma({
      programa: programa.codigo,
    });
    return {
      ...this.serializarPrograma(
        programa,
        ParticipacoesService.programaAtual(),
      ),
      podeLiberarMatching: this.podeLiberarMatching(programa, registros),
    };
  }

  private podeLiberarMatching(
    programa: ProgramaEntity,
    registros: ParticipacaoEntity[],
  ): boolean {
    return (
      programa.etapaAtual === 'analise' &&
      !programa.inscricoesAbertas &&
      !registros.some((registro) =>
        ['pendente', 'em_analise'].includes(registro.status),
      ) &&
      registros.some(
        (registro) =>
          (registro.papel === 'candidato' && registro.status === 'aprovado') ||
          (registro.papel === 'padrinho' &&
            registro.status === 'em_andamento'),
      )
    );
  }

  excluirPrograma(codigo: string, confirmacao: unknown) {
    return this.programasService.excluir(codigo, confirmacao);
  }

  async atualizarPrograma(codigo: string, corpo: Record<string, unknown>) {
    const atualizado = await this.programasService.atualizar(codigo, corpo);
    return this.serializarPrograma(
      atualizado,
      ParticipacoesService.programaAtual(),
    );
  }

  async encerrarInscricoes(codigo: string) {
    const programa = await this.programasService.encerrarInscricoes(codigo);
    return this.serializarPrograma(
      programa,
      ParticipacoesService.programaAtual(),
    );
  }

  async liberarMatching(codigo: string) {
    const programa = await this.programasService.liberarMatching(codigo);
    return this.serializarPrograma(
      programa,
      ParticipacoesService.programaAtual(),
    );
  }

  listarFormularios(programa?: string) {
    return this.formulariosService.listar(programa);
  }

  /** Só o ciclo vigente pode criar/alterar/encerrar formulários. */
  private async assertFormularioEditavel(programaCodigo?: string) {
    const codigo =
      (programaCodigo || '').trim() || ParticipacoesService.programaAtual();
    const programa = await this.programasService.resolverConsulta(codigo);
    if (!programa) {
      throw new NotFoundException('Nenhum programa cadastrado.');
    }
    const vigente = this.serializarPrograma(
      programa,
      ParticipacoesService.programaAtual(),
    ).vigente;
    if (!vigente || programa.etapaAtual === 'encerramento') {
      throw new BadRequestException(
        'Formulários de ciclos passados ou encerrados são somente leitura. Duplicar para o ciclo vigente se precisar alterar.',
      );
    }
    return programa;
  }

  async excluirFormulario(tipo: string, programa?: string) {
    await this.assertFormularioEditavel(programa);
    return this.formulariosService.excluir(
      FormulariosService.validarTipo(tipo),
      programa,
    );
  }

  /** Pool para vínculos manuais; não calcula pontuação nem cria grupos. */
  async obterMatching(programaCodigo?: string) {
    const programa = await this.resolverPrograma(programaCodigo);
    this.programasService.exigirMatchingLiberado(programa);
    const registros = await this.participacoesService.listarPorPrograma({
      programa: programa.codigo,
    });
    const padrinhos = registros.filter(
      (r) =>
        (r.papel === 'candidato' && r.status === 'aprovado') ||
        r.papel === 'padrinho',
    );
    const apadrinhados = registros.filter(
      (r) => r.papel === 'apadrinhado' && r.status === 'em_andamento',
    );
    return {
      programa: this.serializarPrograma(
        programa,
        ParticipacoesService.programaAtual(),
      ),
      matchingLiberado: true,
      padrinhos: padrinhos.map((r) => this.enriquecerCandidatura(r)),
      apadrinhados: apadrinhados.map((r) => ({
        ...this.enriquecerCandidatura(r),
        vinculado: ParticipacoesService.vinculoValido(r, registros),
      })),
    };
  }
  obterFormulario(tipo: string, programa?: string) {
    return this.formulariosService.obter(
      FormulariosService.validarTipo(tipo),
      programa,
    );
  }

  async salvarFormulario(
    tipo: string,
    corpo: { programa?: string; publicado?: boolean; perguntas?: unknown },
  ) {
    await this.assertFormularioEditavel(corpo?.programa);
    const formulario = await this.formulariosService.salvar(
      FormulariosService.validarTipo(tipo),
      corpo,
    );
    if (typeof corpo.publicado === 'boolean')
      await this.sincronizarPublicacao(formulario.programa);
    return formulario;
  }

  async encerrarFormulario(tipo: string, programa?: string) {
    await this.assertFormularioEditavel(programa);
    const formulario = await this.formulariosService.encerrar(
      FormulariosService.validarTipo(tipo),
      programa,
    );
    await this.sincronizarPublicacao(formulario.programa);
    return formulario;
  }

  duplicarFormulario(
    tipo: string,
    corpo: { programaOrigem?: string; programaDestino?: string },
  ) {
    return this.formulariosService.duplicar(
      FormulariosService.validarTipo(tipo),
      corpo,
    );
  }

  /** Envios de um público no programa, com a versão do formulário respondido. */
  async respostasFormulario(tipo: string, programa?: string) {
    const { formulario, itens } = await this.enviosDoFormulario(tipo, programa);
    return {
      programa: formulario.programa,
      tipo: formulario.tipo,
      versaoAtual: formulario.versao,
      total: itens.length,
      envios: respostasIndividuais(itens),
    };
  }

  /** As mesmas respostas, agrupadas por pergunta. */
  async respostasPorPergunta(tipo: string, programa?: string) {
    const { formulario, itens } = await this.enviosDoFormulario(tipo, programa);
    return {
      programa: formulario.programa,
      tipo: formulario.tipo,
      versaoAtual: formulario.versao,
      total: itens.length,
      perguntas: respostasPorPergunta(itens),
    };
  }

  private async enviosDoFormulario(tipo: string, programa?: string) {
    const formulario = await this.formulariosService.obter(
      FormulariosService.validarTipo(tipo),
      programa,
    );
    const lotes = await Promise.all(
      PAPEIS_DO_FORMULARIO[formulario.tipo].map((papel) =>
        this.participacoesService.listarPorPrograma({
          programa: formulario.programa,
          papel,
        }),
      ),
    );
    return { formulario, itens: lotes.flat() };
  }

  /** O selo "Formulário publicado" do dashboard reflete o que foi salvo. */
  private async sincronizarPublicacao(programa: string) {
    const [padrinho, apadrinhado] = await Promise.all([
      this.formulariosService.obter('padrinho', programa),
      this.formulariosService.obter('apadrinhado', programa),
    ]);
    await this.programasService
      .atualizar(programa, {
        formularioPublicado: padrinho.publicado || apadrinhado.publicado,
      })
      .catch(() => undefined);
  }

  criarComunicado(corpo: {
    titulo?: string;
    descricao?: string;
    publico?: string;
    programa?: string;
  }) {
    return this.avisosService.criar(corpo);
  }

  private async resolverPrograma(codigo?: string): Promise<ProgramaEntity> {
    const programa = await this.programasService.resolverConsulta(codigo);
    if (!programa) throw new NotFoundException('Nenhum programa cadastrado.');
    return programa;
  }

  /**
   * Garante um conjunto mínimo de registros no ciclo atual para o painel.
   * Não sobrescreve linhas já existentes (idempotente por usuario+programa+papel);
   * só completa as respostas de registros demo antigos que ainda não as têm.
   */
  private async semearParticipacoesDemo() {
    const programa = ParticipacoesService.programaAtual();
    const agora = new Date();
    const dias = (n: number) => new Date(agora.getTime() - 86400000 * n);

    const seed: Array<Partial<ParticipacaoEntity>> = [
      {
        usuarioId: 'ana.beatriz@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'pendente',
        apadrinhados: 0,
        inicioEm: agora,
        respostas: {
          motivacao:
            'Quero contribuir com a adaptação dos novos alunos, compartilhando minha experiência e ajudando no que for preciso.',
          experiencias:
            'Monitoria de AEDS I, participação em projetos de extensão e voluntariado no Elas++.',
          areas: ['Disciplinas e provas', 'Rotina universitária', 'Tecnologia'],
          disponibilidade: ['Manhã', 'Tarde', 'Fins de semana'],
          genero: 'Feminino',
          bolsistaProuni: false,
          deOutraCidade: true,
          declaraPreRequisitos: true,
          interesses: ['Tecnologia', 'Projetos'],
        },
      },
      {
        usuarioId: 'pedro.lima@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'em_analise',
        apadrinhados: 0,
        inicioEm: dias(2),
        respostas: {
          motivacao:
            'No meu primeiro período contar com um padrinho me ajudou a criar uma rotina de estudos. Quero retribuir.',
          experiencias:
            'Representante de turma e monitor voluntário de Cálculo 1.',
          areas: ['Disciplinas e provas', 'Carreira e estágio'],
          disponibilidade: ['Noite'],
          genero: 'Masculino',
          bolsistaProuni: true,
          deOutraCidade: false,
          declaraPreRequisitos: true,
          interesses: ['Inovação', 'Estágio'],
        },
      },
      {
        usuarioId: 'julia.fernandes@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'nao_aprovado',
        apadrinhados: 0,
        inicioEm: dias(5),
        terminoEm: agora,
        respostas: {
          motivacao: 'Gosto de ajudar colegas e conhecer gente nova.',
          areas: ['Vida no campus'],
          disponibilidade: ['Tarde'],
          genero: 'Feminino',
          bolsistaProuni: false,
          deOutraCidade: false,
          declaraPreRequisitos: false,
        },
      },
      {
        usuarioId: 'thiago@pucminas.edu.br',
        programa,
        papel: 'padrinho',
        status: 'em_andamento',
        grupo: 'Grupo 08',
        apadrinhados: 1,
        inicioEm: dias(10),
        respostas: {
          motivacao: 'Quero que os calouros se sintam em casa na PUC.',
          areas: ['Tecnologia', 'Projetos', 'Vida no campus'],
          disponibilidade: ['Noite'],
          interesses: ['Tecnologia', 'Inovação', 'Projetos'],
          declaraPreRequisitos: true,
        },
      },
      {
        usuarioId: 'camila@pucminas.edu.br',
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: 'Grupo 08',
        apadrinhados: 0,
        inicioEm: dias(8),
        respostas: {
          expectativa:
            'Gostaria de alguém que possa me ajudar na adaptação à universidade.',
          areas: ['Rotina universitária', 'Projetos', 'Tecnologia'],
          disponibilidade: ['Noite'],
          genero: 'Feminino',
          bolsistaProuni: false,
          deOutraCidade: true,
          interesses: ['Tecnologia', 'Inovação'],
        },
      },
      {
        usuarioId: 'lucas.almeida@pucminas.edu.br',
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
        apadrinhados: 0,
        inicioEm: dias(3),
        respostas: {
          expectativa: 'Quero dicas sobre a rotina e as primeiras provas.',
          areas: ['Disciplinas e provas'],
          disponibilidade: ['Tarde'],
          genero: 'Masculino',
          bolsistaProuni: true,
          deOutraCidade: true,
        },
      },
      {
        usuarioId: 'marina.souza@pucminas.edu.br',
        programa,
        papel: 'apadrinhado',
        status: 'pendente',
        apadrinhados: 0,
        inicioEm: dias(1),
        respostas: {
          expectativa: 'Preciso de apoio para montar a grade e conhecer o campus.',
          areas: ['Rotina universitária', 'Vida no campus'],
          disponibilidade: ['Manhã', 'Tarde'],
          genero: 'Feminino',
          bolsistaProuni: false,
          deOutraCidade: true,
          declaraPrimeiroPeriodo: true,
        },
      },
    ];

    for (const item of seed) {
      const existe = await this.participacoes.findOne({
        where: {
          usuarioId: item.usuarioId!,
          programa: item.programa!,
          papel: item.papel!,
        },
      });
      if (!existe) {
        await this.participacoes.save(this.participacoes.create(item));
      } else if (!existe.respostas && item.respostas) {
        existe.respostas = item.respostas;
        await this.participacoes.save(existe);
      }

      // Demo: se o seed define participação ativa, remove candidatura órfã
      // no mesmo ciclo (ex.: Camila com candidato+apadrinhado simultâneos).
      if (item.papel === 'padrinho' || item.papel === 'apadrinhado') {
        const orfaos = await this.participacoes.find({
          where: {
            usuarioId: item.usuarioId!,
            programa: item.programa!,
            papel: 'candidato',
          },
        });
        if (orfaos.length) await this.participacoes.remove(orfaos);
      }
    }
  }
}

/**
 * Dado de demonstração (não é regra): requisitos gravados no ciclo atual na
 * primeira execução, para o ambiente demo refletir o edital vigente. A
 * coordenação altera em Programas → Requisitos para padrinho.
 */
const REQUISITOS_INICIAIS_DEMO = [
  { descricao: 'Aprovação em Cálculo I', obrigatorio: true },
  {
    descricao: 'Aprovação em Algoritmos e Estruturas de Dados I',
    obrigatorio: true,
  },
];
