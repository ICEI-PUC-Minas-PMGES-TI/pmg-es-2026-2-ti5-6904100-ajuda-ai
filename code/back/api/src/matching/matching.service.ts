import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ChatService } from '../chat/chat.service.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { matchingLiberado } from '../programas/etapas.js';
import {
  CriterioMatchingDto,
  SalvarConfiguracaoMatchingDto,
} from './dto/matching.dto.js';
import {
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
  TipoCriterioCatalogo,
} from './entities/criterio-catalogo.entity.js';
import {
  CriterioMatching,
  MatchingChatOutboxEntity,
  MatchingConfiguracaoEntity,
  MatchingDecisaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from './entities/matching.entity.js';
import { alocarMatching } from './matching.algorithm.js';

interface MetadadoCriterio {
  criterioId: number;
  criterioVersao: number;
  perguntaId: string;
  tipo: TipoCriterioCatalogo;
  rotulo: string;
  nome: string;
}

@Injectable()
export class MatchingService {
  constructor(
    @InjectDataSource() private readonly dados: DataSource,
    private readonly chat: ChatService,
  ) {}

  private async programa(
    manager: EntityManager,
    codigo: string,
    lock = false,
  ): Promise<ProgramaEntity> {
    if (typeof codigo !== 'string' || !codigo.trim())
      throw new BadRequestException('Informe o programa.');
    const query = manager
      .getRepository(ProgramaEntity)
      .createQueryBuilder('programa')
      .where('programa.codigo = :codigo', { codigo: codigo.trim() });
    if (lock) query.setLock('pessimistic_write');
    const programa = await query.getOne();
    if (!programa) throw new NotFoundException('Programa não encontrado.');
    return programa;
  }

  private validarEtapa(programa: ProgramaEntity) {
    if (programa.etapaAtual === 'encerramento')
      throw new BadRequestException('Programa encerrado.');
    if (programa.inscricoesAbertas)
      throw new BadRequestException(
        'Feche as inscrições antes de executar ou decidir o matching.',
      );
    if (!matchingLiberado(programa))
      throw new BadRequestException(
        'O matching só pode ser executado ou decidido após a liberação do ciclo.',
      );
  }

  private async configuracaoAtual(
    manager: EntityManager,
    programaId: number,
    lock = false,
  ) {
    const query = manager
      .getRepository(MatchingConfiguracaoEntity)
      .createQueryBuilder('config')
      .where('config.programa_id = :programaId', { programaId })
      .orderBy('config.versao', 'DESC')
      .limit(1);
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }

  async obterConfiguracao(codigo: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    const configuracao = await this.configuracaoAtual(
      this.dados.manager,
      programa.id,
    );
    return configuracao
      ? { ...configuracao, liberado: matchingLiberado(programa) }
      : configuracao;
  }

  async salvarConfiguracao(
    dto: SalvarConfiguracaoMatchingDto,
    responsavel: string,
  ) {
    return this.dados.transaction(async (manager) => {
      const programa = await this.programa(manager, dto.programa, true);
      if (programa.etapaAtual === 'encerramento')
        throw new BadRequestException(
          'Programa encerrado: a configuração é histórica.',
        );
      const metadados = await this.metadadosDosFormularios(
        manager,
        programa.codigo,
      );
      this.validarCriterios(dto.criterios, metadados);
      const anterior = await this.configuracaoAtual(manager, programa.id, true);
      return manager.getRepository(MatchingConfiguracaoEntity).save(
        manager.getRepository(MatchingConfiguracaoEntity).create({
          programaId: programa.id,
          versao: (anterior?.versao ?? 0) + 1,
          liberado: matchingLiberado(programa),
          capacidadePorPadrinho: dto.capacidadePorPadrinho,
          capacidadePorApadrinhado: dto.capacidadePorApadrinhado,
          criterios: dto.criterios.map((c) => ({ ...c })),
          criadoPor: responsavel,
        }),
      );
    });
  }

  async liberar(codigo: string, _liberado: boolean, _responsavel: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    const atual = await this.configuracaoAtual(this.dados.manager, programa.id);
    if (!atual)
      throw new BadRequestException(
        'Salve uma configuração válida antes de liberar o matching pelo ciclo.',
      );
    return { ...atual, liberado: matchingLiberado(programa) };
  }

  private async metadadosDosFormularios(
    manager: EntityManager,
    programa: string,
  ) {
    const formularios = await manager.getRepository(FormularioEntity).find({
      where: { programa },
      order: { tipo: 'ASC' },
    });
    const resultado: Record<
      'padrinho' | 'apadrinhado',
      Map<number, MetadadoCriterio>
    > = {
      padrinho: new Map(),
      apadrinhado: new Map(),
    };
    const snapshots = (
      await manager.getRepository(ParticipacaoEntity).find({
        where: { programa },
        order: { id: 'ASC' },
      })
    ).flatMap((participacao) => {
      const formulario = participacao.respostas?._servidor?.formulario;
      if (!formulario) return [];
      const tipo =
        formulario.tipo ??
        (participacao.papel === 'apadrinhado' ? 'apadrinhado' : 'padrinho');
      return [
        {
          participacaoId: participacao.id,
          tipo,
          id: formulario.id,
          versao: formulario.versao,
          perguntas: formulario.perguntas,
        },
      ];
    });
    const fontes = [
      ...formularios
        .filter((f) => f.versao > 0)
        .map((f) => ({
          tipo: f.tipo as 'padrinho' | 'apadrinhado',
          perguntas: (f.perguntas ?? []) as unknown[],
        })),
      ...snapshots.map((s) => ({
        tipo: s.tipo as 'padrinho' | 'apadrinhado',
        perguntas: (s.perguntas ?? []) as unknown[],
      })),
    ];
    for (const fonte of fontes) {
      if (fonte.tipo !== 'padrinho' && fonte.tipo !== 'apadrinhado') continue;
      for (const perguntaBruta of fonte.perguntas) {
        const pergunta = perguntaBruta as {
          id?: unknown;
          enunciado?: unknown;
          tipo?: unknown;
          criterioId?: unknown;
          criterioVersao?: unknown;
        };
        const criterioId = Number(pergunta.criterioId);
        const criterioVersao = Number(pergunta.criterioVersao);
        if (!Number.isInteger(criterioId) || criterioId < 1) continue;
        if (!Number.isInteger(criterioVersao) || criterioVersao < 1) continue;
        if (typeof pergunta.id !== 'string' || !pergunta.id) continue;
        const tipo = pergunta.tipo;
        if (
          tipo !== 'sim_nao' &&
          tipo !== 'escolha_unica' &&
          tipo !== 'multipla_escolha'
        )
          continue;
        if (resultado[fonte.tipo].has(criterioId)) continue;
        const catalogo = await manager
          .getRepository(MatchingCriterioEntity)
          .findOne({ where: { id: criterioId } });
        resultado[fonte.tipo].set(criterioId, {
          criterioId,
          criterioVersao,
          perguntaId: pergunta.id,
          tipo,
          rotulo:
            typeof pergunta.enunciado === 'string'
              ? pergunta.enunciado
              : (catalogo?.nome ?? `Critério ${criterioId}`),
          nome: catalogo?.nome ?? `Critério ${criterioId}`,
        });
      }
    }
    return { formularios, snapshots, campos: resultado };
  }

  private validarCriterios(
    criterios: CriterioMatchingDto[],
    metadata: Awaited<ReturnType<MatchingService['metadadosDosFormularios']>>,
  ) {
    if (!criterios.length)
      throw new BadRequestException(
        'A configuração deve ter ao menos um critério.',
      );
    const legado = criterios.some(
      (c) =>
        'campoPadrinho' in c ||
        'campoApadrinhado' in c ||
        !(c as CriterioMatchingDto).criterioPadrinhoId,
    );
    if (legado)
      throw new BadRequestException(
        'A configuração usa o formato antigo de campos fixos. Selecione critérios do catálogo e salve uma nova versão.',
      );
    const vistos = new Set<string>();
    for (const criterio of criterios) {
      const p = metadata.campos.padrinho.get(criterio.criterioPadrinhoId);
      const a = metadata.campos.apadrinhado.get(criterio.criterioApadrinhadoId);
      if (!p)
        throw new BadRequestException(
          `Critério ${criterio.criterioPadrinhoId} não está coletado no formulário de padrinhos (pergunta de matching publicada).`,
        );
      if (!a)
        throw new BadRequestException(
          `Critério ${criterio.criterioApadrinhadoId} não está coletado no formulário de apadrinhados (pergunta de matching publicada).`,
        );
      if (
        (criterio.operacao === 'intersecao' ||
          criterio.operacao === 'diferenca') &&
        (p.tipo !== 'multipla_escolha' || a.tipo !== 'multipla_escolha')
      )
        throw new BadRequestException(
          `Operação ${criterio.operacao} exige múltipla escolha nos dois lados.`,
        );
      if (
        criterio.operacao === 'igualdade' &&
        p.tipo === 'multipla_escolha' &&
        a.tipo === 'multipla_escolha'
      )
        throw new BadRequestException(
          'Use interseção (ou diferença) para múltipla escolha; igualdade é para Sim/Não e escolha única.',
        );
      if (
        p.tipo !== a.tipo &&
        criterio.criterioPadrinhoId === criterio.criterioApadrinhadoId
      )
        throw new BadRequestException(
          'Tipos incompatíveis entre as respostas dos papéis para o mesmo critério.',
        );
      const chave = `${criterio.criterioPadrinhoId}|${criterio.criterioApadrinhadoId}|${criterio.operacao}`;
      if (vistos.has(chave))
        throw new BadRequestException('Há critérios duplicados.');
      vistos.add(chave);
    }
  }

  private elegiveis(registros: ParticipacaoEntity[]) {
    return {
      padrinhos: registros
        .filter(
          (p) =>
            (p.papel === 'candidato' && p.status === 'aprovado') ||
            (p.papel === 'padrinho' && p.status === 'em_andamento'),
        )
        .sort((a, b) => a.id - b.id),
      apadrinhados: registros
        .filter((p) => p.papel === 'apadrinhado' && p.status === 'em_andamento')
        .sort((a, b) => a.id - b.id),
    };
  }

  private normalizarBooleano(valor: unknown): boolean | undefined {
    if (typeof valor === 'boolean') return valor;
    if (valor === 'true' || valor === true) return true;
    if (valor === 'false' || valor === false) return false;
    return undefined;
  }

  private metadadoDaParticipacao(
    participacao: ParticipacaoEntity,
    meta: MetadadoCriterio | undefined,
  ): MetadadoCriterio | undefined {
    if (!meta) return undefined;
    const formulario = participacao.respostas?._servidor?.formulario;
    // Envios legados sem snapshot continuam usando os metadados disponíveis.
    if (!formulario) return meta;
    const pergunta = formulario.perguntas.find((bruta) => {
      if (!bruta || typeof bruta !== 'object') return false;
      return (
        Number((bruta as { criterioId?: unknown }).criterioId) ===
        meta.criterioId
      );
    }) as
      | {
          id?: unknown;
          criterioVersao?: unknown;
          tipo?: unknown;
          enunciado?: unknown;
        }
      | undefined;
    const versao = Number(pergunta?.criterioVersao);
    if (
      typeof pergunta?.id !== 'string' ||
      !pergunta.id ||
      !Number.isInteger(versao) ||
      versao < 1 ||
      (pergunta.tipo !== 'sim_nao' &&
        pergunta.tipo !== 'escolha_unica' &&
        pergunta.tipo !== 'multipla_escolha')
    )
      return undefined;
    return {
      ...meta,
      perguntaId: pergunta.id,
      criterioVersao: versao,
      tipo: pergunta.tipo,
      rotulo:
        typeof pergunta.enunciado === 'string'
          ? pergunta.enunciado
          : meta.rotulo,
    };
  }

  private valorPorCriterio(
    participacao: ParticipacaoEntity,
    meta: MetadadoCriterio | undefined,
  ): unknown {
    if (!meta) return undefined;
    const extras = participacao.respostas?.extras;
    if (!extras) return undefined;
    return extras[meta.perguntaId];
  }

  private pontuar(
    padrinho: ParticipacaoEntity,
    apadrinhado: ParticipacaoEntity,
    criterios: CriterioMatching[],
    metadata: Awaited<ReturnType<MatchingService['metadadosDosFormularios']>>,
  ) {
    let obtido = 0;
    let denominador = 0;
    const detalhes = criterios.map((criterio) => {
      const metaP = this.metadadoDaParticipacao(
        padrinho,
        metadata.campos.padrinho.get(criterio.criterioPadrinhoId),
      );
      const metaA = this.metadadoDaParticipacao(
        apadrinhado,
        metadata.campos.apadrinhado.get(criterio.criterioApadrinhadoId),
      );
      let vp = this.valorPorCriterio(padrinho, metaP);
      let va = this.valorPorCriterio(apadrinhado, metaA);
      if (metaP?.tipo === 'sim_nao') vp = this.normalizarBooleano(vp);
      if (metaA?.tipo === 'sim_nao') va = this.normalizarBooleano(va);
      const ausente =
        vp === undefined ||
        vp === null ||
        va === undefined ||
        va === null ||
        vp === '' ||
        va === '' ||
        (Array.isArray(vp) && vp.length === 0) ||
        (Array.isArray(va) && va.length === 0);
      if (ausente)
        return {
          ...criterio,
          nomePadrinho: metaP?.nome,
          nomeApadrinhado: metaA?.nome,
          rotuloPadrinho: metaP?.rotulo,
          rotuloApadrinhado: metaA?.rotulo,
          considerado: false,
          contribuicao: 0,
          motivo: 'resposta_ausente',
        };
      denominador += criterio.peso;
      let compativel = false;
      if (criterio.operacao === 'intersecao') {
        compativel =
          Array.isArray(vp) &&
          Array.isArray(va) &&
          vp.some((v) => va.includes(v));
      } else if (criterio.operacao === 'diferenca') {
        compativel =
          Array.isArray(vp) &&
          Array.isArray(va) &&
          !vp.some((v) => va.includes(v));
      } else {
        compativel = vp === va;
      }
      const contribuicao = compativel ? criterio.peso : 0;
      obtido += contribuicao;
      return {
        ...criterio,
        nomePadrinho: metaP?.nome,
        nomeApadrinhado: metaA?.nome,
        rotuloPadrinho: metaP?.rotulo,
        rotuloApadrinhado: metaA?.rotulo,
        considerado: true,
        compativel,
        contribuicao,
        valorPadrinho: vp,
        valorApadrinhado: va,
      };
    });
    const score = denominador ? obtido / denominador : 0;
    return {
      score,
      explicacao: {
        score,
        pesoObtido: obtido,
        pesoConsiderado: denominador,
        criterios: detalhes,
      },
    };
  }

  async executar(codigo: string, responsavel: string) {
    const execucao = await this.dados.transaction(async (manager) => {
      const programa = await this.programa(manager, codigo, true);
      this.validarEtapa(programa);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      if (!config)
        throw new BadRequestException('Configure o matching antes de executar.');
      const emAndamento = await manager
        .getRepository(MatchingExecucaoEntity)
        .findOne({
          where: { programaId: programa.id, status: 'executando' },
          order: { criadoEm: 'DESC' },
        });
      if (emAndamento) {
        if (Date.now() - emAndamento.criadoEm.getTime() < 15 * 60_000)
          throw new ConflictException(
            'Já existe uma execução de matching em andamento.',
          );
        emAndamento.status = 'falha';
        emAndamento.erro = 'Execução interrompida e recuperada por timeout.';
        emAndamento.concluidaEm = new Date();
        await manager.getRepository(MatchingExecucaoEntity).save(emAndamento);
      }
      const metadata = await this.metadadosDosFormularios(
        manager,
        programa.codigo,
      );
      this.validarCriterios(config.criterios, metadata);
      return manager.getRepository(MatchingExecucaoEntity).save(
        manager.getRepository(MatchingExecucaoEntity).create({
          programaId: programa.id,
          configuracaoId: config.id,
          status: 'executando',
          configSnapshot: {
            versao: config.versao,
            capacidadePorPadrinho: config.capacidadePorPadrinho,
            capacidadePorApadrinhado: config.capacidadePorApadrinhado,
            criterios: config.criterios,
          },
          formulariosSnapshot: {
            formularios: metadata.formularios.map((f) => ({
              id: f.id,
              tipo: f.tipo,
              versao: f.versao,
              perguntas: f.perguntas,
            })),
            respostas: metadata.snapshots,
          },
          erro: null,
          iniciadaPor: responsavel,
          concluidaEm: null,
        }),
      );
    });

    try {
      return await this.dados.transaction(async (manager) => {
        const atual = await manager
          .getRepository(MatchingExecucaoEntity)
          .createQueryBuilder('execucao')
          .setLock('pessimistic_write')
          .where('execucao.id = :id', { id: execucao.id })
          .getOneOrFail();
        const programa = await manager
          .getRepository(ProgramaEntity)
          .createQueryBuilder('programa')
          .setLock('pessimistic_write')
          .where('programa.id = :id', { id: atual.programaId })
          .getOneOrFail();
        this.validarEtapa(programa);
        const config = await manager
          .getRepository(MatchingConfiguracaoEntity)
          .createQueryBuilder('config')
          .setLock('pessimistic_read')
          .where('config.id = :id', { id: atual.configuracaoId })
          .getOneOrFail();
        const metadata = await this.metadadosDosFormularios(
          manager,
          programa.codigo,
        );
        this.validarCriterios(config.criterios, metadata);
        const registros = await manager.getRepository(ParticipacaoEntity).find({
          where: { programa: programa.codigo },
          order: { id: 'ASC' },
        });
        const { padrinhos, apadrinhados } = this.elegiveis(registros);
        if (!padrinhos.length || !apadrinhados.length)
          throw new BadRequestException(
            'São necessários candidatos elegíveis dos dois papéis.',
          );
        const vinculos = await manager
          .getRepository(MatchingVinculoEntity)
          .find({
            where: { programaId: programa.id, ativo: true },
          });
        const paresAtivos = new Set(
          vinculos.map(
            (v) => `${v.padrinhoParticipacaoId}:${v.apadrinhadoParticipacaoId}`,
          ),
        );
        const usadosP = new Map<number, number>();
        const usadosA = new Map<number, number>();
        vinculos.forEach((v) => {
          usadosP.set(
            v.padrinhoParticipacaoId,
            (usadosP.get(v.padrinhoParticipacaoId) ?? 0) + 1,
          );
          usadosA.set(
            v.apadrinhadoParticipacaoId,
            (usadosA.get(v.apadrinhadoParticipacaoId) ?? 0) + 1,
          );
        });
        const capP = new Map(
          padrinhos.map((p) => [
            p.id,
            config.capacidadePorPadrinho - (usadosP.get(p.id) ?? 0),
          ]),
        );
        const capA = new Map(
          apadrinhados.map((a) => [
            a.id,
            config.capacidadePorApadrinhado - (usadosA.get(a.id) ?? 0),
          ]),
        );
        const explicacoes = new Map<
          string,
          ReturnType<MatchingService['pontuar']>
        >();
        const arestas = padrinhos.flatMap((p) =>
          apadrinhados
            .filter(
              (a) =>
                p.usuarioId !== a.usuarioId &&
                !paresAtivos.has(`${p.id}:${a.id}`),
            )
            .map((a) => {
              const resultado = this.pontuar(p, a, config.criterios, metadata);
              explicacoes.set(`${p.id}:${a.id}`, resultado);
              return {
                padrinhoId: p.id,
                apadrinhadoId: a.id,
                score: resultado.score,
              };
            }),
        );
        const alocacao = alocarMatching(arestas, capP, capA);
        await manager
          .getRepository(MatchingSugestaoEntity)
          .update(
            { programaId: programa.id, status: 'pendente' },
            { status: 'obsoleta' },
          );
        const sugestoes = alocacao.map((par) => {
          const resultado = explicacoes.get(
            `${par.padrinhoId}:${par.apadrinhadoId}`,
          )!;
          return manager.getRepository(MatchingSugestaoEntity).create({
            programaId: programa.id,
            execucaoId: atual.id,
            padrinhoParticipacaoId: par.padrinhoId,
            apadrinhadoParticipacaoId: par.apadrinhadoId,
            status: 'pendente',
            score: resultado.score.toFixed(4),
            explicacao: resultado.explicacao,
            decididaPor: null,
            decididaEm: null,
            motivoDecisao: null,
            vinculoId: null,
          });
        });
        if (sugestoes.length)
          await manager.getRepository(MatchingSugestaoEntity).save(sugestoes);
        atual.status = 'concluida';
        atual.concluidaEm = new Date();
        await manager.getRepository(MatchingExecucaoEntity).save(atual);
        programa.matchingPendente = sugestoes.length > 0;
        await manager.getRepository(ProgramaEntity).save(programa);
        return { ...atual, totalSugestoes: sugestoes.length };
      });
    } catch (erro) {
      await this.dados
        .getRepository(MatchingExecucaoEntity)
        .update(execucao.id, {
          status: 'falha',
          erro:
            erro instanceof Error ? erro.message.slice(0, 4000) : String(erro),
          concluidaEm: new Date(),
        });
      throw erro;
    }
  }

  async visao(codigo: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    const [
      configuracao,
      execucoes,
      sugestoesPendentes,
      outboxPendentes,
      vinculos,
      registros,
      metadados,
    ] = await Promise.all([
      this.configuracaoAtual(this.dados.manager, programa.id),
      this.dados.getRepository(MatchingExecucaoEntity).count({
        where: { programaId: programa.id },
      }),
      this.dados.getRepository(MatchingSugestaoEntity).count({
        where: { programaId: programa.id, status: 'pendente' },
      }),
      this.dados.getRepository(MatchingChatOutboxEntity).count({
        where: {
          programaId: programa.id,
          status: In(['pendente', 'processando', 'falha']),
        },
      }),
      this.dados.getRepository(MatchingVinculoEntity).count({
        where: { programaId: programa.id, ativo: true },
      }),
      this.dados.getRepository(ParticipacaoEntity).find({
        where: { programa: programa.codigo },
        order: { id: 'ASC' },
      }),
      this.metadadosDosFormularios(this.dados.manager, programa.codigo),
    ]);
    const { padrinhos, apadrinhados } = this.elegiveis(registros);
    const vinculosAtivos = await this.dados
      .getRepository(MatchingVinculoEntity)
      .find({ where: { programaId: programa.id, ativo: true } });
    const usadosP = new Map<number, number>();
    const usadosA = new Map<number, number>();
    for (const vinculo of vinculosAtivos) {
      usadosP.set(
        vinculo.padrinhoParticipacaoId,
        (usadosP.get(vinculo.padrinhoParticipacaoId) ?? 0) + 1,
      );
      usadosA.set(
        vinculo.apadrinhadoParticipacaoId,
        (usadosA.get(vinculo.apadrinhadoParticipacaoId) ?? 0) + 1,
      );
    }
    const bloqueios: string[] = [];
    if (programa.etapaAtual === 'encerramento')
      bloqueios.push('O programa está encerrado.');
    if (programa.inscricoesAbertas)
      bloqueios.push('As inscrições ainda estão abertas.');
    if (!configuracao)
      bloqueios.push('Configure os critérios e as capacidades.');
    if (!matchingLiberado(programa))
      bloqueios.push('O matching ainda não foi liberado pela coordenação.');
    if (!padrinhos.length)
      bloqueios.push('Não há padrinhos com candidatura aprovada.');
    if (!apadrinhados.length)
      bloqueios.push('Não há apadrinhados com candidatura aprovada.');
    const criteriosCatalogo = await this.dados
      .getRepository(MatchingCriterioEntity)
      .find({ order: { nome: 'ASC' } });
    const versoes = await this.dados
      .getRepository(MatchingCriterioVersaoEntity)
      .find({ order: { criterioId: 'ASC', versao: 'DESC' } });
    const versaoPorCriterio = new Map<number, MatchingCriterioVersaoEntity>();
    for (const v of versoes) {
      if (!versaoPorCriterio.has(v.criterioId))
        versaoPorCriterio.set(v.criterioId, v);
    }
    const criteriosDisponiveis = criteriosCatalogo.map((c) => {
      const versao = versaoPorCriterio.get(c.id);
      const noPadrinho = metadados.campos.padrinho.get(c.id);
      const noApadrinhado = metadados.campos.apadrinhado.get(c.id);
      return {
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        ativo: c.ativo,
        tipo: versao?.tipo ?? null,
        enunciadoPadrao: versao?.enunciadoPadrao ?? null,
        alternativas: versao?.alternativas ?? [],
        versaoAtual: c.versaoAtual,
        coletadoPadrinho: Boolean(noPadrinho),
        coletadoApadrinhado: Boolean(noApadrinhado),
        habilitavel: Boolean(noPadrinho && noApadrinhado && c.ativo),
      };
    });
    if (configuracao?.criterios?.some((c) => !c.criterioPadrinhoId))
      bloqueios.push(
        'A configuração atual usa o formato antigo. Abra a configuração e selecione critérios do catálogo.',
      );
    return {
      programa,
      configuracao: configuracao
        ? { ...configuracao, liberado: matchingLiberado(programa) }
        : null,
      podeExecutar: bloqueios.length === 0,
      bloqueios,
      criteriosDisponiveis,
      camposDisponiveis: [],
      totais: {
        execucoes,
        sugestoesPendentes,
        vinculos,
        outboxPendentes,
        padrinhosElegiveis: padrinhos.length,
        apadrinhadosElegiveis: apadrinhados.length,
        padrinhosComCapacidade: configuracao
          ? padrinhos.filter(
              (p) =>
                (usadosP.get(p.id) ?? 0) < configuracao.capacidadePorPadrinho,
            ).length
          : 0,
        apadrinhadosComCapacidade: configuracao
          ? apadrinhados.filter(
              (a) =>
                (usadosA.get(a.id) ?? 0) <
                configuracao.capacidadePorApadrinhado,
            ).length
          : 0,
        pessoasSemVinculo: apadrinhados.filter(
          (a) => (usadosA.get(a.id) ?? 0) === 0,
        ).length,
      },
      chat: { disponivel: true, pendencias: outboxPendentes },
    };
  }

  async listarExecucoes(codigo: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    return this.dados.getRepository(MatchingExecucaoEntity).find({
      where: { programaId: programa.id },
      order: { criadoEm: 'DESC' },
    });
  }

  async listarSugestoes(codigo: string, status?: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    const permitidos = ['pendente', 'aprovada', 'recusada', 'obsoleta'];
    if (status && !permitidos.includes(status))
      throw new BadRequestException('Status de sugestão inválido.');
    const sugestoes = await this.dados
      .getRepository(MatchingSugestaoEntity)
      .find({
        where: {
          programaId: programa.id,
          ...(status
            ? { status: status as MatchingSugestaoEntity['status'] }
            : {}),
        },
        order: { criadoEm: 'DESC', id: 'ASC' },
      });
    const ids = [
      ...new Set(
        sugestoes.flatMap((s) => [
          s.padrinhoParticipacaoId,
          s.apadrinhadoParticipacaoId,
        ]),
      ),
    ];
    const participantes = ids.length
      ? await this.dados
          .getRepository(ParticipacaoEntity)
          .find({ where: { id: In(ids) } })
      : [];
    const porId = new Map(participantes.map((p) => [p.id, p]));
    const resumo = (p?: ParticipacaoEntity) =>
      p
        ? {
            id: p.id,
            nome: p.respostas?.nome ?? p.usuarioId,
            email: p.usuarioId,
            curso: p.respostas?.curso ?? null,
            periodo: p.respostas?.periodo ?? null,
            papel: p.papel,
            status: p.status,
          }
        : null;
    return sugestoes.map((s) => ({
      ...s,
      padrinho: resumo(porId.get(s.padrinhoParticipacaoId)),
      apadrinhado: resumo(porId.get(s.apadrinhadoParticipacaoId)),
    }));
  }

  async obterSugestao(id: number) {
    const sugestao = await this.dados
      .getRepository(MatchingSugestaoEntity)
      .findOne({ where: { id } });
    if (!sugestao) throw new NotFoundException('Sugestão não encontrada.');
    const [padrinho, apadrinhado, outbox, configuracao] = await Promise.all([
      this.dados
        .getRepository(ParticipacaoEntity)
        .findOne({ where: { id: sugestao.padrinhoParticipacaoId } }),
      this.dados
        .getRepository(ParticipacaoEntity)
        .findOne({ where: { id: sugestao.apadrinhadoParticipacaoId } }),
      sugestao.vinculoId
        ? this.dados.getRepository(MatchingChatOutboxEntity).find({
            where: { programaId: sugestao.programaId },
            order: { criadoEm: 'ASC' },
          })
        : [],
      this.configuracaoAtual(this.dados.manager, sugestao.programaId),
    ]);
    const vinculos = await this.dados
      .getRepository(MatchingVinculoEntity)
      .find({
        where: { programaId: sugestao.programaId, ativo: true },
      });
    const usadosP = vinculos.filter(
      (v) => v.padrinhoParticipacaoId === sugestao.padrinhoParticipacaoId,
    ).length;
    const usadosA = vinculos.filter(
      (v) => v.apadrinhadoParticipacaoId === sugestao.apadrinhadoParticipacaoId,
    ).length;
    return {
      ...sugestao,
      padrinho,
      apadrinhado,
      outbox,
      capacidade: configuracao
        ? {
            padrinho: {
              usada: usadosP,
              limite: configuracao.capacidadePorPadrinho,
              restante: Math.max(
                0,
                configuracao.capacidadePorPadrinho - usadosP,
              ),
            },
            apadrinhado: {
              usada: usadosA,
              limite: configuracao.capacidadePorApadrinhado,
              restante: Math.max(
                0,
                configuracao.capacidadePorApadrinhado - usadosA,
              ),
            },
          }
        : null,
    };
  }

  private validarParticipantes(
    programa: ProgramaEntity,
    padrinho: ParticipacaoEntity,
    apadrinhado: ParticipacaoEntity,
  ) {
    if (
      padrinho.programa !== programa.codigo ||
      apadrinhado.programa !== programa.codigo ||
      padrinho.id === apadrinhado.id ||
      padrinho.usuarioId === apadrinhado.usuarioId
    )
      throw new ConflictException('Par inválido para este programa.');
    if (
      !(
        (padrinho.papel === 'candidato' && padrinho.status === 'aprovado') ||
        (padrinho.papel === 'padrinho' && padrinho.status === 'em_andamento')
      ) ||
      apadrinhado.papel !== 'apadrinhado' ||
      apadrinhado.status !== 'em_andamento'
    )
      throw new ConflictException(
        'A elegibilidade dos participantes mudou desde a execução.',
      );
  }

  async aprovar(id: number, responsavel: string) {
    return this.dados.transaction(async (manager) => {
      const sugestao = await manager
        .getRepository(MatchingSugestaoEntity)
        .createQueryBuilder('sugestao')
        .setLock('pessimistic_write')
        .where('sugestao.id = :id', { id })
        .getOne();
      if (!sugestao) throw new NotFoundException('Sugestão não encontrada.');
      if (sugestao.status === 'aprovada' && sugestao.vinculoId) {
        const vinculo = await manager
          .getRepository(MatchingVinculoEntity)
          .findOne({ where: { id: sugestao.vinculoId } });
        if (vinculo) {
          if (vinculo.ativo)
            await this.chat.criarParaVinculo(manager, vinculo.id);
          return {
            sugestao,
            vinculo,
            chat: { criado: true, eventosPendentes: 0 },
          };
        }
      }
      if (sugestao.status !== 'pendente')
        throw new ConflictException('A sugestão já foi concluída.');
      const programa = await manager
        .getRepository(ProgramaEntity)
        .createQueryBuilder('programa')
        .setLock('pessimistic_write')
        .where('programa.id = :id', { id: sugestao.programaId })
        .getOneOrFail();
      this.validarEtapa(programa);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      if (!matchingLiberado(programa))
        throw new ConflictException('O ciclo não está mais na etapa de matching.');
      if (!config)
        throw new ConflictException(
          'A configuração de matching não está disponível.',
        );
      const ultima = await manager
        .getRepository(MatchingExecucaoEntity)
        .findOne({
          where: { programaId: programa.id, status: 'concluida' },
          order: { criadoEm: 'DESC' },
        });
      if (!ultima || ultima.id !== sugestao.execucaoId)
        throw new ConflictException(
          'A sugestão não pertence à execução atual.',
        );
      const participantes = await manager
        .getRepository(ParticipacaoEntity)
        .createQueryBuilder('participacao')
        .setLock('pessimistic_write')
        .where('participacao.id IN (:...ids)', {
          ids: [
            sugestao.padrinhoParticipacaoId,
            sugestao.apadrinhadoParticipacaoId,
          ],
        })
        .orderBy('participacao.id', 'ASC')
        .getMany();
      const padrinho = participantes.find(
        (p) => p.id === sugestao.padrinhoParticipacaoId,
      );
      const apadrinhado = participantes.find(
        (p) => p.id === sugestao.apadrinhadoParticipacaoId,
      );
      if (!padrinho || !apadrinhado)
        throw new ConflictException('Participante não encontrado.');
      this.validarParticipantes(programa, padrinho, apadrinhado);
      const repoVinculos = manager.getRepository(MatchingVinculoEntity);
      const duplicado = await repoVinculos.findOne({
        where: {
          programaId: programa.id,
          padrinhoParticipacaoId: padrinho.id,
          apadrinhadoParticipacaoId: apadrinhado.id,
          ativo: true,
        },
      });
      if (duplicado)
        throw new ConflictException('Este vínculo ativo já existe.');
      const [quantidadeP, quantidadeA] = await Promise.all([
        repoVinculos.count({
          where: {
            programaId: programa.id,
            padrinhoParticipacaoId: padrinho.id,
            ativo: true,
          },
        }),
        repoVinculos.count({
          where: {
            programaId: programa.id,
            apadrinhadoParticipacaoId: apadrinhado.id,
            ativo: true,
          },
        }),
      ]);
      if (
        quantidadeP >= config.capacidadePorPadrinho ||
        quantidadeA >= config.capacidadePorApadrinhado
      )
        throw new ConflictException(
          'A capacidade de um participante foi atingida.',
        );
      const vinculo = await repoVinculos.save(
        repoVinculos.create({
          programaId: programa.id,
          padrinhoParticipacaoId: padrinho.id,
          apadrinhadoParticipacaoId: apadrinhado.id,
          ativo: true,
          origem: 'matching',
          sugestaoId: sugestao.id,
          confirmadoPor: responsavel,
          encerradoEm: null,
        }),
      );
      const agora = new Date();
      sugestao.status = 'aprovada';
      sugestao.decididaPor = responsavel;
      sugestao.decididaEm = agora;
      sugestao.vinculoId = vinculo.id;
      await manager.getRepository(MatchingSugestaoEntity).save(sugestao);
      await manager.getRepository(MatchingDecisaoEntity).save(
        manager.getRepository(MatchingDecisaoEntity).create({
          sugestaoId: sugestao.id,
          decisao: 'aprovada',
          responsavel,
          motivo: null,
        }),
      );
      const atuais = await repoVinculos.find({
        where: {
          programaId: programa.id,
          padrinhoParticipacaoId: padrinho.id,
          ativo: true,
        },
        order: { apadrinhadoParticipacaoId: 'ASC' },
      });
      padrinho.papel = 'padrinho';
      padrinho.status = 'em_andamento';
      padrinho.inicioEm ??= agora;
      padrinho.grupo = padrinho.grupo?.trim() || `Grupo-${padrinho.id}`;
      padrinho.apadrinhados = atuais.length;
      const repoParticipacoes = manager.getRepository(ParticipacaoEntity);
      if (
        apadrinhado.grupo?.trim() &&
        apadrinhado.grupo !== padrinho.grupo
      ) {
        throw new ConflictException(
          'Apadrinhado já possui vínculo com outro padrinho.',
        );
      }
      const outroPadrinho = await repoParticipacoes.findOne({
        where: {
          programa: programa.codigo,
          grupo: padrinho.grupo,
          papel: 'padrinho',
        },
      });
      if (outroPadrinho && outroPadrinho.id !== padrinho.id)
        throw new ConflictException('Grupo já pertence a outro padrinho.');
      apadrinhado.grupo = padrinho.grupo;
      await repoParticipacoes.save([padrinho, apadrinhado]);
      await this.chat.criarParaVinculo(manager, vinculo.id);
      programa.matchingPendente =
        (await manager.getRepository(MatchingSugestaoEntity).count({
          where: { programaId: programa.id, status: 'pendente' },
        })) > 0;
      await manager.getRepository(ProgramaEntity).save(programa);
      return {
        sugestao,
        vinculo,
        chat: { criado: true, eventosPendentes: 0 },
      };
    });
  }

  async recusar(id: number, responsavel: string, motivo?: string) {
    return this.dados.transaction(async (manager) => {
      const sugestao = await manager
        .getRepository(MatchingSugestaoEntity)
        .createQueryBuilder('sugestao')
        .setLock('pessimistic_write')
        .where('sugestao.id = :id', { id })
        .getOne();
      if (!sugestao) throw new NotFoundException('Sugestão não encontrada.');
      if (sugestao.status !== 'pendente')
        throw new ConflictException('A sugestão já foi concluída.');
      sugestao.status = 'recusada';
      sugestao.decididaPor = responsavel;
      sugestao.decididaEm = new Date();
      sugestao.motivoDecisao = motivo?.trim() || null;
      await manager.getRepository(MatchingSugestaoEntity).save(sugestao);
      await manager.getRepository(MatchingDecisaoEntity).save(
        manager.getRepository(MatchingDecisaoEntity).create({
          sugestaoId: sugestao.id,
          decisao: 'recusada',
          responsavel,
          motivo: sugestao.motivoDecisao,
        }),
      );
      const programa = await manager
        .getRepository(ProgramaEntity)
        .createQueryBuilder('programa')
        .setLock('pessimistic_write')
        .where('programa.id = :id', { id: sugestao.programaId })
        .getOneOrFail();
      programa.matchingPendente =
        (await manager.getRepository(MatchingSugestaoEntity).count({
          where: { programaId: sugestao.programaId, status: 'pendente' },
        })) > 0;
      await manager.getRepository(ProgramaEntity).save(programa);
      return sugestao;
    });
  }
}
