import {
  exigirConnectionStringAzure,
  minutosSas,
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
