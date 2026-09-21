import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export interface Publicacao {
  id: number;
  autor: string;
  iniciais: string;
  descricaoAutor: string;
  tempo: string;
  categoria: string;
  texto: string;
  imagens: string[];
  curtidas: number;
  curtidoPeloUsuario: boolean;
  comentarios: number;
  comentariosTexto: string[];
  isOwn: boolean;
}

interface CriarPublicacaoDto {
  autor?: string;
  iniciais?: string;
  descricaoAutor?: string;
  tempo?: string;
  categoria?: string;
  texto?: string;
  imagens?: string[];
}

@Injectable()
export class PublicacoesService {
  private proximoId = 1;
  private readonly publicacoes: Publicacao[] = [];

  listar(): Publicacao[] {
    return this.publicacoes;
  }

  criar(corpo: CriarPublicacaoDto): Publicacao {
    const texto = corpo.texto?.trim();
    if (!texto) {
      throw new BadRequestException('O texto da publicação é obrigatório.');
    }
    if ((corpo.imagens?.length ?? 0) > 10) {
      throw new BadRequestException('Uma publicação pode ter no máximo 10 fotos.');
    }

    const publicacao: Publicacao = {
      id: this.proximoId++,
      autor: corpo.autor ?? 'Camila Andrade',
      iniciais: corpo.iniciais ?? 'CA',
      descricaoAutor: corpo.descricaoAutor ?? 'Engenharia de Software',
      tempo: corpo.tempo ?? 'agora',
      categoria: corpo.categoria ?? 'Dicas acadêmicas',
      texto,
      imagens: corpo.imagens ?? [],
      curtidas: 0,
      curtidoPeloUsuario: false,
      comentarios: 0,
      comentariosTexto: [],
      isOwn: true,
    };

    this.publicacoes.unshift(publicacao);
    return publicacao;
  }

  remover(id: number): { removido: boolean } {
    const indice = this.publicacoes.findIndex((publicacao) => publicacao.id === id);
    if (indice < 0) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    this.publicacoes.splice(indice, 1);
    return { removido: true };
  }

  comentar(id: number, texto: string): Publicacao {
    const publicacao = this.publicacoes.find((item) => item.id === id);
    const comentario = texto.trim();
    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }
    if (!comentario) {
      throw new BadRequestException('O comentário é obrigatório.');
    }

    publicacao.comentariosTexto.push(comentario);
    publicacao.comentarios = publicacao.comentariosTexto.length;
    return publicacao;
  }

  curtir(id: number, delta: number): Publicacao {
    const publicacao = this.publicacoes.find((item) => item.id === id);
    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    if (delta >= 0 && !publicacao.curtidoPeloUsuario) {
      publicacao.curtidas += 1;
      publicacao.curtidoPeloUsuario = true;
    } else if (delta < 0 && publicacao.curtidoPeloUsuario) {
      publicacao.curtidas = Math.max(0, publicacao.curtidas - 1);
      publicacao.curtidoPeloUsuario = false;
    }
    return publicacao;
  }
}
