import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { MatchingVinculoEntity } from '../../matching/entities/matching.entity.js';
import { MatchingGrupoEntity } from '../../matching/entities/grupo.entity.js';
import { ParticipacaoEntity } from '../../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../../programas/entities/programa.entity.js';

export type EstadoMensagemChat = 'enviada' | 'entregue' | 'lida';

@Entity({ name: 'chats' })
@Index('idx_chat_programa_atualizado', ['programaId', 'atualizadoEm'])
@Index('uq_chat_matching_vinculo', ['matchingVinculoId'], {
  unique: true,
  where: '"matching_vinculo_id" IS NOT NULL',
})
@Index('uq_chat_grupo', ['grupoId'], {
  unique: true,
  where: '"grupo_id" IS NOT NULL',
})
export class ChatEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ name: 'matching_vinculo_id', type: 'int', nullable: true })
  matchingVinculoId!: number | null;

  @ManyToOne(() => MatchingVinculoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'matching_vinculo_id' })
  matchingVinculo!: MatchingVinculoEntity | null;

  @Column({ type: 'varchar', length: 20, default: 'legado' })
  tipo!: 'privado' | 'coletivo' | 'legado';
  @Column({ name: 'grupo_id', type: 'int', nullable: true }) grupoId!:
    number | null;
  @ManyToOne(() => MatchingGrupoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'grupo_id' })
  grupo!: MatchingGrupoEntity | null;
  @Column({ type: 'int', default: 0 }) revisao!: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  titulo!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @OneToMany(() => ChatParticipanteEntity, (participante) => participante.chat)
  participantes!: ChatParticipanteEntity[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}

@Entity({ name: 'chat_participantes' })
@Unique('uq_chat_participante', ['chatId', 'participacaoId'])
@Index('idx_chat_participante_participacao', ['participacaoId'])
export class ChatParticipanteEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chat_id', type: 'int' })
  chatId!: number;

  @ManyToOne(() => ChatEntity, (chat) => chat.participantes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chat_id' })
  chat!: ChatEntity;

  @Column({ name: 'participacao_id', type: 'int' })
  participacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participacao_id' })
  participacao!: ParticipacaoEntity;

  @CreateDateColumn({ name: 'entrou_em', type: 'timestamptz' })
  entrouEm!: Date;
}

@Entity({ name: 'mensagens_chat' })
@Index(
  'uq_chat_mensagem_cliente',
  ['chatId', 'remetenteParticipacaoId', 'clientId'],
  { unique: true, where: '"client_id" IS NOT NULL' },
)
@Index('idx_mensagem_chat_criada', ['chatId', 'criadaEm'])
@Index('idx_mensagem_chat_estado', ['chatId', 'estado'])
export class MensagemChatEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chat_id', type: 'int' })
  chatId!: number;

  @ManyToOne(() => ChatEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat!: ChatEntity;

  @Column({ name: 'remetente_participacao_id', type: 'int' })
  remetenteParticipacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remetente_participacao_id' })
  remetente!: ParticipacaoEntity;

  @Column({ type: 'text' })
  texto!: string;
  @Column({ name: 'imagem_chave', type: 'varchar', length: 1024, nullable: true })
  imagemChave!: string | null;
  @Column({
    name: 'remetente_nome',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  remetenteNome!: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true }) clientId!:
    string | null;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'enviada' })
  estado!: EstadoMensagemChat;

  @Column({ name: 'entregue_em', type: 'timestamptz', nullable: true })
  entregueEm!: Date | null;

  @Column({ name: 'lida_em', type: 'timestamptz', nullable: true })
  lidaEm!: Date | null;

  @CreateDateColumn({ name: 'criada_em', type: 'timestamptz' })
  criadaEm!: Date;
}

/** Uma saída encerra o intervalo; uma volta cria outro, sem revelar o intervalo ausente. */
@Entity({ name: 'chat_periodos' })
@Index('idx_chat_periodo_pessoa', ['participacaoId', 'chatId'])
@Index('uq_chat_periodo_aberto', ['chatId', 'participacaoId'], {
  unique: true,
  where: '"ate_mensagem_id" IS NULL',
})
export class ChatPeriodoEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'chat_id', type: 'int' }) chatId!: number;
  @ManyToOne(() => ChatEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chat_id' })
  chat!: ChatEntity;
  @Column({ name: 'participacao_id', type: 'int' }) participacaoId!: number;
  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participacao_id' })
  participacao!: ParticipacaoEntity;
  @Column({ name: 'apos_mensagem_id', type: 'int', default: 0 })
  aposMensagemId!: number;
  @Column({ name: 'ate_mensagem_id', type: 'int', nullable: true })
  ateMensagemId!: number | null;
  @CreateDateColumn({ name: 'entrou_em', type: 'timestamptz' }) entrouEm!: Date;
  @Column({ name: 'saiu_em', type: 'timestamptz', nullable: true })
  saiuEm!: Date | null;
}

/** Recibo de cada destinatário presente no envio; o grupo não tem uma única leitura global. */
@Entity({ name: 'chat_destinatarios' })
@Unique('uq_chat_destinatario', ['mensagemId', 'participacaoId'])
@Index('idx_chat_destinatario_pessoa', ['participacaoId', 'mensagemId'])
@Index('idx_chat_destinatario_revisao', ['chatId', 'revisao'])
export class ChatDestinatarioEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int', default: 0 }) revisao!: number;
  @Column({ name: 'chat_id', type: 'int' }) chatId!: number;
  @ManyToOne(() => ChatEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chat_id' })
  chat!: ChatEntity;
  @Column({ name: 'mensagem_id', type: 'int' }) mensagemId!: number;
  @ManyToOne(() => MensagemChatEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mensagem_id' })
  mensagem!: MensagemChatEntity;
  @Column({ name: 'participacao_id', type: 'int' }) participacaoId!: number;
  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participacao_id' })
  participacao!: ParticipacaoEntity;
  @Column({ name: 'entregue_em', type: 'timestamptz', nullable: true })
  entregueEm!: Date | null;
  @Column({ name: 'lida_em', type: 'timestamptz', nullable: true })
  lidaEm!: Date | null;
}
