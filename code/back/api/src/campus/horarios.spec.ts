import { BadRequestException } from '@nestjs/common';
import { abertoAgora, agoraNoCampus, validarHorarios } from './horarios.js';

describe('validarHorarios', () => {
  it('aceita e ordena por dia e abertura', () => {
    expect(
      validarHorarios([
        { dia: 1, abre: '13:00', fecha: '21:00' },
        { dia: 0, abre: '08:00', fecha: '12:00' },
        { dia: 1, abre: '07:00', fecha: '12:00' },
      ]),
    ).toEqual([
      { dia: 0, abre: '08:00', fecha: '12:00' },
      { dia: 1, abre: '07:00', fecha: '12:00' },
      { dia: 1, abre: '13:00', fecha: '21:00' },
    ]);
    expect(validarHorarios([])).toEqual([]);
  });

  it('faixas encostadas no mesmo dia são aceitas (12:00 fecha, 12:00 abre)', () => {
    expect(
      validarHorarios([
        { dia: 2, abre: '07:00', fecha: '12:00' },
        { dia: 2, abre: '12:00', fecha: '14:00' },
      ]),
    ).toHaveLength(2);
  });

  it.each([
    ['não lista', { dia: 1 }],
    ['dia 7', [{ dia: 7, abre: '07:00', fecha: '08:00' }]],
    ['dia fracionário', [{ dia: 1.5, abre: '07:00', fecha: '08:00' }]],
    ['hora 24:00', [{ dia: 1, abre: '07:00', fecha: '24:00' }]],
    ['sem zero à esquerda', [{ dia: 1, abre: '7:00', fecha: '08:00' }]],
    ['fecha antes de abrir', [{ dia: 1, abre: '18:00', fecha: '08:00' }]],
    ['fecha igual a abre', [{ dia: 1, abre: '08:00', fecha: '08:00' }]],
    ['atravessa meia-noite', [{ dia: 5, abre: '22:00', fecha: '02:00' }]],
    ['campo extra', [{ dia: 1, abre: '07:00', fecha: '08:00', preco: 1 }]],
    [
      'sobreposição',
      [
        { dia: 3, abre: '07:00', fecha: '12:00' },
        { dia: 3, abre: '11:00', fecha: '13:00' },
      ],
    ],
    [
      'mais de 21',
      Array.from({ length: 22 }, () => ({
        dia: 0,
        abre: '01:00',
        fecha: '02:00',
      })),
    ],
  ])('recusa: %s', (_nome, bruto) => {
    expect(() => validarHorarios(bruto)).toThrow(BadRequestException);
  });
});

describe('aberto agora (horário de Brasília, não UTC)', () => {
  const segunda = [{ dia: 1, abre: '07:00', fecha: '21:00' }];

  it('segunda 20:30 em Brasília = 23:30 UTC: aberto', () => {
    const agora = new Date('2026-10-19T23:30:00Z');
    expect(agoraNoCampus(agora)).toEqual({
      dia: 1,
      minuto: 20 * 60 + 30,
      data: '2026-10-19',
    });
    expect(abertoAgora(segunda, agora)).toBe(true);
  });

  it('segunda 21:00 em Brasília (00:00 UTC de terça): fechado e ainda é segunda', () => {
    const agora = new Date('2026-10-20T00:00:00Z');
    expect(agoraNoCampus(agora).data).toBe('2026-10-19');
    expect(abertoAgora(segunda, agora)).toBe(false);
  });

  it('domingo de manhã: fechado (sem faixa)', () => {
    expect(abertoAgora(segunda, new Date('2026-10-18T13:00:00Z'))).toBe(false);
  });
});
