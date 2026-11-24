/**
 * Limite simples de tentativas por chave (IP) numa janela fixa, em memória.
 * Suficiente para uma réplica; com várias réplicas cada uma conta a sua parte
 * (o limite efetivo multiplica, mas continua barrando força bruta).
 */
export class LimiteTentativas {
  private readonly janelas = new Map<string, { inicio: number; total: number }>();

  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Conta a tentativa. `false` = estourou o limite nesta janela. */
  registrar(chave: string): boolean {
    const agora = this.agora();
    if (this.janelas.size > 10_000) this.limparExpiradas(agora);
    const atual = this.janelas.get(chave);
    if (!atual || agora - atual.inicio >= this.janelaMs) {
      this.janelas.set(chave, { inicio: agora, total: 1 });
      return true;
    }
    atual.total += 1;
    return atual.total <= this.maximo;
  }

  private limparExpiradas(agora: number) {
    for (const [chave, janela] of this.janelas) {
      if (agora - janela.inicio >= this.janelaMs) this.janelas.delete(chave);
    }
  }
}
