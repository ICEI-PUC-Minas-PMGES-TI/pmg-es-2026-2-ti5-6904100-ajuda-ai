import { BadRequestException } from '@nestjs/common';
import { ProgramasService } from '../src/programas/programas.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { validarCronograma } from '../src/programas/cronograma.js';
import { repositorioEmMemoria } from './helpers/repositorio-memoria.js';

function cronograma(codigo: string) {
  const [ano, semestre] = codigo.split('/');
  const dia = (mes: string, d: string) => `${ano}-${mes}-${d}`;
  return semestre === '1'
    ? {
        inscricoesInicio: dia('02', '01'),
        inscricoesFim: dia('02', '28'),
        analiseInicio: dia('03', '01'),
        analiseFim: dia('03', '30'),
        formacaoInicio: dia('04', '01'),
        formacaoFim: dia('04', '20'),
        andamentoInicio: dia('04', '21'),
        andamentoFim: dia('06', '15'),
        encerramentoEm: dia('06', '20'),
      }
    : {
        inscricoesInicio: dia('08', '01'),
        inscricoesFim: dia('08', '28'),
        analiseInicio: dia('09', '01'),
        analiseFim: dia('09', '30'),
        formacaoInicio: dia('10', '01'),
        formacaoFim: dia('10', '20'),
        andamentoInicio: dia('10', '21'),
        andamentoFim: dia('12', '15'),
        encerramentoEm: dia('12', '20'),
      };
}

describe('cronograma e requisitos por ciclo', () => {
  const registros: ProgramaEntity[] = [];
  const service = new ProgramasService(repositorioEmMemoria(registros));

  beforeEach(() => {
    registros.splice(0, registros.length);
  });

  it('exige datas reais e ordem entre as fases', async () => {
    expect(() => validarCronograma({ inscricoesInicio: '2026-02-31' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      validarCronograma({
        inscricoesInicio: '2026-03-10',
        inscricoesFim: '2026-03-01',
      }),
    ).toThrow(/Ordem do cronograma/);
    await expect(
      service.criarNovoCiclo('2027/1', { inscricoesInicio: '2027-02-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registros).toHaveLength(0);
  });

  it('grava o cronograma informado e isola requisitos de cada ciclo', async () => {
    const primeiro = await service.criarNovoCiclo('2026/1', {
      ...cronograma('2026/1'),
      requisitosPadrinho: [{ descricao: 'Requisito antigo' }],
    });
    const segundo = await service.criarNovoCiclo('2026/2', {
      ...cronograma('2026/2'),
      requisitosPadrinho: [{ descricao: 'Cálculo I', obrigatorio: true }],
    });
    expect(primeiro.inscricoesInicio).toBe('2026-02-01');
    expect(primeiro.requisitosPadrinho?.[0].descricao).toBe('Requisito antigo');
    expect(segundo.requisitosPadrinho?.[0].descricao).toBe('Cálculo I');

    await expect(
      service.atualizar('2026/2', { inscricoesFim: '2026-07-15' }),
    ).rejects.toThrow(/Ordem do cronograma/);

    const atualizado = await service.atualizar('2026/2', {
      requisitosPadrinho: [{ descricao: 'AED I', obrigatorio: false }],
      inscricoesFim: '2026-08-20',
    });
    expect(atualizado.requisitosPadrinho).toEqual([
      { id: 'aed-i', descricao: 'AED I', obrigatorio: false },
    ]);
    expect(atualizado.inscricoesFim).toBe('2026-08-20');
    expect((await service.buscarPorCodigo('2026/1'))?.requisitosPadrinho).toEqual(
      primeiro.requisitosPadrinho,
    );

    await service.atualizar('2026/1', { etapaAtual: 'encerramento' });
    await expect(
      service.atualizar('2026/1', {
        requisitosPadrinho: [{ descricao: 'Novo requisito' }],
      }),
    ).rejects.toThrow(/não podem ser alterados/);
    expect((await service.buscarPorCodigo('2026/1'))?.requisitosPadrinho).toEqual(
      primeiro.requisitosPadrinho,
    );
  });
});
