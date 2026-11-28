import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import { EmblemaNivel } from '../../components/EmblemaNivel';
import Icon from '../../components/Icon';
import CelebracaoNivel from '../../components/levelup/CelebracaoNivel';
import { lerProgresso } from '../../components/levelup/progressoAluno';
import {
  definirSomSilenciado,
  desbloquearAudio,
  ouvirSilenciado,
  somSilenciado,
} from '../../components/levelup/sonsConquista';
import { EstadoCarregando, EstadoErro, PageHeader } from './partes';
import { ProgressoCarregado } from './PerfilAlunoPage';
import './qa-gamificacao.css';

/** Estado temporário da simulação (só nesta aba; "Reiniciar teste" apaga). */
export const CHAVE_SIMULACAO = 'ajudaai.qa.gamificacao';

export function lerSimulacaoSalva(armazenamento = globalThis.sessionStorage) {
  try {
    const dados = JSON.parse(armazenamento?.getItem(CHAVE_SIMULACAO) || 'null');
    return dados && Number.isInteger(dados.nivel) ? dados : null;
  } catch {
    return null;
  }
}

function salvarSimulacao(dados, armazenamento = globalThis.sessionStorage) {
  try {
    if (dados) armazenamento?.setItem(CHAVE_SIMULACAO, JSON.stringify(dados));
    else armazenamento?.removeItem(CHAVE_SIMULACAO);
  } catch {
    /* sem armazenamento: a simulação vale até sair da página */
  }
}

const milhar = (n) => Number(n).toLocaleString('pt-BR');

/** Faixa de XP do nível na tabela real (o próximo limiar, se houver). */
export function faixaDoNivel(niveis, numero) {
  const i = niveis.findIndex((n) => n.numero === numero);
  if (i < 0) return null;
  const proximo = niveis[i + 1];
  return { ...niveis[i], proximoXp: proximo?.xpMinimo ?? null, proximoNome: proximo?.nome ?? null };
}

/**
 * Painel de testes da gamificação (QA). Acesso decidido pelo servidor
 * (`/qa/gamificacao`, `GAMIFICACAO_QA_EMAILS`); sem liberação, a rota leva
 * de volta ao perfil e o atalho nem aparece no menu.
 *
 * Tudo aqui é simulação: o perfil vem de `GET /qa/gamificacao/simulacao`
 * (cálculo sem escrita) e a animação é reproduzida sem confirmar nada.
 */
