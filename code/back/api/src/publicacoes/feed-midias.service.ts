import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { detectarTipoCardapio } from '../campus/cardapios/cardapio-arquivo.js';
import { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';

@Injectable()
export class FeedMidiasService {
  async fotoAutor(id: number): Promise<string | null> {
    try {
      return await this.storage.urlFotoPerfil(id);
    } catch {
      // Foto opcional: indisponibilidade do storage não deve impedir comentários.
      return null;
    }
  }
  constructor(private readonly storage: AzureBlobStorageService) {}
  private pasta(email: string): string {
    return `publicacoes/${createHash('sha256').update(email).digest('hex').slice(0, 24)}/`;
  }

  async enviar(dados: Buffer | undefined, email: string) {
    if (!dados?.length || dados.length > 5 * 1024 * 1024)
      throw new BadRequestException('Envie uma imagem de até 5 MB.');
    const tipo = detectarTipoCardapio(dados);
    const ext =
      tipo === 'image/png'
        ? 'png'
        : tipo === 'image/jpeg'
          ? 'jpg'
          : tipo === 'image/webp'
            ? 'webp'
            : null;
    if (!tipo || !ext)
      throw new BadRequestException('Envie uma imagem PNG, JPEG ou WebP.');
    const nome = `${this.pasta(email)}${randomUUID()}.${ext}`;
    const blob = await this.storage.enviar('feed', nome, dados, tipo);
    return {
      chave: blob.chave,
      url: this.storage.sasLeitura('feed', nome).url,
    };
  }

  async validar(chaves: string[], email: string): Promise<void> {
    for (const chave of chaves) {
      const nome = chave.slice('feed/'.length);
      if (
        !chave.startsWith(`feed/${this.pasta(email)}`) ||
        !/^[a-z0-9/.-]+$/.test(nome) ||
        nome.includes('..') ||
        !/\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(nome)
      )
        throw new BadRequestException(
          'Mídia inválida: envie a imagem pelo upload do feed.',
        );
      if (!(await this.storage.existe('feed', nome)))
        throw new BadRequestException('Imagem do feed não encontrada.');
    }
  }

  urls(chaves: string[]): string[] {
    return chaves.map((chave) =>
      chave.startsWith('feed/publicacoes/')
        ? this.storage.sasLeitura('feed', chave.slice(5)).url
        : chave,
    ); // Leitura de publicações legadas preservada; novos envios só aceitam chaves.
  }
}
