import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { USUARIOS } from '../dados/dados.js';
import { ComentarioEntity } from './entities/comentario.entity.js';
import { CurtidaEntity } from './entities/curtida.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';

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
  categoria?: string;
  texto?: string;
  imagens?: string[];
}

@Injectable()
export class PublicacoesService {
  constructor(
    @InjectRepository(PublicacaoEntity)
    private readonly publicacoesRepository: Repository<PublicacaoEntity>,
    @InjectRepository(ComentarioEntity)
    private readonly comentariosRepository: Repository<ComentarioEntity>,
    @InjectRepository(CurtidaEntity)
    private readonly curtidasRepository: Repository<CurtidaEntity>,
  ) {}

  async listar(usuarioId: string): Promise<Publicacao[]> {
    const publicacoes = await this.publicacoesRepository.find({
      relations: { curtidas: true, comentarios: true },
      order: { criadoEm: 'DESC', id: 'DESC' },
    });
    return publicacoes.map((item) => this.apresentar(item, usuarioId));
  }

  async criar(
    corpo: CriarPublicacaoDto,
    usuarioId: string,
  ): Promise<Publicacao> {
    const texto = corpo.texto?.trim();
    const imagens = corpo.imagens ?? [];
    if (!texto) {
      throw new BadRequestException('O texto da publicação é obrigatório.');
    }
    if (
      !Array.isArray(imagens) ||
      imagens.some((imagem) => typeof imagem !== 'string')
    ) {
      throw new BadRequestException('A lista de imagens é inválida.');
    }
    if (imagens.length > 10) {
      throw new BadRequestException(
        'Uma publicação pode ter no máximo 10 fotos.',
      );
    }

    const usuario = Object.values(USUARIOS).find(
      // id da base demo (modo x-user-id) ou e-mail (identidade do token)
      (item) => String(item.id) === usuarioId || item.email === usuarioId,
    );
    const autor = usuario?.nome ?? corpo.autor?.trim() ?? 'Usuário';
    const registro = this.publicacoesRepository.create({
      autor,
      iniciais: this.obterIniciais(autor) || corpo.iniciais?.trim() || 'US',
      descricaoAutor:
        usuario?.curso ??
        corpo.descricaoAutor?.trim() ??
        'Comunidade acadêmica',
      categoria: corpo.categoria?.trim() || 'Dicas acadêmicas',
      texto,
      imagens,
      ownerId: usuarioId,
    });
    const salva = await this.publicacoesRepository.save(registro);
    salva.curtidas = [];
    salva.comentarios = [];
    return this.apresentar(salva, usuarioId);
  }

  async remover(id: number, usuarioId: string): Promise<{ removido: boolean }> {
    const publicacao = await this.encontrar(id);
    if (publicacao.ownerId !== usuarioId) {
      throw new BadRequestException(
        'Você só pode apagar suas próprias publicações.',
      );
    }

    await this.publicacoesRepository.remove(publicacao);
    return { removido: true };
  }

  async comentar(
    id: number,
    texto: string,
    usuarioId: string,
  ): Promise<Publicacao> {
    const publicacao = await this.encontrar(id);
    const comentario = texto.trim();
    if (!comentario) {
      throw new BadRequestException('O comentário é obrigatório.');
    }

    const salvo = await this.comentariosRepository.save(
      this.comentariosRepository.create({
        publicacaoId: publicacao.id,
        autorId: usuarioId,
        texto: comentario,
      }),
    );
    publicacao.comentarios.push(salvo);
    return this.apresentar(publicacao, usuarioId);
  }

  async curtir(
    id: number,
    delta: number,
    usuarioId: string,
  ): Promise<Publicacao> {
    const publicacao = await this.encontrar(id);
    if (delta !== 1 && delta !== -1) {
      throw new BadRequestException(
        'A ação precisa ser curtir (1) ou descurtir (-1).',
      );
    }

    const curtidaExistente = publicacao.curtidas.find(
      (curtida) => curtida.usuarioId === usuarioId,
    );
    if (delta === 1 && !curtidaExistente) {
      const salva = await this.curtidasRepository.save(
        this.curtidasRepository.create({
          publicacaoId: publicacao.id,
          usuarioId,
        }),
      );
      publicacao.curtidas.push(salva);
    } else if (delta === -1 && curtidaExistente) {
      await this.curtidasRepository.remove(curtidaExistente);
      publicacao.curtidas = publicacao.curtidas.filter(
        (curtida) => curtida.id !== curtidaExistente.id,
      );
    }
    return this.apresentar(publicacao, usuarioId);
  }

  private async encontrar(id: number): Promise<PublicacaoEntity> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Identificador de publicação inválido.');
    }
    const publicacao = await this.publicacoesRepository.findOne({
      where: { id },
      relations: { curtidas: true, comentarios: true },
    });
    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }
    return publicacao;
  }

  private apresentar(item: PublicacaoEntity, usuarioId: string): Publicacao {
    const curtidas = item.curtidas ?? [];
    const comentarios = [...(item.comentarios ?? [])].sort(
      (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime(),
    );
    return {
      id: item.id,
      autor: item.autor,
      iniciais: item.iniciais,
      descricaoAutor: item.descricaoAutor,
      tempo: this.tempoDecorrido(item.criadoEm),
      categoria: item.categoria,
      texto: item.texto,
      imagens: item.imagens,
      curtidas: curtidas.length,
      curtidoPeloUsuario: curtidas.some(
        (curtida) => curtida.usuarioId === usuarioId,
      ),
      comentarios: comentarios.length,
      comentariosTexto: comentarios.map((comentario) => comentario.texto),
      isOwn: item.ownerId === usuarioId,
    };
  }

  private obterIniciais(nome: string): string {
    return nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase())
      .join('');
  }

  private tempoDecorrido(data: Date): string {
    const minutos = Math.max(
      0,
      Math.floor((Date.now() - data.getTime()) / 60_000),
    );
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.floor(horas / 24);
    return dias === 1 ? 'ontem' : `há ${dias} dias`;
  }
}
