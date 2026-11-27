import { useCallback, useEffect, useState } from 'react';
import { api, getAlunoSession } from '../../api/client';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { formatarData } from './util';
import { EstadoCarregando, EstadoErro, EstadoVazio, PageHeader } from './partes';

/**
 * A obtida `o` foi desbloqueada nesta visita? Compara id e contexto: a mesma
 * conquista obtida em dois semestres aparece duas vezes, e só uma é nova.
 */
export function ehNova(colecao, o) {
  return (colecao?.novas || []).some((n) => n?.id === o.id && n?.contexto === o.contexto);
}

/**
 * Desbloqueios cujo aviso a tela exibiu, para confirmar ao servidor
 * (`POST /me/conquistas/vistas`). Só depois de exibir: se a carga falhar ou
 * a resposta se perder, o aviso volta na próxima visita.
 */
export function vistasParaConfirmar(colecao) {
  return (colecao?.obtidas || []).filter((o) => ehNova(colecao, o)).map((o) => ({ id: o.id, contexto: o.contexto }));
}

/** Máximo por `POST /me/conquistas/vistas` (o mesmo limite da API). */
export const VISTAS_POR_LOTE = 200;

/** Divide a confirmação em lotes que a API aceita. */
export function lotesDeVistas(vistas, tamanho = VISTAS_POR_LOTE) {
  const lotes = [];
  for (let i = 0; i < (vistas || []).length; i += tamanho) lotes.push(vistas.slice(i, i + tamanho));
  return lotes;
}

/**
 * Confirma em lotes, um depois do outro, sempre pela conta `email` que
 * carregou a coleção. Antes de cada lote confere a sessão ativa: se a pessoa
 * trocou de conta (ou saiu), para, e nada é enviado com a sessão de outra
 * pessoa. A falha de um lote não impede os demais (o que falhou volta como
 * aviso na próxima visita). Nunca rejeita.
 */
export async function confirmarEmLotes(vistas, {
  email,
  enviar = (lote) => api.confirmarConquistasVistas(lote, email),
  contaAtiva = () => getAlunoSession()?.email,
} = {}) {
  let confirmados = 0;
  if (!email) return confirmados;
  for (const lote of lotesDeVistas(vistas)) {
    if (contaAtiva() !== email) break;
    try {
      await enviar(lote);
      confirmados += lote.length;
    } catch {
      // Segue para o próximo lote.
    }
  }
  return confirmados;
}

/** Texto do aviso das conquistas desbloqueadas nesta visita. */
export function textoNovas(colecao) {
  const novas = (colecao?.obtidas || []).filter((o) => ehNova(colecao, o));
  if (!novas.length) return '';
  if (novas.length === 1) return `Conquista desbloqueada: ${novas[0].nome}!`;
  return `Você desbloqueou ${novas.length} conquistas!`;
}

/** Contexto do desbloqueio para o aluno: "2026/2" ou "carreira". */
export function rotuloContexto(contexto) {
  return contexto === 'GERAL' ? 'Conquista de carreira' : `Semestre ${contexto}`;
}

/** Data (AAAA-MM-DD) no fuso do navegador: perto da meia-noite o UTC é outro dia. */
export function dataLocal(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE');
}

/** 0–100 para a barra. */
export function porcentagem({ atual, meta }) {
  if (!meta) return 0;
  return Math.max(0, Math.min(100, Math.floor((atual * 100) / meta)));
}

function Medalha({ imagemUrl, bloqueada = false }) {
  return (
    <span className={`conquista-medalha${bloqueada ? ' bloqueada' : ''}`} aria-hidden="true">
      {imagemUrl
        ? <img src={imagemUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <Icon name={bloqueada ? 'lock' : 'trophy'} size={26} />}
    </span>
  );
}

export default function ConquistasAlunoPage() {
  const mostrarToast = useToast();
  const [colecao, setColecao] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    // A conta que carrega a coleção é a mesma que confirma os avisos.
    const email = getAlunoSession()?.email;
    try {
      const dados = await api.conquistasAluno(email);
      setColecao(dados);
      const aviso = textoNovas(dados);
      if (aviso) {
        mostrarToast(aviso, 'sucesso');
        // Em lotes (limite da API). Falha não atrapalha a tela: o aviso do
        // lote que falhou só volta na próxima visita.
        confirmarEmLotes(vistasParaConfirmar(dados), { email });
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar suas conquistas.');
    }
  }, [mostrarToast]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="aluno-page conquistas-aluno">
      <PageHeader titulo="Conquistas" subtitulo="Medalhas que você desbloqueia participando. Veja o critério de cada uma e quanto falta." />

      {erro && !colecao && <EstadoErro mensagem={erro} onTentar={carregar} />}
      {!colecao && !erro && <EstadoCarregando texto="Conferindo suas conquistas…" />}

      {colecao && (
        <>
          <section className="aluno-section" aria-labelledby="conquistas-obtidas">
            <div className="section-head">
              <h2 id="conquistas-obtidas">Minha coleção</h2>
              <span className="detail-muted small">{colecao.obtidas.length === 1 ? '1 conquista' : `${colecao.obtidas.length} conquistas`}</span>
            </div>
            {colecao.obtidas.length === 0 ? (
              <EstadoVazio icon="trophy" titulo="Nenhuma conquista ainda" texto="Cumpra um dos critérios abaixo para desbloquear a primeira." />
            ) : (
              <ul className="conquistas-grade">
                {colecao.obtidas.map((o) => (
                  <li key={`${o.id}-${o.contexto}`} className={`conquista-card obtida${ehNova(colecao, o) ? ' nova' : ''}`}>
                    <Medalha imagemUrl={o.imagemUrl} />
                    <div>
                      <strong>{o.nome}</strong>
                      <p>{o.descricao}</p>
                      <small>{o.criterioTexto}</small>
                      <small>
                        {rotuloContexto(o.contexto)} · {formatarData(dataLocal(o.desbloqueadaEm))}
                        {o.xpCreditado > 0 ? ` · +${o.xpCreditado} XP` : ''}
                      </small>
                      {ehNova(colecao, o) && <span className="flag green">Nova!</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="aluno-section" aria-labelledby="conquistas-disponiveis">
            <h2 id="conquistas-disponiveis">Para desbloquear</h2>
            {colecao.disponiveis.length === 0 ? (
              <p className="detail-muted">
                {colecao.obtidas.length
                  ? 'Você já tem todas as conquistas disponíveis agora. Fique de olho: a coordenação pode criar novas.'
                  : 'Nenhuma conquista disponível para você neste semestre.'}
              </p>
            ) : (
              <ul className="conquistas-grade">
                {colecao.disponiveis.map((d) => (
                  <li key={d.id} className="conquista-card">
                    <Medalha imagemUrl={d.imagemUrl} bloqueada />
                    <div>
                      <strong>{d.nome}</strong>
                      <p>{d.descricao}</p>
                      <small>{d.criterioTexto}{d.xp > 0 ? ` Vale +${d.xp} XP.` : ''}</small>
                      <div
                        className="barra-nivel"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={d.progresso.meta}
                        aria-valuenow={d.progresso.atual}
                        aria-label={`Progresso em ${d.nome}`}
                      >
                        <span style={{ width: `${porcentagem(d.progresso)}%` }} />
                      </div>
                      <small>{d.progresso.atual} de {d.progresso.meta}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
