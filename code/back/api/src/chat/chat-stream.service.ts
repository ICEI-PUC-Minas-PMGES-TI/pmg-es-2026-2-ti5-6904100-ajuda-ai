import {
  HttpException,
  Injectable,
  type MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  catchError,
  concat,
  concatMap,
  filter,
  from,
  interval,
  map,
  merge,
  Observable,
  of,
  Subject,
  takeUntil,
  takeWhile,
  timer,
  throwError,
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

  private validarAcesso(
    verificarAcesso: () => Promise<void>,
    autorizado: () => MessageEvent,
  ): Observable<MessageEvent> {
    return from(verificarAcesso()).pipe(
      map(autorizado),
      catchError((erro: unknown) => {
        if (
          erro instanceof HttpException &&
          [401, 403, 404].includes(erro.getStatus())
        ) {
          return of({
            type: 'chat.access',
            data: { revogado: true },
          });
        }
        return throwError(() => erro);
      }),
    );
  }

  observar(
    chatId: number,
    expiraEm: number,
    verificarAcesso: () => Promise<void>,
  ): Observable<MessageEvent> {
    return concat(
      of({
        type: 'chat.ready',
        data: { conectado: this.brokerConectado },
      }),
      merge(
        this.eventos.pipe(
          filter((evento) => evento.chatId === chatId),
          concatMap((evento) =>
            this.validarAcesso(verificarAcesso, () => ({
              id: evento.id,
              type: evento.tipo,
              data: evento,
            })),
          ),
        ),
        interval(15_000).pipe(
          concatMap(() =>
            this.validarAcesso(verificarAcesso, () => ({
              type: 'chat.heartbeat',
              data: { conectado: this.brokerConectado },
            })),
          ),
        ),
      ),
    ).pipe(
      takeWhile((evento) => evento.type !== 'chat.access', true),
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
