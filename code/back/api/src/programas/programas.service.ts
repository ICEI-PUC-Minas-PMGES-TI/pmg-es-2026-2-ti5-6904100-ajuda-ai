import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { seedDemoHabilitado } from '../config/seguranca.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import {
  EtapaPrograma,
  ProgramaEntity,
  RequisitoPadrinho,
} from './entities/programa.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import { AvisoEntity } from '../avisos/entities/aviso.entity.js';
import { ORDEM_ETAPAS } from './etapas.js';
import { DATAS_PROGRAMA, validarCronograma } from './cronograma.js';

@Injectable()
export class ProgramasService implements OnModuleInit {
  constructor(
    @InjectRepository(ProgramaEntity)
    private readonly programas: Repository<ProgramaEntity>,
  ) {}

  async onModuleInit() {
    if (seedDemoHabilitado()) await this.garantirProgramaAtual();
  }

  async listar(): Promise<ProgramaEntity[]> {
    return this.programas.find({ order: { codigo: 'DESC' } });
  }

  /** Exclui somente o ciclo vazio, com confirmação e proteção concorrente. */
  async excluir(codigo: string, confirmacao: unknown) {
    if (confirmacao !== 'COORDENADOR') {
      throw new BadRequestException(
        'Digite COORDENADOR para confirmar a exclusão permanente.',
      );
    }
    const alvo = ProgramasService.validarCodigoCiclo(codigo ?? '');
    try {
      return await this.programas.manager.transaction(async (manager) => {
        const repo = manager.getRepository(ProgramaEntity);
        const programa = await repo.findOne({
          where: { codigo: alvo },
          lock: { mode: 'pessimistic_write' },
        });
        if (!programa) throw new NotFoundException('Programa não encontrado.');
        // Falha fechada se um banco tiver FK cascata não prevista no modelo.
        const cascatas = (await manager.query(
          "SELECT conname FROM pg_constraint WHERE contype = 'f' AND confrelid = to_regclass($1) AND confdeltype = 'c'",
          [repo.metadata?.tablePath ?? 'programas'],
        )) as Array<{ conname: string }>;
        if (cascatas.length)
          throw new ConflictException(
            'Exclusão bloqueada: há FK com cascade para programas. Revise o schema; nenhum registro foi excluído.',
          );
        const registros = await manager
          .getRepository(ParticipacaoEntity)
          .find({ where: { programa: alvo } });
        const formularios = await manager
          .getRepository(FormularioEntity)
          .find({ where: { programa: alvo } });
        const avisos = await manager
          .getRepository(AvisoEntity)
          .find({ where: { programa: alvo } });
        const dependencias = {
          candidaturas: registros.filter((r) => r.papel === 'candidato').length,
          participacoes: registros.length,
          vinculos: registros.filter((r) => r.grupo?.trim()).length,
          grupos: new Set(registros.map((r) => r.grupo?.trim()).filter(Boolean))
            .size,
          decisoes: registros.filter((r) => r.respostas?._servidor?.decisao)
            .length,
          historico: registros.filter(
            (r) =>
              r.status === 'concluido' ||
              r.status === 'nao_aprovado' ||
              r.terminoEm,
          ).length,
          formularios: formularios.length,
          comunicados: avisos.length,
        };
        if (registros.length || formularios.length || avisos.length) {
          const resumo = Object.entries(dependencias)
            .filter(([, n]) => n > 0)
            .map(([tipo, n]) => `${tipo}: ${n}`)
            .join('; ');
          throw new ConflictException({
            statusCode: 409,
            message: `Não é possível excluir o programa ${alvo}. Registros relacionados (${resumo}). Encerre o programa em vez de excluir.`,
            dependencias,
          });
        }
        await repo.delete({ id: programa.id });
        return { codigo: alvo, excluido: true };
      });
    } catch (erro) {
      if (
        (erro as { driverError?: { code?: string } })?.driverError?.code ===
        '23503'
      ) {
        throw new ConflictException(
          'Há outros registros vinculados ao programa. Encerre o programa em vez de excluir.',
        );
      }
      throw erro;
    }
  }

