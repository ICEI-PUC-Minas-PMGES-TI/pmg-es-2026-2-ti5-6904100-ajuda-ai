import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelarResgateDto } from './resgates/resgates-admin.dto.js';
import {
  codificarCursor,
  decodificarCursor,
} from './resgates/resgates-admin.service.js';
import { AjustarXpDto } from './xp/xp-admin.dto.js';
import { comprimentoJustificativa } from './justificativa.js';

/** Erros de validação do campo `motivo`, como o ValidationPipe veria. */
async function errosDoMotivo(
  classe: typeof CancelarResgateDto | typeof AjustarXpDto,
  motivo: unknown,
): Promise<string[]> {
  const dto = plainToInstance(classe, {
    motivo,
    quantidade: 10,
    chaveIdempotencia: '6f1c1d7e-1b7a-4c47-9d5e-2a3b4c5d6e7f',
  });
  const erros = await validate(dto);
  return erros.filter((e) => e.property === 'motivo').map((e) => e.property);
}

describe('justificativas da coordenação (motivo)', () => {
  it('mede como o CHECK do banco: depois do trim e em pontos de código', () => {
    expect(comprimentoJustificativa(' a ')).toBe(1);
    expect(comprimentoJustificativa('\n\tabc ')).toBe(3);
    // `length` do JavaScript daria 3 (par substituto); o PostgreSQL conta 2.
    expect('😀a'.length).toBe(3);
    expect(comprimentoJustificativa('😀a')).toBe(2);
  });

  it.each([CancelarResgateDto, AjustarXpDto])(
    '%p recusa o que estouraria o CHECK e aceita o resto',
    async (classe) => {
      for (const ruim of [
        ' a ',
        '  ab  ',
        '\n\tab\n',
        '😀a',
        '',
        '   ',
        42,
        null,
      ]) {
        expect(await errosDoMotivo(classe, ruim)).toEqual(['motivo']);
      }
      for (const bom of [
        'abc',
        '  abc  ',
        '😀ab',
        'x'.repeat(300),
        ` ${'x'.repeat(300)} `,
      ]) {
        expect(await errosDoMotivo(classe, bom)).toEqual([]);
      }
      expect(await errosDoMotivo(classe, 'x'.repeat(301))).toEqual(['motivo']);
      // 300 emojis: 600 unidades UTF-16, mas 300 caracteres para o banco.
      expect(await errosDoMotivo(classe, '😀'.repeat(300))).toEqual([]);
      expect(await errosDoMotivo(classe, '😀'.repeat(301))).toEqual(['motivo']);
    },
  );
});

describe('cursor da fila de resgates', () => {
  const id = '6f1c1d7e-1b7a-4c47-9d5e-2a3b4c5d6e7f';

  it('ida e volta preserva os microssegundos', () => {
    const criadoEm = '2026-11-23T16:20:05.123456Z';
    expect(decodificarCursor(codificarCursor(criadoEm, id))).toEqual({
      criadoEm,
      id,
    });
  });

  it.each([
    ['vazio', ''],
    [
      'sem id',
      Buffer.from('2026-11-23T16:20:05.123456Z').toString('base64url'),
    ],
    [
      'data sem microssegundos',
      codificarCursor('2026-11-23T16:20:05.123Z', id),
    ],
    ['id inválido', codificarCursor('2026-11-23T16:20:05.123456Z', 'x')],
    [
      'partes a mais',
      Buffer.from(`2026-11-23T16:20:05.123456Z|${id}|x`).toString('base64url'),
    ],
  ])('recusa cursor %s com 400', (_caso, cursor) => {
    expect(() => decodificarCursor(cursor)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
