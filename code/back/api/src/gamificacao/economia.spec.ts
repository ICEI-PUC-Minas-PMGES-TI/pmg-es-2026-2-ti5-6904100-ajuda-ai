import {
  cicloDaData,
  LIMITES,
  moedasPorXp,
  NIVEIS,
  nivelDe,
  RECOMPENSAS_TOTEM,
} from './economia.js';
import { efeitoXpPadrao } from './gamificacao.js';

describe('níveis (BL-50)', () => {
  it('10 níveis com os limiares aprovados', () => {
    expect(NIVEIS.map((n) => [n.numero, n.nome, n.xpMinimo])).toEqual([
      [1, 'Primeiro passo', 0],
      [2, 'Curiosidade', 50],
      [3, 'Exploração', 150],
      [4, 'Descoberta', 300],
      [5, 'Conexão', 500],
      [6, 'Parceria', 750],
      [7, 'Mentoria', 1050],
      [8, 'Guia do campus', 1400],
      [9, 'Referência', 1950],
      [10, 'Lenda da PUC', 2600],
    ]);
  });

  it.each(NIVEIS.slice(1).map((n, i) => [NIVEIS[i], n] as const))(
    'limiar de %o: um abaixo fica, no limiar sobe',
    (anterior, nivel) => {
      expect(nivelDe(nivel.xpMinimo - 1).numero).toBe(anterior.numero);
      expect(nivelDe(nivel.xpMinimo).numero).toBe(nivel.numero);
      expect(nivelDe(nivel.xpMinimo + 1).numero).toBe(nivel.numero);
    },
  );

  it('barra: 580 XP = nível 5, 80 de 250, 32%, faltam 170', () => {
    expect(nivelDe(580)).toEqual({
      numero: 5,
      nome: 'Conexão',
      xpMinimo: 500,
      proximoXp: 750,
      proximoNome: 'Parceria',
      xpNoNivel: 80,
      xpDoNivel: 250,
      xpRestante: 170,
      progresso: 32,
      maximo: false,
    });
  });

  it('zero XP: nível 1, barra vazia, faltam 50', () => {
    expect(nivelDe(0)).toMatchObject({
      numero: 1,
      progresso: 0,
      xpRestante: 50,
      maximo: false,
    });
  });

  it('nível máximo: sem próximo nível, XP continua acumulando', () => {
    for (const xp of [2600, 2601, 9999]) {
      expect(nivelDe(xp)).toMatchObject({
        numero: 10,
        nome: 'Lenda da PUC',
        proximoXp: null,
        proximoNome: null,
        xpRestante: 0,
        progresso: 100,
        maximo: true,
        xpNoNivel: xp - 2600,
      });
    }
  });
});

describe('economia', () => {
  it('totens só nas opções 10–50; moedas 1:1', () => {
    expect([...RECOMPENSAS_TOTEM]).toEqual([10, 20, 30, 40, 50]);
    expect(moedasPorXp(30)).toBe(30);
  });

  it('tetos aprovados', () => {
    expect(LIMITES).toEqual({
      totensPorCiclo: 400,
      geralPorCiclo: 1500,
      porMissao: 100,
      missoesSemanais: 60,
      ajusteAdmin: 200,
    });
  });

  it('resgate e estorno não mexem no XP; ganhos e ajustes mexem', () => {
    expect(efeitoXpPadrao('RECOMPENSA', -200)).toBe(0);
    expect(efeitoXpPadrao('RECOMPENSA', 200)).toBe(0);
    expect(efeitoXpPadrao('PUCSTOP_CLAIM', 30)).toBe(30);
    expect(efeitoXpPadrao('MISSAO', 50)).toBe(50);
    expect(efeitoXpPadrao('AJUSTE_ADMIN', -40)).toBe(-40);
  });

  it('semestre pelo horário de Brasília (virada de 30/jun para 1º/jul)', () => {
    expect(cicloDaData(new Date('2026-06-30T23:30:00-03:00'))).toBe('2026/1');
    // 02h UTC de 1º/jul ainda é 30/jun em Brasília.
    expect(cicloDaData(new Date('2026-07-01T02:00:00Z'))).toBe('2026/1');
    expect(cicloDaData(new Date('2026-07-01T00:30:00-03:00'))).toBe('2026/2');
    expect(cicloDaData(new Date('2027-01-01T01:00:00Z'))).toBe('2026/2');
  });
});