  async buscarPorCodigo(codigo: string): Promise<ProgramaEntity | null> {
    return this.programas.findOne({ where: { codigo } });
  }

  async garantirProgramaAtual(): Promise<ProgramaEntity> {
    const codigo = ParticipacoesService.programaAtual();
    const existente = await this.buscarPorCodigo(codigo);
    if (existente) {
      return existente;
    }
    // Criar um ciclo com calendário padrão é dado de demonstração: fora do
    // modo demo a coordenação precisa abrir o ciclo (Programas).
    if (!seedDemoHabilitado()) {
      throw new NotFoundException(
        `Ciclo ${codigo} não cadastrado. A coordenação precisa abrir o ciclo em Programas.`,
      );
    }

    const [ano, semestre] = codigo.split('/').map(Number);
    const base = semestre === 1 ? `${ano}-02` : `${ano}-08`;
    const fimSemestre = semestre === 1 ? `${ano}-06` : `${ano}-12`;

    const criado = this.programas.create({
      codigo,
      titulo: `Programa ${codigo}`,
      etapaAtual: 'analise' satisfies EtapaPrograma,
      inscricoesAbertas: false,
      formularioPublicado: true,
      matchingPendente: true,
      vagasApadrinhados: 80,
      gruposPrevistos: 25,
      inscricoesInicio: `${base}-01`,
      inscricoesFim: `${base}-28`,
      analiseInicio: `${ano}-${semestre === 1 ? '03' : '09'}-01`,
      analiseFim: `${ano}-${semestre === 1 ? '03' : '09'}-30`,
      formacaoInicio: `${ano}-${semestre === 1 ? '04' : '10'}-01`,
      formacaoFim: `${ano}-${semestre === 1 ? '04' : '10'}-20`,
      andamentoInicio: `${ano}-${semestre === 1 ? '04' : '10'}-21`,
      andamentoFim: `${fimSemestre}-15`,
      encerramentoEm: `${fimSemestre}-20`,
    });
    return this.programas.save(criado);
  }

  /**
   * Demo: garante um ciclo anterior encerrado para o seletor do painel.
   * Não inventa semestres na UI — só persiste se ainda não existir no banco.
   */
  async garantirProgramaHistoricoDemo(): Promise<void> {
    const codigo = '2026/1';
    const existente = await this.buscarPorCodigo(codigo);
    if (existente) return;
    await this.programas.save(
      this.programas.create({
        codigo,
        titulo: `Programa ${codigo}`,
        etapaAtual: 'encerramento' satisfies EtapaPrograma,
        inscricoesAbertas: false,
        formularioPublicado: true,
        matchingPendente: false,
        vagasApadrinhados: 80,
        gruposPrevistos: 25,
        inscricoesInicio: '2026-02-01',
        inscricoesFim: '2026-02-28',
        analiseInicio: '2026-03-01',
        analiseFim: '2026-03-30',
        formacaoInicio: '2026-04-01',
        formacaoFim: '2026-04-20',
        andamentoInicio: '2026-04-21',
        andamentoFim: '2026-06-15',
        encerramentoEm: '2026-06-20',
      }),
    );
  }

  async resolverConsulta(codigo?: string): Promise<ProgramaEntity | null> {
    if (codigo?.trim()) {
      const programa = await this.buscarPorCodigo(codigo.trim());
      if (!programa) throw new NotFoundException('Ciclo não cadastrado.');
      return programa;
    }
    const programas = await this.listar();
    if (programas.length > 1)
      throw new BadRequestException(
        'Informe explicitamente o programa para consultar sua situação.',
      );
    return programas[0] ?? null;
  }

