import { isDeepStrictEqual } from 'node:util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ProgramasService } from '../programas/programas.service.js';
import { CAMPOS_FIXOS } from './campos-fixos.js';
import {
  FormularioEntity,
  PerguntaFormulario,
  StatusFormulario,
  TipoFormulario,
  tipoPerguntaMatching,
  tipoPerguntaSuportado,
} from './entities/formulario.entity.js';
import {
  normalizarCondicao,
  perguntasVisiveis,
} from './visibilidade-perguntas.js';

/** Status derivado: encerrado tem precedência, depois publicado, senão rascunho. */
export function statusDoFormulario(
  registro: Pick<FormularioEntity, 'publicado' | 'encerradoEm'>,
): StatusFormulario {
  if (registro.encerradoEm) return 'encerrado';
  return registro.publicado ? 'publicado' : 'rascunho';
}

/** Perguntas sugeridas quando o programa ainda não tem formulário salvo. */
const PADRAO: Record<TipoFormulario, PerguntaFormulario[]> = {
  apadrinhado: [
    {
      id: 'maior-dificuldade',
      enunciado: 'Qual sua maior dificuldade?',
      tipo: 'texto_curto',
      opcoes: [],
      obrigatoria: true,
    },
    {
      id: 'expectativas-apoio',
      enunciado: 'Quais são suas expectativas de apoio?',
      tipo: 'texto_longo',
      opcoes: [],
      obrigatoria: true,
    },
    {
      id: 'tipos-apoio',
      enunciado: 'Escolha uma ou mais opções',
      tipo: 'checklist',
      opcoes: [
        'Apoio acadêmico',
        'Orientação de carreira',
        'Apoio socioemocional',
      ],
      obrigatoria: false,
    },
    {
      id: 'area-apoio',
      enunciado: 'Áreas que você precisa de apoio',
      tipo: 'dropdown',
      opcoes: ['Acadêmico', 'Carreira', 'Socioemocional'],
      obrigatoria: false,
    },
  ],
  padrinho: [
    {
      id: 'como-conheceu',
      enunciado: 'Como você conheceu o programa?',
      tipo: 'dropdown',
      opcoes: ['Colegas', 'Professores', 'Redes sociais', 'Evento da PUC'],
      obrigatoria: false,
    },
  ],
};

@Injectable()
export class FormulariosService {
  constructor(
    @InjectRepository(FormularioEntity)
    private readonly formularios: Repository<FormularioEntity>,
    private readonly programasService: ProgramasService,
  ) {}

  static validarTipo(tipo: string): TipoFormulario {
    if (tipo !== 'padrinho' && tipo !== 'apadrinhado') {
      throw new BadRequestException('Tipo de formulário inválido.');
    }
    return tipo;
  }

  private async resolverCiclo(programa?: string): Promise<ProgramaEntity> {
    const ciclo = await this.programasService.resolverConsulta(programa);
    if (!ciclo)
      throw new BadRequestException(
        'Nenhum ciclo cadastrado para o formulário.',
      );
    return ciclo;
  }

  /** Formulário do programa (o salvo ou o padrão, ainda não publicado). */
  async obter(tipo: TipoFormulario, programa?: string) {
    const { codigo } = await this.resolverCiclo(programa);
    const salvo = await this.formularios.findOne({
      where: { programa: codigo, tipo },
    });
    if (salvo) return this.serializar(salvo);
    return {
      id: null,
      programa: codigo,
      tipo,
      publicado: false,
      status: 'rascunho' as StatusFormulario,
      versao: 0,
      encerradoEm: null,
      perguntas: PADRAO[tipo],
      atualizadoEm: null,
      salvo: false,
      camposFixos: CAMPOS_FIXOS[tipo],
    };
  }

  /** Formulários do programa, um por público (padrinho e apadrinhado). */
  async listar(programa?: string) {
    const [apadrinhado, padrinho] = await Promise.all([
      this.obter('apadrinhado', programa),
      this.obter('padrinho', programa),
    ]);
    return [apadrinhado, padrinho];
  }

