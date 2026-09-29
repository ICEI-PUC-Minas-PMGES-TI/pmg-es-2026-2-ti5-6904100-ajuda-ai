import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ComentarioEntity } from './entities/comentario.entity.js';
import { CurtidaEntity } from './entities/curtida.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';
import { PublicacoesService } from './publicacoes.service.js';

describe('PublicacoesService', () => {
  let publicacoes: PublicacaoEntity[];
  let proximoIdPublicacao: number;
  let proximoIdComentario: number;
  let proximoIdCurtida: number;
  let service: PublicacoesService;

  beforeEach(() => {
    publicacoes = [];
    proximoIdPublicacao = 1;
    proximoIdComentario = 1;
    proximoIdCurtida = 1;
    service = criarService();
  });

  it('inicia o feed vazio, sem publicacoes ficticias', async () => {
    await expect(service.listar('1')).resolves.toEqual([]);
  });

  it('salva publicacao, curtida e comentario nos repositorios', async () => {
    const criada = await service.criar(
      {
        autor: 'Nome enviado pelo cliente',
        categoria: 'Dicas acadêmicas',
        texto: 'Conteúdo criado por uma pessoa real.',
        imagens: [],
      },
      '1',
    );

    expect(criada.autor).toBe('Camila Duarte');
    await service.curtir(criada.id, 1, '1');
    await service.comentar(criada.id, 'Comentário persistido.', '1');

    const serviceDepoisDoReinicio = criarService();
    await expect(serviceDepoisDoReinicio.listar('1')).resolves.toEqual([
      expect.objectContaining({
        id: criada.id,
        texto: 'Conteúdo criado por uma pessoa real.',
        curtidas: 1,
        curtidoPeloUsuario: true,
        comentarios: 1,
        comentariosTexto: ['Comentário persistido.'],
        isOwn: true,
      }),
    ]);
  });

  it('registra no maximo uma curtida por usuario', async () => {
    const criada = await service.criar({ texto: 'Publicação' }, '1');

    await service.curtir(criada.id, 1, '1');
    await service.curtir(criada.id, 1, '1');
    await service.curtir(criada.id, 1, '2');

    await expect(service.listar('1')).resolves.toEqual([
      expect.objectContaining({ curtidas: 2, curtidoPeloUsuario: true }),
    ]);

    await service.curtir(criada.id, -1, '1');
    await expect(service.listar('1')).resolves.toEqual([
      expect.objectContaining({ curtidas: 1, curtidoPeloUsuario: false }),
    ]);
  });

  it('permite apagar apenas a propria publicacao', async () => {
    const criada = await service.criar({ texto: 'Publicação' }, '1');

    await expect(service.remover(criada.id, '2')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.listar('1')).resolves.toHaveLength(1);

    await expect(service.remover(criada.id, '1')).resolves.toEqual({
      removido: true,
    });
    await expect(service.listar('1')).resolves.toEqual([]);
  });

  function criarService(): PublicacoesService {
    const publicacoesRepository = {
      find: vi.fn(async () => publicacoes),
      findOne: vi.fn(async ({ where }: { where: { id: number } }) =>
        publicacoes.find((item) => item.id === where.id),
      ),
      create: vi.fn((dados: Partial<PublicacaoEntity>) =>
        Object.assign(new PublicacaoEntity(), dados),
      ),
      save: vi.fn(async (item: PublicacaoEntity) => {
        item.id ||= proximoIdPublicacao++;
        item.criadoEm ||= new Date();
        item.curtidas ||= [];
        item.comentarios ||= [];
        if (!publicacoes.includes(item)) publicacoes.push(item);
        return item;
      }),
      remove: vi.fn(async (item: PublicacaoEntity) => {
        publicacoes = publicacoes.filter((publicacao) => publicacao !== item);
        return item;
      }),
    } as unknown as Repository<PublicacaoEntity>;

    const comentariosRepository = {
      create: vi.fn((dados: Partial<ComentarioEntity>) =>
        Object.assign(new ComentarioEntity(), dados),
      ),
      save: vi.fn(async (item: ComentarioEntity) => {
        item.id ||= proximoIdComentario++;
        item.criadoEm ||= new Date();
        return item;
      }),
    } as unknown as Repository<ComentarioEntity>;

    const curtidasRepository = {
      create: vi.fn((dados: Partial<CurtidaEntity>) =>
        Object.assign(new CurtidaEntity(), dados),
      ),
      save: vi.fn(async (item: CurtidaEntity) => {
        item.id ||= proximoIdCurtida++;
        item.criadoEm ||= new Date();
        return item;
      }),
      remove: vi.fn(async (item: CurtidaEntity) => item),
    } as unknown as Repository<CurtidaEntity>;

    return new PublicacoesService(
      publicacoesRepository,
      comentariosRepository,
      curtidasRepository,
    );
  }
});