  /** Contexto explícito ou único ciclo cadastrado elegível; nunca escolhe entre vários. */
  async resolverInscricao(codigo?: string): Promise<ProgramaEntity> {
    if (codigo?.trim()) {
      const ciclo = await this.buscarPorCodigo(codigo.trim());
      if (!ciclo)
        throw new BadRequestException(`Ciclo ${codigo} não cadastrado.`);
      this.validarInscricoes(ciclo);
      return ciclo;
    }
    const elegiveis = (await this.listar()).filter((ciclo) => {
      try {
        this.validarInscricoes(ciclo);
        return true;
      } catch {
        return false;
      }
    });
    if (elegiveis.length !== 1)
      throw new BadRequestException(
        'Informe o programa: não há um único ciclo elegível para inscrições.',
      );
    return elegiveis[0];
  }

  /** Datas de calendário inclusivas no fuso do programa, America/Sao_Paulo. */
  validarInscricoes(ciclo: ProgramaEntity, agora = new Date()): void {
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(agora);
    if (
      ciclo.etapaAtual !== 'inscricoes' ||
      !ciclo.inscricoesAbertas ||
      (ciclo.inscricoesInicio && hoje < ciclo.inscricoesInicio) ||
      (ciclo.inscricoesFim && hoje > ciclo.inscricoesFim)
    ) {
      throw new BadRequestException(
        'Inscrições indisponíveis para este ciclo.',
      );
    }
  }

  /** Requisitos para padrinho do ciclo ([] se não configurados). */
  async requisitosPadrinho(codigo?: string): Promise<RequisitoPadrinho[]> {
    const programa = await this.buscarPorCodigo(
      codigo?.trim() || ParticipacoesService.programaAtual(),
    );
    return programa?.requisitosPadrinho ?? [];
  }

