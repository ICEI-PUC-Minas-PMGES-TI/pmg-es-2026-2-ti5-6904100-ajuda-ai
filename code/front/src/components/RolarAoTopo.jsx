import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Ao trocar de tela, volta a rolagem para o topo. Sem isso o navegador
 * mantém a posição da tela anterior (a nova abre "no meio"). Só reage à
 * troca de caminho: mudar o ciclo (`?programa=`) ou uma âncora (`#suporte`)
 * não mexe na rolagem.
 */
export default function RolarAoTopo() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}
