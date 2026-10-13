import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { ProgramasService } from '../programas/programas.service.js';
import {
  FormularioEntity,
  PerguntaFormulario,
  TipoFormulario,
  TipoPergunta,
} from './entities/formulario.entity.js';

const TIPOS_PERGUNTA: TipoPergunta[] = [
  'texto_curto',
  'texto_longo',
  'checklist',
  'dropdown',
  'upload',
];

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

  /** Formulário do programa (o salvo ou o padrão, ainda não publicado). */
  async obter(tipo: TipoFormulario, programa?: string) {
    const codigo = programa?.trim() || ParticipacoesService.programaAtual();
    const salvo = await this.formularios.findOne({
      where: { programa: codigo, tipo },
    });
    if (salvo) return this.serializar(salvo);
    return {
      id: null,
      programa: codigo,
      tipo,
      publicado: false,
      perguntas: PADRAO[tipo],
      atualizadoEm: null,
      salvo: false,
    };
  }

  /**
   * Visão do aluno: só devolve perguntas quando o formulário foi publicado.
   * Para padrinho, inclui SEMPRE os requisitos do ciclo (web e mobile leem
   * daqui), mesmo sem perguntas extras publicadas.
   */
  async obterPublicado(tipo: TipoFormulario, programa?: string) {
    const formulario = await this.obter(tipo, programa);
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

  async salvar(
    tipo: TipoFormulario,
    corpo: { programa?: string; publicado?: boolean; perguntas?: unknown },
  ) {
    const programa =
      corpo.programa?.trim() || ParticipacoesService.programaAtual();
    const perguntas = this.validarPerguntas(corpo.perguntas);
    const existente = await this.formularios.findOne({
      where: { programa, tipo },
    });
    const registro =
      existente ??
      this.formularios.create({ programa, tipo, publicado: false });
    registro.perguntas = perguntas;
    if (typeof corpo.publicado === 'boolean') {
      registro.publicado = corpo.publicado;
    }
    return this.serializar(await this.formularios.save(registro));
  }

  private validarPerguntas(entrada: unknown): PerguntaFormulario[] {
    if (!Array.isArray(entrada)) {
      throw new BadRequestException('Envie a lista de perguntas.');
    }
    if (entrada.length > 30) {
      throw new BadRequestException('O formulário aceita até 30 perguntas.');
    }
    const ids = new Set<string>();
    return entrada.map((bruta, index) => {
      const item = (bruta ?? {}) as Record<string, unknown>;
      const enunciado =
        typeof item.enunciado === 'string' ? item.enunciado.trim() : '';
      if (!enunciado) {
        throw new BadRequestException(
          `A pergunta ${index + 1} precisa de um enunciado.`,
        );
      }
      const tipo = item.tipo as TipoPergunta;
      if (!TIPOS_PERGUNTA.includes(tipo)) {
        throw new BadRequestException(
          `Tipo de resposta inválido na pergunta ${index + 1}.`,
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
      let id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 60)
          : `pergunta-${index + 1}`;
      while (ids.has(id)) id = `${id}-${index + 1}`;
      ids.add(id);
      return {
        id,
        enunciado: enunciado.slice(0, 200),
        tipo,
        opcoes: comOpcoes ? opcoes : [],
        obrigatoria: item.obrigatoria === true,
      };
    });
  }

  private serializar(registro: FormularioEntity) {
    return {
      id: registro.id,
      programa: registro.programa,
      tipo: registro.tipo,
      publicado: registro.publicado,
      perguntas: registro.perguntas ?? [],
      atualizadoEm: registro.atualizadoEm,
      salvo: true,
    };
  }
}
