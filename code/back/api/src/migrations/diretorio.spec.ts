import { readdirSync } from 'node:fs';

/**
 * O CLI do TypeORM carrega `dist/migrations/*.js` e instancia toda função
 * exportada desses arquivos como migration. Um helper exportado aqui quebra
 * `migration:run` com `migrationClass is not a constructor`, sem precisar de
 * banco para falhar. Este teste reproduz a regra: cada função exportada de
 * um arquivo deste diretório tem de ser uma classe com `up` e `down`.
 */
const diretorio = new URL('./', import.meta.url);
const arquivos = readdirSync(diretorio).filter(
  (nome) => nome.endsWith('.ts') && !nome.endsWith('.spec.ts'),
);

describe('diretório de migrations', () => {
  it.each(arquivos)('%s só exporta classes de migration', async (arquivo) => {
    const modulo = (await import(new URL(arquivo, diretorio).href)) as Record<
      string,
      unknown
    >;
    const funcoes = Object.entries(modulo).filter(
      ([, valor]) => typeof valor === 'function',
    );
    expect(funcoes.length).toBeGreaterThan(0);
    for (const [nome, valor] of funcoes) {
      const prototipo = (valor as { prototype?: Record<string, unknown> })
        .prototype;
      expect(
        typeof prototipo?.up === 'function' &&
          typeof prototipo?.down === 'function',
        `${arquivo}: export "${nome}" não é uma classe de migration`,
      ).toBe(true);
    }
  });
});
