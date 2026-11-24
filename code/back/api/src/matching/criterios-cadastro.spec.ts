import { avaliarCadastro, CRITERIOS_CADASTRO } from './criterios-cadastro.js';
import { validarPreferenciaGenero } from '../participacoes/preferencia-genero.js';
import { MatchingService } from './matching.service.js';
import type { DataSource } from 'typeorm';
import type { ChatService } from '../chat/chat.service.js';

describe('Contrato de compatibilidade do cadastro', () => {
  const preferencia = (generos: string[]) => ({
    modo: 'preferencia' as const,
    generos,
  });
  const neutra = { modo: 'sem_preferencia' as const, generos: [] };
  it('mantém desconhecido diferente de sem preferência e copia a entrada', () => {
    expect(validarPreferenciaGenero(undefined)).toBeUndefined();
    expect(validarPreferenciaGenero(neutra)).toEqual(neutra);
    const entrada = preferencia(['Feminino']);
    const validada = validarPreferenciaGenero(entrada)!;
    entrada.generos.push('Masculino');
    expect(validada.generos).toEqual(['Feminino']);
  });
  it.each([
    null,
    false,
    '',
    [],
    {},
    { modo: 'exclusiva', generos: ['Feminino'] },
    { modo: 'sem_preferencia', generos: ['Feminino'] },
    { modo: 'preferencia', generos: [] },
    { modo: 'preferencia', generos: ['Feminino', 'Feminino'] },
    { modo: 'preferencia', generos: ['Prefiro não informar'] },
    { modo: 'preferencia', generos: ['inventado'] },
    { ...neutra, obrigatorio: true },
  ])('recusa preferência inválida: %j', (entrada) => {
    expect(() => validarPreferenciaGenero(entrada)).toThrow();
  });
  it('não deduz preferência a partir do próprio gênero', () => {
    expect(
      avaliarCadastro(
        'preferenciaGenero',
        { genero: 'Feminino' },
        { genero: 'Feminino' },
      ),
    ).toMatchObject({ considerado: false, motivo: 'resposta_ausente' });
    expect(
      avaliarCadastro(
        'preferenciaGenero',
        { preferenciaGenero: neutra },
        { preferenciaGenero: neutra },
      ),
    ).toMatchObject({ considerado: false, motivo: 'sem_preferencia' });
  });
  it('considera cada preferência declarada nos dois sentidos', () => {
    const p = {
      genero: 'Masculino',
      preferenciaGenero: preferencia(['Feminino', 'Não binário']),
    };
    const a = {
      genero: 'Feminino',
      preferenciaGenero: preferencia(['Masculino']),
    };
    expect(avaliarCadastro('preferenciaGenero', p, a)).toMatchObject({
      fator: 1,
      compativel: true,
    });
    expect(
      avaliarCadastro('preferenciaGenero', p, {
        ...a,
        preferenciaGenero: preferencia(['Feminino']),
      }),
    ).toMatchObject({ fator: 0.5, compativel: false });
    expect(
      avaliarCadastro('preferenciaGenero', { genero: 'Masculino' }, a),
    ).toMatchObject({ fator: 0.5, considerado: true, fracaoConhecida: 0.5 });
  });
  it('não trata gênero não informado como preferência atendida ou violada', () => {
    expect(
      avaliarCadastro(
        'preferenciaGenero',
        { preferenciaGenero: preferencia(['Feminino']) },
        { genero: 'Prefiro não informar' },
      ),
    ).toMatchObject({ considerado: false, motivo: 'resposta_ausente' });
  });
  it.each(['bolsistaProuni', 'deOutraCidade'] as const)(
    '%s valoriza vivência verdadeira e preserva desconhecidos',
    (campo) => {
      expect(
        avaliarCadastro(campo, { [campo]: true }, { [campo]: true }),
      ).toMatchObject({ considerado: true, fator: 1 });
      expect(
        avaliarCadastro(campo, { [campo]: true }, { [campo]: false }),
      ).toMatchObject({ considerado: true, fator: 0 });
      expect(
        avaliarCadastro(campo, { [campo]: false }, { [campo]: false }),
      ).toMatchObject({ considerado: false, motivo: 'vivencia_nao_aplicavel' });
      expect(avaliarCadastro(campo, {}, { [campo]: false })).toMatchObject({
        considerado: false,
        motivo: 'resposta_ausente',
      });
    },
  );
  it('modalidade online não cria compatibilidade de horários sozinha', () => {
    expect(
      avaliarCadastro(
        'disponibilidade',
        { disponibilidade: ['Online', 'Manhã'] },
        { disponibilidade: ['Online', 'Noite'] },
      ),
    ).toMatchObject({ considerado: true, fator: 0 });
    expect(
      avaliarCadastro(
        'disponibilidade',
        { disponibilidade: ['Online'] },
        { disponibilidade: ['Online'] },
      ),
    ).toMatchObject({ considerado: false });
    expect(
      avaliarCadastro(
        'disponibilidade',
        { disponibilidade: ['Noite'] },
        { disponibilidade: ['Noite'] },
      ),
    ).toMatchObject({ fator: 1 });
  });
  it('alimenta o serviço real sem perguntas extras e respeita os pesos configurados', () => {
    const service = new MatchingService({} as DataSource, {} as ChatService);
    const resultado = Reflect.get(service, 'pontuar').call(
      service,
      { respostas: { bolsistaProuni: true, areas: ['Tecnologia'] } },
      { respostas: { bolsistaProuni: true, areas: ['Carreira'] } },
      [
        {
          campoCadastro: 'bolsistaProuni',
          operacao: 'vivencia_compartilhada',
          peso: 80,
        },
        { campoCadastro: 'areas', operacao: 'intersecao', peso: 20 },
      ],
      { campos: { padrinho: new Map(), apadrinhado: new Map() } },
    );
    expect(resultado.score).toBe(0.8);
    expect(resultado.explicacao.pesoObtido).toBe(80);
  });
  it('valida fontes canônicas, rejeita fontes misturadas e duplicidade', () => {
    const service = new MatchingService({} as DataSource, {} as ChatService);
    const validar = (criterios: unknown[]) =>
      Reflect.get(service, 'validarCriterios').call(service, criterios, {
        campos: { padrinho: new Map(), apadrinhado: new Map() },
      });
    for (const f of CRITERIOS_CADASTRO)
      expect(() =>
        validar([{ campoCadastro: f.campo, operacao: f.operacao, peso: 10 }]),
      ).not.toThrow();
    const criterio = {
      campoCadastro: 'areas',
      operacao: 'intersecao',
      peso: 10,
    };
    expect(() => validar([criterio, criterio])).toThrow(/duplicados/);
    expect(() => validar([{ ...criterio, criterioPadrinhoId: 1 }])).toThrow(
      /Fonte/,
    );
    expect(() => validar([{ ...criterio, operacao: 'igualdade' }])).toThrow(
      /Fonte/,
    );
    expect(() =>
      validar([
        {
          criterioPadrinhoId: 1,
          criterioApadrinhadoId: 2,
          operacao: 'igualdade',
          peso: 10,
        },
      ]),
    ).toThrow(/equivalência/);
  });
  it('não compara versão histórica inexistente nem alternativas inventadas', () => {
    const service = new MatchingService({} as DataSource, {} as ChatService);
    const meta = {
      criterioId: 10,
      criterioVersao: 1,
      perguntaId: 'q',
      tipo: 'escolha_unica',
      nome: 'Apoio',
      rotulo: 'Apoio',
    };
    const versoes = new Map([
      [
        '10:1',
        {
          criterioId: 10,
          versao: 1,
          tipo: 'escolha_unica',
          alternativas: [{ id: 'real', rotulo: 'Apoio real' }],
        },
      ],
    ]);
    const participante = {
      respostas: {
        _servidor: {
          formulario: {
            perguntas: [
              {
                id: 'antiga',
                criterioId: 10,
                criterioVersao: 888,
                tipo: 'escolha_unica',
              },
            ],
          },
        },
      },
    };
    const metadado = Reflect.get(service, 'metadadoDaParticipacao').call(
      service,
      participante,
      meta,
      versoes,
    );
    expect(metadado).toBeUndefined();
    const valor = Reflect.get(service, 'valorPorCriterio').bind(service);
    const validado = { ...meta, alternativas: ['real'] };
    expect(
      valor({ respostas: { extras: { q: 'inventada' } } }, validado),
    ).toBeUndefined();
    expect(valor({ respostas: { extras: { q: 'real' } } }, validado)).toBe(
      'real',
    );
  });
});
