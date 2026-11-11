import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { CalcularRotaDto } from './rotas.dto.js';
import { RotasService } from './rotas.service.js';

const x = (dx: number) => -43.99 + dx * 1e-4;
const y = (dy: number) => -19.92 + dy * 1e-4;
const quadrado = (x0: number, y0: number, x1: number, y1: number) => [
  [
    [x(x0), y(y0)],
    [x(x1), y(y0)],
    [x(x1), y(y1)],
    [x(x0), y(y1)],
    [x(x0), y(y0)],
  ],
];

/** Banco falso: versão ativa trocável, grafo N1—N2—N3, PA em N1, PB em N3. */
function fonte() {
  const estado = { ativa: 'v1' as string | null, falhar: false, cargas: 0 };
  const ds = {
    query: async (sql: string) => {
      if (sql.includes('FROM pg_extension')) return [{ schema: 'extensions' }];
      if (sql.includes(`FROM "mapa"."versoes"`)) {
        return estado.ativa
          ? [{ id: estado.ativa, codigo: `codigo-${estado.ativa}` }]
          : [];
      }
      if (estado.falhar) throw new Error('banco caiu');
      if (sql.includes(`FROM "mapa"."nos_grafo"`)) {
        estado.cargas++;
        return [
          { id: 'N1', predio_id: 'PA', x: x(0), y: y(0) },
          { id: 'N2', predio_id: null, x: x(10), y: y(0) },
          { id: 'N3', predio_id: 'PB', x: x(20), y: y(0) },
        ];
      }
      if (sql.includes(`FROM "mapa"."arestas_grafo"`)) {
        const aresta = (
          id: string,
          o: string,
          d: string,
          a: number,
          b: number,
        ) => ({
          id,
          no_origem_id: o,
          no_destino_id: d,
          distancia_m: 104.6,
          tempo_caminhada_s: 75,
          acessivel: true,
          geometria: [
            [x(a), y(0)],
            [x(b), y(0)],
          ],
        });
        return [
          aresta('a', 'N1', 'N2', 0, 10),
          aresta('b', 'N2', 'N1', 10, 0),
          aresta('c', 'N2', 'N3', 10, 20),
          aresta('d', 'N3', 'N2', 20, 10),
        ];
      }
      if (sql.includes(`FROM "mapa"."predios"`)) {
        return [
          {
            id: 'PA',
            nome: 'Prédio A',
            poligono: quadrado(-1, -1, 1, 1),
            x: x(0),
            y: y(0),
          },
          {
            id: 'PB',
            nome: 'Prédio B',
            poligono: quadrado(19, -1, 21, 1),
            x: x(20),
            y: y(0),
          },
        ];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
  } as unknown as DataSource;
  return { ds, estado };
}

const pedido = (corpo: object) => corpo as CalcularRotaDto;

describe('RotasService', () => {
  it('calcula prédio → prédio e responde GeoJSON', async () => {
    const r = await new RotasService(fonte().ds).calcular(
      pedido({ origem: { id: 'PA' }, destino: { id: 'PB' } }),
    );
    expect(r.versao).toBe('codigo-v1');
    expect(r.acessivel).toBe(false);
    expect(r.tempoSegundos).toBe(150);
    expect(r.distanciaMetros).toBe(209.2);
    expect(r.geometria).toEqual({
      type: 'LineString',
      coordinates: [
        [x(0), y(0)],
        [x(10), y(0)],
        [x(20), y(0)],
      ],
    });
    expect(r.origem).toMatchObject({
      tipo: 'predio',
      id: 'PA',
      conexao: 'entrada',
    });
    expect(r.destino).toMatchObject({
      tipo: 'predio',
      id: 'PB',
      nome: 'Prédio B',
    });
    expect(r.arestas).toBe(2);
  });

  it('carrega o grafo uma vez (inclusive em chamadas simultâneas) e recarrega se a versão mudar', async () => {
    const { ds, estado } = fonte();
    const servico = new RotasService(ds);
    const corpo = pedido({ origem: { id: 'PA' }, destino: { id: 'PB' } });
    await Promise.all([
      servico.calcular(corpo),
      servico.calcular(corpo),
      servico.calcular(corpo),
    ]);
    await servico.calcular(corpo);
    expect(estado.cargas).toBe(1);
    estado.ativa = 'v2';
    expect((await servico.calcular(corpo)).versao).toBe('codigo-v2');
    expect(estado.cargas).toBe(2);
  });

  it('falha de carga não fica presa no cache', async () => {
    const { ds, estado } = fonte();
    const servico = new RotasService(ds);
    const corpo = pedido({ origem: { id: 'PA' }, destino: { id: 'PB' } });
    estado.falhar = true;
    await expect(servico.calcular(corpo)).rejects.toThrow('banco caiu');
    estado.falhar = false;
    await expect(servico.calcular(corpo)).resolves.toMatchObject({
      tempoSegundos: 150,
    });
  });

  it('503 sem versão ativa', async () => {
    const { ds, estado } = fonte();
    estado.ativa = null;
    await expect(
      new RotasService(ds).calcular(
        pedido({ origem: { id: 'PA' }, destino: { id: 'PB' } }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('404 para prédio inexistente; 422 para rota impossível', async () => {
    const servico = new RotasService(fonte().ds);
    await expect(
      servico.calcular(pedido({ origem: { id: 'PA' }, destino: { id: 'PX' } })),
    ).rejects.toBeInstanceOf(NotFoundException);
    const mesmo = servico.calcular(
      pedido({ origem: { id: 'PA' }, destino: { id: 'PA' } }),
    );
    await expect(mesmo).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(mesmo).rejects.toMatchObject({
      response: { motivo: 'mesmo-local' },
    });
    const longe = servico.calcular(
      pedido({
        origem: { latitude: y(500), longitude: x(500) },
        destino: { id: 'PB' },
      }),
    );
    await expect(longe).rejects.toMatchObject({
      response: { motivo: 'origem-fora' },
    });
  });

  it('400 para pontas mal formadas', async () => {
    const servico = new RotasService(fonte().ds);
    for (const corpo of [
      {
        origem: { id: 'PA', latitude: y(0), longitude: x(0) },
        destino: { id: 'PB' },
      },
      { origem: {}, destino: { id: 'PB' } },
      { origem: { latitude: y(0) }, destino: { id: 'PB' } },
      { origem: { id: 'PA' }, destino: {} },
      { origem: { id: 'PA' }, destino: { longitude: x(20) } },
      {
        origem: { id: 'PA' },
        destino: { id: 'PB', latitude: y(0), longitude: x(20) },
      },
    ]) {
      await expect(servico.calcular(pedido(corpo))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  describe('destino por coordenada (evento, restaurante, área)', () => {
    it('encaixa no caminho mais próximo e termina no ponto', async () => {
      const r = await new RotasService(fonte().ds).calcular(
        pedido({
          origem: { id: 'PA' },
          destino: { latitude: y(0.5), longitude: x(15) },
        }),
      );
      expect(r.destino).toMatchObject({
        tipo: 'coordenada',
        id: null,
        conexao: 'caminho',
        latitude: y(0.5),
        longitude: x(15),
      });
      // N1 → N2 pela aresta, metade da aresta N2→N3 e o trecho reto até o ponto.
      expect(r.geometria.coordinates).toEqual([
        [x(0), y(0)],
        [x(10), y(0)],
        [x(15), y(0)],
        [x(15), y(0.5)],
      ]);
      expect(r.distanciaMetros).toBeGreaterThan(104.6 + 52.3);
      expect(r.distanciaMetros).toBeLessThan(104.6 + 52.3 + 7);
    });

    it('origem e destino na mesma aresta: anda direto, sem ir a um nó e voltar', async () => {
      const r = await new RotasService(fonte().ds).calcular(
        pedido({
          origem: { latitude: y(0.2), longitude: x(19) },
          destino: { latitude: y(0.5), longitude: x(15) },
        }),
      );
      expect(r.geometria.coordinates.at(-2)).toEqual([x(15), y(0)]);
      expect(r.geometria.coordinates.at(-1)).toEqual([x(15), y(0.5)]);
      expect(r.geometria.coordinates).toEqual([
        [x(19), y(0.2)],
        [x(19), y(0)],
        [x(15), y(0)],
        [x(15), y(0.5)],
      ]);
      // 4 unidades de aresta (41,8 m) + os dois trechos retos (~2 m + ~5,5 m).
      expect(r.distanciaMetros).toBeGreaterThan(41.8);
      expect(r.distanciaMetros).toBeLessThan(41.8 + 8);
      expect(r.arestas).toBe(1);
    });

    it('longe de qualquer caminho: 422 destino-fora', async () => {
      const erro = await new RotasService(fonte().ds)
        .calcular(
          pedido({
            origem: { id: 'PA' },
            destino: { latitude: y(900), longitude: x(900) },
          }),
        )
        .catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (erro as UnprocessableEntityException).getResponse(),
      ).toMatchObject({ motivo: 'destino-fora' });
    });

    it('origem e destino a menos de 10 m: 422 mesmo-local', async () => {
      const erro = await new RotasService(fonte().ds)
        .calcular(
          pedido({
            origem: { latitude: y(0), longitude: x(15) },
            destino: { latitude: y(0.3), longitude: x(15.2) },
          }),
        )
        .catch((e: unknown) => e);
      expect(
        (erro as UnprocessableEntityException).getResponse(),
      ).toMatchObject({ motivo: 'mesmo-local' });
    });

    it('coordenada de destino dentro do prédio de origem: mesmo-local', async () => {
      const erro = await new RotasService(fonte().ds)
        .calcular(
          pedido({
            origem: { id: 'PA' },
            destino: { latitude: y(0), longitude: x(0.2) },
          }),
        )
        .catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('não registra a coordenada do usuário em log', async () => {
    const mensagens: string[] = [];
    const espiao = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: unknown) => void mensagens.push(String(m)));
    try {
      const servico = new RotasService(fonte().ds);
      const lat = y(1.234567);
      const lon = x(5.432198);
      await servico.calcular(
        pedido({
          origem: { latitude: lat, longitude: lon },
          destino: { id: 'PB' },
        }),
      );
      await servico
        .calcular(
          pedido({
            origem: { latitude: y(900), longitude: x(900) },
            destino: { id: 'PB' },
          }),
        )
        .catch(() => undefined);
      // Destino por coordenada também não vai para o log.
      const dLat = y(0.512345);
      const dLon = x(15.123456);
      await servico.calcular(
        pedido({
          origem: { id: 'PA' },
          destino: { latitude: dLat, longitude: dLon },
        }),
      );
      expect(mensagens.length).toBeGreaterThanOrEqual(4);
      const tudo = mensagens.join('\n');
      expect(tudo).toContain('destino=coordenada');
      for (const n of [lat, lon, y(900), x(900), dLat, dLon]) {
        expect(tudo).not.toContain(String(n).slice(0, 7));
      }
    } finally {
      espiao.mockRestore();
    }
  });
});

describe('CalcularRotaDto (ValidationPipe global)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validar = (corpo: unknown) =>
    pipe.transform(corpo, { type: 'body', metatype: CalcularRotaDto });

  it('aceita prédio ou coordenada', async () => {
    await expect(
      validar({ origem: { id: 'P01_R4751608' }, destino: { id: 'P26' } }),
    ).resolves.toBeTruthy();
    await expect(
      validar({
        origem: { latitude: -19.92, longitude: -43.99 },
        destino: { id: 'P26' },
        acessivel: true,
      }),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['sem destino', { origem: { id: 'P01' } }],
    ['sem origem', { destino: { id: 'P01' } }],
    [
      'latitude fora da faixa',
      { origem: { latitude: 91, longitude: 0 }, destino: { id: 'P01' } },
    ],
    [
      'longitude fora da faixa',
      { origem: { latitude: 0, longitude: -181 }, destino: { id: 'P01' } },
    ],
    [
      'latitude em texto',
      {
        origem: { latitude: '-19.9', longitude: -43.9 },
        destino: { id: 'P01' },
      },
    ],
    [
      'id com caracteres inválidos',
      { origem: { id: "P01'; --" }, destino: { id: 'P01' } },
    ],
    [
      'id longo demais',
      { origem: { id: 'P'.repeat(65) }, destino: { id: 'P01' } },
    ],
    [
      'acessivel em texto',
      { origem: { id: 'P01' }, destino: { id: 'P02' }, acessivel: 'sim' },
    ],
    [
      'campo extra',
      { origem: { id: 'P01' }, destino: { id: 'P02' }, usuario: 1 },
    ],
    [
      'campo extra na ponta',
      { origem: { id: 'P01', nome: 'x' }, destino: { id: 'P02' } },
    ],
    ['ponta não objeto', { origem: 'P01', destino: { id: 'P02' } }],
  ])('recusa: %s', async (_, corpo) => {
    await expect(validar(corpo)).rejects.toBeInstanceOf(BadRequestException);
  });
});
