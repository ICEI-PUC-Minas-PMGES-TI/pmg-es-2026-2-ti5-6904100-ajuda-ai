import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
  type ContainerClient,
} from '@azure/storage-blob';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { montarChave, validarNomeBlob } from './blob-chave.js';
import {
  ehContainerPermitido,
  ehContainerPrivado,
  ehContainerPublico,
  type ContainerArmazenamento,
} from './containers.js';
import {
  SAS_LEITURA_MAX_MINUTOS,
  SAS_UPLOAD_MAX_MINUTOS,
} from './azure-storage.config.js';

const MIME = /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/;
const FOLGA_RELOGIO_MS = 5 * 60 * 1000;

export interface BlobGravado {
  container: ContainerArmazenamento;
  blobName: string;
  chave: string;
  /** Só containers públicos. Privado fica `null`: use SAS na hora da leitura. */
  url: string | null;
}

export interface SasTemporaria {
  container: ContainerArmazenamento;
  blobName: string;
  chave: string;
  url: string;
  expiraEm: Date;
}

export interface OpcoesSasUpload {
  minutos?: number;
  contentType?: string;
}

@Injectable()
export class AzureBlobStorageService {
  constructor(
    private readonly servico: BlobServiceClient | null,
    private readonly credencial: StorageSharedKeyCredential | null,
    private readonly prazos: { leituraMinutos: number; uploadMinutos: number },
  ) {}

  /** Client do container permitido. Não cria o container no Azure. */
  obterContainer(container: ContainerArmazenamento): ContainerClient {
    return this.cliente().getContainerClient(this.exigirContainer(container));
  }

  async enviar(
    container: ContainerArmazenamento,
    blobName: string,
    dados: Buffer,
    contentType: string,
  ): Promise<BlobGravado> {
    const nome = validarNomeBlob(blobName);
    const tipo = this.exigirMime(contentType);
    if (!Buffer.isBuffer(dados) || dados.length === 0) {
      throw new BadRequestException('Envie o conteúdo do blob.');
    }
    const cliente = await this.garantirContainer(container);
    const blob = cliente.getBlockBlobClient(nome);
    try {
      await blob.uploadData(dados, {
        blobHTTPHeaders: { blobContentType: tipo },
        conditions: { ifNoneMatch: '*' },
      });
    } catch (erro) {
      this.propagar(erro, 'enviar o blob');
    }
    const destino = this.exigirContainer(container);
    return {
      container: destino,
      blobName: nome,
      chave: montarChave(destino, nome),
      url: ehContainerPublico(destino) ? blob.url : null,
    };
  }

