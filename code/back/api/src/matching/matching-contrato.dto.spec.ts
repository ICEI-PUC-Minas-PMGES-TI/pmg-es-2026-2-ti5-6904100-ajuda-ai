import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CriterioMatchingDto } from './dto/matching.dto.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import type { Repository } from 'typeorm';
import type { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';

describe('Entrada e persistência dos critérios', () => {
  const validar = (entrada: Record<string, unknown>) =>
    validate(plainToInstance(CriterioMatchingDto, entrada), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  it.each([
    {
      criterioPadrinhoId: 1,
      criterioApadrinhadoId: 1,
      operacao: 'igualdade',
      peso: 10,
    },
    { campoCadastro: 'areas', operacao: 'intersecao', peso: 25 },
    {
      campoCadastro: 'areas',
      operacao: 'intersecao',
      peso: 25,
      obrigatorio: true,
    },
    {
      campoCadastro: 'preferenciaGenero',
      operacao: 'preferencia_genero',
      peso: 25,
    },
  ])('aceita os formatos de fonte documentados: %j', async (entrada) => {
    expect(await validar(entrada)).toHaveLength(0);
  });
  it.each([
    { campoCadastro: null, operacao: 'igualdade', peso: 10 },
    { campoCadastro: 'inventado', operacao: 'igualdade', peso: 10 },
    { operacao: 'igualdade', peso: 10 },
    { campoCadastro: 'areas', operacao: 'intersecao', peso: 0 },
    { campoCadastro: 'areas', operacao: 'intersecao', peso: 1.5 },
    { campoCadastro: 'areas', operacao: 'intersecao', peso: 101 },
    {
      campoCadastro: 'areas',
      operacao: 'intersecao',
      peso: 10,
      obrigatorio: 'sim',
    },
  ])(
    'recusa dados que seriam ignorados ou pesos inválidos: %j',
    async (entrada) => {
      expect((await validar(entrada)).length).toBeGreaterThan(0);
    },
  );
  it('preserva a preferência durante a limpeza e não cria respostas ausentes', () => {
    const service = new ParticipacoesService(
      {} as Repository<ParticipacaoEntity>,
      {} as Repository<ProgramaEntity>,
    );
    const limpar = Reflect.get(service, 'limparRespostas').bind(service);
    const preferenciaGenero = {
      modo: 'preferencia',
      generos: ['Feminino', 'Não binário'],
    };
    const entrada = {
      genero: 'Masculino',
      preferenciaGenero,
      bolsistaProuni: false,
      deOutraCidade: true,
      _servidor: { decisao: { resultado: 'aprovado' } },
    };
    const anterior = structuredClone(entrada);
    const resposta = limpar(entrada);
    expect(resposta.preferenciaGenero).toEqual(preferenciaGenero);
    expect(resposta.genero).toBe('Masculino');
    expect(resposta.bolsistaProuni).toBe(false);
    expect(resposta._servidor).toBeUndefined();
    expect(limpar({})).not.toHaveProperty('preferenciaGenero');
    expect(limpar({})).not.toHaveProperty('bolsistaProuni');
    expect(entrada).toEqual(anterior);
  });
});
