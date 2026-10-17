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
import { ORDEM_ETAPAS } from './etapas.js';

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
  async criarNovoCiclo(codigo?: string): Promise<ProgramaEntity> {
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
    const [ano, semestre] = alvo.split('/').map(Number);
    const base = semestre === 1 ? `${ano}-02` : `${ano}-08`;
    const fimSemestre = semestre === 1 ? `${ano}-06` : `${ano}-12`;
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
        inscricoesInicio: `${base}-01`,
        inscricoesFim: `${base}-28`,
        analiseInicio: `${ano}-${semestre === 1 ? '03' : '09'}-01`,
        analiseFim: `${ano}-${semestre === 1 ? '03' : '09'}-30`,
        formacaoInicio: `${ano}-${semestre === 1 ? '04' : '10'}-01`,
        formacaoFim: `${ano}-${semestre === 1 ? '04' : '10'}-20`,
        andamentoInicio: `${ano}-${semestre === 1 ? '04' : '10'}-21`,
        andamentoFim: `${fimSemestre}-15`,
        encerramentoEm: `${fimSemestre}-20`,
        requisitosPadrinho: anterior?.requisitosPadrinho
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
    const programa = await this.buscarPorCodigo(codigo);
    if (!programa) {
      throw new NotFoundException(`Programa ${codigo} não encontrado.`);
    }

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
    for (const chave of [
      'inscricoesInicio',
      'inscricoesFim',
      'analiseInicio',
      'analiseFim',
      'formacaoInicio',
      'formacaoFim',
      'andamentoInicio',
      'andamentoFim',
      'encerramentoEm',
    ] as const) {
      const valor = corpo[chave];
      if (valor === undefined) continue;
      if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new BadRequestException(
          `Data inválida em ${chave} (use AAAA-MM-DD).`,
        );
      }
      programa[chave] = valor;
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
