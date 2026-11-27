import {
  Controller,
  Get,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import { ChatController } from '../../src/chat/chat.controller.js';
import { ChatService } from '../../src/chat/chat.service.js';
import { MatchingController } from '../../src/matching/matching.controller.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import { VinculosService } from '../../src/matching/vinculos.service.js';
import { CriterioCatalogoService } from '../../src/matching/criterio-catalogo.service.js';
import { ParticipacoesService } from '../../src/participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../../src/participacoes/permissoes-aluno.service.js';
import { ParticipacaoEntity } from '../../src/participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../../src/programas/programas.service.js';
import { PublicacoesController } from '../../src/publicacoes/publicacoes.controller.js';
import { PublicacoesService } from '../../src/publicacoes/publicacoes.service.js';
import { PublicacaoEntity } from '../../src/publicacoes/entities/publicacao.entity.js';
import {
  FeedPolicy,
  FeedPublishGuard,
  FeedAdminGuard,
  FeedLeituraGuard,
} from '../../src/publicacoes/feed-policy.js';
import { FeedMidiasService } from '../../src/publicacoes/feed-midias.service.js';
import { FeedStreamService } from '../../src/publicacoes/feed-stream.service.js';
import { UsuariosService } from '../../src/usuarios/usuarios.service.js';
import { ParticipacoesController } from '../../src/participacoes/participacoes.controller.js';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../../src/auth/authenticated-request.js';
import { servicosMatching } from './matching-postgres.js';

/** API real com identidades de teste locais; não usa Entra ID nem Azure Storage. */
export async function apiMatchingIsolada(dados: DataSource) {
  const servicos = servicosMatching(dados);
  const participacoes = new ParticipacoesService(
    dados.getRepository(ParticipacaoEntity),
    dados.getRepository(ProgramaEntity),
    dados,
    servicos.operacoes,
  );
  const programas = new ProgramasService(dados.getRepository(ProgramaEntity));
  const permissoes = new PermissoesAlunoService(participacoes, programas);
  const policy = new FeedPolicy(permissoes);
  const midias = {
    validar: async (imagens: string[]) => {
      if (imagens.length) throw new Error('Este cenário não usa mídias.');
    },
    urls: () => [],
    fotoAutor: async () => null,
  } as unknown as FeedMidiasService;
  const buscarPorEmail = async (email: string) => {
    const p = await dados
      .getRepository(ParticipacaoEntity)
      .findOneBy({ usuarioId: email });
    return p
      ? {
          id: p.id,
          email,
          nome: p.respostas?.nome ?? email,
          curso: 'Engenharia de Software',
          periodo: p.respostas?.periodo ?? 1,
          turno: 'Noite',
          interesses: [],
          cadastroStatus: 'aprovado',
          criadoEm: p.criadoEm,
        }
      : null;
  };
  const usuarios = {
    buscarPorEmail,
    buscarAutoresPorEmails: async (emails: string[]) =>
      (await Promise.all(emails.map(buscarPorEmail))).filter(Boolean),
  } as unknown as UsuariosService;
  const publicacoes = new PublicacoesService(
    dados.getRepository(PublicacaoEntity),
    dados,
    policy,
    usuarios,
    midias,
  );
  @Controller()
  @UseGuards(JwtAuthGuard)
  class IdentidadesTesteController {
    @Get('me') perfil(@Req() req: AuthenticatedRequest) {
      return buscarPorEmail(req.user.email);
    }
    @Get('coordenacao/programas') ciclos() {
      return programas.listar();
    }
  }
  const modulo = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: 'segredo-exclusivo-homologacao-matching' }),
    ],
    controllers: [
      ChatController,
      MatchingController,
      PublicacoesController,
      ParticipacoesController,
      IdentidadesTesteController,
    ],
    providers: [
      { provide: ChatService, useValue: servicos.chat },
      { provide: MatchingService, useValue: servicos.matching },
      { provide: VinculosService, useValue: servicos.operacoes },
      {
        provide: CriterioCatalogoService,
        useValue: new CriterioCatalogoService(dados),
      },
      { provide: ParticipacoesService, useValue: participacoes },
      { provide: ProgramasService, useValue: programas },
      { provide: UsuariosService, useValue: usuarios },
      { provide: FeedPolicy, useValue: policy },
      { provide: PublicacoesService, useValue: publicacoes },
      { provide: FeedMidiasService, useValue: midias },
      FeedStreamService,
      FeedPublishGuard,
      FeedAdminGuard,
      FeedLeituraGuard,
    ],
  }).compile();
  const app = modulo.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableCors();
  await app.listen(0, '127.0.0.1');
  const token = (email: string, perfil = 'nenhuma') =>
    app
      .get(JwtService)
      .sign(
        { sub: email, email, perfil, escopo: 'acesso' },
        { expiresIn: '1h' },
      );
  return { app, token, publicacoes, policy, ...servicos };
}
