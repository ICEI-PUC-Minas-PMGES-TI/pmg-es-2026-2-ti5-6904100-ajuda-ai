import { resumirCompatibilidade } from './matching.politica.js';
import { avaliarCadastro } from './criterios-cadastro.js';
import { MatchingService } from './matching.service.js';
import type { DataSource } from 'typeorm';
import type { ChatService } from '../chat/chat.service.js';

describe('Política de compatibilidade v3', () => {
  it('10 pontos conhecidos em 100 não viram aderência de 100%', () => {
    const resultado = resumirCompatibilidade([
      { peso: 10, considerado: true, compativel: true, contribuicao: 10 },
      {
        peso: 90,
        considerado: false,
        contribuicao: 0,
        motivo: 'resposta_ausente',
      },
    ]);
    expect(resultado.score).toBe(0.1);
    expect(resultado.explicacao).toMatchObject({
      afinidade: 1,
      cobertura: 0.1,
      pesoConfigurado: 100,
      pesoConhecido: 10,
    });
  });
  it.each([false, true])(
    'condição obrigatória ausente ou violada impede sugestão: %s',
    (conhecido) => {
      const resultado = resumirCompatibilidade([
        {
          peso: 1,
          obrigatorio: true,
          considerado: conhecido,
          compativel: false,
          contribuicao: 0,
        },
        { peso: 99, considerado: true, compativel: true, contribuicao: 99 },
      ]);
      expect(resultado.sugerivel).toBe(false);
      expect(resultado.explicacao.viabilidade).toBe(
        conhecido ? 'inviavel' : 'dados_insuficientes',
      );
    },
  );
  it('ausência de afinidade é diferente de impedimento e de falta de dados', () => {
    expect(
      resumirCompatibilidade([
        { peso: 10, considerado: true, compativel: false, contribuicao: 0 },
      ]),
    ).toMatchObject({
      sugerivel: false,
      explicacao: {
        viabilidade: 'viavel',
        motivo: 'sem_afinidade',
        cobertura: 1,
      },
    });
    expect(
      resumirCompatibilidade([
        { peso: 10, considerado: false, contribuicao: 0 },
      ]),
    ).toMatchObject({
      sugerivel: false,
      explicacao: { motivo: 'dados_insuficientes', cobertura: 0 },
    });
  });
  it('neutralidade conhecida não é ausência e não gera pontos', () => {
    const resultado = resumirCompatibilidade([
      {
        peso: 100,
        considerado: false,
        contribuicao: 0,
        motivo: 'sem_preferencia',
      },
    ]);
    expect(resultado).toMatchObject({
      score: 0,
      sugerivel: false,
      explicacao: {
        afinidade: null,
        cobertura: 1,
        pesoNeutro: 100,
        motivo: 'sem_criterios_aplicaveis',
      },
    });
  });
  it('uma direção desconhecida de preferência tem cobertura parcial', () => {
    const criterio = avaliarCadastro(
      'preferenciaGenero',
      { genero: 'Masculino' },
      {
        genero: 'Feminino',
        preferenciaGenero: { modo: 'preferencia', generos: ['Masculino'] },
      },
    );
    const resultado = resumirCompatibilidade([
      { ...criterio, peso: 100, contribuicao: 100 * criterio.fator },
    ]);
    expect(resultado).toMatchObject({
      score: 0.5,
      explicacao: { afinidade: 1, cobertura: 0.5, pesoNeutro: 0 },
    });
    const neutra = avaliarCadastro(
      'preferenciaGenero',
      {
        genero: 'Masculino',
        preferenciaGenero: { modo: 'sem_preferencia', generos: [] },
      },
      {
        genero: 'Feminino',
        preferenciaGenero: { modo: 'preferencia', generos: ['Masculino'] },
      },
    );
    expect(
      resumirCompatibilidade([
        { ...neutra, peso: 100, contribuicao: 100 * neutra.fator },
      ]),
    ).toMatchObject({ score: 1, explicacao: { cobertura: 1, pesoNeutro: 50 } });
  });
  it('condições são opcionais; gênero exclusivo não é habilitado', () => {
    const service = new MatchingService({} as DataSource, {} as ChatService);
    const validar = (criterios: unknown[]) =>
      Reflect.get(service, 'validarCriterios').call(service, criterios, {
        campos: { padrinho: new Map(), apadrinhado: new Map() },
      });
    expect(() =>
      validar([
        {
          campoCadastro: 'areas',
          operacao: 'intersecao',
          peso: 10,
          obrigatorio: true,
        },
      ]),
    ).not.toThrow();
    expect(() =>
      validar([
        {
          campoCadastro: 'preferenciaGenero',
          operacao: 'preferencia_genero',
          peso: 10,
          obrigatorio: true,
        },
      ]),
    ).toThrow(/preferências ponderadas/);
    expect(() =>
      validar([
        {
          campoCadastro: 'bolsistaProuni',
          operacao: 'vivencia_compartilhada',
          peso: 10,
          obrigatorio: true,
        },
      ]),
    ).toThrow();
    expect(() =>
      validar([
        {
          campoCadastro: 'areas',
          operacao: 'intersecao',
          peso: 10,
          obrigatorio: null,
        },
      ]),
    ).toThrow();
  });
  it('áreas avaliam necessidades atendidas e interesses avaliam sobreposição proporcional', () => {
    expect(
      avaliarCadastro(
        'areas',
        { areas: ['Tecnologia', 'Projetos', 'Carreira'] },
        { areas: ['Tecnologia'] },
      ),
    ).toMatchObject({ fator: 1, compativel: true });
    expect(
      avaliarCadastro(
        'areas',
        { areas: [' Tecnologia ', 'tecnologia'] },
        { areas: ['Tecnologia', 'Projetos'] },
      ),
    ).toMatchObject({ fator: 0.5, itensEmComum: 1 });
    expect(
      avaliarCadastro(
        'interesses',
        { interesses: ['Esporte', 'Música'] },
        { interesses: ['Música', 'Projetos'] },
      ),
    ).toMatchObject({ fator: 1 / 3 });
  });
});
