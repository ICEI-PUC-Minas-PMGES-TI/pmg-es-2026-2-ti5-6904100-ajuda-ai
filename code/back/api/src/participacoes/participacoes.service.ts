import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from '../matching/entities/matching.entity.js';
import {
  PapelParticipacao,
  ParticipacaoEntity,
  RespostasCadastro,
  MetadadosCandidatura,
  StatusParticipacaoRegistro,
} from './entities/participacao.entity.js';
import {
  acrescentarVerificacao,
  EntradaVerificacao,
  exigirConferenciaParaAprovar,
  ItemConferencia,
  itensDaConferencia,
  montarVerificacao,
} from './verificacao-academica.js';

export interface RegistrarCandidaturaDto {
  usuarioId: string;
  programa?: string;
  respostas?: RespostasCadastro;
  metadados?: MetadadosCandidatura;
}

export interface CadastrarApadrinhadoDto {
  usuarioId: string;
  programa?: string;
  respostas?: RespostasCadastro;
  /**
   * `pendente` (padrão) enquanto o cadastro do aluno aguarda a coordenação;
   * `em_andamento` quando o aluno já tem cadastro aprovado (novo ciclo).
   */
  statusInicial?: 'pendente' | 'em_andamento';
  metadados?: MetadadosCandidatura;
}

export interface ConfirmarParticipacaoDto {
  usuarioId: string;
  papel: 'padrinho' | 'apadrinhado';
  programa?: string;
  grupo?: string;
  apadrinhados?: number;
  inicioEm?: string;
}

export interface RejeitarCandidaturaDto {
  usuarioId: string;
  programa?: string;
  justificativa?: string;
}

export type SituacaoAluno =
  | 'nenhuma'
  | 'candidatura_pendente'
  | 'candidatura_em_analise'
  | 'candidatura_rejeitada'
  | 'candidatura_aprovada_aguardando_matching'
  | 'padrinho_ativo'
  | 'apadrinhado_pendente'
  | 'apadrinhado_rejeitado'
  | 'apadrinhado_aguardando'
  | 'apadrinhado_ativo'
  | 'concluido';

@Injectable()
export class ParticipacoesService {
  constructor(
    @InjectRepository(ParticipacaoEntity)
    private readonly participacoes: Repository<ParticipacaoEntity>,
    @InjectRepository(ProgramaEntity)
    private readonly programas: Repository<ProgramaEntity>,
    @Optional()
    @InjectDataSource()
    private readonly dados?: DataSource,
  ) {}

  private repositorioVinculos(): Repository<MatchingVinculoEntity> | null {
    return this.dados?.isInitialized
      ? this.dados.getRepository(MatchingVinculoEntity)
      : null;
  }

  /** Tabelas do matching (F11/F12) só existem com o banco real conectado. */
  private matchingDisponivel(): boolean {
    return Boolean(this.dados?.isInitialized);
  }

  /**
   * Itens da conferência acadêmica do registro. Padrinho usa a foto dos
   * requisitos respondida no envio; envios antigos usam os do ciclo.
   */
  async itensDaConferencia(
    registro: ParticipacaoEntity,
  ): Promise<ItemConferencia[]> {
    if (registro.papel === 'apadrinhado') {
      return itensDaConferencia('apadrinhado');
    }
    const requisitos =
      registro.respostas?.requisitos ??
      (await this.programas.findOne({ where: { codigo: registro.programa } }))
        ?.requisitosPadrinho ??
      [];
    return itensDaConferencia(registro.papel, requisitos);
  }

