import {
  exigirConnectionStringAzure,
  minutosSas,
  resolverConnectionStringAzure,
  SAS_LEITURA_MAX_MINUTOS,
  SAS_LEITURA_PADRAO_MINUTOS,
} from './azure-storage.config.js';

describe('exigirConnectionStringAzure', () => {
  it('recusa ausência e o placeholder do exemplo', () => {
    expect(() => exigirConnectionStringAzure(undefined)).toThrow(/obrigatória/);
    expect(() => exigirConnectionStringAzure('  ')).toThrow(/obrigatória/);
    expect(() =>
      exigirConnectionStringAzure('cole-a-connection-string-aqui'),
    ).toThrow(/obrigatória/);
  });

  it('recusa formato inválido sem repetir o valor', () => {
    const segredo = 'valor-invalido-SEGREDO-NAO-LOGAR';
    expect(() => exigirConnectionStringAzure(segredo)).toThrow(/inválida/);
    try {
      exigirConnectionStringAzure(segredo);
    } catch (erro) {
      expect(String(erro)).not.toContain('SEGREDO');
      expect(String(erro)).not.toContain(segredo);
    }
  });
});

describe('resolverConnectionStringAzure', () => {
  it('em desenvolvimento aceita ausência e placeholder, sem repetir o valor', () => {
    for (const valor of [undefined, '', 'cole-a-connection-string-aqui']) {
      const r = resolverConnectionStringAzure(valor, 'development');
      expect(r).toEqual({
        aviso: expect.stringMatching(/só em desenvolvimento/),
      });
      expect(JSON.stringify(r)).not.toContain('cole-a-connection-string');
    }
  });

  it('em produção recusa ausência e placeholder', () => {
    expect(() =>
      resolverConnectionStringAzure(undefined, 'production'),
    ).toThrow(/obrigatória em produção/);
    expect(() =>
      resolverConnectionStringAzure(
        'cole-a-connection-string-aqui',
        'production',
      ),
    ).toThrow(/obrigatória em produção/);
  });

  it('valor inválido falha também fora de produção, sem repetir o segredo', () => {
    const segredo = 'valor-invalido-SEGREDO-NAO-LOGAR';
    expect(() => resolverConnectionStringAzure(segredo, 'development')).toThrow(
      /inválida/,
    );
    try {
      resolverConnectionStringAzure(segredo, undefined);
    } catch (erro) {
      expect(String(erro)).not.toContain('SEGREDO');
    }
  });
});

describe('minutosSas', () => {
  it('usa o padrão quando a variável está ausente', () => {
    expect(
      minutosSas(
        undefined,
        SAS_LEITURA_PADRAO_MINUTOS,
        SAS_LEITURA_MAX_MINUTOS,
        'AZURE_STORAGE_SAS_LEITURA_MINUTOS',
      ),
    ).toBe(15);
  });

  it('rejeita valor fora do intervalo', () => {
    expect(() =>
      minutosSas(
        '0',
        SAS_LEITURA_PADRAO_MINUTOS,
        SAS_LEITURA_MAX_MINUTOS,
        'AZURE_STORAGE_SAS_LEITURA_MINUTOS',
      ),
    ).toThrow(/entre 1 e 60/);
    expect(() =>
      minutosSas(
        '61',
        SAS_LEITURA_PADRAO_MINUTOS,
        SAS_LEITURA_MAX_MINUTOS,
        'AZURE_STORAGE_SAS_LEITURA_MINUTOS',
      ),
    ).toThrow(/entre 1 e 60/);
  });
});