  /** Valida e normaliza a lista de requisitos enviada pela coordenação. */
  static validarRequisitos(entrada: unknown): RequisitoPadrinho[] {
    if (!Array.isArray(entrada)) {
      throw new BadRequestException('Envie a lista de requisitos.');
    }
    if (entrada.length > 20) {
      throw new BadRequestException('O ciclo aceita até 20 requisitos.');
    }
    const ids = new Set<string>();
    const descricoes = new Set<string>();
    return entrada.map((bruto, index) => {
      const item = (bruto ?? {}) as Record<string, unknown>;
      const descricao =
        typeof item.descricao === 'string'
          ? item.descricao.trim().slice(0, 120)
          : '';
      if (!descricao) {
        throw new BadRequestException(
          `O requisito ${index + 1} precisa de uma descrição.`,
        );
      }
      const chave = descricao.toLowerCase();
      if (descricoes.has(chave)) {
        throw new BadRequestException(`Requisito repetido: ${descricao}.`);
      }
      descricoes.add(chave);
      let id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 60)
          : ProgramasService.slug(descricao) || `requisito-${index + 1}`;
      while (ids.has(id)) id = `${id}-${index + 1}`;
      ids.add(id);
      return { id, descricao, obrigatorio: item.obrigatorio !== false };
    });
  }

  private static slug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  /** `AAAA/1` ou `AAAA/2` (ex.: 2027/1). */
  static validarCodigoCiclo(codigo: string): string {
    const valor = codigo.trim();
    const partes = /^(\d{4})\/([12])$/.exec(valor);
    const ano = Number(partes?.[1]);
    if (!partes || ano < 2000 || ano > 2100) {
      throw new BadRequestException(
        'Código do ciclo inválido: use AAAA/1 ou AAAA/2 (ex.: 2027/1).',
      );
    }
    return valor;
  }

  /**
   * Abre um ciclo explicitamente (coordenação). Com `codigo`, cria aquele
   * semestre — inclusive o vigente pela data, ex. 2027/1 — sem depender da
   * data atual; sem `codigo`, sugere o semestre seguinte ao vigente. Recusa
   * (409) se o ciclo já existir, em vez de fingir que criou.
   */
  async criarNovoCiclo(codigo?: string, configuracao: Record<string, unknown> = {}): Promise<ProgramaEntity> {
    const alvo = codigo?.trim()
      ? ProgramasService.validarCodigoCiclo(codigo)
      : this.proximoCodigo();
    const existente = await this.buscarPorCodigo(alvo);
    if (existente) {
      throw new ConflictException(`O ciclo ${alvo} já existe.`);
    }
    // Novo ciclo começa com uma CÓPIA dos requisitos do ciclo mais recente
    // (editável depois); mudar um ciclo nunca altera o outro.
    const anterior = (await this.listar())
      .sort((a, b) => b.codigo.localeCompare(a.codigo))
      .find((p) => p.requisitosPadrinho);
    validarCronograma(configuracao, true);
    const datas = Object.fromEntries(Object.keys(DATAS_PROGRAMA).map(chave => [chave, configuracao[chave]]));
    return this.programas.save(
      this.programas.create({
        codigo: alvo,
        titulo: `Programa ${alvo}`,
        etapaAtual: 'inscricoes',
        inscricoesAbertas: true,
        formularioPublicado: false,
        matchingPendente: false,
        vagasApadrinhados: 80,
        gruposPrevistos: 25,
        ...datas,
        requisitosPadrinho: configuracao.requisitosPadrinho !== undefined
          ? ProgramasService.validarRequisitos(configuracao.requisitosPadrinho)
          : anterior?.requisitosPadrinho
          ? anterior.requisitosPadrinho.map((r) => ({ ...r }))
          : null,
      }),
    );
  }

  /** Atualiza etapa, flags, vagas e datas do programa (painel "Programas"). */
  async atualizar(
    codigo: string,
    corpo: Record<string, unknown>,
  ): Promise<ProgramaEntity> {
    const existente = await this.buscarPorCodigo(codigo);
    if (!existente) {
      throw new NotFoundException(`Programa ${codigo} não encontrado.`);
    }
    const programa = { ...existente };

    if (corpo.requisitosPadrinho !== undefined) {
      // Ciclo encerrado é histórico: seus requisitos não mudam mais.
      if (programa.etapaAtual === 'encerramento') {
        throw new BadRequestException(
          'Ciclo encerrado: os requisitos para padrinho não podem ser alterados.',
        );
      }
      programa.requisitosPadrinho = ProgramasService.validarRequisitos(
        corpo.requisitosPadrinho,
      );
    }
    if (corpo.etapaAtual !== undefined) {
      if (!ORDEM_ETAPAS.includes(corpo.etapaAtual as EtapaPrograma)) {
        throw new BadRequestException('Etapa do programa inválida.');
      }
      programa.etapaAtual = corpo.etapaAtual as EtapaPrograma;
    }
    for (const chave of [
      'inscricoesAbertas',
      'formularioPublicado',
      'matchingPendente',
    ] as const) {
      if (typeof corpo[chave] === 'boolean') programa[chave] = corpo[chave];
    }
    for (const chave of ['vagasApadrinhados', 'gruposPrevistos'] as const) {
      if (corpo[chave] !== undefined) {
        const valor = Number(corpo[chave]);
        if (!Number.isInteger(valor) || valor < 0 || valor > 10000) {
          throw new BadRequestException(`Valor inválido para ${chave}.`);
        }
        programa[chave] = valor;
      }
    }
    for (const chave of Object.keys(DATAS_PROGRAMA) as (keyof typeof DATAS_PROGRAMA)[]) {
      const valor = corpo[chave];
      if (valor === undefined) continue;
      if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new BadRequestException(
          `Data inválida em ${chave} (use AAAA-MM-DD).`,
        );
      }
      programa[chave] = valor;
    }
    if (Object.keys(DATAS_PROGRAMA).some(chave => corpo[chave] !== undefined)) {
      validarCronograma({ ...programa });
    }
    return this.programas.save(programa);
  }

  private proximoCodigo(): string {
    const atual = ParticipacoesService.programaAtual();
    const [ano, semestre] = atual.split('/').map(Number);
    if (semestre === 1) {
      return `${ano}/2`;
    }
    return `${ano + 1}/1`;
  }
}
