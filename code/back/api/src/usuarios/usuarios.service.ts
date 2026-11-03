import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { seedDemoHabilitado } from '../config/seguranca.js';
import { USUARIOS } from '../dados/dados.js';
import {
  StatusCadastro,
  TipoParticipacao,
  UsuarioEntity,
} from './entities/usuario.entity.js';

/** Usuário no formato da API (o mesmo para sessão, /me e coordenação). */
export function serializarUsuario(usuario: UsuarioEntity) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.tipoParticipacao,
    tipoParticipacao: usuario.tipoParticipacao,
    statusCadastro: usuario.statusCadastro,
    curso: usuario.curso,
    periodo: usuario.periodo,
    turno: usuario.turno ?? null,
    interesses: usuario.interesses ?? [],
    motivoRejeicao: usuario.motivoRejeicao ?? null,
    analisadoEm: usuario.analisadoEm ?? null,
    criadoEm: usuario.criadoEm,
    atualizadoEm: usuario.atualizadoEm,
  };
}

export type UsuarioSerializado = ReturnType<typeof serializarUsuario>;

/** Situação dos alunos da base demo (mesma da semente de participações). */
const STATUS_DEMO: Record<string, StatusCadastro> = {
  'camila@pucminas.edu.br': 'aprovado',
  'thiago@pucminas.edu.br': 'aprovado',
  'lucas.almeida@pucminas.edu.br': 'aprovado',
  'ana.beatriz@pucminas.edu.br': 'pendente',
  'pedro.lima@pucminas.edu.br': 'pendente',
  'julia.fernandes@pucminas.edu.br': 'rejeitado',
};

@Injectable()
export class UsuariosService implements OnModuleInit {
  constructor(
    @InjectRepository(UsuarioEntity)
    private readonly usuarios: Repository<UsuarioEntity>,
  ) {}

  async onModuleInit() {
    if (seedDemoHabilitado()) await this.semearAlunosDemo();
  }

  static normalizarEmail(email: string): string {
    return String(email ?? '')
      .trim()
      .toLowerCase();
  }

  buscarPorEmail(email: string): Promise<UsuarioEntity | null> {
    const chave = UsuariosService.normalizarEmail(email);
    if (!chave) return Promise.resolve(null);
    return this.usuarios.findOne({ where: { email: chave } });
  }

  buscarAutoresPorEmails(emails: string[]) {
    if (!emails.length) return Promise.resolve([]);
    return this.usuarios.find({
      where: { email: In(emails.map(UsuariosService.normalizarEmail)) },
      select: { id: true, nome: true, email: true },
    });
  }

  async buscarPorId(id: number): Promise<UsuarioEntity> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return usuario;
  }

  listar(status?: StatusCadastro): Promise<UsuarioEntity[]> {
    return this.usuarios.find({
      where: status ? { statusCadastro: status } : {},
      order: { criadoEm: 'DESC' },
    });
  }

  /** Mapa e-mail → usuário, para enriquecer listas de participações. */
  async mapaPorEmail(): Promise<Map<string, UsuarioEntity>> {
    const todos = await this.usuarios.find();
    return new Map(todos.map((u) => [u.email, u]));
  }

  transacao<T>(acao: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.usuarios.manager.transaction(acao);
  }

  async atualizarPerfil(
    email: string,
    dados: Record<string, unknown>,
    criar = false,
  ) {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados))
      throw new BadRequestException('Perfil inválido.');
    const permitidos = ['nome', 'curso', 'periodo', 'turno', 'interesses'];
    if (Object.keys(dados).some((k) => !permitidos.includes(k))) {
      throw new BadRequestException(
        'Campo não autorizado. O e-mail institucional não pode ser alterado.',
      );
    }
    let usuario = await this.buscarPorEmail(email);
    if (!usuario && !criar)
      throw new NotFoundException('Perfil não encontrado.');
    usuario ??= this.usuarios.create({
      email: UsuariosService.normalizarEmail(email),
      tipoParticipacao: 'nenhuma',
      statusCadastro: 'aprovado',
    });
    usuario = this.usuarios.create({ ...usuario });
    const novo = { ...usuario, ...dados };
    for (const chave of ['nome', 'curso'] as const) {
      if (
        typeof novo[chave] !== 'string' ||
        !novo[chave].trim() ||
        novo[chave].length > 120
      )
        throw new BadRequestException(`Informe ${chave} válido.`);
      usuario[chave] = novo[chave].trim();
    }
    if (
      !Number.isInteger(novo.periodo) ||
      Number(novo.periodo) < 1 ||
      Number(novo.periodo) > 12
    )
      throw new BadRequestException('Período deve estar entre 1 e 12.');
    usuario.periodo = Number(novo.periodo);
    if (dados.turno !== undefined) {
      if (typeof dados.turno !== 'string' || dados.turno.length > 40)
        throw new BadRequestException('Turno inválido.');
      usuario.turno = dados.turno.trim();
    }
    if (dados.interesses !== undefined) {
      if (
        !Array.isArray(dados.interesses) ||
        dados.interesses.length > 20 ||
        dados.interesses.some((v) => typeof v !== 'string' || v.length > 80)
      )
        throw new BadRequestException('Interesses inválidos.');
      usuario.interesses = dados.interesses
        .map((v: string) => v.trim())
        .filter(Boolean);
    }
    return this.usuarios.save(usuario);
  }

  criar(dados: Partial<UsuarioEntity>): UsuarioEntity {
    return this.usuarios.create(dados);
  }

  salvar(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    return this.usuarios.save(usuario);
  }

  /**
   * Leva os alunos da base demo para o banco, para que o painel e os testes
   * manuais tenham padrinhos/apadrinhados aprovados, pendentes e rejeitados.
   * Idempotente: não altera usuários que já existem.
   */
  async semearAlunosDemo() {
    for (const demo of Object.values(USUARIOS)) {
      if (demo.perfil === 'coordenador') continue;
      const email = UsuariosService.normalizarEmail(demo.email);
      if (await this.buscarPorEmail(email)) continue;
      const status = STATUS_DEMO[email] ?? 'aprovado';
      await this.usuarios.save(
        this.usuarios.create({
          nome: demo.nome,
          email,
          curso: demo.curso,
          periodo: demo.periodo,
          turno: null,
          interesses: null,
          tipoParticipacao: demo.perfil as TipoParticipacao,
          statusCadastro: status,
          motivoRejeicao:
            status === 'rejeitado'
              ? 'Pré-requisitos do ciclo não declarados.'
              : null,
          analisadoEm: status === 'pendente' ? null : new Date(),
          analisadoPor: status === 'pendente' ? null : 'renata@pucminas.edu.br',
        }),
      );
    }
  }
}
