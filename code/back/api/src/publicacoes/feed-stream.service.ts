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
import type { FeedPermissoesDto } from './publicacoes.dto.js';

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

  /** A autorização é renovada antes de cada evento e a cada dois segundos. */
  observarAutorizado(
    expiraEm: number,
    consultar: () => Promise<FeedPermissoesDto>,
    programaPedido?: string,
  ): Observable<MessageEvent> {
    return new Observable((assinante) => {
      let terminou = false,
        ocupado = false,
        repetir = false;
      let pendente: MessageEvent | undefined;
      let assinatura = '';
      const verificar = async () => {
        if (terminou) return;
        if (ocupado) {
          repetir = true;
          return;
        }
        ocupado = true;
        const evento = pendente;
        pendente = undefined;
        try {
          const p = await consultar();
          if (terminou || Date.now() >= expiraEm) return;
          if (
            !p.podeLer ||
            (programaPedido &&
              programaPedido !== p.programa &&
              !p.podeAdministrar)
          ) {
            assinante.next({ type: 'feed.access', data: { revogado: true } });
            assinante.complete();
            return;
          }
          const nova = JSON.stringify(p);
          if (nova !== assinatura) {
            assinatura = nova;
            assinante.next({ type: 'feed.permissions', data: p });
          }
          const escopo = programaPedido || p.programa;
          const dados = evento?.data as Partial<EventoFeed> | undefined;
          if (
            evento &&
            ((!evento.type?.startsWith('feed.post.') &&
              !evento.type?.startsWith('feed.comment.') &&
              evento.type !== 'feed.like.updated') ||
              dados?.programaCodigo === escopo)
          )
            assinante.next(evento);
        } catch {
          if (!terminou) {
            assinante.next({ type: 'feed.access', data: { revogado: true } });
            assinante.complete();
          }
        } finally {
          ocupado = false;
          if (repetir && !terminou) {
            repetir = false;
            void verificar();
          }
        }
      };
      const sub = this.observar(expiraEm).subscribe({
        next: (evento) => {
          // Rajadas viram ressincronização completa: não perder posts ao coalescer IDs.
          pendente = pendente
            ? { type: 'feed.ready', data: { conectado: this.brokerConectado } }
            : evento;
          void verificar();
        },
        complete: () => assinante.complete(),
        error: (erro) => assinante.error(erro),
      });
      const timerAcesso = setInterval(() => {
        void verificar();
      }, 2000);
      return () => {
        terminou = true;
        clearInterval(timerAcesso);
        sub.unsubscribe();
      };
    });
  }

  onModuleDestroy(): void {
    this.fechar.next();
    this.fechar.complete();
    this.eventos.complete();
  }
}
