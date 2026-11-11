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
import { ParticipacaoEntity } from '../../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../../programas/entities/programa.entity.js';

export type EstadoMensagemChat = 'enviada' | 'entregue' | 'lida';

@Entity({ name: 'chats' })
@Index('idx_chat_programa_atualizado', ['programaId', 'atualizadoEm'])
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

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'enviada' })
  estado!: EstadoMensagemChat;

  @Column({ name: 'entregue_em', type: 'timestamptz', nullable: true })
  entregueEm!: Date | null;

  @Column({ name: 'lida_em', type: 'timestamptz', nullable: true })
  lidaEm!: Date | null;

  @CreateDateColumn({ name: 'criada_em', type: 'timestamptz' })
  criadaEm!: Date;
}
