import { BlobSASPermissions, BlobServiceClient } from '@azure/storage-blob';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { credencialCompartilhada } from './azure-storage.config.js';
import { AzureBlobStorageService } from './azure-blob-storage.service.js';
import { dividirChave, montarNomeBlob } from './blob-chave.js';
import { CONTAINERS } from './containers.js';

const CHAVE_FALSA = Buffer.from(
  'chave-falsa-somente-para-teste-unitario',
).toString('base64');
const CONNECTION_FAKE = `DefaultEndpointsProtocol=https;AccountName=contateste;AccountKey=${CHAVE_FALSA};EndpointSuffix=core.windows.net`;

function criarServico(): AzureBlobStorageService {
  return new AzureBlobStorageService(
    BlobServiceClient.fromConnectionString(CONNECTION_FAKE),
    credencialCompartilhada(CONNECTION_FAKE),
    { leituraMinutos: 15, uploadMinutos: 10 },
  );
}

function permissoesDaUrl(url: string): BlobSASPermissions {
  return BlobSASPermissions.parse(new URL(url).searchParams.get('sp') ?? '');
}

describe('nomes de blob', () => {
  it('gera uuid e ignora qualquer nome original', () => {
    const nome = montarNomeBlob(['usuario-id'], 'WEBP');
    expect(nome).toMatch(/^usuario-id\/[0-9a-f-]{36}\.webp$/);
  });

  it('rejeita path traversal e container fora da lista', () => {
    expect(() => montarNomeBlob(['../etc'], 'webp')).toThrow(
      BadRequestException,
    );
    expect(() => montarNomeBlob(['a/b'], 'webp')).toThrow(BadRequestException);
    expect(() => dividirChave('outro-container/arquivo.webp')).toThrow(
      BadRequestException,
    );
    expect(dividirChave('profiles/usuario-id/arquivo.webp')).toEqual({
      container: CONTAINERS.profiles,
      blobName: 'usuario-id/arquivo.webp',
    });
  });
});

