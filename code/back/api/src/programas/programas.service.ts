import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { EtapaPrograma, ProgramaEntity } from './entities/programa.entity.js';

@Injectable()
export class ProgramasService implements OnModuleInit {
  constructor(
    @InjectRepository(ProgramaEntity)
    private readonly programas: Repository<ProgramaEntity>,
  ) {}

  async onModuleInit() {
    await this.garantirProgramaAtual();
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

  async criarNovoCiclo(codigo?: string): Promise<ProgramaEntity> {
    const alvo = codigo?.trim() || this.proximoCodigo();
    const existente = await this.buscarPorCodigo(alvo);
    if (existente) {
      return existente;
    }
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
      }),
    );
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
