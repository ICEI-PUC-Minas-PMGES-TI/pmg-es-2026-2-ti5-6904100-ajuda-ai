import { api } from '../../api/client';

/**
 * `GET /me/xp` compartilhado entre o cartão de progresso e a celebração
 * automática: leituras simultâneas viram uma requisição, e quem ouve recebe
 * o valor novo (o cartão reflete o nível assim que a animação aparece).
 */
let emVoo = null;
const ouvintes = new Set();

export function lerProgresso(carregar = () => api.progressoAluno()) {
  emVoo ??= carregar()
    .then((dados) => {
      for (const ouvinte of ouvintes) ouvinte(dados);
      return dados;
    })
    .finally(() => {
      emVoo = null;
    });
  return emVoo;
}

export function ouvirProgresso(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