  /**
   * Exclui o rascunho salvo; o programa volta às perguntas sugeridas. Quem já
   * foi publicado não sai: a numeração das versões das respostas depende dele.
   */
  async excluir(tipo: TipoFormulario, programa?: string) {
    const atual = await this.obter(tipo, programa);
    if (atual.status !== 'rascunho' || atual.versao > 0)
      throw new BadRequestException(
        'Só é possível excluir rascunhos que nunca foram publicados.',
      );
    await this.formularios.delete({ programa: atual.programa, tipo });
    return this.obter(tipo, atual.programa);
  }

  /**
   * Visão do aluno: só devolve perguntas quando o formulário foi publicado.
   * Para padrinho, inclui SEMPRE os requisitos do ciclo (web e mobile leem
   * daqui), mesmo sem perguntas extras publicadas.
   */
  async obterPublicado(tipo: TipoFormulario, programa?: string) {
    const formulario = await this.obter(tipo, programa);
    if (formulario.publicado)
      this.exigirPerguntasSuportadas(formulario.perguntas ?? []);
    const requisitos =
      tipo === 'padrinho'
        ? await this.programasService.requisitosPadrinho(formulario.programa)
        : [];
    return {
      ...formulario,
      perguntas: formulario.publicado ? formulario.perguntas : [],
      ...(tipo === 'padrinho' ? { requisitos } : {}),
    };
  }

  /**
   * Valida as respostas adicionais contra a versão publicada e devolve a foto
   * do formulário respondido (perguntas exatas + versão), que é gravada junto
   * da resposta. Formulário encerrado não aceita novas respostas. Sem
   * formulário publicado: padrinho não pode se inscrever; apadrinhado se
   * inscreve sem respostas adicionais (devolve `undefined`).
   */
  async validarRespostas(
    tipo: TipoFormulario,
    programa: string,
    extras: unknown,
  ) {
    const formulario = await this.obter(tipo, programa);
    if (formulario.status === 'encerrado')
      throw new BadRequestException(
        `Formulário de ${tipo} encerrado: não aceita novas respostas.`,
      );
    if (!formulario.publicado && tipo === 'padrinho')
      throw new BadRequestException('Formulário de padrinho não publicado.');
    const respostas = this.normalizarExtras(extras);
    if (!formulario.publicado) {
      if (Object.keys(respostas).length)
        throw new BadRequestException(
          'Formulário de apadrinhado não publicado.',
        );
      return undefined;
    }
    const perguntas = formulario.perguntas ?? [];
    this.exigirPerguntasSuportadas(perguntas);
    this.conferirRespostas(perguntas, respostas);
    return {
      id: formulario.id,
      programa: formulario.programa,
      tipo,
      versao: formulario.versao,
      perguntas: structuredClone(perguntas),
      atualizadoEm: formulario.atualizadoEm,
    };
  }

  private normalizarExtras(extras: unknown): Record<string, unknown> {
    if (extras == null) return {};
    if (typeof extras !== 'object' || Array.isArray(extras))
      throw new BadRequestException('Respostas adicionais inválidas.');
    return extras as Record<string, unknown>;
  }

