import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import CelebracaoNivel from './CelebracaoNivel';
import { deveCelebrar, enviarConfirmacao, idDispositivo, lerGuarda, marcarExibida } from './celebracaoAluno';
import { chaveSessao, lerProgresso } from './progressoAluno';

/** Intervalo mínimo entre releituras ao voltar para a aba. */
const RELEITURA_MS = 60 * 1000;

/**
 * Mostra a animação quando o aluno conquistou um nível de verdade (valor do
 * servidor). Fica no layout do aluno: vale para qualquer página. Relê ao
 * entrar e ao voltar para a aba (a conquista pode ter vindo de um totem no
 * app). Nunca concede nada: só exibe e confirma a exibição.
 */
export default function CelebracaoAutomatica({ email }) {
  const [celebracao, setCelebracao] = useState(null);
  const ultimaLeitura = useRef(0);

  useEffect(() => {
    if (!email) return undefined;
    let ativo = true;
    let atraso;
    // Tudo preso à conta (`email`): com outra conta logada a chamada é
    // recusada, nunca confirmada na sessão errada.
    const confirmar = () => enviarConfirmacao(email, (nivel) => api.confirmarCelebracaoNivel(nivel, email));
    const mesmaSessao = (chave) => ativo && chaveSessao() === chave;

    async function verificar() {
      const chave = chaveSessao();
      ultimaLeitura.current = Date.now();
      await confirmar();
      let dados;
      try {
        dados = await lerProgresso(() => api.progressoAluno(email), chave);
      } catch {
        return; // offline/servidor fora: a conquista continua pendente no servidor
      }
      const c = dados?.celebracao;
      // Resposta de outra sessão (logout/login durante a requisição): descarta.
      if (!mesmaSessao(chave) || !deveCelebrar(c, lerGuarda(email))) return;
      // Um instante para a página por trás já mostrar o nível novo. A marca
      // e a confirmação acontecem só quando a animação aparece de fato.
      clearTimeout(atraso);
      atraso = setTimeout(async () => {
        if (!mesmaSessao(chave) || !deveCelebrar(c, lerGuarda(email))) return;
        // O servidor dá a vez a UM aparelho; os outros esperam (e, se ele
        // fechar antes de exibir, a reserva expira e a vez volta).
        try {
          const vez = await api.reivindicarCelebracaoNivel(c.para, idDispositivo(), email);
          if (vez?.autorizado !== true) return;
        } catch {
          return; // sem vez, sem animação: continua pendente no servidor
        }
        if (!mesmaSessao(chave) || !deveCelebrar(c, lerGuarda(email))) return;
        marcarExibida(email, c.para);
        confirmar();
        setCelebracao(c);
      }, 450);
    }

    verificar();
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaLeitura.current > RELEITURA_MS) verificar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      clearTimeout(atraso);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [email]);

  if (!celebracao) return null;
  return (
    <CelebracaoNivel
      key={celebracao.para}
      nivel={{ numero: celebracao.para, nome: celebracao.nome }}
      niveisAvancados={celebracao.niveisAvancados}
      onFechar={() => setCelebracao(null)}
    />
  );
}
