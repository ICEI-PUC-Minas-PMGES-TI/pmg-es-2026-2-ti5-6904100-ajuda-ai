import {
  criarVinculoNaTransacao,
  validarElegibilidadePar,
} from './vinculos.dominio.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { MatchingParDecisaoEntity } from './entities/par-decisao.entity.js';
import {
  chavePar,
  decisoesAtuais,
  fingerprintMatching,
  MOTIVOS_VALIDADE,
  VERSAO_INTEGRIDADE,
} from './matching.integridade.js';
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
} from './entities/criterio-catalogo.entity.js';
import {
  MatchingChatOutboxEntity,
  MatchingConfiguracaoEntity,
  MatchingDecisaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from './entities/matching.entity.js';
import { CRITERIOS_CADASTRO, avaliarCadastro } from './criterios-cadastro.js';
import {
  GENEROS_PREFERENCIA,
  validarPreferenciaGenero,
} from '../participacoes/preferencia-genero.js';
import { POLITICA_MATCHING } from './matching.politica.js';
import { calcularMatchingAssincrono } from './matching.executor.js';
import {
  normalizarBooleano,
  metadadoDaParticipacao,
  valorPorCriterio,
  pontuarPar,
  type MetadadoCriterio,
} from './matching.pontuacao.js';

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
      if (
        dto.versaoBase !== undefined &&
        dto.versaoBase !== (anterior?.versao ?? 0)
      )
        throw new ConflictException(
          'A configuração mudou em outra sessão. Atualize os dados antes de revisar e salvar novamente.',
        );
      for (const criterio of dto.criterios) {
        if (criterio.campoCadastro) continue;
        const inativo =
          metadados.campos.padrinho.get(criterio.criterioPadrinhoId ?? 0)
            ?.ativo === false;
        const retido = anterior?.criterios.some(
          (c) =>
            c.criterioPadrinhoId === criterio.criterioPadrinhoId &&
            c.criterioApadrinhadoId === criterio.criterioApadrinhadoId &&
            c.operacao === criterio.operacao,
        );
        if (inativo && !retido)
          throw new BadRequestException(
            'Critério inativo não pode ser habilitado em uma nova configuração.',
          );
      }
      const salva = await manager
        .getRepository(MatchingConfiguracaoEntity)
        .save(
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
      const pendentes = await manager
        .getRepository(MatchingSugestaoEntity)
        .find({ where: { programaId: programa.id, status: 'pendente' } });
      await this.marcarObsoletas(manager, pendentes, ['configuracao_alterada']);
      await this.atualizarIndicador(manager, programa);
      return salva;
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
      if (!formulario || !Array.isArray(formulario.perguntas)) return [];
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
    const ids = [
      ...new Set(
        fontes
          .flatMap((f) => f.perguntas)
          .map((q) => Number((q as { criterioId?: unknown })?.criterioId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const catalogos = ids.length
      ? await manager
          .getRepository(MatchingCriterioEntity)
          .find({ where: { id: In(ids) } })
      : [];
    const versoes = ids.length
      ? await manager
          .getRepository(MatchingCriterioVersaoEntity)
          .find({ where: { criterioId: In(ids) } })
      : [];
    const porId = new Map(catalogos.map((c) => [c.id, c]));
    const versoesValidas = new Map(
      versoes.map((v) => [`${v.criterioId}:${v.versao}`, v]),
    );
    for (const fonte of fontes) {
      if (fonte.tipo !== 'padrinho' && fonte.tipo !== 'apadrinhado') continue;
      for (const perguntaBruta of fonte.perguntas) {
        if (!perguntaBruta || typeof perguntaBruta !== 'object') continue;
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
        const catalogo = porId.get(criterioId);
        const versaoCatalogo = versoesValidas.get(
          `${criterioId}:${criterioVersao}`,
        );
        if (!catalogo || !versaoCatalogo || versaoCatalogo.tipo !== tipo)
          continue;
        resultado[fonte.tipo].set(criterioId, {
          criterioId,
          ativo: catalogo.ativo,
          alternativas: versaoCatalogo.alternativas.map((a) => a.id),
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
    return { formularios, snapshots, campos: resultado, versoesValidas };
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
        (!c.campoCadastro && !c.criterioPadrinhoId),
    );
    if (legado)
      throw new BadRequestException(
        'A configuração usa o formato antigo de campos fixos. Selecione critérios do catálogo e salve uma nova versão.',
      );
    const vistos = new Set<string>();
    for (const criterio of criterios) {
      if (
        !Number.isInteger(criterio.peso) ||
        criterio.peso < 1 ||
        criterio.peso > 100
      )
        throw new BadRequestException('Informe pesos inteiros entre 1 e 100.');
      if (
        'exclusivo' in criterio ||
        (criterio.obrigatorio !== undefined &&
          typeof criterio.obrigatorio !== 'boolean')
      )
        throw new BadRequestException(
          'Informe uma condição obrigatória válida. Preferência exclusiva não foi habilitada.',
        );
      if (
        criterio.obrigatorio &&
        criterio.campoCadastro &&
        !['areas', 'disponibilidade'].includes(criterio.campoCadastro)
      )
        throw new BadRequestException(
          'Gênero, vivências e interesses são preferências ponderadas; apenas apoio e disponibilidade podem ser condições obrigatórias do cadastro.',
        );
      if (criterio.campoCadastro !== undefined) {
        const fonte = CRITERIOS_CADASTRO.find(
          (c) => c.campo === criterio.campoCadastro,
        );
        if (
          !fonte ||
          criterio.criterioPadrinhoId !== undefined ||
          criterio.criterioApadrinhadoId !== undefined ||
          criterio.operacao !== fonte.operacao
        )
          throw new BadRequestException(
            'Fonte de cadastro ou operação incompatível.',
          );
        if (vistos.has(fonte.campo))
          throw new BadRequestException('Há critérios duplicados.');
        vistos.add(fonte.campo);
        continue;
      }
      if (criterio.criterioPadrinhoId !== criterio.criterioApadrinhadoId)
        throw new BadRequestException(
          'Compare o mesmo critério do catálogo nos dois públicos. Alternativas de critérios diferentes não têm equivalência definida.',
        );
      if (!['intersecao', 'igualdade', 'diferenca'].includes(criterio.operacao))
        throw new BadRequestException(
          'Operação inválida para critério do catálogo.',
        );
      const p = metadata.campos.padrinho.get(criterio.criterioPadrinhoId ?? 0);
      const a = metadata.campos.apadrinhado.get(
        criterio.criterioApadrinhadoId ?? 0,
      );
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
        (p.tipo === 'multipla_escolha' || a.tipo === 'multipla_escolha')
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
      const chave = `${criterio.criterioPadrinhoId}|${criterio.criterioApadrinhadoId}`;
      if (vistos.has(chave))
        throw new BadRequestException('Há critérios duplicados.');
      vistos.add(chave);
    }
  }

  private async programaPorId(manager: EntityManager, id: number) {
    const programa = await manager
      .getRepository(ProgramaEntity)
      .createQueryBuilder('programa')
      .setLock('pessimistic_write')
      .where('programa.id = :id', { id })
      .getOne();
    if (!programa) throw new NotFoundException('Programa não encontrado.');
    return programa;
  }

  private registrosBloqueados(manager: EntityManager, codigo: string) {
    return manager
      .getRepository(ParticipacaoEntity)
      .createQueryBuilder('participacao')
      .setLock('pessimistic_read')
      .where('participacao.programa = :programa', { programa: codigo })
      .orderBy('participacao.id', 'ASC')
      .getMany();
  }

  private eventosDosPares(manager: EntityManager, programaId: number) {
    return manager
      .getRepository(MatchingParDecisaoEntity)
      .find({ where: { programaId }, order: { id: 'ASC' } });
  }

  private assinaturaEntrada(
    config: MatchingConfiguracaoEntity,
    registros: ParticipacaoEntity[],
    metadata: Awaited<ReturnType<MatchingService['metadadosDosFormularios']>>,
    vinculos: MatchingVinculoEntity[],
  ) {
    const elegiveis = this.elegiveis(registros);
    const pessoas = [...elegiveis.padrinhos, ...elegiveis.apadrinhados].map(
      (p) => {
        const papel = p.papel === 'apadrinhado' ? 'apadrinhado' : 'padrinho';
        return {
          id: p.id,
          usuarioId: p.usuarioId,
          papel,
          criterios: config.criterios.map((c) => {
            if (c.campoCadastro)
              return {
                campo: c.campoCadastro,
                valor: p.respostas?.[c.campoCadastro],
                ...(c.campoCadastro === 'preferenciaGenero'
                  ? { genero: p.respostas?.genero }
                  : {}),
              };
            const meta = this.metadadoDaParticipacao(
              p,
              metadata.campos[papel].get(
                (papel === 'padrinho'
                  ? c.criterioPadrinhoId
                  : c.criterioApadrinhadoId) ?? 0,
              ),
              metadata.versoesValidas,
            );
            const bruto = this.valorPorCriterio(p, meta);
            return {
              criterioId: meta?.criterioId,
              versao: meta?.criterioVersao,
              tipo: meta?.tipo,
              alternativas: meta?.alternativas,
              valor:
                meta?.tipo === 'sim_nao'
                  ? this.normalizarBooleano(bruto)
                  : bruto,
            };
          }),
        };
      },
    );
    return fingerprintMatching({
      versao: VERSAO_INTEGRIDADE,
      politica: POLITICA_MATCHING.versao,
      configuracao: {
        id: config.id,
        versao: config.versao,
        criterios: config.criterios,
        capacidadeP: config.capacidadePorPadrinho,
        capacidadeA: config.capacidadePorApadrinhado,
      },
      pessoas,
      vinculos: vinculos.map((v) => ({
        id: v.id,
        padrinho: v.padrinhoParticipacaoId,
        apadrinhado: v.apadrinhadoParticipacaoId,
      })),
    });
  }

  private assinaturaSugestao(
    s: Pick<
      MatchingSugestaoEntity,
      | 'execucaoId'
      | 'padrinhoParticipacaoId'
      | 'apadrinhadoParticipacaoId'
      | 'explicacao'
    >,
    entrada: string,
  ) {
    const calculo = { ...s.explicacao };
    delete calculo.integridade;
    delete calculo.validade;
    delete calculo.distribuicao;
    return fingerprintMatching({
      entrada,
      execucaoId: s.execucaoId,
      padrinho: s.padrinhoParticipacaoId,
      apadrinhado: s.apadrinhadoParticipacaoId,
      calculo,
    });
  }

  private async contextoValidade(
    manager: EntityManager,
    programa: ProgramaEntity,
    config: MatchingConfiguracaoEntity | null,
  ) {
    const registros = await this.registrosBloqueados(manager, programa.codigo);
    const metadata = await this.metadadosDosFormularios(
      manager,
      programa.codigo,
    );
    const vinculos = await manager
      .getRepository(MatchingVinculoEntity)
      .find({ where: { programaId: programa.id, ativo: true } });
    const sugestoes = await manager.getRepository(MatchingSugestaoEntity).find({
      where: {
        programaId: programa.id,
        status: In(['pendente', 'aprovada']),
      },
    });
    const execucoes = await manager.getRepository(MatchingExecucaoEntity).find({
      where: { programaId: programa.id, status: 'concluida' },
      order: { id: 'DESC' },
    });
    const recusas = decisoesAtuais(
      await this.eventosDosPares(manager, programa.id),
    );
    let criteriosValidos = true;
    if (config) {
      try {
        this.validarCriterios(config.criterios, metadata);
      } catch (erro) {
        if (!(erro instanceof BadRequestException)) throw erro;
        criteriosValidos = false;
      }
    }
    return {
      programa,
      config,
      registros,
      metadata,
      vinculos,
      sugestoes,
      execucoes,
      recusas,
      criteriosValidos,
      assinaturas: new Map<number, string>(),
    };
  }

  private motivosDesatualizacao(
    s: MatchingSugestaoEntity,
    contexto: Awaited<ReturnType<MatchingService['contextoValidade']>>,
  ) {
    const {
      programa,
      config,
      vinculos,
      sugestoes,
      registros,
      metadata,
      execucoes,
      recusas,
    } = contexto;
    const execucao = execucoes.find((e) => e.id === s.execucaoId);
    const motivos: string[] = [];
    if (programa.inscricoesAbertas || !matchingLiberado(programa))
      motivos.push('ciclo_fora_matching');
    if (!execucao || execucoes[0]?.id !== s.execucaoId)
      motivos.push('execucao_substituida');
    if (!config || execucao?.configuracaoId !== config.id)
      motivos.push('configuracao_alterada');
    const integridade = execucao?.configSnapshot.integridade as
      { versao?: string; fingerprint?: string } | undefined;
    if (
      integridade?.versao !== VERSAO_INTEGRIDADE ||
      typeof integridade.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(integridade.fingerprint) ||
      (execucao?.configSnapshot.politica as { versao?: string } | undefined)
        ?.versao !== POLITICA_MATCHING.versao
    )
      motivos.push('politica_desatualizada');
    const vinculacao = s.explicacao.integridade as
      { entrada?: string; par?: string } | undefined;
    if (
      !integridade?.fingerprint ||
      vinculacao?.entrada !== integridade.fingerprint ||
      vinculacao?.par !== this.assinaturaSugestao(s, integridade.fingerprint)
    )
      motivos.push('politica_desatualizada');
    if (
      recusas.get(
        chavePar(s.padrinhoParticipacaoId, s.apadrinhadoParticipacaoId),
      )?.acao === 'recusado'
    )
      motivos.push('par_recusado');
    // Aprovações da própria rodada concretizam o plano; não mudam a base daquela rodada.
    const aprovadas = sugestoes.filter(
      (v) => v.execucaoId === s.execucaoId && v.status === 'aprovada',
    );
    const proprios = new Set<number>();
    for (const aprovada of aprovadas) {
      const vinculo = vinculos.find(
        (v) =>
          v.id === aprovada.vinculoId &&
          v.origem === 'matching' &&
          v.sugestaoId === aprovada.id &&
          v.padrinhoParticipacaoId === aprovada.padrinhoParticipacaoId &&
          v.apadrinhadoParticipacaoId === aprovada.apadrinhadoParticipacaoId,
      );
      if (vinculo) proprios.add(vinculo.id);
      else motivos.push('vinculos_alterados');
    }
    if (config && !contexto.assinaturas.has(s.execucaoId))
      contexto.assinaturas.set(
        s.execucaoId,
        this.assinaturaEntrada(
          config,
          registros,
          metadata,
          vinculos.filter((v) => !proprios.has(v.id)),
        ),
      );
    if (
      !contexto.criteriosValidos ||
      (integridade?.fingerprint &&
        contexto.assinaturas.get(s.execucaoId) !== integridade.fingerprint)
    )
      motivos.push('dados_alterados');
    const padrinho = registros.find((p) => p.id === s.padrinhoParticipacaoId);
    const apadrinhado = registros.find(
      (p) => p.id === s.apadrinhadoParticipacaoId,
    );
    if (
      config &&
      contexto.criteriosValidos &&
      (!padrinho ||
        !apadrinhado ||
        !this.pontuar(padrinho, apadrinhado, config.criterios, metadata)
          .sugerivel)
    )
      motivos.push('par_nao_viavel');
    if (
      config &&
      (vinculos.filter(
        (v) => v.padrinhoParticipacaoId === s.padrinhoParticipacaoId,
      ).length >= config.capacidadePorPadrinho ||
        vinculos.filter(
          (v) => v.apadrinhadoParticipacaoId === s.apadrinhadoParticipacaoId,
        ).length >= config.capacidadePorApadrinhado)
    )
      motivos.push('capacidade_atingida');
    return [...new Set(motivos)];
  }

  private async marcarObsoletas(
    manager: EntityManager,
    sugestoes: MatchingSugestaoEntity[],
    motivos: string[],
  ) {
    for (const s of sugestoes) {
      s.status = 'obsoleta';
      s.explicacao = {
        ...s.explicacao,
        validade: {
          vigente: false,
          motivos,
          mensagens: motivos.map((m) => MOTIVOS_VALIDADE[m]),
          detectadaEm: new Date().toISOString(),
        },
      };
    }
    if (sugestoes.length)
      await manager.getRepository(MatchingSugestaoEntity).save(sugestoes);
  }

  private async atualizarIndicador(
    manager: EntityManager,
    programa: ProgramaEntity,
  ) {
    programa.matchingPendente =
      (await manager
        .getRepository(MatchingSugestaoEntity)
        .count({ where: { programaId: programa.id, status: 'pendente' } })) > 0;
    await manager.getRepository(ProgramaEntity).save(programa);
  }

  private async invalidarPendentesDoContexto(
    manager: EntityManager,
    contexto: Awaited<ReturnType<MatchingService['contextoValidade']>>,
  ) {
    for (const sugestao of contexto.sugestoes.filter(
      (s) => s.status === 'pendente',
    )) {
      const motivos = this.motivosDesatualizacao(sugestao, contexto);
      if (motivos.length)
        await this.marcarObsoletas(manager, [sugestao], motivos);
    }
    await this.atualizarIndicador(manager, contexto.programa);
  }

  private async atualizarPendentes(codigo: string) {
    await this.dados.transaction(async (manager) => {
      const programa = await this.programa(manager, codigo, true);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      const contexto = await this.contextoValidade(manager, programa, config);
      await this.invalidarPendentesDoContexto(manager, contexto);
    });
  }

  private elegiveis(registros: ParticipacaoEntity[]) {
    registros = registros.filter((p) => !p.terminoEm);
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

  private normalizarBooleano = normalizarBooleano;
  private metadadoDaParticipacao = metadadoDaParticipacao;
  private pontuar = pontuarPar;
  private valorPorCriterio = valorPorCriterio;

  async executar(codigo: string, responsavel: string) {
    const execucao = await this.dados.transaction(async (manager) => {
      const programa = await this.programa(manager, codigo, true);
      this.validarEtapa(programa);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      if (!config)
        throw new BadRequestException(
          'Configure o matching antes de executar.',
        );
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
            politica: POLITICA_MATCHING,
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
      const preparado = await this.dados.transaction(async (manager) => {
        const programa = await this.programaPorId(manager, execucao.programaId);
        this.validarEtapa(programa);
        const config = await this.configuracaoAtual(manager, programa.id, true);
        if (!config || config.id !== execucao.configuracaoId)
          throw new ConflictException(
            'A configuração mudou durante a execução. Inicie uma nova rodada.',
          );
        const atual = await manager
          .getRepository(MatchingExecucaoEntity)
          .createQueryBuilder('execucao')
          .setLock('pessimistic_write')
          .where('execucao.id = :id', { id: execucao.id })
          .getOneOrFail();
        if (atual.status !== 'executando')
          throw new ConflictException(
            'Esta execução foi encerrada ou substituída.',
          );
        const metadata = await this.metadadosDosFormularios(
          manager,
          programa.codigo,
        );
        this.validarCriterios(config.criterios, metadata);
        if (
          (atual.configSnapshot.politica as { versao?: string } | undefined)
            ?.versao !== POLITICA_MATCHING.versao
        )
          throw new ConflictException(
            'A política do algoritmo mudou; inicie uma nova execução.',
          );
        const registros = await this.registrosBloqueados(
          manager,
          programa.codigo,
        );
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
        const eventos = await this.eventosDosPares(manager, programa.id);
        const impedidos = new Set(
          [...decisoesAtuais(eventos)]
            .filter(([, e]) => e.acao === 'recusado')
            .map(([par]) => par),
        );
        atual.configSnapshot = {
          ...atual.configSnapshot,
          integridade: {
            versao: VERSAO_INTEGRIDADE,
            fingerprint: this.assinaturaEntrada(
              config,
              registros,
              metadata,
              vinculos,
            ),
          },
          impedimentos: [...decisoesAtuais(eventos).values()]
            .filter((e) => e.acao === 'recusado')
            .map((e) => ({
              decisaoId: e.id,
              padrinhoParticipacaoId: e.padrinhoParticipacaoId,
              apadrinhadoParticipacaoId: e.apadrinhadoParticipacaoId,
            })),
        };
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
        return {
          programa,
          config,
          atual,
          metadata,
          registros,
          padrinhos,
          apadrinhados,
          vinculos,
          eventos,
          impedidos,
          usadosP,
          usadosA,
          capP,
          capA,
        };
      });
      const {
        config,
        metadata,
        padrinhos,
        apadrinhados,
        vinculos,
        impedidos,
        usadosP,
        usadosA,
        capP,
        capA,
      } = preparado;
      // Pontuação de todos os pares e alocação rodam fora da transação e do HTTP/SSE.
      const { alocacao, explicacoes, relatorio } =
        await calcularMatchingAssincrono({
          padrinhos,
          apadrinhados,
          criterios: config.criterios,
          metadata: {
            campos: metadata.campos,
            versoesValidas: metadata.versoesValidas,
          },
          vinculos,
          impedidos,
          usadosP,
          usadosA,
          capP,
          capA,
          capacidadePorPadrinho: config.capacidadePorPadrinho,
          capacidadePorApadrinhado: config.capacidadePorApadrinhado,
        });
      return await this.dados.transaction(async (manager) => {
        const programa = await this.programaPorId(manager, execucao.programaId);
        this.validarEtapa(programa);
        const atual = await manager
          .getRepository(MatchingExecucaoEntity)
          .createQueryBuilder('execucao')
          .setLock('pessimistic_write')
          .where('execucao.id = :id', { id: execucao.id })
          .getOneOrFail();
        if (atual.status !== 'executando')
          throw new ConflictException(
            'Esta execução foi encerrada ou substituída.',
          );
        const vigente = await this.configuracaoAtual(
          manager,
          programa.id,
          true,
        );
        const metadataVigente = await this.metadadosDosFormularios(
          manager,
          programa.codigo,
        );
        const registrosVigentes = await this.registrosBloqueados(
          manager,
          programa.codigo,
        );
        const vinculosVigentes = await manager
          .getRepository(MatchingVinculoEntity)
          .find({ where: { programaId: programa.id, ativo: true } });
        const eventosVigentes = await this.eventosDosPares(
          manager,
          programa.id,
        );
        const assinatura = (
          preparado.atual.configSnapshot.integridade as { fingerprint: string }
        ).fingerprint;
        if (
          !vigente ||
          vigente.id !== config.id ||
          this.assinaturaEntrada(
            vigente,
            registrosVigentes,
            metadataVigente,
            vinculosVigentes,
          ) !== assinatura ||
          eventosVigentes.map((e) => e.id).join(',') !==
            preparado.eventos.map((e) => e.id).join(',')
        ) {
          throw new ConflictException(
            'Os dados do ciclo mudaram durante o cálculo. Execute uma nova rodada.',
          );
        }
        atual.configSnapshot = preparado.atual.configSnapshot;
        atual.configSnapshot = {
          ...atual.configSnapshot,
          relatorio,
          vinculosConfirmados: vinculos.map((v) => ({
            id: v.id,
            padrinhoParticipacaoId: v.padrinhoParticipacaoId,
            apadrinhadoParticipacaoId: v.apadrinhadoParticipacaoId,
          })),
        };
        // Foto dos dados realmente utilizados nesta rodada, além da versão do formulário.
        atual.formulariosSnapshot = {
          formularios: metadata.formularios.map((f) => ({
            id: f.id,
            tipo: f.tipo,
            versao: f.versao,
            perguntas: f.perguntas,
          })),
          respostas: metadata.snapshots,
          participantes: [...padrinhos, ...apadrinhados].map((p) => ({
            id: p.id,
            usuarioId: p.usuarioId,
            papel: p.papel,
            status: p.status,
            respostas: structuredClone(p.respostas),
          })),
        };
        const anteriores = await manager
          .getRepository(MatchingSugestaoEntity)
          .find({ where: { programaId: programa.id, status: 'pendente' } });
        await this.marcarObsoletas(manager, anteriores, [
          'execucao_substituida',
        ]);
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
            explicacao: {
              ...resultado.explicacao,
              integridade: {
                entrada: (
                  atual.configSnapshot.integridade as { fingerprint: string }
                ).fingerprint,
                par: this.assinaturaSugestao(
                  {
                    execucaoId: atual.id,
                    padrinhoParticipacaoId: par.padrinhoId,
                    apadrinhadoParticipacaoId: par.apadrinhadoId,
                    explicacao: resultado.explicacao,
                  },
                  (atual.configSnapshot.integridade as { fingerprint: string })
                    .fingerprint,
                ),
              },
              distribuicao: {
                politica: POLITICA_MATCHING.equilibrio,
                objetivos: POLITICA_MATCHING.objetivos,
                padrinho: relatorio.cargaPadrinhos.find(
                  (p) => p.participacaoId === par.padrinhoId,
                ),
                vinculosAnterioresApadrinhado:
                  usadosA.get(par.apadrinhadoId) ?? 0,
              },
            },
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
        return { ...atual, totalSugestoes: sugestoes.length, relatorio };
      });
    } catch (erro) {
      await this.dados.getRepository(MatchingExecucaoEntity).update(
        { id: execucao.id, status: 'executando' },
        {
          status: 'falha',
          erro:
            erro instanceof Error ? erro.message.slice(0, 4000) : String(erro),
          concluidaEm: new Date(),
        },
      );
      throw erro;
    }
  }

  private diagnosticoDados(
    config: MatchingConfiguracaoEntity | null,
    pessoas: {
      padrinhos: ParticipacaoEntity[];
      apadrinhados: ParticipacaoEntity[];
    },
    metadata: Awaited<ReturnType<MatchingService['metadadosDosFormularios']>>,
  ) {
    const pendentes = new Map<
      number,
      {
        participacaoId: number;
        nome: string;
        papel: string;
        campos: string[];
        obrigatorio: boolean;
      }
    >();
    const criterios = (config?.criterios ?? []).map((c, indice) => {
      const nome = c.campoCadastro
        ? (CRITERIOS_CADASTRO.find((item) => item.campo === c.campoCadastro)
            ?.nome ?? c.campoCadastro)
        : (metadata.campos.padrinho.get(c.criterioPadrinhoId ?? 0)?.nome ??
          `Critério ${c.criterioPadrinhoId ?? indice + 1}`);
      const contar = (
        lista: ParticipacaoEntity[],
        papel: 'padrinho' | 'apadrinhado',
      ) => {
        let conhecidos = 0;
        for (const p of lista) {
          let conhecido = false;
          if (c.campoCadastro === 'preferenciaGenero') {
            try {
              conhecido =
                !!validarPreferenciaGenero(p.respostas?.preferenciaGenero) &&
                (GENEROS_PREFERENCIA as readonly unknown[]).includes(
                  p.respostas?.genero,
                );
            } catch {
              /* Dado legado inválido continua pendente. */
            }
          } else if (c.campoCadastro) {
            const resultado = avaliarCadastro(
              c.campoCadastro,
              p.respostas ?? {},
              p.respostas ?? {},
            );
            conhecido =
              resultado.considerado ||
              resultado.motivo === 'vivencia_nao_aplicavel';
          } else {
            const meta = this.metadadoDaParticipacao(
              p,
              metadata.campos[papel].get(
                (papel === 'padrinho'
                  ? c.criterioPadrinhoId
                  : c.criterioApadrinhadoId) ?? 0,
              ),
              metadata.versoesValidas,
            );
            let valor = this.valorPorCriterio(p, meta);
            if (meta?.tipo === 'sim_nao')
              valor = this.normalizarBooleano(valor);
            conhecido =
              !!meta &&
              valor !== undefined &&
              valor !== null &&
              (Array.isArray(valor)
                ? valor.length > 0
                : String(valor).trim().length > 0);
          }
          if (conhecido) conhecidos++;
          else {
            const item = pendentes.get(p.id) ?? {
              participacaoId: p.id,
              nome: p.respostas?.nome || p.usuarioId,
              papel,
              campos: [],
              obrigatorio: false,
            };
            item.campos.push(nome);
            item.obrigatorio ||= c.obrigatorio === true;
            pendentes.set(p.id, item);
          }
        }
        return { conhecidos, total: lista.length };
      };
      return {
        chave: `${indice}`,
        nome,
        obrigatorio: c.obrigatorio === true,
        padrinhos: contar(pessoas.padrinhos, 'padrinho'),
        apadrinhados: contar(pessoas.apadrinhados, 'apadrinhado'),
      };
    });
    return {
      configuracaoVersao: config?.versao ?? null,
      criterios,
      pendencias: [...pendentes.values()],
    };
  }

  async visao(codigo: string) {
    await this.atualizarPendentes(codigo);
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
    if (
      configuracao?.criterios?.some(
        (c) => !c.campoCadastro && !c.criterioPadrinhoId,
      )
    )
      bloqueios.push(
        'A configuração atual usa o formato antigo. Abra a configuração e selecione critérios do catálogo.',
      );
    if (configuracao) {
      try {
        this.validarCriterios(configuracao.criterios, metadados);
      } catch (erro) {
        if (erro instanceof BadRequestException) bloqueios.push(erro.message);
        else throw erro;
      }
    }
    return {
      programa,
      configuracao: configuracao
        ? { ...configuracao, liberado: matchingLiberado(programa) }
        : null,
      podeExecutar: bloqueios.length === 0,
      bloqueios,
      criteriosDisponiveis,
      diagnosticoDados: this.diagnosticoDados(
        configuracao,
        { padrinhos, apadrinhados },
        metadados,
      ),
      criteriosCadastroDisponiveis: CRITERIOS_CADASTRO.map((c) => ({
        ...c,
        permiteObrigatorio:
          c.campo === 'areas' || c.campo === 'disponibilidade',
      })),
      politicaAtual: POLITICA_MATCHING,
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
    await this.atualizarPendentes(codigo);
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
    const inicial = await this.dados
      .getRepository(MatchingSugestaoEntity)
      .findOne({ where: { id } });
    if (!inicial) throw new NotFoundException('Sugestão não encontrada.');
    const ciclo = await this.dados
      .getRepository(ProgramaEntity)
      .findOne({ where: { id: inicial.programaId } });
    if (!ciclo) throw new NotFoundException('Programa não encontrado.');
    await this.atualizarPendentes(ciclo.codigo);
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
    const historicoPar = (
      await this.eventosDosPares(this.dados.manager, sugestao.programaId)
    ).filter(
      (e) =>
        e.padrinhoParticipacaoId === sugestao.padrinhoParticipacaoId &&
        e.apadrinhadoParticipacaoId === sugestao.apadrinhadoParticipacaoId,
    );
    return {
      ...sugestao,
      historicoPar,
      podeAprovar: sugestao.status === 'pendente',
      validade:
        sugestao.status === 'pendente'
          ? { vigente: true, motivos: [], mensagens: [] }
          : (sugestao.explicacao.validade ?? {
              vigente: false,
              motivos: [],
              mensagens: [],
            }),
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

  /** Carrega e bloqueia os insumos uma vez para a escolha manual de destinos. */
  async prepararDestinos(
    manager: EntityManager,
    programa: ProgramaEntity,
    apadrinhadoId: number,
  ) {
    const config = await this.configuracaoAtual(manager, programa.id, true);
    if (!config)
      throw new ConflictException(
        'Configure o matching antes de criar vínculos.',
      );
    const registros = await manager
      .getRepository(ParticipacaoEntity)
      .createQueryBuilder('participacao')
      .setLock('pessimistic_write')
      .where('participacao.programa = :programa', { programa: programa.codigo })
      .orderBy('participacao.id', 'ASC')
      .getMany();
    const apadrinhado = registros.find((p) => p.id === apadrinhadoId);
    if (
      !apadrinhado ||
      apadrinhado.papel !== 'apadrinhado' ||
      apadrinhado.status !== 'em_andamento'
    )
      throw new ConflictException(
        'Selecione um apadrinhado aprovado do mesmo ciclo.',
      );
    const metadata = await this.metadadosDosFormularios(
      manager,
      programa.codigo,
    );
    this.validarCriterios(config.criterios, metadata);
    return this.elegiveis(registros)
      .padrinhos.filter((p) => p.usuarioId !== apadrinhado.usuarioId)
      .map((padrinho) => ({
        programa,
        config,
        padrinho,
        apadrinhado,
        avaliacao: this.pontuar(
          padrinho,
          apadrinhado,
          config.criterios,
          metadata,
        ),
      }));
  }

  /** Mesmo avaliador para criação sugerida, manual e transferência. Ciclo já bloqueado. */
  async prepararPar(
    manager: EntityManager,
    programa: ProgramaEntity,
    padrinhoId: number,
    apadrinhadoId: number,
  ) {
    const par = (
      await this.prepararDestinos(manager, programa, apadrinhadoId)
    ).find((p) => p.padrinho.id === padrinhoId);
    if (!par)
      throw new ConflictException(
        'Selecione um padrinho aprovado e ativo do mesmo ciclo.',
      );
    validarElegibilidadePar(par);
    return par;
  }

  async aprovar(id: number, responsavel: string) {
    const resultado = await this.dados.transaction(async (manager) => {
      const inicial = await manager
        .getRepository(MatchingSugestaoEntity)
        .findOne({ where: { id } });
      if (!inicial) throw new NotFoundException('Sugestão não encontrada.');
      // A ordem começa sempre pelo ciclo; nenhuma sugestão é bloqueada antes dele.
      const programa = await this.programaPorId(manager, inicial.programaId);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      const sugestao = await manager
        .getRepository(MatchingSugestaoEntity)
        .createQueryBuilder('sugestao')
        .setLock('pessimistic_write')
        .where('sugestao.id = :id', { id })
        .getOneOrFail();
      if (sugestao.status === 'aprovada' && sugestao.vinculoId) {
        const vinculo = await manager
          .getRepository(MatchingVinculoEntity)
          .findOne({ where: { id: sugestao.vinculoId } });
        if (
          vinculo &&
          vinculo.sugestaoId === sugestao.id &&
          vinculo.programaId === programa.id &&
          vinculo.padrinhoParticipacaoId === sugestao.padrinhoParticipacaoId &&
          vinculo.apadrinhadoParticipacaoId ===
            sugestao.apadrinhadoParticipacaoId
        )
          return { sugestao, vinculo };
        throw new ConflictException(
          'A aprovação histórica não possui o vínculo correspondente.',
        );
      }
      if (sugestao.status !== 'pendente')
        throw new ConflictException(
          'A sugestão já foi concluída ou está desatualizada.',
        );
      const contexto = await this.contextoValidade(manager, programa, config);
      const motivos = this.motivosDesatualizacao(sugestao, contexto);
      if (motivos.length) {
        await this.invalidarPendentesDoContexto(manager, contexto);
        return {
          erro: new ConflictException(
            motivos.map((m) => MOTIVOS_VALIDADE[m]).join(' '),
          ),
        };
      }
      if (!config) throw new ConflictException('Configuração indisponível.');
      const par = await this.prepararPar(
        manager,
        programa,
        sugestao.padrinhoParticipacaoId,
        sugestao.apadrinhadoParticipacaoId,
      );
      const vinculo = await criarVinculoNaTransacao(
        manager,
        par,
        { origem: 'matching', sugestaoId: sugestao.id, responsavel },
        this.chat,
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
    // A invalidação acima precisa ser confirmada mesmo quando a API responde 409.
    if ('erro' in resultado) throw resultado.erro;
    return resultado;
  }

  async recusar(id: number, responsavel: string, motivo?: string) {
    if (motivo != null && (typeof motivo !== 'string' || motivo.length > 1000))
      throw new BadRequestException('Motivo inválido.');
    const resultado = await this.dados.transaction(async (manager) => {
      const inicial = await manager
        .getRepository(MatchingSugestaoEntity)
        .findOne({ where: { id } });
      if (!inicial) throw new NotFoundException('Sugestão não encontrada.');
      const programa = await this.programaPorId(manager, inicial.programaId);
      const config = await this.configuracaoAtual(manager, programa.id, true);
      const sugestao = await manager
        .getRepository(MatchingSugestaoEntity)
        .createQueryBuilder('sugestao')
        .setLock('pessimistic_write')
        .where('sugestao.id = :id', { id })
        .getOneOrFail();
      // Repetir a mesma requisição não desfaz uma reconsideração posterior.
      if (sugestao.status === 'recusada') return sugestao;
      if (sugestao.status !== 'pendente')
        throw new ConflictException(
          'A sugestão já foi concluída ou está desatualizada.',
        );
      const contexto = await this.contextoValidade(manager, programa, config);
      const motivos = this.motivosDesatualizacao(sugestao, contexto);
      if (motivos.length) {
        await this.invalidarPendentesDoContexto(manager, contexto);
        return {
          erro: new ConflictException(
            motivos.map((m) => MOTIVOS_VALIDADE[m]).join(' '),
          ),
        };
      }
      this.validarEtapa(programa);
      sugestao.status = 'recusada';
      sugestao.decididaPor = responsavel;
      sugestao.decididaEm = new Date();
      sugestao.motivoDecisao = motivo?.trim() || null;
      await manager.getRepository(MatchingSugestaoEntity).save(sugestao);
      await manager.getRepository(MatchingDecisaoEntity).save(
        manager.getRepository(MatchingDecisaoEntity).create({
          sugestaoId: id,
          decisao: 'recusada',
          responsavel,
          motivo: sugestao.motivoDecisao,
        }),
      );
      const evento = manager.getRepository(MatchingParDecisaoEntity).create({
        programaId: programa.id,
        padrinhoParticipacaoId: sugestao.padrinhoParticipacaoId,
        apadrinhadoParticipacaoId: sugestao.apadrinhadoParticipacaoId,
        acao: 'recusado',
        responsavel,
        motivo: sugestao.motivoDecisao,
        sugestaoId: id,
        eventoAnteriorId: null,
      });
      await manager.getRepository(MatchingParDecisaoEntity).save(evento);
      const outras = contexto.sugestoes.filter(
        (s) =>
          s.id !== id &&
          s.status === 'pendente' &&
          s.padrinhoParticipacaoId === sugestao.padrinhoParticipacaoId &&
          s.apadrinhadoParticipacaoId === sugestao.apadrinhadoParticipacaoId,
      );
      await this.marcarObsoletas(manager, outras, ['par_recusado']);
      await this.atualizarIndicador(manager, programa);
      return sugestao;
    });
    if ('erro' in resultado) throw resultado.erro;
    return resultado;
  }

  async listarParesRecusados(codigo: string) {
    const programa = await this.programa(this.dados.manager, codigo);
    const eventos = await this.eventosDosPares(this.dados.manager, programa.id);
    const registros = await this.dados
      .getRepository(ParticipacaoEntity)
      .find({ where: { programa: programa.codigo } });
    const pessoa = (id: number) => {
      const p = registros.find((p) => p.id === id);
      return p
        ? { id: p.id, nome: p.respostas?.nome || p.usuarioId }
        : { id, nome: 'Participante indisponível' };
    };
    return [...decisoesAtuais(eventos).values()]
      .filter((e) => e.acao === 'recusado')
      .sort((a, b) => b.id - a.id)
      .map((e) => ({
        ...e,
        padrinho: pessoa(e.padrinhoParticipacaoId),
        apadrinhado: pessoa(e.apadrinhadoParticipacaoId),
        podeReconsiderar:
          !programa.inscricoesAbertas && matchingLiberado(programa),
        historico: eventos.filter(
          (v) =>
            v.padrinhoParticipacaoId === e.padrinhoParticipacaoId &&
            v.apadrinhadoParticipacaoId === e.apadrinhadoParticipacaoId,
        ),
      }));
  }

  async reconsiderarPar(
    id: number,
    responsavel: string,
    justificativa: string,
  ) {
    if (
      typeof justificativa !== 'string' ||
      !justificativa.trim() ||
      justificativa.length > 1000
    )
      throw new BadRequestException(
        'Informe a justificativa da reconsideração (até 1000 caracteres).',
      );
    return this.dados.transaction(async (manager) => {
      const inicial = await manager
        .getRepository(MatchingParDecisaoEntity)
        .findOne({ where: { id } });
      if (!inicial || inicial.acao !== 'recusado')
        throw new NotFoundException('Recusa de par não encontrada.');
      const programa = await this.programaPorId(manager, inicial.programaId);
      const ultima = decisoesAtuais(
        await this.eventosDosPares(manager, programa.id),
      ).get(
        chavePar(
          inicial.padrinhoParticipacaoId,
          inicial.apadrinhadoParticipacaoId,
        ),
      );
      if (
        ultima?.acao === 'reconsiderado' &&
        ultima.eventoAnteriorId === inicial.id
      )
        return {
          decisao: ultima,
          impedido: false,
          novaExecucaoNecessaria: true,
        };
      this.validarEtapa(programa);
      if (!ultima || ultima.id !== inicial.id)
        throw new ConflictException(
          'A decisão do par mudou. Atualize a lista antes de reconsiderar.',
        );
      const decisao = await manager
        .getRepository(MatchingParDecisaoEntity)
        .save(
          manager.getRepository(MatchingParDecisaoEntity).create({
            programaId: programa.id,
            padrinhoParticipacaoId: inicial.padrinhoParticipacaoId,
            apadrinhadoParticipacaoId: inicial.apadrinhadoParticipacaoId,
            acao: 'reconsiderado',
            responsavel,
            motivo: justificativa.trim(),
            sugestaoId: inicial.sugestaoId,
            eventoAnteriorId: inicial.id,
          }),
        );
      return { decisao, impedido: false, novaExecucaoNecessaria: true };
    });
  }
}