  private conferirRespostas(
    perguntas: PerguntaFormulario[],
    respostas: Record<string, unknown>,
  ): void {
    const visiveis = perguntasVisiveis(perguntas, respostas);
    const idsVisiveis = new Set(visiveis.map((q) => q.id));
    for (const chave of Object.keys(respostas)) {
      if (!perguntas.some((q) => q.id === chave))
        throw new BadRequestException('Pergunta desconhecida no formulário.');
      if (!idsVisiveis.has(chave))
        throw new BadRequestException(
          'Resposta enviada para pergunta oculta pela lógica condicional.',
        );
    }
    for (const q of visiveis) {
      const valor = respostas[q.id];
      const vazio =
        valor == null ||
        valor === '' ||
        (typeof valor === 'string' && !valor.trim()) ||
        (Array.isArray(valor) && !valor.length);
      if (vazio) {
        if (q.obrigatoria)
          throw new BadRequestException(`Responda: ${q.enunciado}.`);
        continue;
      }
      if (q.tipo === 'checklist') {
        if (
          !Array.isArray(valor) ||
          valor.length > 20 ||
          valor.some((v) => typeof v !== 'string' || !q.opcoes.includes(v))
        ) {
          throw new BadRequestException(`Opção inválida: ${q.enunciado}.`);
        }
      } else if (q.tipo === 'sim_nao') {
        if (typeof valor !== 'boolean')
          throw new BadRequestException(`Resposta inválida: ${q.enunciado}.`);
      } else if (q.tipo === 'escolha_unica') {
        const ids = (q.alternativas ?? []).map((a) => a.id);
        if (typeof valor !== 'string' || !ids.includes(valor))
          throw new BadRequestException(`Opção inválida: ${q.enunciado}.`);
      } else if (q.tipo === 'multipla_escolha') {
        const ids = (q.alternativas ?? []).map((a) => a.id);
        if (
          !Array.isArray(valor) ||
          valor.length > 30 ||
          valor.some((v) => typeof v !== 'string' || !ids.includes(v))
        ) {
          throw new BadRequestException(`Opção inválida: ${q.enunciado}.`);
        }
      } else if (
        typeof valor !== 'string' ||
        valor.length > (q.tipo === 'texto_longo' ? 1000 : 300) ||
        (q.tipo === 'dropdown' && !q.opcoes.includes(valor))
      ) {
        throw new BadRequestException(`Resposta inválida: ${q.enunciado}.`);
      }
    }
  }

  async salvar(
    tipo: TipoFormulario,
    corpo: { programa?: string; publicado?: boolean; perguntas?: unknown },
  ) {
    const { codigo: programa } = await this.resolverCiclo(corpo.programa);
    const perguntas = this.validarPerguntas(corpo.perguntas);
    return this.comCicloBloqueado(programa, async (manager, ciclo) => {
      const repo = manager.getRepository(FormularioEntity);
      const registro =
        (await repo.findOne({ where: { programa, tipo } })) ??
        this.novoRegistro(repo, programa, tipo);
      const estavaPublicado = registro.publicado;
      const perguntasAnteriores = registro.perguntas;
      registro.perguntas = perguntas;
      if (corpo.publicado === true) {
        this.exigirCicloAberto(ciclo);
        registro.publicado = true;
        registro.encerradoEm = null;
      } else if (corpo.publicado === false && !registro.encerradoEm) {
        registro.publicado = false;
      }
      // Cada publicação, ou alteração de um formulário publicado, é uma versão.
      if (
        registro.publicado &&
        (!estavaPublicado || !isDeepStrictEqual(perguntasAnteriores, perguntas))
      )
        registro.versao = (registro.versao ?? 0) + 1;
      return this.serializar(await repo.save(registro));
    });
  }

  /** Encerra novas respostas; o que já foi enviado permanece intacto. */
  async encerrar(tipo: TipoFormulario, programa?: string) {
    const { codigo } = await this.resolverCiclo(programa);
    return this.comCicloBloqueado(codigo, async (manager) => {
      const repo = manager.getRepository(FormularioEntity);
      const registro = await repo.findOne({
        where: { programa: codigo, tipo },
      });
      if (!registro?.publicado)
        throw new BadRequestException(
          'Só é possível encerrar um formulário publicado.',
        );
      registro.publicado = false;
      registro.encerradoEm = new Date();
      return this.serializar(await repo.save(registro));
    });
  }

