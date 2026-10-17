import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { seedDemoHabilitado } from '../config/seguranca.js';
import { AVISOS } from '../dados/dados.js';
import { AvisoEntity, PublicoAviso } from './entities/aviso.entity.js';

const PUBLICOS: PublicoAviso[] = ['todos', 'padrinhos', 'apadrinhados'];

@Injectable()
export class AvisosService implements OnModuleInit {
  constructor(
    @InjectRepository(AvisoEntity)
    private readonly avisos: Repository<AvisoEntity>,
  ) {}

  /**
   * Semeia os avisos de demonstração (SEED_DEMO_DATA=true) só quando a
   * tabela está vazia.
   */
  async onModuleInit() {
    if (!seedDemoHabilitado()) return;
    if ((await this.avisos.count()) > 0) return;
    await this.avisos.save(
      AVISOS.map((aviso) =>
        this.avisos.create({
          titulo: aviso.titulo,
          descricao: aviso.descricao,
          publico: 'todos',
          programa: null,
          criadoEm: new Date(`${aviso.data}T12:00:00`),
        }),
      ),
    );
  }

  /** Lista os avisos visíveis para o público informado (mais novos primeiro). */
  async listar(publico?: string) {
    const lista = await this.avisos.find({ order: { criadoEm: 'DESC' } });
    const filtro = publico?.trim();
    const visiveis =
      filtro === 'padrinhos' || filtro === 'apadrinhados'
        ? lista.filter((a) => a.publico === 'todos' || a.publico === filtro)
        : lista;
    return visiveis.slice(0, 50).map((aviso) => ({
      id: aviso.id,
      titulo: aviso.titulo,
      descricao: aviso.descricao,
      publico: aviso.publico,
      programa: aviso.programa,
      data: aviso.criadoEm.toISOString().slice(0, 10),
      criadoEm: aviso.criadoEm,
    }));
  }

  async criar(corpo: {
    titulo?: string;
    descricao?: string;
    publico?: string;
    programa?: string;
  }) {
    const titulo = corpo.titulo?.trim() ?? '';
    const descricao = corpo.descricao?.trim() ?? '';
    if (!titulo || !descricao) {
      throw new BadRequestException('Informe título e mensagem do comunicado.');
    }
    const publico = PUBLICOS.includes(corpo.publico as PublicoAviso)
      ? (corpo.publico as PublicoAviso)
      : 'todos';
    const salvo = await this.avisos.save(
      this.avisos.create({
        titulo: titulo.slice(0, 120),
        descricao: descricao.slice(0, 2000),
        publico,
        programa: corpo.programa?.trim() || null,
      }),
    );
    return {
      id: salvo.id,
      titulo: salvo.titulo,
      descricao: salvo.descricao,
      publico: salvo.publico,
      programa: salvo.programa,
      data: salvo.criadoEm.toISOString().slice(0, 10),
      criadoEm: salvo.criadoEm,
    };
  }
}