describe('AzureBlobStorageService', () => {
  const service = criarServico();

  it('rejeita container que não está na lista', () => {
    expect(() =>
      service.urlPublica(
        'segredos' as typeof CONTAINERS.mapAssets,
        'arquivo.glb',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.sasLeitura(
        'segredos' as typeof CONTAINERS.profiles,
        'arquivo.webp',
      ),
    ).toThrow(/não permitido/);
  });

  it('monta URL pública só para container público, sem SAS', () => {
    expect(service.urlPublica(CONTAINERS.mapAssets, 'campus/mapa.glb')).toBe(
      'https://contateste.blob.core.windows.net/map-assets/campus/mapa.glb',
    );
    expect(
      service.urlPublica(CONTAINERS.restaurantMenus, 'cardapio/foto.webp'),
    ).toBe(
      'https://contateste.blob.core.windows.net/restaurant-menus/cardapio/foto.webp',
    );
    expect(() =>
      service.urlPublica(CONTAINERS.profiles, 'usuario/foto.webp'),
    ).toThrow(/privado/);
    expect(() => service.urlPublica(CONTAINERS.feed, 'post/foto.webp')).toThrow(
      /privado/,
    );
    expect(() =>
      service.urlPublica(CONTAINERS.chat, 'conversa/foto.webp'),
    ).toThrow(/privado/);
  });

  it('SAS de leitura é só leitura, só privada e não leva a account key', () => {
    const sas = service.sasLeitura(
      CONTAINERS.profiles,
      'usuario-id/arquivo.webp',
    );
    const permissoes = permissoesDaUrl(sas.url);
    const params = new URL(sas.url).searchParams;

    expect(params.get('sp')).toBe('r');
    expect(permissoes.read).toBe(true);
    expect(permissoes.create).toBe(false);
    expect(permissoes.write).toBe(false);
    expect(permissoes.add).toBe(false);
    expect(permissoes.delete).toBe(false);
    expect(permissoes.permanentDelete).toBe(false);
    expect(params.get('sr')).toBe('b');
    expect(params.get('spr')).toBe('https');
    expect(sas.url).not.toContain(CHAVE_FALSA);
    expect(sas.url).not.toContain('AccountKey');
    expect(sas.chave).toBe('profiles/usuario-id/arquivo.webp');
    expect(sas.expiraEm.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(sas.expiraEm.getTime()).toBeLessThan(Date.now() + 16 * 60_000);

    expect(() =>
      service.sasLeitura(CONTAINERS.mapAssets, 'campus/mapa.glb'),
    ).toThrow(/público/);
    expect(() =>
      service.sasLeitura(CONTAINERS.profiles, '../outro.webp'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.sasLeitura(CONTAINERS.feed, 'post/a.webp', 61),
    ).toThrow(/1 e 60/);
  });

  it('SAS de upload concede só escrita no blob nomeado', () => {
    const sas = service.sasUpload(CONTAINERS.chat, 'conversa/arquivo.webp', {
      contentType: 'image/webp',
      minutos: 5,
    });
    const permissoes = permissoesDaUrl(sas.url);
    const params = new URL(sas.url).searchParams;

    expect(params.get('sp')).toBe('w');
    expect(permissoes.create).toBe(false);
    expect(permissoes.write).toBe(true);
    expect(permissoes.read).toBe(false);
    expect(permissoes.add).toBe(false);
    expect(permissoes.delete).toBe(false);
    expect(permissoes.permanentDelete).toBe(false);
    expect(params.get('sr')).toBe('b');
    expect(params.get('rsct')).toBe('image/webp');
    expect(sas.url).toContain(
      'https://contateste.blob.core.windows.net/chat/conversa/arquivo.webp?',
    );
    expect(sas.url).not.toContain(CHAVE_FALSA);
    expect(sas.expiraEm.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
    expect(sas.expiraEm.getTime()).toBeLessThan(Date.now() + 6 * 60_000);
    expect(() =>
      service.sasUpload(CONTAINERS.feed, 'post/a.webp', { minutos: 16 }),
    ).toThrow(/1 e 15/);
  });
});

describe('Azure Blob Storage sem connection string', () => {
  const service = new AzureBlobStorageService(null, null, {
    leituraMinutos: 15,
    uploadMinutos: 10,
  });

  it('recusa URL e SAS sem consultar o Azure', () => {
    expect(() =>
      service.urlPublica(CONTAINERS.mapAssets, 'campus/mapa.glb'),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      service.sasLeitura(CONTAINERS.profiles, 'usuario/foto.webp'),
    ).toThrow(/não está configurado/);
  });
});

describe('operações no container', () => {
  function servicoMockado(containerExiste = true) {
    const base = BlobServiceClient.fromConnectionString(CONNECTION_FAKE);
    const uploadData = vi.fn().mockResolvedValue({});
    const deleteIfExists = vi.fn().mockResolvedValue({ succeeded: true });
    const exists = vi.fn().mockResolvedValue(true);
    const containerExists = vi.fn().mockResolvedValue(containerExiste);
    vi.spyOn(base, 'getContainerClient').mockImplementation((nome: string) => {
      const real =
        BlobServiceClient.fromConnectionString(
          CONNECTION_FAKE,
        ).getContainerClient(nome);
      return {
        exists: containerExists,
        getBlockBlobClient: (blobName: string) => {
          const blob = real.getBlockBlobClient(blobName);
          return { url: blob.url, uploadData, deleteIfExists, exists };
        },
      } as never;
    });
    return {
      service: new AzureBlobStorageService(
        base,
        credencialCompartilhada(CONNECTION_FAKE),
        { leituraMinutos: 15, uploadMinutos: 10 },
      ),
      uploadData,
      deleteIfExists,
      exists,
      containerExists,
    };
  }

  it('substitui foto privada sem excluir previamente e sem condição de criação exclusiva', async () => {
    const { service, uploadData, deleteIfExists } = servicoMockado();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    await service.substituirFotoPerfil('usuarios/42/avatar.img', png);
    await service.substituirFotoPerfil('usuarios/42/avatar.img', png);
    expect(uploadData).toHaveBeenCalledTimes(2);
    expect(uploadData).toHaveBeenCalledWith(png, {
      blobHTTPHeaders: {
        blobContentType: 'image/png',
        blobCacheControl: 'private, no-cache',
      },
    });
    expect(deleteIfExists).not.toHaveBeenCalled();
    uploadData.mockRejectedValueOnce(new Error('Indisponível'));
    await expect(
      service.substituirFotoPerfil('usuarios/42/avatar.img', png),
    ).rejects.toThrow();
    expect(deleteIfExists).not.toHaveBeenCalled();
    const sas = service.sasLeitura('profiles', 'usuarios/42/avatar.img');
    expect(permissoesDaUrl(sas.url).toString()).toBe('r');
    expect(sas.expiraEm.getTime()).toBeGreaterThan(Date.now());
  });

  it('recusa foto sem assinatura de imagem, chave arbitrária e tamanho excessivo', async () => {
    const { service, uploadData } = servicoMockado();
    await expect(
      service.substituirFotoPerfil(
        'usuarios/1/avatar.img',
        Buffer.from('<svg/>'),
      ),
    ).rejects.toThrow(/Formato/);
    await expect(
      service.substituirFotoPerfil('outra/chave.png', Buffer.from('x')),
    ).rejects.toThrow(/Chave/);
    await expect(
      service.substituirFotoPerfil(
        'usuarios/1/avatar.img',
        Buffer.alloc(5 * 1024 * 1024 + 1),
      ),
    ).rejects.toThrow(/5 MB/);
    expect(uploadData).not.toHaveBeenCalled();
  });

  it('não cria container ausente e não envia o blob', async () => {
    const { service, uploadData } = servicoMockado(false);
    await expect(
      service.enviar(
        CONTAINERS.feed,
        'post/foto.webp',
        Buffer.from('img'),
        'image/webp',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(uploadData).not.toHaveBeenCalled();
  });

  it('envia sem sobrescrever e só devolve URL permanente se o container for público', async () => {
    const { service, uploadData } = servicoMockado();
    const publico = await service.enviar(
      CONTAINERS.mapAssets,
      'campus/mapa.glb',
      Buffer.from('glb'),
      'model/gltf-binary',
    );
    expect(publico.url).toBe(
      'https://contateste.blob.core.windows.net/map-assets/campus/mapa.glb',
    );
    expect(uploadData).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'model/gltf-binary' },
      }),
    );

    const privado = await service.enviar(
      CONTAINERS.profiles,
      'usuario/foto.webp',
      Buffer.from('img'),
      'image/webp',
    );
    expect(privado.url).toBeNull();
    expect(privado.chave).toBe('profiles/usuario/foto.webp');
  });

  it('trata conflito, ausência e existência sem chamar o Azure de verdade', async () => {
    const { service, uploadData, deleteIfExists, exists } = servicoMockado();
    uploadData.mockRejectedValueOnce({ statusCode: 412 });
    await expect(
      service.enviar(
        CONTAINERS.chat,
        'conversa/arquivo.webp',
        Buffer.from('x'),
        'image/webp',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    deleteIfExists.mockResolvedValueOnce({ succeeded: false });
    await expect(
      service.excluir(CONTAINERS.chat, 'conversa/arquivo.webp'),
    ).rejects.toBeInstanceOf(NotFoundException);

    exists.mockResolvedValueOnce(false);
    await expect(
      service.existe(CONTAINERS.feed, 'post/foto.webp'),
    ).resolves.toBe(false);
  });
});