  /** Copia as perguntas para o programa de destino como novo rascunho. */
  async duplicar(
    tipo: TipoFormulario,
    corpo: { programaOrigem?: string; programaDestino?: string },
  ) {
    if (!corpo.programaDestino?.trim())
      throw new BadRequestException('Informe o programa de destino.');
    const origem = await this.obter(tipo, corpo.programaOrigem);
    const { codigo: destino } = await this.resolverCiclo(corpo.programaDestino);
    if (destino === origem.programa)
      throw new BadRequestException(
        'Escolha um programa de destino diferente do de origem.',
      );
    const perguntas = this.validarPerguntas(origem.perguntas);
    return this.comCicloBloqueado(destino, async (manager) => {
      const repo = manager.getRepository(FormularioEntity);
      if (await repo.findOne({ where: { programa: destino, tipo } }))
        throw new ConflictException(
          'O programa de destino já tem formulário salvo. Exclua o rascunho antes de duplicar.',
        );
      const registro = this.novoRegistro(repo, destino, tipo);
      registro.perguntas = perguntas;
      return this.serializar(await repo.save(registro));
    });
  }

  private novoRegistro(
    repo: Repository<FormularioEntity>,
    programa: string,
    tipo: TipoFormulario,
  ): FormularioEntity {
    return repo.create({
      programa,
      tipo,
      publicado: false,
      versao: 0,
      encerradoEm: null,
    });
  }

  /** Serializa alterações do mesmo programa e garante que o ciclo existe. */
  private comCicloBloqueado<T>(
    programa: string,
    acao: (manager: EntityManager, ciclo: ProgramaEntity) => Promise<T>,
  ): Promise<T> {
    return this.formularios.manager.transaction(async (manager) => {
      const ciclo = await manager.getRepository(ProgramaEntity).findOne({
        where: { codigo: programa },
        lock: { mode: 'pessimistic_write' },
      });
      if (!ciclo) throw new BadRequestException('Ciclo não cadastrado.');
      return acao(manager, ciclo);
    });
  }

  private exigirCicloAberto(ciclo: ProgramaEntity): void {
    if (ciclo.etapaAtual === 'encerramento')
      throw new BadRequestException(
        'Programa encerrado: não é possível publicar o formulário.',
      );
  }

  private exigirPerguntasSuportadas(perguntas: PerguntaFormulario[]): void {
    if (perguntas.some((q) => !q || !tipoPerguntaSuportado(q.tipo))) {
      throw new BadRequestException(
        'Formulário contém tipo de pergunta não suportado. A coordenação deve remover ou substituir a pergunta.',
      );
    }
  }

