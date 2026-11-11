import { Injectable, type MessageEvent, OnModuleDestroy } from '@nestjs/common';
import {
  concat,
  interval,
  map,
  merge,
  Observable,
  of,
  Subject,
  takeUntil,
  timer,
} from 'rxjs';
import type { EventoFeed } from './feed-evento.js';

@Injectable()
export class FeedStreamService implements OnModuleDestroy {
  private readonly eventos = new Subject<MessageEvent>();
  private readonly fechar = new Subject<void>();
  private readonly vistos = new Set<string>();
  brokerConectado = false;

  receber(evento: EventoFeed): void {
    if (this.vistos.has(evento.id)) return;
    this.vistos.add(evento.id);
    if (this.vistos.size > 2000)
      this.vistos.delete(this.vistos.values().next().value!);
    this.eventos.next({ id: evento.id, type: evento.tipo, data: evento });
  }

  /** Também sincroniza clientes existentes quando o broker reconecta. */
  conectado(): void {
    this.brokerConectado = true;
    this.eventos.next({ type: 'feed.ready', data: { conectado: true } });
  }

  observar(expiraEm: number): Observable<MessageEvent> {
    return concat(
      of({ type: 'feed.ready', data: { conectado: this.brokerConectado } }),
      merge(
        this.eventos,
        interval(15_000).pipe(
          map(() => ({
            type: 'feed.heartbeat',
            data: { conectado: this.brokerConectado },
          })),
        ),
      ),
    ).pipe(
      takeUntil(timer(Math.max(0, expiraEm - Date.now()))),
      takeUntil(this.fechar),
    );
  }

  onModuleDestroy(): void {
    this.fechar.next();
    this.fechar.complete();
    this.eventos.complete();
  }
}
