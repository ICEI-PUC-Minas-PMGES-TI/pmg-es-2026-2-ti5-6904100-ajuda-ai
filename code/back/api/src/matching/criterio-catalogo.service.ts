import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike } from 'typeorm';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import {
  AtualizarCriterioCatalogoDto,
  SalvarCriterioCatalogoDto,
} from './dto/criterio-catalogo.dto.js';
import {
  AlternativaCriterio,
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
  TipoCriterioCatalogo,
} from './entities/criterio-catalogo.entity.js';
import { MatchingConfiguracaoEntity } from './entities/matching.entity.js';

function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function slugAlternativa(rotulo: string, usados: Set<string>): string {
  let base = rotulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  if (!base) base = 'opcao';
  let id = base;
  let n = 2;
  while (usados.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  usados.add(id);
  return id;
}

@Injectable()
export class CriterioCatalogoService {
  constructor(@InjectDataSource() private readonly dados: DataSource) {}

  private validarAlternativas(
    tipo: TipoCriterioCatalogo,
    entrada: Array<{ id?: string; rotulo: string }> | undefined,
    anteriores?: AlternativaCriterio[],
  ): AlternativaCriterio[] {
    if (tipo === 'sim_nao') {
      if (entrada?.length)
        throw new BadRequestException(
          'Critérios Sim/Não não possuem alternativas livres.',
        );
      return [
        { id: 'true', rotulo: 'Sim' },
        { id: 'false', rotulo: 'Não' },
      ];
    }
    if (!entrada?.length)
      throw new BadRequestException(
        'Informe ao menos uma alternativa para este tipo de critério.',
      );
    const rotulos = new Set<string>();
    const usados = new Set<string>();
    const porIdAnterior = new Map(
      (anteriores ?? []).map((a) => [a.id, a] as const),
    );
    return entrada.map((item, index) => {
      const rotulo = item.rotulo?.trim().slice(0, 80) ?? '';
      if (!rotulo)
        throw new BadRequestException(
          `A alternativa ${index + 1} precisa de um rótulo.`,
        );
      const chave = rotulo.toLowerCase();
      if (rotulos.has(chave))
        throw new BadRequestException(`Alternativa duplicada: ${rotulo}.`);
      rotulos.add(chave);
      let id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 60)
          : '';
      if (id && usados.has(id))
        throw new BadRequestException(
          `Identificador de alternativa repetido: ${id}.`,
        );
      if (!id) {
        const antigo = anteriores?.find(
          (a) => a.rotulo.toLowerCase() === chave,
        );
        id = antigo?.id ?? slugAlternativa(rotulo, usados);
      } else {
        usados.add(id);
        if (porIdAnterior.has(id) === false && anteriores?.length) {
          // id novo explícito é permitido em nova versão
        }
      }
      return { id, rotulo };
    });
  }

  private mudancaEstrutural(
    atual: MatchingCriterioVersaoEntity,
    tipo: TipoCriterioCatalogo,
    alternativas: AlternativaCriterio[],
  ): boolean {
    if (atual.tipo !== tipo) return true;
    const idsAtuais = atual.alternativas
      .map((a) => a.id)
      .sort()
      .join('|');
    const idsNovos = alternativas
      .map((a) => a.id)
      .sort()
      .join('|');
    if (idsAtuais !== idsNovos) return true;
    return false;
  }

  async listar(busca?: string) {
    const where = busca?.trim()
      ? [
          { nome: ILike(`%${busca.trim()}%`) },
          { descricao: ILike(`%${busca.trim()}%`) },
        ]
      : undefined;
    const criterios = await this.dados
      .getRepository(MatchingCriterioEntity)
      .find({
        where,
        order: { nome: 'ASC', id: 'ASC' },
      });
    const versoes = await this.dados
      .getRepository(MatchingCriterioVersaoEntity)
      .find({ order: { criterioId: 'ASC', versao: 'DESC' } });
    const porCriterio = new Map<number, MatchingCriterioVersaoEntity>();
    for (const v of versoes) {
      if (!porCriterio.has(v.criterioId)) porCriterio.set(v.criterioId, v);
    }
    const usos = await this.usosPorCriterio(criterios.map((c) => c.id));
    return criterios.map((c) => ({
      ...c,
      versao: porCriterio.get(c.id) ?? null,
      usos: usos.get(c.id) ?? { formularios: [], configuracoes: 0 },
      semelhantes: [],
    }));
  }

  async obter(id: number) {
    const criterio = await this.dados
      .getRepository(MatchingCriterioEntity)
      .findOne({ where: { id } });
    if (!criterio) throw new NotFoundException('Critério não encontrado.');
    const versoes = await this.dados
      .getRepository(MatchingCriterioVersaoEntity)
      .find({ where: { criterioId: id }, order: { versao: 'DESC' } });
    const usos = await this.usosPorCriterio([id]);
    const semelhantes = await this.buscarSemelhantes(criterio.nome, id);
    return {
      ...criterio,
      versoes,
      versao: versoes[0] ?? null,
      usos: usos.get(id) ?? { formularios: [], configuracoes: 0 },
      semelhantes,
    };
  }

  async listarAtivosParaFormulario() {
    const criterios = await this.dados
      .getRepository(MatchingCriterioEntity)
      .find({
        where: { ativo: true },
        order: { nome: 'ASC' },
      });
    const resultado = [];
    for (const c of criterios) {
      const versao = await this.versaoAtual(this.dados.manager, c.id);
      if (versao) resultado.push({ ...c, versao });
    }
    return resultado;
  }

  /** Prévia de nomes parecidos — não funde nem bloqueia criação. */
  async sugerirSemelhantes(nome: string, excetoId?: number) {
    if (!nome?.trim()) return [];
    return this.buscarSemelhantes(nome, excetoId);
  }

  async criar(dto: SalvarCriterioCatalogoDto, responsavel: string) {
    const nome = dto.nome.trim();
    if (!nome) throw new BadRequestException('Informe o nome do critério.');
    const nomeNormalizado = normalizarNome(nome);
    const enunciado = dto.enunciadoPadrao.trim();
    if (!enunciado)
      throw new BadRequestException('Informe o enunciado padrão da pergunta.');
    const alternativas = this.validarAlternativas(dto.tipo, dto.alternativas);
    return this.dados.transaction(async (manager) => {
      const repo = manager.getRepository(MatchingCriterioEntity);
      const existente = await repo.findOne({ where: { nomeNormalizado } });
      if (existente)
        throw new ConflictException(
          `Já existe um critério com o nome “${existente.nome}”.`,
        );
      const criterio = await repo.save(
        repo.create({
          nome: nome.slice(0, 120),
          nomeNormalizado,
          descricao: dto.descricao?.trim().slice(0, 1000) || null,
          ativo: dto.ativo !== false,
          versaoAtual: 1,
          criadoPor: responsavel,
        }),
      );
      await manager.getRepository(MatchingCriterioVersaoEntity).save(
        manager.getRepository(MatchingCriterioVersaoEntity).create({
          criterioId: criterio.id,
          versao: 1,
          enunciadoPadrao: enunciado.slice(0, 200),
          tipo: dto.tipo,
          alternativas,
          criadoPor: responsavel,
        }),
      );
      return this.obterComManager(manager, criterio.id);
    });
  }

  async atualizar(
    id: number,
    dto: AtualizarCriterioCatalogoDto,
    responsavel: string,
  ) {
    return this.dados.transaction(async (manager) => {
      const repo = manager.getRepository(MatchingCriterioEntity);
      const criterio = await repo.findOne({ where: { id } });
      if (!criterio) throw new NotFoundException('Critério não encontrado.');
      const versaoAtual = await this.versaoAtual(manager, id);
      if (!versaoAtual)
        throw new ConflictException('Critério sem versão utilizável.');

      if (dto.nome !== undefined) {
        const nome = dto.nome.trim();
        if (!nome) throw new BadRequestException('Informe o nome do critério.');
        const nomeNormalizado = normalizarNome(nome);
        const conflito = await repo.findOne({ where: { nomeNormalizado } });
        if (conflito && conflito.id !== id)
          throw new ConflictException(
            `Já existe um critério com o nome “${conflito.nome}”.`,
          );
        criterio.nome = nome.slice(0, 120);
        criterio.nomeNormalizado = nomeNormalizado;
      }
      if (dto.descricao !== undefined)
        criterio.descricao =
          dto.descricao === null
            ? null
            : dto.descricao.trim().slice(0, 1000) || null;
      if (dto.ativo !== undefined) criterio.ativo = dto.ativo;

      const tipo = dto.tipo ?? versaoAtual.tipo;
      const enunciado = (
        dto.enunciadoPadrao ?? versaoAtual.enunciadoPadrao
      ).trim();
      if (!enunciado)
        throw new BadRequestException('Informe o enunciado padrão.');
      const alternativas = this.validarAlternativas(
        tipo,
        tipo === 'sim_nao'
          ? undefined
          : (dto.alternativas ??
              versaoAtual.alternativas.map((a) => ({
                id: a.id,
                rotulo: a.rotulo,
              }))),
        versaoAtual.alternativas,
      );

      const estrutural = this.mudancaEstrutural(
        versaoAtual,
        tipo,
        alternativas,
      );
      const soRotulos =
        !estrutural &&
        (dto.alternativas !== undefined ||
          dto.enunciadoPadrao !== undefined ||
          dto.tipo !== undefined);

      if (estrutural) {
        const usos = await this.usosPorCriterio([id], manager);
        const uso = usos.get(id);
        if (
          (uso?.formularios.length ?? 0) > 0 ||
          (uso?.configuracoes ?? 0) > 0
        ) {
          criterio.versaoAtual += 1;
          await manager.getRepository(MatchingCriterioVersaoEntity).save(
            manager.getRepository(MatchingCriterioVersaoEntity).create({
              criterioId: id,
              versao: criterio.versaoAtual,
              enunciadoPadrao: enunciado.slice(0, 200),
              tipo,
              alternativas,
              criadoPor: responsavel,
            }),
          );
        } else {
          versaoAtual.enunciadoPadrao = enunciado.slice(0, 200);
          versaoAtual.tipo = tipo;
          versaoAtual.alternativas = alternativas;
          await manager
            .getRepository(MatchingCriterioVersaoEntity)
            .save(versaoAtual);
        }
      } else if (soRotulos) {
        versaoAtual.enunciadoPadrao = enunciado.slice(0, 200);
        versaoAtual.alternativas = alternativas;
        await manager
          .getRepository(MatchingCriterioVersaoEntity)
          .save(versaoAtual);
      }

      await repo.save(criterio);
      return this.obterComManager(manager, id);
    });
  }

  async desativar(id: number, ativo: boolean, responsavel: string) {
    return this.atualizar(id, { ativo }, responsavel);
  }

  async excluir(id: number) {
    return this.dados.transaction(async (manager) => {
      const criterio = await manager
        .getRepository(MatchingCriterioEntity)
        .findOne({ where: { id } });
      if (!criterio) throw new NotFoundException('Critério não encontrado.');
      const usos = await this.usosPorCriterio([id], manager);
      const uso = usos.get(id);
      if ((uso?.formularios.length ?? 0) > 0 || (uso?.configuracoes ?? 0) > 0)
        throw new ConflictException(
          'Não é possível excluir: o critério está em uso. Desative-o para novos usos.',
        );
      await manager
        .getRepository(MatchingCriterioVersaoEntity)
        .delete({ criterioId: id });
      await manager.getRepository(MatchingCriterioEntity).delete(id);
      return { ok: true };
    });
  }

  async versaoAtual(manager: EntityManager, criterioId: number) {
    return manager.getRepository(MatchingCriterioVersaoEntity).findOne({
      where: { criterioId },
      order: { versao: 'DESC' },
    });
  }

  async obterVersao(
    manager: EntityManager,
    criterioId: number,
    versao: number,
  ) {
    return manager.getRepository(MatchingCriterioVersaoEntity).findOne({
      where: { criterioId, versao },
    });
  }

  private async obterComManager(manager: EntityManager, id: number) {
    const criterio = await manager
      .getRepository(MatchingCriterioEntity)
      .findOneOrFail({ where: { id } });
    const versoes = await manager
      .getRepository(MatchingCriterioVersaoEntity)
      .find({ where: { criterioId: id }, order: { versao: 'DESC' } });
    const usos = await this.usosPorCriterio([id], manager);
    return {
      ...criterio,
      versoes,
      versao: versoes[0] ?? null,
      usos: usos.get(id) ?? { formularios: [], configuracoes: 0 },
    };
  }

  private async buscarSemelhantes(nome: string, excetoId?: number) {
    const norm = normalizarNome(nome);
    const todos = await this.dados.getRepository(MatchingCriterioEntity).find({
      order: { nome: 'ASC' },
    });
    return todos
      .filter((c) => c.id !== excetoId)
      .filter((c) => {
        const outro = c.nomeNormalizado;
        return (
          outro === norm ||
          outro.includes(norm) ||
          norm.includes(outro) ||
          (norm.length >= 4 &&
            outro.length >= 4 &&
            (outro.startsWith(norm.slice(0, 4)) ||
              norm.startsWith(outro.slice(0, 4))))
        );
      })
      .slice(0, 5)
      .map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }));
  }

  private async usosPorCriterio(
    ids: number[],
    manager: EntityManager = this.dados.manager,
  ) {
    const mapa = new Map<
      number,
      {
        formularios: Array<{
          programa: string;
          tipo: string;
          versao: number;
        }>;
        configuracoes: number;
      }
    >();
    for (const id of ids) mapa.set(id, { formularios: [], configuracoes: 0 });
    if (!ids.length) return mapa;

    const formularios = await manager.getRepository(FormularioEntity).find();
    for (const form of formularios) {
      for (const pergunta of form.perguntas ?? []) {
        const criterioId = Number(
          (pergunta as { criterioId?: unknown }).criterioId,
        );
        if (!ids.includes(criterioId)) continue;
        mapa.get(criterioId)!.formularios.push({
          programa: form.programa,
          tipo: form.tipo,
          versao: form.versao,
        });
      }
    }

    const configs = await manager
      .getRepository(MatchingConfiguracaoEntity)
      .find();
    for (const config of configs) {
      for (const item of config.criterios ?? []) {
        const bruto = item as {
          criterioPadrinhoId?: number;
          criterioApadrinhadoId?: number;
          criterioId?: number;
        };
        const idsCfg = [
          bruto.criterioPadrinhoId,
          bruto.criterioApadrinhadoId,
          bruto.criterioId,
        ].filter((v): v is number => typeof v === 'number');
        for (const id of idsCfg) {
          if (mapa.has(id)) mapa.get(id)!.configuracoes += 1;
        }
      }
    }
    return mapa;
  }
}