  private validarPerguntas(entrada: unknown): PerguntaFormulario[] {
    if (!Array.isArray(entrada)) {
      throw new BadRequestException('Envie a lista de perguntas.');
    }
    if (entrada.length > 30) {
      throw new BadRequestException('O formulário aceita até 30 perguntas.');
    }
    const ids = new Set<string>();
    const idsAnteriores = new Set<string>();
    const criteriosUsados = new Set<number>();
    return entrada.map((bruta, index) => {
      const item = (bruta ?? {}) as Record<string, unknown>;
      const enunciado =
        typeof item.enunciado === 'string' ? item.enunciado.trim() : '';
      if (!enunciado) {
        throw new BadRequestException(
          `A pergunta ${index + 1} precisa de um enunciado.`,
        );
      }
      const tipo = item.tipo;
      if (!tipoPerguntaSuportado(tipo)) {
        throw new BadRequestException(
          `Tipo de resposta inválido na pergunta ${index + 1}.`,
        );
      }
      const ehMatching = tipoPerguntaMatching(tipo);
      const criterioId =
        typeof item.criterioId === 'number'
          ? item.criterioId
          : Number(item.criterioId);
      const criterioVersao =
        typeof item.criterioVersao === 'number'
          ? item.criterioVersao
          : Number(item.criterioVersao);
      if (ehMatching) {
        if (!Number.isInteger(criterioId) || criterioId < 1)
          throw new BadRequestException(
            `A pergunta ${index + 1} de matching precisa estar vinculada a um critério do catálogo.`,
          );
        if (!Number.isInteger(criterioVersao) || criterioVersao < 1)
          throw new BadRequestException(
            `A pergunta ${index + 1} precisa da versão do critério.`,
          );
        if (criteriosUsados.has(criterioId))
          throw new BadRequestException(
            `O critério ${criterioId} já foi incluído neste formulário.`,
          );
        criteriosUsados.add(criterioId);
      } else if (Number.isInteger(criterioId) && criterioId > 0) {
        throw new BadRequestException(
          `A pergunta ${index + 1} comum não pode referenciar um critério de matching.`,
        );
      }
      const comOpcoes = tipo === 'checklist' || tipo === 'dropdown';
      const opcoes = Array.isArray(item.opcoes)
        ? item.opcoes
            .filter((op): op is string => typeof op === 'string')
            .map((op) => op.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 20)
        : [];
      if (comOpcoes && opcoes.length < 1) {
        throw new BadRequestException(
          `A pergunta ${index + 1} precisa de pelo menos uma opção.`,
        );
      }
      if (comOpcoes && new Set(opcoes).size !== opcoes.length) {
        throw new BadRequestException(
          `A pergunta ${index + 1} tem opções repetidas.`,
        );
      }
      const alternativas = Array.isArray(item.alternativas)
        ? item.alternativas
            .map((alt) => {
              const a = (alt ?? {}) as Record<string, unknown>;
              const id =
                typeof a.id === 'string' ? a.id.trim().slice(0, 60) : '';
              const rotulo =
                typeof a.rotulo === 'string'
                  ? a.rotulo.trim().slice(0, 80)
                  : '';
              return id && rotulo ? { id, rotulo } : null;
            })
            .filter((a): a is { id: string; rotulo: string } => Boolean(a))
            .slice(0, 30)
        : [];
      if (
        (tipo === 'escolha_unica' || tipo === 'multipla_escolha') &&
        alternativas.length < 1
      ) {
        throw new BadRequestException(
          `A pergunta ${index + 1} precisa das alternativas do critério.`,
        );
      }
      // LEGADO: matching=true em checklist/dropdown sem critério — ainda aceito
      // na leitura, mas novas perguntas devem nascer com criterioId.
      if (item.matching === true && !comOpcoes && !ehMatching) {
        throw new BadRequestException(
          `A pergunta ${index + 1} só pode marcar matching legado se tiver alternativas.`,
        );
      }
      const ajuda =
        typeof item.ajuda === 'string' ? item.ajuda.trim().slice(0, 300) : '';
      const secao =
        typeof item.secao === 'string' ? item.secao.trim().slice(0, 60) : '';
      let id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 60)
          : `pergunta-${index + 1}`;
      while (ids.has(id)) id = `${id}-${index + 1}`;
      ids.add(id);
      const visivelSe = normalizarCondicao(
        item.visivelSe,
        index,
        idsAnteriores,
        index + 1,
      );
      idsAnteriores.add(id);
      return {
        id,
        enunciado: enunciado.slice(0, 200),
        tipo,
        opcoes: comOpcoes ? opcoes : [],
        ...(alternativas.length ? { alternativas } : {}),
        obrigatoria: item.obrigatoria === true,
        ...(ajuda ? { ajuda } : {}),
        ...(secao ? { secao } : {}),
        ...(ehMatching
          ? { criterioId, criterioVersao, matching: true }
          : item.matching === true
            ? { matching: true }
            : {}),
        ...(visivelSe ? { visivelSe } : {}),
      };
    });
  }

  private serializar(registro: FormularioEntity) {
    return {
      id: registro.id,
      programa: registro.programa,
      tipo: registro.tipo,
      publicado: registro.publicado,
      status: statusDoFormulario(registro),
      versao: registro.versao ?? 0,
      encerradoEm: registro.encerradoEm ?? null,
      perguntas: registro.perguntas ?? [],
      atualizadoEm: registro.atualizadoEm,
      salvo: true,
      camposFixos: CAMPOS_FIXOS[registro.tipo],
      perguntasNaoSuportadas: (registro.perguntas ?? [])
        .filter((q) => !tipoPerguntaSuportado(q.tipo))
        .map((q) => ({ id: q.id, tipo: q.tipo })),
    };
  }
}
