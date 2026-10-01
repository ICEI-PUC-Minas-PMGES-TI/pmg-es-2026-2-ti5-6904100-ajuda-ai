import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buscarUsuarioPorEmail, USUARIOS } from '../dados/dados.js';
import {
  ParticipacaoEntity,
  StatusParticipacaoRegistro,
} from '../participacoes/entities/participacao.entity.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { EtapaPrograma, ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ProgramasService } from '../programas/programas.service.js';

@Injectable()
export class CoordenacaoService implements OnModuleInit {
  constructor(
    private readonly programasService: ProgramasService,
    private readonly participacoesService: ParticipacoesService,
    @InjectRepository(ParticipacaoEntity)
    private readonly participacoes: Repository<ParticipacaoEntity>,
  ) {}

  async onModuleInit() {
    await this.programasService.garantirProgramaAtual();
    await this.programasService.garantirProgramaHistoricoDemo();
    await this.semearParticipacoesDemo();
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
    const solicitado = programaCodigo?.trim();
    const codigo =
      (solicitado && programas.some((p) => p.codigo === solicitado)
        ? solicitado
        : null) ||
      programas.find((p) => p.codigo === codigoAtual)?.codigo ||
      programas.find((p) => p.etapaAtual !== 'encerramento')?.codigo ||
      programas[0].codigo;

    const programa = await this.programasService.buscarPorCodigo(codigo);
    if (!programa) {
      throw new NotFoundException(`Programa ${codigo} não encontrado.`);
    }

    const registros = await this.participacoesService.listarPorPrograma({
      programa: codigo,
    });

    const candidatos = registros.filter((r) => r.papel === 'candidato');
    const padrinhos = registros.filter((r) => r.papel === 'padrinho');
    const apadrinhados = registros.filter(
      (r) => r.papel === 'apadrinhado' && r.status === 'em_andamento',
    );

    const pendentesLista = candidatos.filter((r) => r.status === 'pendente');
    const emAnaliseLista = candidatos.filter((r) => r.status === 'em_analise');
    const pendentes = pendentesLista.length;
    const emAnalise = emAnaliseLista.length;
    const aguardandoDecisao = pendentes + emAnalise;
    const rejeitadas = candidatos.filter(
      (r) => r.status === 'nao_aprovado',
    ).length;
    const aprovadas = padrinhos.filter(
      (r) => r.status === 'em_andamento' || r.status === 'concluido',
    ).length;
    const padrinhosComVinculo = padrinhos.filter(
      (r) =>
        r.status === 'em_andamento' &&
        ((r.grupo && r.grupo.trim()) || r.apadrinhados > 0),
    ).length;
    const gruposFormados = new Set(
      padrinhos
        .map((r) => r.grupo?.trim())
        .filter((g): g is string => Boolean(g)),
    ).size;

    const candidaturasInscritas =
      pendentes + emAnalise + rejeitadas + aprovadas;

    const recentes = [...candidatos]
      .sort(
        (a, b) =>
          new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
      )
      .slice(0, 6)
      .map((item) => this.enriquecerCandidatura(item));

    const semVinculoLista = apadrinhados.filter(
      (r) => !r.grupo || !r.grupo.trim(),
    );
    const gruposIncompletos = Math.max(
      0,
      (programa.gruposPrevistos || 0) - gruposFormados,
    );
    const pontosAtencao = this.montarPontosAtencao({
      aguardando: [...pendentesLista, ...emAnaliseLista],
      pendentes,
      emAnalise,
      semVinculo: semVinculoLista.length,
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
      etapas: this.montarEtapas(programa),
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

  async listarCandidaturas(programa: string, status?: string) {
    const filtro = status?.trim();

    if (filtro === 'aprovadas') {
      const aprovados = await this.participacoesService.listarPorPrograma({
        programa,
        papel: 'padrinho',
      });
      return aprovados.map((item) => this.enriquecerCandidatura(item));
    }

    if (filtro === 'sem_vinculo') {
      const apadrinhados = await this.participacoesService.listarPorPrograma({
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
      });
      return apadrinhados
        .filter((r) => !r.grupo || !r.grupo.trim())
        .map((item) => this.enriquecerCandidatura(item));
    }

    if (filtro === 'aguardando') {
      const registros = await this.participacoesService.listarPorPrograma({
        programa,
        papel: 'candidato',
      });
      return registros
        .filter((r) => r.status === 'pendente' || r.status === 'em_analise')
        .map((item) => this.enriquecerCandidatura(item));
    }

    const registros = await this.participacoesService.listarPorPrograma({
      programa,
      papel: 'candidato',
      ...(filtro
        ? { status: filtro as StatusParticipacaoRegistro }
        : {}),
    });
    return registros.map((item) => this.enriquecerCandidatura(item));
  }

  async criarNovoCiclo(codigo?: string) {
    return this.serializarPrograma(
      await this.programasService.criarNovoCiclo(codigo),
    );
  }

  private enriquecerCandidatura(item: ParticipacaoEntity) {
    const usuario =
      buscarUsuarioPorEmail(item.usuarioId) ||
      Object.values(USUARIOS).find(
        (u) => String(u.id) === item.usuarioId,
      );
    const nome = usuario?.nome ?? this.nomeDoEmail(item.usuarioId);
    const iniciais = nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');

    return {
      id: item.id,
      usuarioId: item.usuarioId,
      programa: item.programa,
      papel: item.papel,
      status: item.status,
      grupo: item.grupo ?? null,
      apadrinhados: item.apadrinhados,
      criadoEm: item.criadoEm,
      nome,
      curso: usuario?.curso ?? 'Curso não informado',
      periodo: usuario?.periodo ?? null,
      fotoUrl: usuario?.fotoUrl ?? null,
      iniciais,
      statusRotulo: this.rotuloStatus(item),
    };
  }

  private rotuloStatus(item: ParticipacaoEntity): string {
    if (item.papel === 'padrinho') return 'Aprovada';
    return {
      pendente: 'Nova',
      em_analise: 'Em análise',
      nao_aprovado: 'Rejeitada',
      em_andamento: 'Em andamento',
      concluido: 'Concluída',
    }[item.status];
  }

  private montarEtapas(programa: ProgramaEntity) {
    const ordem: EtapaPrograma[] = [
      'inscricoes',
      'analise',
      'formacao',
      'andamento',
      'encerramento',
    ];
    const atualIdx = ordem.indexOf(programa.etapaAtual);
    const titulos: Record<EtapaPrograma, string> = {
      inscricoes: 'Inscrições abertas',
      analise: 'Análise de candidaturas',
      formacao: 'Formação dos grupos',
      andamento: 'Programa em andamento',
      encerramento: 'Encerramento',
    };
    const periodos: Record<EtapaPrograma, [string | null, string | null]> = {
      inscricoes: [programa.inscricoesInicio, programa.inscricoesFim],
      analise: [programa.analiseInicio, programa.analiseFim],
      formacao: [programa.formacaoInicio, programa.formacaoFim],
      andamento: [programa.andamentoInicio, programa.andamentoFim],
      encerramento: [programa.encerramentoEm, programa.encerramentoEm],
    };

    return ordem.map((chave, index) => {
      const [inicio, fim] = periodos[chave];
      return {
        id: chave,
        titulo: titulos[chave],
        estado:
          index < atualIdx
            ? 'concluida'
            : index === atualIdx
              ? 'atual'
              : 'futura',
        periodoTexto: this.formatarPeriodo(inicio, fim),
      };
    });
  }

  private montarPontosAtencao(input: {
    aguardando: ParticipacaoEntity[];
    pendentes: number;
    emAnalise: number;
    semVinculo: number;
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
              ? `Inscrições encerram hoje (${this.formatarData(input.programa.inscricoesFim)}).`
              : `Encerramento em ${dias} dia${dias === 1 ? '' : 's'} (${this.formatarData(input.programa.inscricoesFim)}).`,
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

  private serializarPrograma(
    programa: ProgramaEntity,
    codigoVigente?: string,
  ) {
    const vigente =
      programa.codigo === codigoVigente ||
      (programa.etapaAtual !== 'encerramento' &&
        programa.codigo === ParticipacoesService.programaAtual());
    const statusRotulo: Record<EtapaPrograma, string> = {
      inscricoes: 'Inscrições',
      analise: 'Em análise',
      formacao: 'Formação',
      andamento: 'Em andamento',
      encerramento: 'Encerrado',
    };
    return {
      id: programa.id,
      codigo: programa.codigo,
      titulo: programa.titulo || `Programa ${programa.codigo}`,
      nome: programa.titulo || `Programa ${programa.codigo}`,
      etapaAtual: programa.etapaAtual,
      statusRotulo: statusRotulo[programa.etapaAtual] ?? programa.etapaAtual,
      vigente,
      encerrado: programa.etapaAtual === 'encerramento',
      inscricoesAbertas: programa.inscricoesAbertas,
      formularioPublicado: programa.formularioPublicado,
      matchingPendente: programa.matchingPendente,
      vagasApadrinhados: programa.vagasApadrinhados,
      gruposPrevistos: programa.gruposPrevistos,
      inscricoesFim: programa.inscricoesFim,
    };
  }

  private formatarPeriodo(inicio?: string | null, fim?: string | null) {
    if (!inicio && !fim) return 'A definir';
    if (inicio && fim && inicio === fim) {
      return this.formatarData(inicio);
    }
    if (inicio && fim) {
      return `${this.formatarData(inicio)} a ${this.formatarData(fim)}`;
    }
    return this.formatarData(inicio || fim || '');
  }

  private formatarData(iso: string) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    if (!ano || !mes) return iso;
    const meses = [
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
    return `${String(dia || 1).padStart(2, '0')} ${meses[mes - 1]} de ${ano}`;
  }

  private diasAte(iso: string): number | null {
    const alvo = new Date(`${iso}T23:59:59`);
    if (Number.isNaN(alvo.getTime())) return null;
    const hoje = new Date();
    const diff = alvo.getTime() - hoje.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  private nomeDoEmail(email: string) {
    const local = email.split('@')[0] || email;
    return local
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  /**
   * Garante um conjunto mínimo de registros no ciclo atual para o painel.
   * Não sobrescreve linhas já existentes (idempotente por usuario+programa+papel).
   */
  private async semearParticipacoesDemo() {
    const programa = ParticipacoesService.programaAtual();
    const agora = new Date();

    const seed: Array<Partial<ParticipacaoEntity>> = [
      {
        usuarioId: 'ana.beatriz@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'pendente',
        apadrinhados: 0,
        inicioEm: agora,
      },
      {
        usuarioId: 'pedro.lima@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'em_analise',
        apadrinhados: 0,
        inicioEm: new Date(agora.getTime() - 86400000 * 2),
      },
      {
        usuarioId: 'julia.fernandes@pucminas.edu.br',
        programa,
        papel: 'candidato',
        status: 'nao_aprovado',
        apadrinhados: 0,
        inicioEm: new Date(agora.getTime() - 86400000 * 5),
        terminoEm: agora,
      },
      {
        usuarioId: 'thiago@pucminas.edu.br',
        programa,
        papel: 'padrinho',
        status: 'em_andamento',
        grupo: 'Grupo 08',
        apadrinhados: 2,
        inicioEm: new Date(agora.getTime() - 86400000 * 10),
      },
      {
        usuarioId: 'camila@pucminas.edu.br',
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: 'Grupo 08',
        apadrinhados: 0,
        inicioEm: new Date(agora.getTime() - 86400000 * 8),
      },
      {
        usuarioId: 'lucas.almeida@pucminas.edu.br',
        programa,
        papel: 'apadrinhado',
        status: 'em_andamento',
        apadrinhados: 0,
        inicioEm: new Date(agora.getTime() - 86400000 * 3),
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
      }
    }
  }
}