export default function QaGamificacaoPage() {
  const { qaLiberado, qaConferido } = useOutletContext();
  const salvo = useRef(lerSimulacaoSalva());
  const [niveis, setNiveis] = useState(null);
  const [erro, setErro] = useState('');
  const [negado, setNegado] = useState(false);
  const [real, setReal] = useState(null);
  // O nível inicial espera o progresso real (ou a falha dele).
  const [realPronto, setRealPronto] = useState(false);
  const [nivel, setNivel] = useState(salvo.current?.nivel ?? null);
  const [progresso, setProgresso] = useState(salvo.current?.progresso ?? 50);
  const [saltos, setSaltos] = useState(salvo.current?.saltos ?? 1);
  const [comparar, setComparar] = useState(salvo.current?.comparar ?? null);
  const [simulacoes, setSimulacoes] = useState({});
  const [erroSimulacao, setErroSimulacao] = useState('');
  const [animacao, setAnimacao] = useState(null);
  const [mudo, setMudo] = useState(() => somSilenciado());
  const [original, setOriginal] = useState(!salvo.current);
  const contador = useRef(0);

  useEffect(() => ouvirSilenciado(setMudo), []);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const acesso = await api.qaGamificacaoAcesso();
      setNiveis(acesso.niveis);
      lerProgresso().then(setReal).catch(() => setReal(null)).finally(() => setRealPronto(true));
    } catch (e) {
      if (e.status === 403 || e.status === 404) setNegado(true);
      else setErro(e.message || 'Não foi possível abrir o painel de testes.');
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Nível inicial: o salvo na aba, senão o nível real, senão o primeiro.
  useEffect(() => {
    if (!niveis?.length || nivel !== null || !realPronto) return;
    const atual = real?.nivel?.numero;
    setNivel(niveis.some((n) => n.numero === atual) ? atual : niveis[0].numero);
  }, [niveis, real, nivel, realPronto]);

  // Perfil simulado (servidor), com espera curta enquanto o controle desliza.
  useEffect(() => {
    if (nivel === null || !niveis) return undefined;
    const alvos = [nivel, comparar].filter((n) => n !== null && n !== undefined);
    let ativo = true;
    const espera = setTimeout(async () => {
      try {
        const lista = await Promise.all(alvos.map((n) => api.qaGamificacaoSimulacao(n, progresso)));
        if (!ativo) return;
        setSimulacoes(Object.fromEntries(lista.map((s) => [s.nivel.numero, s])));
        setErroSimulacao('');
      } catch (e) {
        if (!ativo) return;
        if (e.status === 403 || e.status === 404) setNegado(true);
        else setErroSimulacao(e.message || 'Não foi possível simular o perfil.');
      }
    }, 180);
    return () => { ativo = false; clearTimeout(espera); };
  }, [nivel, comparar, progresso, niveis]);

  useEffect(() => {
    if (nivel === null || original) return;
    salvarSimulacao({ nivel, progresso, saltos, comparar });
  }, [nivel, progresso, saltos, comparar, original]);

  if ((qaConferido && !qaLiberado) || negado) return <Navigate to="/aluno/perfil" replace />;
  if (erro) return <EstadoErro mensagem={erro} onTentar={carregar} />;
  if (!niveis || nivel === null) return <EstadoCarregando texto="Abrindo o painel de testes…" />;

  const faixa = faixaDoNivel(niveis, nivel);
  const indice = niveis.findIndex((n) => n.numero === nivel);
  const maxSaltos = Math.max(1, indice);

  function escolher(numero) {
    setOriginal(false);
    setNivel(numero);
    setSaltos((s) => Math.min(s, Math.max(1, niveis.findIndex((n) => n.numero === numero))));
  }

  function reproduzir(numero = nivel, quantos = saltos) {
    desbloquearAudio(); // dentro do clique: o navegador libera o áudio
    const dados = niveis.find((n) => n.numero === numero);
    contador.current += 1;
    setAnimacao({ chave: contador.current, nivel: dados, saltos: quantos });
  }

  function reiniciar() {
    salvarSimulacao(null);
    setOriginal(true);
    setComparar(null);
    setProgresso(50);
    setSaltos(1);
    setAnimacao(null);
    const atual = real?.nivel?.numero;
    setNivel(niveis.some((n) => n.numero === atual) ? atual : niveis[0].numero);
  }

  const simulado = simulacoes[nivel];
  const comparado = comparar !== null ? simulacoes[comparar] : null;

  return (
    <div className="qa-gamificacao">
      <PageHeader
        titulo="Testes de gamificação"
        subtitulo="Simule qualquer nível e reproduza a animação de conquista. Nada aqui altera seu XP, moedas ou nível real."
      >
        <button
          type="button"
          className="ghost-button small"
          aria-pressed={mudo}
          onClick={() => definirSomSilenciado(!mudo)}
        >
          {mudo ? 'Sons desligados' : 'Sons ligados'}
        </button>
      </PageHeader>

      <p className="qa-aviso" role="note">
        <Icon name="info" size={16} /> Modo de teste: valores calculados pelo servidor, sem gravação. A animação manual não concede XP nem recompensas.
      </p>

      <section className="aluno-section" aria-labelledby="qa-niveis-titulo">
        <div className="section-head">
          <h2 id="qa-niveis-titulo">Níveis cadastrados ({niveis.length})</h2>
        </div>
        <div className="qa-niveis" role="group" aria-label="Escolha um nível">
          {niveis.map((n) => (
            <button
              key={n.numero}
              type="button"
              className={`qa-nivel${n.numero === nivel ? ' ativo' : ''}${n.numero === comparar ? ' comparando' : ''}`}
              aria-pressed={n.numero === nivel}
              onClick={() => escolher(n.numero)}
            >
              <EmblemaNivel numero={n.numero} nome={n.nome} />
              <strong>Nível {n.numero}</strong>
              <span>{n.nome}</span>
              <small>{milhar(n.xpMinimo)} XP</small>
            </button>
          ))}
        </div>
      </section>

      <section className="aluno-section qa-detalhe" aria-labelledby="qa-detalhe-titulo">
        <div className="dash-card qa-emblema-card">
          <EmblemaNivel numero={faixa.numero} nome={faixa.nome} />
          <h2 id="qa-detalhe-titulo">Nível {faixa.numero} · {faixa.nome}</h2>
          <dl className="qa-faixa">
            <div><dt>XP exigido</dt><dd>{milhar(faixa.xpMinimo)} XP</dd></div>
            <div>
              <dt>Próximo nível</dt>
              <dd>{faixa.proximoXp === null ? 'Nível máximo' : `${milhar(faixa.proximoXp)} XP · ${faixa.proximoNome}`}</dd>
            </div>
          </dl>
          <div className="qa-navegar">
            <button type="button" className="ghost-button small" disabled={indice <= 0} onClick={() => escolher(niveis[indice - 1].numero)} aria-label="Nível anterior">◀ Anterior</button>
            <button type="button" className="ghost-button small" disabled={indice >= niveis.length - 1} onClick={() => escolher(niveis[indice + 1].numero)} aria-label="Próximo nível">Próximo ▶</button>
          </div>
          <label className="qa-campo">
            <span>Simular subida de</span>
            <select value={saltos} onChange={(e) => setSaltos(Number(e.target.value))} disabled={maxSaltos <= 1}>
              {Array.from({ length: maxSaltos }, (_, i) => i + 1).map((q) => (
                <option key={q} value={q}>{q} {q === 1 ? 'nível' : 'níveis de uma vez'}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-button inline qa-reproduzir" onClick={() => reproduzir()}>
            <Icon name="spark" size={17} /> Reproduzir animação
          </button>
        </div>

        <div className="qa-perfil">
          <h3>Como o perfil aparece</h3>
          <label className="qa-campo qa-barra">
            <span>Posição na barra do nível: {progresso}%</span>
            <input type="range" min={0} max={100} step={1} value={progresso} onChange={(e) => { setOriginal(false); setProgresso(Number(e.target.value)); }} />
          </label>
          {erroSimulacao && <p className="dash-inline-error" role="alert">{erroSimulacao}</p>}
          {simulado ? <ProgressoCarregado dados={simulado} simulado /> : <p role="status">Simulando…</p>}

          <label className="qa-campo">
            <span>Comparar com</span>
            <select value={comparar ?? ''} onChange={(e) => { setOriginal(false); setComparar(e.target.value === '' ? null : Number(e.target.value)); }}>
              <option value="">Nenhum nível</option>
              {niveis.filter((n) => n.numero !== nivel).map((n) => (
                <option key={n.numero} value={n.numero}>Nível {n.numero} · {n.nome}</option>
              ))}
            </select>
          </label>
          {comparado && (
            <div className="qa-comparacao">
              <ProgressoCarregado dados={comparado} simulado />
              <button type="button" className="ghost-button small" onClick={() => reproduzir(comparar, 1)}>
                Reproduzir animação do nível {comparar}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="aluno-section" aria-labelledby="qa-real-titulo">
        <div className="section-head">
          <h2 id="qa-real-titulo">Seu progresso real</h2>
          <button type="button" className="outline-button qa-reiniciar" onClick={reiniciar}>
            <Icon name="refresh" size={16} /> Reiniciar teste
          </button>
        </div>
        <p className="detail-muted small">
          Restaura a visualização original e apaga o estado temporário da simulação. {original ? 'Nenhuma simulação ativa.' : ''}
        </p>
        {real ? <ProgressoCarregado dados={real} /> : <p className="detail-muted small">Progresso real indisponível agora.</p>}
        <p className="detail-muted small qa-app">
          No app: Perfil › Testes de gamificação, com a mesma conta.
        </p>
      </section>

      {animacao && (
        <CelebracaoNivel
          key={animacao.chave}
          nivel={animacao.nivel}
          niveisAvancados={animacao.saltos}
          teste
          onFechar={() => setAnimacao(null)}
        />
      )}
    </div>
  );
}
