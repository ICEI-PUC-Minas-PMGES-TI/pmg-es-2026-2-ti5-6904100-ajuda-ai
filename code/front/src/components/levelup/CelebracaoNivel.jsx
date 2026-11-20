import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { srcEmblemaNivel } from '../EmblemaNivel';
import {
  definirSomSilenciado,
  ouvirSilenciado,
  prepararSons,
  somSilenciado,
  tocarSom,
} from './sonsConquista';
import './celebracao-nivel.css';

/**
 * Momentos da animação (ms). Os mesmos valores estão no app Flutter
 * (`lib/widgets/celebracao_nivel.dart`) e no CSS (`celebracao-nivel.css`).
 */
export const TEMPOS_CELEBRACAO = {
  giro: 650,
  revelacao: 1650,
  brilho: 1850,
  acoes: 2050,
  fim: 3400,
  /** Antes disto um clique no fundo não fecha (evita fechar sem querer). */
  fecharNoFundo: 1200,
};

export const TITULO_CELEBRACAO = 'NOVO NÍVEL ALCANÇADO!';

const CORES = ['#a78bfa', '#fbbf24', '#fde68a', '#ffffff', '#c4b5fd', '#f9a8d4'];

/** Gerador com semente: o mesmo nível sempre tem as mesmas partículas. */
function sorteador(semente) {
  let s = (semente * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Explosão da celebração: estrelas, faíscas e confetes, distribuídos em
 * volta do emblema. Valores relativos ao tamanho do palco (responsivo).
 */
export function gerarParticulas(numero, quantidade = { estrelas: 8, faiscas: 10, confetes: 14 }) {
  const rnd = sorteador(Number(numero) || 1);
  const lista = [];
  const adicionar = (tipo, n, distancia, tamanho) => {
    for (let i = 0; i < n; i++) {
      const angulo = ((i + rnd() * 0.7) / n) * Math.PI * 2;
      const d = distancia[0] + rnd() * (distancia[1] - distancia[0]);
      lista.push({
        tipo,
        dx: +(Math.cos(angulo) * d).toFixed(3),
        dy: +(Math.sin(angulo) * d).toFixed(3),
        tamanho: Math.round(tamanho[0] + rnd() * (tamanho[1] - tamanho[0])),
        rot: Math.round((rnd() > 0.5 ? 1 : -1) * (180 + rnd() * 540)),
        atraso: Math.round(rnd() * 160),
        duracao: Math.round(900 + rnd() * 500),
        escala: +(0.5 + rnd() * 0.7).toFixed(2),
        queda: +(0.12 + rnd() * 0.3).toFixed(2),
        cor: CORES[Math.floor(rnd() * CORES.length)],
      });
    }
  };
  adicionar('estrela', quantidade.estrelas, [0.42, 0.72], [12, 22]);
  adicionar('faisca', quantidade.faiscas, [0.3, 0.68], [6, 12]);
  adicionar('confete', quantidade.confetes, [0.48, 0.85], [9, 15]);
  return lista;
}

/** Usuário pediu menos movimento (sistema ou "sem animações" do Ajuda-aí). */
export function movimentoReduzido() {
  if (typeof window === 'undefined') return false;
  const sistema = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const app = document.documentElement.classList.contains('a11y-sem-animacao');
  return Boolean(sistema || app);
}

function IconeSom({ mudo }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {mudo
        ? <path d="m17 9 5 6M22 9l-5 6" />
        : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

/**
 * Animação de conquista de nível, com os emblemas reais (pixel art).
 *
 * - `nivel`: `{ numero, nome }` do nível conquistado.
 * - `niveisAvancados`: > 1 quando o aluno pulou níveis de uma vez.
 * - `teste`: pré-visualização do painel de QA (selo visível; não confirma nada).
 * - `onFechar`: chamado depois do fade de saída.
 *
 * Só exibe: não lê nem grava progresso. Quem decide quando mostrar (e
 * confirma a conquista no servidor) é quem a monta.
 */
export default function CelebracaoNivel({ nivel, niveisAvancados = 1, teste = false, onFechar }) {
  const [saindo, setSaindo] = useState(false);
  const [mudo, setMudo] = useState(() => somSilenciado());
  const [reduzido] = useState(() => movimentoReduzido());
  const abertoEm = useRef(Date.now());
  const raiz = useRef(null);
  const botao = useRef(null);
  const numero = Number(nivel?.numero);
  const nome = nivel?.nome?.trim();
  const src = srcEmblemaNivel(numero);
  const particulas = useMemo(() => gerarParticulas(numero), [numero]);
  const idTitulo = `lvl-titulo-${numero}`;

  function fechar() {
    if (saindo) return;
    setSaindo(true);
    setTimeout(() => onFechar?.(), reduzido ? 0 : 220);
  }

  // Sons sincronizados com o giro, a revelação e a celebração.
  useEffect(() => {
    prepararSons();
    const t = reduzido
      ? [setTimeout(() => tocarSom('conquista', 0.8), 150)]
      : [
          setTimeout(() => tocarSom('giro', 0.9), TEMPOS_CELEBRACAO.giro - 10),
          setTimeout(() => tocarSom('conquista'), TEMPOS_CELEBRACAO.revelacao - 10),
          setTimeout(() => tocarSom('brilho', 0.8), TEMPOS_CELEBRACAO.brilho),
        ];
    return () => t.forEach(clearTimeout);
  }, [reduzido]);

  useEffect(() => ouvirSilenciado(setMudo), []);

  // Modal: foco dentro, Esc fecha, rolagem da página travada, foco devolvido.
  useEffect(() => {
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    raiz.current?.focus({ preventScroll: true });
    const foco = setTimeout(() => botao.current?.focus({ preventScroll: true }),
      reduzido ? 200 : TEMPOS_CELEBRACAO.acoes);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      if (e.key === 'Tab') {
        const alvos = raiz.current?.querySelectorAll('button');
        if (!alvos?.length) return;
        const primeiro = alvos[0];
        const ultimo = alvos[alvos.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(foco);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (anterior instanceof HTMLElement) anterior.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cliqueNoFundo(e) {
    if (e.target !== e.currentTarget) return;
    if (Date.now() - abertoEm.current < TEMPOS_CELEBRACAO.fecharNoFundo) return;
    fechar();
  }

  const rotuloNivel = nome ? `Nível ${numero} · ${nome}` : `Nível ${numero}`;
  const conteudo = (
    <div
      ref={raiz}
      className={`lvl-overlay${saindo ? ' lvl-saindo' : ''}${reduzido ? ' lvl-reduzido' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      onClick={cliqueNoFundo}
      data-testid="celebracao-nivel"
    >
      <div className="lvl-conteudo" onClick={cliqueNoFundo}>
        <div className="lvl-palco" aria-hidden="true" style={src ? { '--lvl-emblema': `url("${src}")` } : undefined}>
          <span className="lvl-raios" />
          <span className="lvl-halo" />
          <span className="lvl-onda" />
          <div className="lvl-entrada">
            <div className="lvl-giro">
              <div className="lvl-face lvl-frente">
                {src ? <img src={src} alt="" width={448} height={448} draggable="false" /> : <span className="emblema-nivel-fallback">{numero}</span>}
                {src && <span className="lvl-reflexo" />}
              </div>
              <div className="lvl-face lvl-verso">
                {src ? <img src={src} alt="" width={448} height={448} draggable="false" /> : <span className="emblema-nivel-fallback">{numero}</span>}
              </div>
            </div>
          </div>
          <div className="lvl-particulas">
            {particulas.map((p, i) => (
              <span
                key={i}
                className={`lvl-particula lvl-${p.tipo}`}
                style={{
                  '--dx': p.dx,
                  '--dy': p.dy,
                  '--t': `${p.tamanho}px`,
                  '--rot': `${p.rot}deg`,
                  '--atraso': `${p.atraso}ms`,
                  '--dur': `${p.duracao}ms`,
                  '--s': p.escala,
                  '--queda': p.queda,
                  '--cor': p.cor,
                }}
              />
            ))}
          </div>
        </div>

        <h2 className="lvl-titulo" id={idTitulo}>{TITULO_CELEBRACAO}</h2>
        <p className="lvl-nivel" aria-live="polite">
          <strong>{rotuloNivel}</strong>
        </p>
        {niveisAvancados > 1 && (
          <p className="lvl-detalhe">Você avançou {niveisAvancados} níveis de uma vez.</p>
        )}
        {teste && <span className="lvl-selo-teste">Pré-visualização · sem XP real</span>}
        <div className="lvl-acoes">
          <button ref={botao} type="button" className="lvl-continuar" onClick={fechar}>Continuar</button>
          <button
            type="button"
            className="lvl-som"
            aria-pressed={mudo}
            aria-label={mudo ? 'Ativar sons da conquista' : 'Silenciar sons da conquista'}
            title={mudo ? 'Ativar sons' : 'Silenciar sons'}
            onClick={() => definirSomSilenciado(!mudo)}
          >
            <IconeSom mudo={mudo} />
          </button>
        </div>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return conteudo;
  return createPortal(conteudo, document.body);
}
