import { Injectable, type MessageEvent, OnModuleDestroy } from '@nestjs/common';
import {
  concat,
  filter,
  interval,
  map,
  merge,
  Observable,
  of,
  Subject,
  takeUntil,
  timer,
} from 'rxjs';
import type { EventoChat } from './chat-evento.js';

@Injectable()
export class ChatStreamService implements OnModuleDestroy {
  private readonly eventos = new Subject<EventoChat>();
  private readonly fechar = new Subject<void>();
  private readonly vistos = new Set<string>();
  brokerConectado = false;

  receber(evento: EventoChat): void {
    if (this.vistos.has(evento.id)) return;
    this.vistos.add(evento.id);
    if (this.vistos.size > 2000)
      this.vistos.delete(this.vistos.values().next().value!);
    this.eventos.next(evento);
  }

  conectado(): void {
    this.brokerConectado = true;
  }

  observar(chatId: number, expiraEm: number): Observable<MessageEvent> {
    return concat(
      of({
        type: 'chat.ready',
        data: { conectado: this.brokerConectado },
      }),
      merge(
        this.eventos.pipe(
          filter((evento) => evento.chatId === chatId),
          map((evento) => ({
            id: evento.id,
            type: evento.tipo,
            data: evento,
          })),
        ),
        interval(15_000).pipe(
          map(() => ({
            type: 'chat.heartbeat',
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
