import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import type { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';
import { MapaLocaisAdminController } from './mapa.controller.js';
import { LocalConteudoService } from './local-conteudo.service.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const pdf = Buffer.from('%PDF-1.7');

function cenario({ falharUpdate = false, total = 0 } = {}) {
  const excluidos: string[] = [];
  const enviados: string[] = [];
  const consultasTransacao: string[] = [];
  const storage = {
    enviar: async (_container: string, nome: string) => {
      enviados.push(nome);
      return { blobName: nome };
    },
    excluir: async (_container: string, nome: string) => {
      excluidos.push(nome);
    },
    urlPublica: (_container: string, nome: string) => `https://storage/${nome}`,
  } as unknown as AzureBlobStorageService;
  const manager = {
    query: async (sql: string) => {
      consultasTransacao.push(sql);
      if (sql.startsWith('SELECT "arquivo"'))
        return [{ arquivo: 'locais/P01/anterior.png' }];
      if (sql.includes('count(*)::int AS total')) return [{ total }];
      if (sql.startsWith('UPDATE') && falharUpdate) throw new Error('banco');
      return [];
    },
  };
  const ds = {
    query: async (sql: string) => {
      if (sql.includes('FROM "mapa"."predios"')) return [{ existe: 1 }];
      if (sql.includes('local_informacoes')) return [];
      if (sql.includes('local_imagens')) return [];
      return [];
    },
    transaction: (acao: (m: typeof manager) => unknown) => acao(manager),
  } as unknown as DataSource;
  return {
    service: new LocalConteudoService(ds, storage),
    enviados,
    excluidos,
    consultasTransacao,
  };
}

describe('informações e imagens dos locais', () => {
  it('todas as mutações carregam a role coordenador', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MapaLocaisAdminController)).toEqual([
      'coordenador',
    ]);
  });

  it('confere o formato real e recusa PDF no fluxo de imagens', async () => {
    const { service } = cenario();
    await expect(service.adicionar('P01', [pdf], 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('serializa a contagem por local e compensa upload que excederia o limite', async () => {
    const { service, enviados, excluidos, consultasTransacao } = cenario({
      total: 10,
    });
    await expect(service.adicionar('P01', [png], 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(
      consultasTransacao.findIndex((sql) => sql.includes('FOR UPDATE')),
    ).toBeLessThan(
      consultasTransacao.findIndex((sql) =>
        sql.includes('count(*)::int AS total'),
      ),
    );
    expect(excluidos).toEqual(enviados);
  });

  it('substitui somente depois de persistir e então limpa a anterior', async () => {
    const { service, enviados, excluidos } = cenario();
    await service.substituir(
      'P01',
      '11111111-1111-4111-8111-111111111111',
      png,
      1,
    );
    expect(enviados).toHaveLength(1);
    expect(excluidos).toEqual(['locais/P01/anterior.png']);
  });

  it('falha de persistência mantém a imagem anterior e compensa a nova', async () => {
    const { service, enviados, excluidos } = cenario({ falharUpdate: true });
    await expect(
      service.substituir('P01', '11111111-1111-4111-8111-111111111111', png, 1),
    ).rejects.toThrow('banco');
    expect(excluidos).toEqual([enviados[0]]);
    expect(excluidos).not.toContain('locais/P01/anterior.png');
  });
});
