import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioEntity } from './entities/usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';

/**
 * Persistência dos alunos. Sem controllers para não depender do AuthModule
 * (que usa este módulo no login); as rotas `/me` e `/cadastro` ficam no
 * CadastroModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UsuarioEntity])],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