  /**
   * Registra a conferência feita no sistema da faculdade. Só vale antes da
   * decisão; a candidatura a padrinho nova passa a "em análise".
   */
  async registrarVerificacao(
    id: number,
    entrada: EntradaVerificacao,
    coordenador?: string,
  ): Promise<ParticipacaoEntity> {
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const registro = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registro)
        throw new NotFoundException('Participação não encontrada.');
      if (
        registro.papel === 'padrinho' ||
        !['pendente', 'em_analise'].includes(registro.status)
      ) {
        throw new ConflictException(
          'A conferência acadêmica é registrada antes da decisão. Esta inscrição já foi decidida.',
        );
      }
      const verificacao = montarVerificacao(
        await this.itensDaConferencia(registro),
        entrada,
        coordenador,
      );
      registro.verificacao = acrescentarVerificacao(
        registro.verificacao,
        verificacao,
      );
      if (registro.papel === 'candidato' && registro.status === 'pendente')
        registro.status = 'em_analise';
      return repo.save(registro);
    });
  }

  /**
   * Uma participação só pode apontar para um ciclo cadastrado em `programas`.
   * Nunca cria ciclo: quem abre o ciclo é a coordenação (Programas).
   */
  async exigirCiclo(codigo: string): Promise<void> {
    const existe = await this.programas.findOne({ where: { codigo } });
    if (!existe) {
      throw new BadRequestException(
        `Ciclo ${codigo} não cadastrado. A coordenação precisa abrir o ciclo em Programas.`,
      );
    }
  }

  static programaAtual(referencia = new Date()): string {
    const ano = referencia.getFullYear();
    const semestre = referencia.getMonth() < 6 ? 1 : 2;
    return `${ano}/${semestre}`;
  }

  /** Situação consolidada do aluno a partir dos registros de um ciclo. */
  static situacaoDe(
    registro: ParticipacaoEntity | null,
    vinculoValido = false,
  ): SituacaoAluno {
    if (!registro) return 'nenhuma';
    if (registro.status === 'concluido') return 'concluido';
    if (registro.status === 'nao_aprovado')
      return registro.papel === 'apadrinhado'
        ? 'apadrinhado_rejeitado'
        : 'candidatura_rejeitada';
    if (registro.papel === 'padrinho')
      return registro.status === 'em_andamento' && vinculoValido
        ? 'padrinho_ativo'
        : 'candidatura_aprovada_aguardando_matching';
    if (registro.papel === 'apadrinhado') {
      if (registro.status === 'pendente') return 'apadrinhado_pendente';
      return registro.status === 'em_andamento' && vinculoValido
        ? 'apadrinhado_ativo'
        : 'apadrinhado_aguardando';
    }
    if (registro.status === 'aprovado')
      return 'candidatura_aprovada_aguardando_matching';
    if (registro.status === 'em_analise') return 'candidatura_em_analise';
    return 'candidatura_pendente';
  }

  async listarPorUsuario(usuarioId: string): Promise<ParticipacaoEntity[]> {
    const id = this.normalizarUsuario(usuarioId);
    return this.participacoes.find({
      where: { usuarioId: id },
      order: { programa: 'DESC', criadoEm: 'DESC' },
    });
  }

  async listarPorUsuarios(usuarioIds: string[]): Promise<ParticipacaoEntity[]> {
    const ids = [...new Set(usuarioIds.map((id) => id.trim().toLowerCase()))];
    if (!ids.length) return [];
    return this.participacoes.find({
      where: { usuarioId: In(ids) },
      order: { programa: 'DESC', criadoEm: 'DESC' },
    });
  }

  async buscarPorId(id: number): Promise<ParticipacaoEntity> {
    const registro = await this.participacoes.findOne({ where: { id } });
    if (!registro) {
      throw new NotFoundException('Participação não encontrada.');
    }
    return registro;
  }

  /**
   * Registro principal do aluno no ciclo: padrinho > candidatura > apadrinhado.
   */
  async registroPrincipal(
    usuarioId: string,
    programa: string,
  ): Promise<ParticipacaoEntity | null> {
    const registros = await this.participacoes.find({
      where: { usuarioId: this.normalizarUsuario(usuarioId), programa },
    });
    const prioridade: PapelParticipacao[] = [
      'padrinho',
      'candidato',
      'apadrinhado',
    ];
    for (const papel of prioridade) {
      const encontrado = registros.find((r) => r.papel === papel);
      if (encontrado) return encontrado;
    }
    return null;
  }

  /**
   * Registra uma candidatura submetida no ciclo informado.
   * Reenvio é recusado: as respostas enviadas permanecem imutáveis.
   * O CadastroService valida inscrições/formulário dentro da transação.
   */
  async registrarCandidaturaPadrinho(
    dto: RegistrarCandidaturaDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa = dto.programa?.trim();
    if (!programa) throw new BadRequestException('Informe o programa.');

    const existente = await this.registroPrincipal(usuarioId, programa);
    if (existente)
      throw new ConflictException(
        'Já existe inscrição neste ciclo. Respostas submetidas não podem ser editadas.',
      );

    await this.exigirCiclo(programa);
    const registro = this.participacoes.create({
      usuarioId,
      programa,
      papel: 'candidato',
      status: 'pendente',
      apadrinhados: 0,
      inicioEm: new Date(),
      respostas: {
        ...this.limparRespostas(dto.respostas ?? {}),
        ...(dto.metadados ? { _servidor: dto.metadados } : {}),
      },
    });
    return this.participacoes.save(registro);
  }

  /**
   * Cadastro do apadrinhado no ciclo: nasce `pendente` (aguardando a
   * coordenação aprovar o cadastro) e, depois de aprovado, fica em andamento
   * sem grupo até o match. Reenvios no mesmo ciclo são recusados.
   */
  async cadastrarApadrinhado(
    dto: CadastrarApadrinhadoDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa = dto.programa?.trim();
    if (!programa) throw new BadRequestException('Informe o programa.');

    const existente = await this.registroPrincipal(usuarioId, programa);
    if (existente)
      throw new ConflictException('Já existe inscrição neste ciclo.');

    await this.exigirCiclo(programa);
    return this.participacoes.save(
      this.participacoes.create({
        usuarioId,
        programa,
        papel: 'apadrinhado',
        status: dto.statusInicial ?? 'pendente',
        apadrinhados: 0,
        inicioEm: new Date(),
        respostas: dto.respostas
          ? {
              ...this.limparRespostas(dto.respostas),
              ...(dto.metadados ? { _servidor: dto.metadados } : {}),
            }
          : null,
      }),
    );
  }

  async listarPorPrograma(filtros: {
    programa: string;
    papel?: PapelParticipacao;
    status?: StatusParticipacaoRegistro;
  }): Promise<ParticipacaoEntity[]> {
    const programa = filtros.programa.trim();
    if (!programa) {
      throw new BadRequestException('programa é obrigatório.');
    }
    return this.participacoes.find({
      where: {
        programa,
        ...(filtros.papel ? { papel: filtros.papel } : {}),
        ...(filtros.status ? { status: filtros.status } : {}),
      },
      order: { criadoEm: 'DESC' },
    });
  }

  async buscarPadrinhoDoGrupo(
    programa: string,
    grupo: string,
  ): Promise<ParticipacaoEntity | null> {
    return this.participacoes.findOne({
      where: { programa, grupo, papel: 'padrinho' },
    });
  }

  async listarApadrinhadosDoGrupo(
    programa: string,
    grupo: string,
  ): Promise<ParticipacaoEntity[]> {
    return this.participacoes.find({
      where: { programa, grupo, papel: 'apadrinhado' },
      order: { criadoEm: 'ASC' },
    });
  }

  async marcarEmAnalise(id: number): Promise<ParticipacaoEntity | null> {
    return this.atualizarCandidatura(id, { status: 'em_analise' });
  }

  /**
   * Aprovação acadêmica mantém candidato/aprovado até o matching.
   * Apadrinhados aprovados aguardam vínculo, sem permissões ativas.
   */
  async aprovarCandidatura(
    id: number,
    coordenador?: string,
  ): Promise<ParticipacaoEntity> {
    return this.decidir(id, 'aprovado', undefined, coordenador);
  }

  async rejeitarCandidaturaPorId(
    id: number,
    justificativa?: string,
    coordenador?: string,
  ): Promise<ParticipacaoEntity> {
    return this.decidir(id, 'nao_aprovado', justificativa, coordenador);
  }

  private async decidir(
    id: number,
    resultado: 'aprovado' | 'nao_aprovado',
    justificativa?: string,
    coordenador?: string,
  ) {
    const motivo =
      typeof justificativa === 'string' ? justificativa.trim() : '';
    if (resultado === 'nao_aprovado' && (!motivo || motivo.length > 1000)) {
      throw new BadRequestException(
        'Justificativa de rejeição obrigatória (até 1000 caracteres).',
      );
    }
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const registro = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registro)
        throw new NotFoundException('Participação não encontrada.');
      if (
        !['pendente', 'em_analise'].includes(registro.status) ||
        registro.papel === 'padrinho'
      ) {
        throw new ConflictException(
          'Apenas inscrições aguardando decisão podem ser decididas.',
        );
      }
      if (resultado === 'aprovado') {
        exigirConferenciaParaAprovar(
          registro.verificacao,
          await this.itensDaConferencia(registro),
        );
      }
      registro.status =
        resultado === 'aprovado' && registro.papel === 'apadrinhado'
          ? 'em_andamento'
          : resultado;
      registro.terminoEm = resultado === 'nao_aprovado' ? new Date() : null;
      registro.respostas = {
        ...registro.respostas,
        _servidor: {
          ...registro.respostas?._servidor,
          decisao: {
            resultado,
            justificativa: motivo || null,
            em: new Date().toISOString(),
            por: coordenador ?? null,
          },
        },
      };
      return repo.save(registro);
    });
  }

  /** Volta a candidatura para análise (ex.: "Solicitar revisão"). */
  async atualizarCandidatura(
    id: number,
    dados: { status?: 'pendente' | 'em_analise'; observacoes?: string | null },
  ): Promise<ParticipacaoEntity> {
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const registro = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registro)
        throw new NotFoundException('Participação não encontrada.');
      if (dados.status) {
        if (
          registro.papel !== 'candidato' ||
          !['pendente', 'em_analise'].includes(registro.status)
        ) {
          throw new BadRequestException(
            'Somente candidaturas sem decisão podem entrar em análise.',
          );
        }
        registro.status = dados.status;
      }
      if (dados.observacoes !== undefined)
        registro.observacoes = dados.observacoes?.trim().slice(0, 1000) || null;
      return repo.save(registro);
    });
  }

  /** Define o vínculo apadrinhado → padrinho, criando o grupo se preciso. */
  async vincular(
    apadrinhadoId: number,
    padrinhoId: number,
  ): Promise<{
    apadrinhado: ParticipacaoEntity;
    padrinho: ParticipacaoEntity;
  }> {
    if (apadrinhadoId === padrinhoId)
      throw new BadRequestException('Vínculo inválido.');
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const inicial = await repo.findOne({ where: { id: padrinhoId } });
      if (!inicial) throw new NotFoundException('Candidato não encontrado.');
      // Lock por ciclo serializa a formação e contagem dos grupos.
      const programa = await manager.getRepository(ProgramaEntity).findOne({
        where: { codigo: inicial.programa },
        lock: { mode: 'pessimistic_write' },
      });
      if (!programa || programa.etapaAtual === 'encerramento')
        throw new BadRequestException('Ciclo indisponível para matching.');
      const registros = [];
      for (const id of [apadrinhadoId, padrinhoId].sort((a, b) => a - b)) {
        registros.push(
          await repo.findOne({
            where: { id },
            lock: { mode: 'pessimistic_write' },
          }),
        );
      }
      const apadrinhado = registros.find((r) => r?.id === apadrinhadoId);
      const padrinho = registros.find((r) => r?.id === padrinhoId);
      if (!apadrinhado || !padrinho)
        throw new NotFoundException('Participação não encontrada.');
      if (
        apadrinhado.usuarioId === padrinho.usuarioId ||
        apadrinhado.programa !== padrinho.programa ||
        apadrinhado.papel !== 'apadrinhado' ||
        apadrinhado.status !== 'em_andamento'
      ) {
        throw new BadRequestException(
          'Selecione um apadrinhado aprovado do mesmo ciclo.',
        );
      }
      const aprovado =
        padrinho.papel === 'candidato' && padrinho.status === 'aprovado';
      const legadoOuAtivo =
        padrinho.papel === 'padrinho' && padrinho.status === 'em_andamento';
      if (!aprovado && !legadoOuAtivo)
        throw new BadRequestException('Selecione um candidato aprovado.');
      if (apadrinhado.grupo?.trim() && apadrinhado.grupo !== padrinho.grupo) {
        throw new ConflictException(
          'Apadrinhado já possui vínculo. Remanejamento não disponível.',
        );
      }
      if (!padrinho.grupo?.trim()) padrinho.grupo = `Grupo-${padrinho.id}`;
      const outrosPadrinhos = await repo.find({
        where: {
          programa: padrinho.programa,
          grupo: padrinho.grupo,
          papel: 'padrinho',
        },
      });
      if (outrosPadrinhos.some((r) => r.id !== padrinho.id))
        throw new ConflictException('Grupo já pertence a outro padrinho.');
      if (apadrinhado.grupo?.trim() && legadoOuAtivo)
        return { apadrinhado, padrinho };
      apadrinhado.grupo = padrinho.grupo;
      padrinho.papel = 'padrinho';
      padrinho.status = 'em_andamento';
      if (aprovado) padrinho.inicioEm = new Date();
      await repo.save(apadrinhado);
      padrinho.apadrinhados = (
        await repo.find({
          where: {
            programa: padrinho.programa,
            grupo: padrinho.grupo,
            papel: 'apadrinhado',
            status: 'em_andamento',
          },
        })
      ).length;
      await repo.save(padrinho);
      return { apadrinhado, padrinho };
    });
  }

  /**
   * Desfaz os vínculos do apadrinhado: encerra os pares do matching (F11/F12)
   * e limpa o grupo legado. O padrinho que ficar sem apadrinhados volta a
   * candidato aprovado aguardando matching.
   */
  async desvincular(apadrinhadoId: number): Promise<{
    apadrinhado: ParticipacaoEntity;
    padrinho: ParticipacaoEntity | null;
  }> {
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const apadrinhado = await repo.findOne({
        where: { id: apadrinhadoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!apadrinhado)
        throw new NotFoundException('Participação não encontrada.');
      if (apadrinhado.papel !== 'apadrinhado') {
        throw new BadRequestException(
          'Somente apadrinhados podem ter o vínculo desfeito por este fluxo.',
        );
      }
      const canonicos = this.matchingDisponivel()
        ? await manager.getRepository(MatchingVinculoEntity).find({
            where: { apadrinhadoParticipacaoId: apadrinhado.id, ativo: true },
          })
        : [];
      const grupo = apadrinhado.grupo?.trim();
      if (!grupo && !canonicos.length) {
        throw new BadRequestException('Este apadrinhado não possui vínculo.');
      }
      let padrinho: ParticipacaoEntity | null = null;
      for (const vinculo of canonicos) {
        padrinho = (await this.encerrarPar(manager, vinculo)).padrinho;
      }
      if (grupo && apadrinhado.grupo?.trim()) {
        const doGrupo = await repo.findOne({
          where: {
            programa: apadrinhado.programa,
            grupo,
            papel: 'padrinho',
          },
          lock: { mode: 'pessimistic_write' },
        });
        apadrinhado.grupo = null;
        await repo.save(apadrinhado);
        if (doGrupo) padrinho = await this.recalcularPadrinho(manager, doGrupo);
      }
      return { apadrinhado, padrinho };
    });
  }

  /**
   * Encerra um vínculo do matching ligado à participação. É o tratamento
   * exigido antes de retirar uma aprovação que já foi usada.
   */
  async encerrarVinculo(
    participacaoId: number,
    vinculoId: number,
  ): Promise<{
    apadrinhado: ParticipacaoEntity | null;
    padrinho: ParticipacaoEntity | null;
  }> {
    if (!this.matchingDisponivel()) {
      throw new BadRequestException(
        'Vínculos do matching indisponíveis neste ambiente.',
      );
    }
    return this.participacoes.manager.transaction(async (manager) => {
      const vinculo = await manager
        .getRepository(MatchingVinculoEntity)
        .findOne({
          where: { id: vinculoId },
          lock: { mode: 'pessimistic_write' },
        });
      if (
        !vinculo ||
        (vinculo.padrinhoParticipacaoId !== participacaoId &&
          vinculo.apadrinhadoParticipacaoId !== participacaoId)
      ) {
        throw new NotFoundException(
          'Vínculo não encontrado para esta participação.',
        );
      }
      if (!vinculo.ativo)
        throw new ConflictException('Este vínculo já foi encerrado.');
      const programa = await manager
        .getRepository(ProgramaEntity)
        .findOne({ where: { id: vinculo.programaId } });
      if (programa?.etapaAtual === 'encerramento') {
        throw new BadRequestException(
          'Programa encerrado: os vínculos são históricos.',
        );
      }
      return this.encerrarPar(manager, vinculo);
    });
  }

  /** Encerra o par canônico e recalcula o padrinho, na transação do chamador. */
  private async encerrarPar(
    manager: EntityManager,
    vinculo: MatchingVinculoEntity,
  ): Promise<{
    apadrinhado: ParticipacaoEntity | null;
    padrinho: ParticipacaoEntity | null;
  }> {
    const repo = manager.getRepository(ParticipacaoEntity);
    const pessoas: ParticipacaoEntity[] = [];
    for (const id of [
      vinculo.padrinhoParticipacaoId,
      vinculo.apadrinhadoParticipacaoId,
    ].sort((a, b) => a - b)) {
      const pessoa = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (pessoa) pessoas.push(pessoa);
    }
    const apadrinhado =
      pessoas.find((p) => p.id === vinculo.apadrinhadoParticipacaoId) ?? null;
    let padrinho =
      pessoas.find((p) => p.id === vinculo.padrinhoParticipacaoId) ?? null;
    vinculo.ativo = false;
    vinculo.encerradoEm = new Date();
    await manager.getRepository(MatchingVinculoEntity).save(vinculo);
    // Par legado convertido pela migration F11/F12: o grupo também é desfeito.
    if (
      apadrinhado?.grupo?.trim() &&
      padrinho?.grupo?.trim() &&
      apadrinhado.grupo === padrinho.grupo
    ) {
      apadrinhado.grupo = null;
      await repo.save(apadrinhado);
    }
    if (padrinho) padrinho = await this.recalcularPadrinho(manager, padrinho);
    return { apadrinhado, padrinho };
  }

  /**
   * Conta os apadrinhados do padrinho (pares do matching + grupo legado).
   * Sem nenhum, volta a candidato aprovado aguardando matching.
   */
  private async recalcularPadrinho(
    manager: EntityManager,
    padrinho: ParticipacaoEntity,
  ): Promise<ParticipacaoEntity> {
    const repo = manager.getRepository(ParticipacaoEntity);
    const ids = new Set<number>();
    if (this.matchingDisponivel()) {
      const pares = await manager.getRepository(MatchingVinculoEntity).find({
        where: { padrinhoParticipacaoId: padrinho.id, ativo: true },
      });
      for (const par of pares) ids.add(par.apadrinhadoParticipacaoId);
    }
    if (padrinho.grupo?.trim()) {
      const doGrupo = await repo.find({
        where: {
          programa: padrinho.programa,
          grupo: padrinho.grupo,
          papel: 'apadrinhado',
          status: 'em_andamento',
        },
      });
      for (const item of doGrupo) ids.add(item.id);
    }
    padrinho.apadrinhados = ids.size;
    if (ids.size === 0 && padrinho.papel === 'padrinho') {
      padrinho.papel = 'candidato';
      padrinho.status = 'aprovado';
      padrinho.grupo = null;
      padrinho.inicioEm = null;
    }
    return repo.save(padrinho);
  }

  /** Sugestões pendentes deixam de valer quando a aprovação é retirada. */
  private async retirarDoMatching(
    manager: EntityManager,
    registro: ParticipacaoEntity,
  ): Promise<void> {
    if (!this.matchingDisponivel()) return;
    const sugestoes = manager.getRepository(MatchingSugestaoEntity);
    const pendentes = await sugestoes.find({
      where: [
        { padrinhoParticipacaoId: registro.id, status: 'pendente' },
        { apadrinhadoParticipacaoId: registro.id, status: 'pendente' },
      ],
    });
    if (!pendentes.length) return;
    for (const sugestao of pendentes) {
      sugestao.status = 'obsoleta';
      sugestao.motivoDecisao =
        'Aprovação da candidatura revogada pela coordenação.';
    }
    await sugestoes.save(pendentes);
    for (const programaId of new Set(pendentes.map((s) => s.programaId))) {
      const restantes = await sugestoes.count({
        where: { programaId, status: 'pendente' },
      });
      await manager
        .getRepository(ProgramaEntity)
        .update({ id: programaId }, { matchingPendente: restantes > 0 });
    }
  }

  /**
   * Retira aprovação já concedida. Exige ausência de vínculo ativo; use
   * `desvincular` antes quando houver match.
   */
  async revogarAprovacao(
    id: number,
    justificativa: string | undefined,
    coordenador?: string,
  ): Promise<ParticipacaoEntity> {
    const motivo =
      typeof justificativa === 'string' ? justificativa.trim() : '';
    if (!motivo || motivo.length > 1000) {
      throw new BadRequestException(
        'Justificativa obrigatória para revogar a aprovação (até 1000 caracteres).',
      );
    }
    return this.participacoes.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ParticipacaoEntity);
      const registro = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registro)
        throw new NotFoundException('Participação não encontrada.');

      const candidaturaAprovada =
        registro.papel === 'candidato' && registro.status === 'aprovado';
      const apadrinhadoAprovado =
        registro.papel === 'apadrinhado' && registro.status === 'em_andamento';
      const padrinhoAtivo =
        registro.papel === 'padrinho' && registro.status === 'em_andamento';

      if (!candidaturaAprovada && !apadrinhadoAprovado && !padrinhoAtivo) {
        throw new ConflictException(
          'Somente aprovações vigentes podem ser revogadas.',
        );
      }

      if (this.matchingDisponivel()) {
        const ativos = await manager
          .getRepository(MatchingVinculoEntity)
          .count({
            where: {
              ...(apadrinhadoAprovado
                ? { apadrinhadoParticipacaoId: registro.id }
                : { padrinhoParticipacaoId: registro.id }),
              ativo: true,
            },
          });
        if (ativos > 0) {
          throw new ConflictException(
            `Esta aprovação já foi usada no matching (${ativos} vínculo(s) ativo(s)). Encerre os vínculos antes de revogar a aprovação.`,
          );
        }
      }

      if (apadrinhadoAprovado && registro.grupo?.trim()) {
        throw new ConflictException(
          'Este apadrinhado já tem vínculo. Desfaça o vínculo antes de revogar a aprovação.',
        );
      }

      if (padrinhoAtivo) {
        const vinculados = registro.grupo?.trim()
          ? (
              await repo.find({
                where: {
                  programa: registro.programa,
                  grupo: registro.grupo,
                  papel: 'apadrinhado',
                  status: 'em_andamento',
                },
              })
            ).length
          : 0;
        if (vinculados > 0) {
          throw new ConflictException(
            'Este padrinho ainda tem apadrinhados vinculados. Desfaça os vínculos antes de revogar a aprovação.',
          );
        }
        registro.papel = 'candidato';
        registro.grupo = null;
        registro.apadrinhados = 0;
        registro.inicioEm = null;
      }

      registro.status = 'nao_aprovado';
      registro.terminoEm = new Date();
      registro.respostas = {
        ...registro.respostas,
        _servidor: {
          ...registro.respostas?._servidor,
          decisao: {
            resultado: 'nao_aprovado',
            justificativa: motivo,
            em: new Date().toISOString(),
            por: coordenador ?? null,
          },
        },
      };
      const salvo = await repo.save(registro);
      await this.retirarDoMatching(manager, salvo);
      return salvo;
    });
  }

  async temVinculoValido(
    registro: ParticipacaoEntity | null,
  ): Promise<boolean> {
    const repositorioVinculos = this.repositorioVinculos();
    if (registro && repositorioVinculos) {
      const campo =
        registro.papel === 'padrinho'
          ? { padrinhoParticipacaoId: registro.id }
          : registro.papel === 'apadrinhado'
            ? { apadrinhadoParticipacaoId: registro.id }
            : null;
      if (campo) {
        const existe = await repositorioVinculos.exists({
          where: { ...campo, ativo: true },
        });
        if (existe) return true;
      }
    }
    if (
      !registro ||
      registro.status !== 'em_andamento' ||
      !registro.grupo?.trim()
    )
      return false;
    if (!['padrinho', 'apadrinhado'].includes(registro.papel)) return false;
    const grupo = await this.participacoes.find({
      where: { programa: registro.programa, grupo: registro.grupo },
    });
    return ParticipacoesService.vinculoValido(registro, grupo);
  }

  /** Relações canônicas F11/F12; vazio permite ao chamador usar o legado. */
  async listarVinculados(
    registro: ParticipacaoEntity,
  ): Promise<Array<{ participacao: ParticipacaoEntity; vinculoId: number }>> {
    const repositorioVinculos = this.repositorioVinculos();
    if (!repositorioVinculos) return [];
    const comoPadrinho = registro.papel === 'padrinho';
    const comoApadrinhado = registro.papel === 'apadrinhado';
    if (!comoPadrinho && !comoApadrinhado) return [];
    const vinculos = await repositorioVinculos.find({
      where: {
        ...(comoPadrinho
          ? { padrinhoParticipacaoId: registro.id }
          : { apadrinhadoParticipacaoId: registro.id }),
        ativo: true,
      },
      order: { confirmadoEm: 'ASC', id: 'ASC' },
    });
    if (!vinculos.length) return [];
    const ids = vinculos.map((v) =>
      comoPadrinho ? v.apadrinhadoParticipacaoId : v.padrinhoParticipacaoId,
    );
    const pessoas = await this.participacoes.find({ where: { id: In(ids) } });
    return vinculos.flatMap((v) => {
      const id = comoPadrinho
        ? v.apadrinhadoParticipacaoId
        : v.padrinhoParticipacaoId;
      const participacao = pessoas.find((p) => p.id === id);
      return participacao ? [{ participacao, vinculoId: v.id }] : [];
    });
  }

  static vinculoValido(
    registro: ParticipacaoEntity,
    grupo: ParticipacaoEntity[],
  ): boolean {
    if (registro.status !== 'em_andamento' || !registro.grupo?.trim())
      return false;
    const ativos = grupo.filter(
      (r) =>
        r.programa === registro.programa &&
        r.grupo === registro.grupo &&
        r.status === 'em_andamento',
    );
    const padrinhos = ativos.filter((r) => r.papel === 'padrinho');
    if (padrinhos.length !== 1) return false;
    return registro.papel === 'padrinho'
      ? ativos.some(
          (r) =>
            r.papel === 'apadrinhado' && r.usuarioId !== registro.usuarioId,
        )
      : registro.papel === 'apadrinhado' &&
          padrinhos[0].usuarioId !== registro.usuarioId;
  }

  async situacaoDoRegistro(
    registro: ParticipacaoEntity | null,
  ): Promise<SituacaoAluno> {
    return ParticipacoesService.situacaoDe(
      registro,
      await this.temVinculoValido(registro),
    );
  }

  async buscarVarios(ids: number[]): Promise<ParticipacaoEntity[]> {
    if (!ids.length) return [];
    return this.participacoes.find({ where: { id: In(ids) } });
  }

  /**
   * Rota legada somente confirma a leitura de um vínculo já estabelecido.
   * Não cria participação nem aceita grupo arbitrário como matching.
   */
  async confirmarIngresso(
    dto: ConfirmarParticipacaoDto,
  ): Promise<ParticipacaoEntity> {
    const programa = dto.programa?.trim();
    if (!programa) throw new BadRequestException('Informe o programa.');
    await this.exigirCiclo(programa);
    const registro = await this.registroPrincipal(dto.usuarioId, programa);
    if (
      !registro ||
      registro.papel !== dto.papel ||
      !(await this.temVinculoValido(registro))
    ) {
      throw new BadRequestException(
        'Confirme o matching pela operação de vínculos da coordenação.',
      );
    }
    return registro;
  }

  async rejeitarCandidatura(
    dto: RejeitarCandidaturaDto,
  ): Promise<ParticipacaoEntity> {
    if (!dto.programa?.trim())
      throw new BadRequestException('Informe o programa.');
    const registro = await this.registroPrincipal(
      dto.usuarioId,
      dto.programa.trim(),
    );
    if (!registro) throw new NotFoundException('Candidatura não encontrada.');
    return this.rejeitarCandidaturaPorId(registro.id, dto.justificativa);
  }

  /** Mantém só campos conhecidos e limita o tamanho dos textos. */
  private limparRespostas(respostas: RespostasCadastro): RespostasCadastro {
    const texto = (valor: unknown, limite: number) =>
      typeof valor === 'string' && valor.trim()
        ? valor.trim().slice(0, limite)
        : undefined;
    const lista = (valor: unknown) =>
      Array.isArray(valor)
        ? valor
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 20)
        : undefined;
    const booleano = (valor: unknown) =>
      typeof valor === 'boolean' ? valor : undefined;
    const periodo = Number(respostas.periodo);

    const extras: Record<string, string | string[] | boolean> = {};
    if (respostas.extras && typeof respostas.extras === 'object') {
      for (const [chave, valor] of Object.entries(respostas.extras).slice(
        0,
        30,
      )) {
        if (Array.isArray(valor)) {
          extras[chave.slice(0, 60)] = lista(valor) ?? [];
        } else if (typeof valor === 'string') {
          extras[chave.slice(0, 60)] = valor.trim().slice(0, 1000);
        } else if (typeof valor === 'boolean') {
          extras[chave.slice(0, 60)] = valor;
        }
      }
    }

    const limpo: RespostasCadastro = {
      nome: texto(respostas.nome, 120),
      curso: texto(respostas.curso, 120),
      periodo: Number.isInteger(periodo) && periodo > 0 ? periodo : undefined,
      turno: texto(respostas.turno, 40),
      interesses: lista(respostas.interesses),
      genero: texto(respostas.genero, 40),
      bolsistaProuni: booleano(respostas.bolsistaProuni),
      deOutraCidade: booleano(respostas.deOutraCidade),
      disponibilidade: lista(respostas.disponibilidade),
      areas: lista(respostas.areas),
      motivacao: texto(respostas.motivacao, 500),
      experiencias: texto(respostas.experiencias, 300),
      declaraPreRequisitos: booleano(respostas.declaraPreRequisitos),
      requisitos: Array.isArray(respostas.requisitos)
        ? respostas.requisitos.slice(0, 20).map((r) => ({
            id: String(r.id).slice(0, 60),
            descricao: String(r.descricao).slice(0, 120),
            obrigatorio: r.obrigatorio === true,
            cumpre: r.cumpre === true,
          }))
        : undefined,
      expectativa: texto(respostas.expectativa, 500),
      outrasInformacoes: texto(respostas.outrasInformacoes, 300),
      extras: Object.keys(extras).length ? extras : undefined,
    };
    return Object.fromEntries(
      Object.entries(limpo).filter(([, valor]) => valor !== undefined),
    ) as RespostasCadastro;
  }

  private normalizarUsuario(usuarioId: string): string {
    const id = usuarioId?.trim();
    if (!id) {
      throw new BadRequestException('usuarioId é obrigatório.');
    }
    return id.toLowerCase();
  }
}

export type { PapelParticipacao };
