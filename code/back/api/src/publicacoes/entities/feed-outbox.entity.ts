import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { EventoFeed } from '../feed-evento.js';

@Entity({ name: 'feed_outbox' })
export class FeedOutboxEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'jsonb' }) evento: EventoFeed;
  @Index()
  @Column({ name: 'publicado_em', type: 'timestamptz', nullable: true })
  publicadoEm: Date | null;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm: Date;
}
