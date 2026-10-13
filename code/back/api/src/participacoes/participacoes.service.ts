import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PapelParticipacao,
  ParticipacaoEntity,
  RespostasCadastro,
  StatusParticipacaoRegistro,
} from './entities/participacao.entity.js';

export interface RegistrarCandidaturaDto {
  usuarioId: string;
  programa?: string;
  respostas?: RespostasCadastro;
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
}

export type SituacaoAluno =
  | 'nenhuma'
  | 'candidatura_pendente'
  | 'candidatura_em_analise'
  | 'candidatura_rejeitada'
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
  ) {}

  static programaAtual(referencia = new Date()): string {
    const ano = referencia.getFullYear();
    const semestre = referencia.getMonth() < 6 ? 1 : 2;
    return `${ano}/${semestre}`;
  }

  /** Situação consolidada do aluno a partir dos registros de um ciclo. */
  static situacaoDe(registro: ParticipacaoEntity | null): SituacaoAluno {
    if (!registro) return 'nenhuma';
    if (registro.status === 'concluido') return 'concluido';
    if (registro.papel === 'padrinho') return 'padrinho_ativo';
    if (registro.papel === 'apadrinhado') {
      if (registro.status === 'pendente') return 'apadrinhado_pendente';
      if (registro.status === 'nao_aprovado') return 'apadrinhado_rejeitado';
      return registro.grupo?.trim()
        ? 'apadrinhado_ativo'
        : 'apadrinhado_aguardando';
    }
    if (registro.status === 'nao_aprovado') return 'candidatura_rejeitada';
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
   * Registra candidatura de padrinho no ciclo atual.
   * Idempotente: recarregar/reenviar não duplica. Enquanto a candidatura não
   * foi decidida, reenviar atualiza as respostas (edição da candidatura).
   * Não cria participação ativa de padrinho.
   */
  async registrarCandidaturaPadrinho(
    dto: RegistrarCandidaturaDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa =
      dto.programa?.trim() || ParticipacoesService.programaAtual();

    const padrinhoAtivo = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'padrinho' },
    });
    if (padrinhoAtivo) {
      return padrinhoAtivo;
    }

    const existente = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (existente) {
      const editavel =
        existente.status === 'pendente' || existente.status === 'em_analise';
      if (editavel && dto.respostas) {
        existente.respostas = this.limparRespostas(dto.respostas);
        return this.participacoes.save(existente);
      }
      return existente;
    }

    const registro = this.participacoes.create({
      usuarioId,
      programa,
      papel: 'candidato',
      status: 'pendente',
      apadrinhados: 0,
      inicioEm: new Date(),
      respostas: dto.respostas ? this.limparRespostas(dto.respostas) : null,
    });
    return this.participacoes.save(registro);
  }

  /**
   * Cadastro do apadrinhado no ciclo: nasce `pendente` (aguardando a
   * coordenação aprovar o cadastro) e, depois de aprovado, fica em andamento
   * sem grupo até o match. Idempotente; reenviar atualiza respostas enquanto
   * ainda não há vínculo nem rejeição.
   */
  async cadastrarApadrinhado(
    dto: CadastrarApadrinhadoDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa =
      dto.programa?.trim() || ParticipacoesService.programaAtual();

    const existente = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'apadrinhado' },
    });
    if (existente) {
      const editavel =
        !existente.grupo?.trim() && existente.status !== 'nao_aprovado';
      if (editavel && dto.respostas) {
        existente.respostas = this.limparRespostas(dto.respostas);
        return this.participacoes.save(existente);
      }
      return existente;
    }

    return this.participacoes.save(
      this.participacoes.create({
        usuarioId,
        programa,
        papel: 'apadrinhado',
        status: dto.statusInicial ?? 'pendente',
        apadrinhados: 0,
        inicioEm: new Date(),
        respostas: dto.respostas ? this.limparRespostas(dto.respostas) : null,
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
    const registro = await this.participacoes.findOne({ where: { id } });
    if (!registro || registro.papel !== 'candidato') {
      return null;
    }
    if (registro.status === 'pendente') {
      registro.status = 'em_analise';
      return this.participacoes.save(registro);
    }
    return registro;
  }

  /**
   * Aprova uma candidatura (por id) transformando-a em padrinho ativo. Para
   * apadrinhados, aprova o cadastro do ciclo (fica aguardando o match).
   */
  async aprovarCandidatura(id: number): Promise<ParticipacaoEntity> {
    const registro = await this.buscarPorId(id);
    if (registro.papel === 'padrinho') return registro;
    if (registro.papel === 'apadrinhado') {
      if (
        registro.status !== 'pendente' &&
        registro.status !== 'nao_aprovado'
      ) {
        return registro;
      }
      registro.status = 'em_andamento';
      registro.terminoEm = null;
      return this.participacoes.save(registro);
    }
    if (registro.papel !== 'candidato') {
      throw new BadRequestException('Apenas candidaturas podem ser aprovadas.');
    }
    registro.papel = 'padrinho';
    registro.status = 'em_andamento';
    registro.terminoEm = null;
    registro.inicioEm ??= new Date();
    return this.participacoes.save(registro);
  }

  /** Rejeita uma candidatura (por id). Padrinhos já aprovados não mudam. */
  async rejeitarCandidaturaPorId(id: number): Promise<ParticipacaoEntity> {
    const registro = await this.buscarPorId(id);
    if (registro.papel === 'apadrinhado') {
      if (registro.status === 'nao_aprovado') return registro;
      if (registro.status !== 'pendente') {
        throw new BadRequestException(
          'Apenas cadastros de apadrinhado aguardando análise podem ser rejeitados.',
        );
      }
      registro.status = 'nao_aprovado';
      registro.terminoEm = new Date();
      return this.participacoes.save(registro);
    }
    if (registro.papel !== 'candidato') {
      throw new BadRequestException(
        'Apenas candidaturas ainda não aprovadas podem ser rejeitadas.',
      );
    }
    if (registro.status === 'nao_aprovado') return registro;
    registro.status = 'nao_aprovado';
    registro.terminoEm = new Date();
    return this.participacoes.save(registro);
  }

  /** Volta a candidatura para análise (ex.: "Solicitar revisão"). */
  async atualizarCandidatura(
    id: number,
    dados: { status?: 'pendente' | 'em_analise'; observacoes?: string | null },
  ): Promise<ParticipacaoEntity> {
    const registro = await this.buscarPorId(id);
    if (dados.status) {
      if (registro.papel !== 'candidato') {
        throw new BadRequestException(
          'O status só pode ser alterado em candidaturas.',
        );
      }
      registro.status = dados.status;
      registro.terminoEm = null;
    }
    if (dados.observacoes !== undefined) {
      const texto = dados.observacoes?.trim() ?? '';
      registro.observacoes = texto ? texto.slice(0, 1000) : null;
    }
    return this.participacoes.save(registro);
  }

  /** Define o vínculo apadrinhado → padrinho, criando o grupo se preciso. */
  async vincular(
    apadrinhadoId: number,
    padrinhoId: number,
  ): Promise<{
    apadrinhado: ParticipacaoEntity;
    padrinho: ParticipacaoEntity;
  }> {
    const [apadrinhado, padrinho] = await Promise.all([
      this.buscarPorId(apadrinhadoId),
      this.buscarPorId(padrinhoId),
    ]);
    if (apadrinhado.papel !== 'apadrinhado') {
      throw new BadRequestException('Selecione um apadrinhado válido.');
    }
    if (apadrinhado.status !== 'em_andamento') {
      throw new BadRequestException(
        'O cadastro deste apadrinhado ainda não foi aprovado pela coordenação.',
      );
    }
    if (padrinho.papel !== 'padrinho') {
      throw new BadRequestException('Selecione um padrinho aprovado.');
    }
    if (apadrinhado.programa !== padrinho.programa) {
      throw new BadRequestException(
        'Apadrinhado e padrinho precisam ser do mesmo programa.',
      );
    }

    if (!padrinho.grupo?.trim()) {
      padrinho.grupo = await this.proximoGrupo(padrinho.programa);
    }
    const grupoAnterior = apadrinhado.grupo?.trim();
    apadrinhado.grupo = padrinho.grupo;
    await this.participacoes.save(apadrinhado);

    if (grupoAnterior && grupoAnterior !== padrinho.grupo) {
      await this.recontarApadrinhados(padrinho.programa, grupoAnterior);
    }
    padrinho.apadrinhados = (
      await this.listarApadrinhadosDoGrupo(padrinho.programa, padrinho.grupo)
    ).length;
    await this.participacoes.save(padrinho);
    return { apadrinhado, padrinho };
  }

  async buscarVarios(ids: number[]): Promise<ParticipacaoEntity[]> {
    if (!ids.length) return [];
    return this.participacoes.find({ where: { id: In(ids) } });
  }

  /**
   * Confirma ingresso efetivo no programa (aprovação / match).
   * Idempotente por usuarioId + programa + papel.
   */
  async confirmarIngresso(
    dto: ConfirmarParticipacaoDto,
  ): Promise<ParticipacaoEntity> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const papel = dto.papel;
    if (papel !== 'padrinho' && papel !== 'apadrinhado') {
      throw new BadRequestException('Papel inválido para ingresso.');
    }

    const programa =
      dto.programa?.trim() || ParticipacoesService.programaAtual();

    const existente = await this.participacoes.findOne({
      where: { usuarioId, programa, papel },
    });
    if (existente) {
      if (existente.status === 'em_analise') {
        existente.status = 'em_andamento';
        existente.inicioEm ??= new Date();
        if (dto.grupo !== undefined) existente.grupo = dto.grupo;
        if (dto.apadrinhados !== undefined) {
          existente.apadrinhados = dto.apadrinhados;
        }
        return this.participacoes.save(existente);
      }
      return existente;
    }

    const candidatura = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (candidatura && papel === 'padrinho') {
      candidatura.papel = 'padrinho';
      candidatura.status = 'em_andamento';
      candidatura.inicioEm = dto.inicioEm
        ? new Date(dto.inicioEm)
        : (candidatura.inicioEm ?? new Date());
      if (dto.grupo !== undefined) candidatura.grupo = dto.grupo;
      candidatura.apadrinhados = dto.apadrinhados ?? candidatura.apadrinhados;
      return this.participacoes.save(candidatura);
    }

    const registro = this.participacoes.create({
      usuarioId,
      programa,
      papel,
      status: 'em_andamento' satisfies StatusParticipacaoRegistro,
      apadrinhados: dto.apadrinhados ?? 0,
      inicioEm: dto.inicioEm ? new Date(dto.inicioEm) : new Date(),
    });
    if (dto.grupo !== undefined) {
      registro.grupo = dto.grupo;
    }
    return this.participacoes.save(registro);
  }

  async rejeitarCandidatura(
    dto: RejeitarCandidaturaDto,
  ): Promise<ParticipacaoEntity | null> {
    const usuarioId = this.normalizarUsuario(dto.usuarioId);
    const programa =
      dto.programa?.trim() || ParticipacoesService.programaAtual();

    const candidatura = await this.participacoes.findOne({
      where: { usuarioId, programa, papel: 'candidato' },
    });
    if (!candidatura) {
      return null;
    }
    if (candidatura.status === 'nao_aprovado') {
      return candidatura;
    }

    candidatura.status = 'nao_aprovado';
    candidatura.terminoEm = new Date();
    return this.participacoes.save(candidatura);
  }

  private async proximoGrupo(programa: string): Promise<string> {
    const padrinhos = await this.listarPorPrograma({
      programa,
      papel: 'padrinho',
    });
    const usados = new Set(
      padrinhos.map((p) => p.grupo?.trim()).filter(Boolean) as string[],
    );
    let numero = 1;
    while (usados.has(`Grupo ${String(numero).padStart(2, '0')}`)) numero++;
    return `Grupo ${String(numero).padStart(2, '0')}`;
  }

  private async recontarApadrinhados(programa: string, grupo: string) {
    const padrinho = await this.buscarPadrinhoDoGrupo(programa, grupo);
    if (!padrinho) return;
    padrinho.apadrinhados = (
      await this.listarApadrinhadosDoGrupo(programa, grupo)
    ).length;
    await this.participacoes.save(padrinho);
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

    const extras: Record<string, string | string[]> = {};
    if (respostas.extras && typeof respostas.extras === 'object') {
      for (const [chave, valor] of Object.entries(respostas.extras).slice(
        0,
        30,
      )) {
        if (Array.isArray(valor)) {
          extras[chave.slice(0, 60)] = lista(valor) ?? [];
        } else if (typeof valor === 'string') {
          extras[chave.slice(0, 60)] = valor.trim().slice(0, 1000);
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
