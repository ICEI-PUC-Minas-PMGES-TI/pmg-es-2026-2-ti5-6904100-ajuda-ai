import { api, getAlunoSession } from '../../api/client';

/**
 * `GET /me/xp` compartilhado entre o cartão de progresso e a celebração
 * automática: leituras simultâneas viram uma requisição, e quem ouve recebe
 * o valor novo (o cartão reflete o nível assim que a animação aparece).
 *
 * O compartilhamento vale SÓ dentro da mesma sessão: a requisição e os
 * ouvintes ficam presos à chave da sessão que os criou. Quem sai e entra com
 * outra conta durante uma requisição não reaproveita nem recebe o progresso
 * da conta anterior.
 */
const emVoo = new Map();
const ouvintes = new Set();

/** Identifica a sessão do aluno (e-mail + token); `''` se não houver. */
export function chaveSessao() {
  const sessao = getAlunoSession();
  return sessao?.accessToken ? `${sessao.email}|${sessao.accessToken}` : '';
}

/**
 * @param carregar leitura a executar; o padrão usa a sessão vigente NESTE
 *   instante (a requisição só vale para o e-mail que a iniciou).
 * @param chave sessão dona da leitura; o padrão é a sessão vigente.
 */
export function lerProgresso(carregar, chave = chaveSessao()) {
  if (!emVoo.has(chave)) {
    const email = getAlunoSession()?.email;
    const executar = carregar ?? (() => api.progressoAluno(email));
    const promessa = executar()
      .then((dados) => {
        for (const ouvinte of [...ouvintes]) if (ouvinte.chave === chave) ouvinte.fn(dados);
        return dados;
      })
      .finally(() => {
        if (emVoo.get(chave) === promessa) emVoo.delete(chave);
      });
    emVoo.set(chave, promessa);
  }
  return emVoo.get(chave);
}

export function ouvirProgresso(fn, chave = chaveSessao()) {
  const ouvinte = { fn, chave };
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