  /** Substituição atômica de um único blob privado, sem apagar a foto anterior primeiro. */
  async substituirFotoPerfil(blobName: string, dados: Buffer): Promise<void> {
    if (!/^usuarios\/[1-9][0-9]*\/avatar\.img$/.test(blobName))
      throw new BadRequestException('Chave de perfil inválida.');
    if (
      !Buffer.isBuffer(dados) ||
      !dados.length ||
      dados.length > 5 * 1024 * 1024
    )
      throw new BadRequestException('Foto excede 5 MB ou está vazia.');
    const png = dados
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = dados[0] === 255 && dados[1] === 216 && dados[2] === 255;
    const webp =
      dados.toString('ascii', 0, 4) === 'RIFF' &&
      dados.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp)
      throw new BadRequestException(
        'Formato de foto inválido. Use PNG, JPEG ou WebP.',
      );
    const cliente = await this.garantirContainer('profiles');
    try {
      await cliente
        .getBlockBlobClient(validarNomeBlob(blobName))
        .uploadData(dados, {
          blobHTTPHeaders: {
            blobContentType: png
              ? 'image/png'
              : jpeg
                ? 'image/jpeg'
                : 'image/webp',
            blobCacheControl: 'private, no-cache',
          },
        });
    } catch (erro) {
      this.propagar(erro, 'substituir foto de perfil');
    }
  }

  async excluir(
    container: ContainerArmazenamento,
    blobName: string,
  ): Promise<void> {
    const nome = validarNomeBlob(blobName);
    const cliente = await this.garantirContainer(container);
    let sucesso = false;
    try {
      sucesso = (await cliente.getBlockBlobClient(nome).deleteIfExists())
        .succeeded;
    } catch (erro) {
      this.propagar(erro, 'excluir o blob');
    }
    if (!sucesso) {
      throw new NotFoundException('Blob não encontrado.');
    }
  }

  async existe(
    container: ContainerArmazenamento,
    blobName: string,
  ): Promise<boolean> {
    const nome = validarNomeBlob(blobName);
    const cliente = await this.garantirContainer(container);
    try {
      return await cliente.getBlockBlobClient(nome).exists();
    } catch (erro) {
      this.propagar(erro, 'consultar o blob');
    }
  }

  /** URL permanente. Recusada para profiles, feed e chat. */
  urlPublica(container: ContainerArmazenamento, blobName: string): string {
    const destino = this.exigirContainer(container);
    if (!ehContainerPublico(destino)) {
      throw new BadRequestException(
        `O container "${destino}" é privado e não possui URL pública permanente. Use uma SAS de leitura.`,
      );
    }
    return this.cliente()
      .getContainerClient(destino)
      .getBlockBlobClient(validarNomeBlob(blobName)).url;
  }

  /** SAS só de leitura, só para container privado, só desse blob. */
  sasLeitura(
    container: ContainerArmazenamento,
    blobName: string,
    minutos?: number,
  ): SasTemporaria {
    const destino = this.exigirContainer(container);
    if (!ehContainerPrivado(destino)) {
      throw new BadRequestException(
        `O container "${destino}" é público. Use a URL permanente, sem SAS.`,
      );
    }
    const permissoes = new BlobSASPermissions();
    permissoes.read = true;
    return this.emitirSas(
      destino,
      blobName,
      permissoes,
      this.resolverMinutos(
        minutos,
        this.prazos.leituraMinutos,
        SAS_LEITURA_MAX_MINUTOS,
      ),
    );
  }

  /**
   * SAS de escrita de um blob já nomeado pelo backend.
   * O cliente envia o arquivo direto ao Azure; a API não recebe o binário.
   * Só `write`: no Blob Storage essa permissão cobre Put Blob e o envio em
   * blocos. `create` junto não impede sobrescrita e não libera operação
   * extra nesse fluxo.
   */
  sasUpload(
    container: ContainerArmazenamento,
    blobName: string,
    opcoes: OpcoesSasUpload = {},
  ): SasTemporaria {
    const destino = this.exigirContainer(container);
    const permissoes = new BlobSASPermissions();
    permissoes.write = true;
    return this.emitirSas(
      destino,
      blobName,
      permissoes,
      this.resolverMinutos(
        opcoes.minutos,
        this.prazos.uploadMinutos,
        SAS_UPLOAD_MAX_MINUTOS,
      ),
      opcoes.contentType === undefined
        ? undefined
        : this.exigirMime(opcoes.contentType),
    );
  }

  private emitirSas(
    container: ContainerArmazenamento,
    blobName: string,
    permissoes: BlobSASPermissions,
    minutos: number,
    contentType?: string,
  ): SasTemporaria {
    const nome = validarNomeBlob(blobName);
    const expiraEm = new Date(Date.now() + minutos * 60_000);
    const consulta = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName: nome,
        permissions: permissoes,
        protocol: SASProtocol.Https,
        startsOn: new Date(Date.now() - FOLGA_RELOGIO_MS),
        expiresOn: expiraEm,
        contentType,
      },
      this.credencialCompartilhada(),
    ).toString();
    const url = this.cliente()
      .getContainerClient(container)
      .getBlockBlobClient(nome).url;
    return {
      container,
      blobName: nome,
      chave: montarChave(container, nome),
      url: `${url}?${consulta}`,
      expiraEm,
    };
  }

  private async garantirContainer(
    container: ContainerArmazenamento,
  ): Promise<ContainerClient> {
    const destino = this.exigirContainer(container);
    const cliente = this.cliente().getContainerClient(destino);
    let existe: boolean;
    try {
      existe = await cliente.exists();
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível consultar o Azure Blob Storage.',
      );
    }
    if (!existe) {
      throw new ServiceUnavailableException(
        `O container "${destino}" não existe no Azure Storage. Crie-o manualmente; a API não cria containers.`,
      );
    }
    return cliente;
  }

  private cliente(): BlobServiceClient {
    if (!this.servico || !this.credencial) {
      throw new ServiceUnavailableException(
        'Azure Blob Storage não está configurado. Defina AZURE_STORAGE_CONNECTION_STRING no .env.',
      );
    }
    return this.servico;
  }

  private credencialCompartilhada(): StorageSharedKeyCredential {
    if (!this.servico || !this.credencial) {
      throw new ServiceUnavailableException(
        'Azure Blob Storage não está configurado. Defina AZURE_STORAGE_CONNECTION_STRING no .env.',
      );
    }
    return this.credencial;
  }

  private exigirContainer(valor: string): ContainerArmazenamento {
    if (!ehContainerPermitido(valor)) {
      throw new BadRequestException(
        'Container de armazenamento não permitido.',
      );
    }
    return valor;
  }

  private exigirMime(contentType: string): string {
    const tipo = contentType?.trim() ?? '';
    if (!MIME.test(tipo) || tipo.length > 128) {
      throw new BadRequestException('Content-Type do blob inválido.');
    }
    return tipo;
  }

  private resolverMinutos(
    informado: number | undefined,
    padrao: number,
    maximo: number,
  ): number {
    if (informado === undefined) return padrao;
    if (!Number.isInteger(informado) || informado < 1 || informado > maximo) {
      throw new BadRequestException(
        `A SAS deve expirar entre 1 e ${maximo} minutos.`,
      );
    }
    return informado;
  }

  private propagar(erro: unknown, acao: string): never {
    const status = statusHttp(erro);
    if (status === 409 || status === 412) {
      throw new ConflictException(
        'Já existe um blob com esse nome. Gere uma nova chave.',
      );
    }
    if (status === 404) {
      throw new NotFoundException('Blob não encontrado.');
    }
    throw new ServiceUnavailableException(
      `Não foi possível ${acao} no Azure Blob Storage.`,
    );
  }
}

function statusHttp(erro: unknown): number | undefined {
  if (typeof erro === 'object' && erro !== null && 'statusCode' in erro) {
    const status = (erro as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number') return status;
  }
  return undefined;
}
