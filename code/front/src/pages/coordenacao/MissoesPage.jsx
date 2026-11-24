import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import './missoes.css';

export const LIMITES_MISSAO = { tituloMax: 120, descricaoMax: 1000, xpMax: 100, xpSemanalMax: 60 };

export const ROTULO_TIPO = { UNICA: 'Única', SEMANAL: 'Semanal' };

export const REQUISITOS = {
  PUCSTOPS: { rotulo: 'Coletar PucStops', curto: 'PucStops', contado: true, dica: 'Conta totem coletado no local (geofence) neste semestre. Cada totem vale uma vez: a missão é única.' },
  EVENTO: { rotulo: 'Check-in em evento', curto: 'Evento', dica: 'O aluno faz check-in no local do evento (GPS), de 30 min antes até o fim, e digita o código que você mostra lá. Sem o código, o GPS não basta.' },
  FEED_COMENTARIOS: { rotulo: 'Comentar no feed', curto: 'Comentários', contado: true, dica: 'Comentários com pelo menos 10 caracteres, no feed do semestre.' },
  FEED_CURTIDAS: { rotulo: 'Curtir posts de colegas', curto: 'Curtidas', contado: true, dica: 'Uma curtida por post; curtir o próprio post não conta.' },
  FEED_PUBLICACOES: { rotulo: 'Publicar no feed', curto: 'Publicações', contado: true, dica: 'Só padrinhos com dupla publicam: os demais nem veem esta missão.' },
  CHAT_MENSAGENS: { rotulo: 'Mensagens no chat da dupla', curto: 'Chat', contado: true, dica: 'Só quem já tem dupla vê esta missão. Mensagem de 1 caractere não conta.' },
  CODIGO: { rotulo: 'Código da atividade presencial', curto: 'Código', dica: 'Mostre o código na atividade (telão, monitor, estande). 5 erros por hora bloqueiam o aluno.' },
};

export const REQUISITOS_NO_APP = Object.keys(REQUISITOS).filter((r) => r !== 'CHAT_MENSAGENS');

const OPCOES_REQUISITO = REQUISITOS_NO_APP.map((valor) => ({ valor, rotulo: REQUISITOS[valor].rotulo }));

export const QUANTIDADE_MAX = 20;
const CODIGO_VALIDO = /^[A-Z0-9-]{4,20}$/;

export function normalizarCodigo(codigo) {
  return String(codigo ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

export function paraInputData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function paraIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function diaMes(iso) {
  const d = new Date(iso);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
}

export function periodoMissao(m) {
  if (!m.inicio && !m.fim) return m.tipo === 'SEMANAL' ? 'Contínua' : `Ciclo ${m.ciclo}`;
  if (m.inicio && m.fim) return `${diaMes(m.inicio)} – ${diaMes(m.fim)}`;
  if (m.inicio) return `A partir de ${diaMes(m.inicio)}`;
  return `Até ${diaMes(m.fim)}`;
}

export function formDaMissao(missao) {
  return {
    titulo: missao?.titulo ?? '',
    descricao: missao?.descricao ?? '',
    tipo: missao?.tipo ?? 'UNICA',
    xp: missao ? String(missao.xp) : '50',
    requisito: missao ? missao.requisito ?? '' : 'PUCSTOPS',
    quantidade: String(missao?.quantidade ?? 1),
    alvoId: missao?.alvoId ?? '',
    codigo: missao?.codigo ?? '',
    inicio: paraInputData(missao?.inicio),
    fim: paraInputData(missao?.fim),
    ativar: false,
  };
}

export function validarMissao(form, { agora = new Date(), fimNovo = true } = {}) {
  const { tituloMax, descricaoMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;
  const titulo = form.titulo.trim();
  const descricao = form.descricao.trim();
  if (!titulo) return 'Informe o título da missão.';
  if (titulo.length > tituloMax) return `O título deve ter no máximo ${tituloMax} caracteres.`;
  if (!descricao) return 'Descreva como o aluno conclui a missão.';
  if (descricao.length > descricaoMax) return `A descrição deve ter no máximo ${descricaoMax} caracteres.`;
  const xp = Number(form.xp);
  if (!Number.isInteger(xp) || xp < 1 || xp > xpMax) return `A recompensa deve ser de 1 a ${xpMax} XP.`;
  if (form.tipo === 'SEMANAL' && xp > xpSemanalMax) return `Missão semanal limitada a ${xpSemanalMax} XP.`;
  const requisito = REQUISITOS[form.requisito];
  if (!requisito) return 'Escolha como o aluno comprova a missão.';
  if (form.requisito === 'EVENTO') {
    if (!form.alvoId) return 'Escolha o evento.';
    if (form.tipo !== 'UNICA') return 'Missão de evento é única: o evento acontece uma vez.';
  }
  if (form.requisito === 'PUCSTOPS' && form.tipo !== 'UNICA') {
    return 'Missão de PucStop é única: cada totem é coletado uma vez por semestre.';
  }
  if ((form.requisito === 'CODIGO' || form.requisito === 'EVENTO') && !CODIGO_VALIDO.test(normalizarCodigo(form.codigo))) {
    return 'Código: de 4 a 20 letras, números ou hífen (ex.: CALOURO26).';
  }
  if (usaQuantidade(form)) {
    const quantidade = Number(form.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAX) {
      return `A quantidade deve ser de 1 a ${QUANTIDADE_MAX}.`;
    }
  }
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio && fim && new Date(fim) <= new Date(inicio)) return 'O fim precisa ser depois do início.';
  if (fimNovo && fim && new Date(fim) <= agora) return 'O fim precisa estar no futuro.';
  return '';
}

export function usaQuantidade(form) {
  return Boolean(REQUISITOS[form.requisito]?.contado) && !(form.requisito === 'PUCSTOPS' && form.alvoId);
}

export function camposRequisito(form) {
  const campos = { requisito: form.requisito, quantidade: usaQuantidade(form) ? Number(form.quantidade) : 1 };
  campos.alvoId = (form.requisito === 'PUCSTOPS' || form.requisito === 'EVENTO') && form.alvoId ? form.alvoId : null;
  campos.codigo = form.requisito === 'CODIGO' || form.requisito === 'EVENTO' ? normalizarCodigo(form.codigo) : null;
  return campos;
}

export function corpoCriacaoMissao(form) {
  const { alvoId, codigo, ...requisito } = camposRequisito(form);
  const corpo = {
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim(),
    tipo: form.tipo,
    xp: Number(form.xp),
    ativar: Boolean(form.ativar),
    ...requisito,
  };
  if (alvoId) corpo.alvoId = alvoId;
  if (codigo) corpo.codigo = codigo;
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio) corpo.inicio = inicio;
  if (fim) corpo.fim = fim;
  return corpo;
}

export function camposAlteradosMissao(original, form) {
  const alterados = {};
  const titulo = form.titulo.trim();
  const descricao = form.descricao.trim();
  if (titulo !== original.titulo) alterados.titulo = titulo;
  if (descricao !== original.descricao) alterados.descricao = descricao;
  if (form.tipo !== original.tipo) alterados.tipo = form.tipo;
  if (Number(form.xp) !== original.xp) alterados.xp = Number(form.xp);
  if (form.requisito) {
    const novo = camposRequisito(form);
    const mudouRegra = novo.requisito !== original.requisito
      || novo.quantidade !== original.quantidade
      || novo.alvoId !== (original.alvoId ?? null);
    if (mudouRegra) {
      Object.assign(alterados, novo);
    } else if (novo.codigo !== (original.codigo ?? null)) {
      alterados.codigo = novo.codigo;
    }
  }
  const inicio = paraIso(form.inicio);
  const fim = paraIso(form.fim);
  if (inicio !== (original.inicio ? new Date(original.inicio).toISOString() : null)) alterados.inicio = inicio;
  if (fim !== (original.fim ? new Date(original.fim).toISOString() : null)) alterados.fim = fim;
  return alterados;
}

export function resumoMissoes(missoes) {
  return {
    ativas: missoes.filter((m) => m.ativa).length,
    conclusoes: missoes.reduce((t, m) => t + (m.conclusoes ?? 0), 0),
    xp: missoes.reduce((t, m) => t + (m.xpCreditadoTotal ?? 0), 0),
  };
}

export function filtrarMissoes(missoes, { busca = '', tipo = '', status = '' }) {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return missoes.filter((m) => (
    (!termo || m.titulo.toLocaleLowerCase('pt-BR').includes(termo) || m.descricao.toLocaleLowerCase('pt-BR').includes(termo))
    && (!tipo || m.tipo === tipo)
    && (!status || (status === 'ativa' ? m.ativa : !m.ativa))
  ));
}

const numero = (v) => Number(v ?? 0).toLocaleString('pt-BR');

export function rotuloRequisito(m) {
  const r = REQUISITOS[m.requisito];
  if (!r) return 'Sem requisito';
  if (m.alvoNome) return `${r.curto}: ${m.alvoNome}`;
  return r.contado && m.quantidade > 1 ? `${r.curto} ×${m.quantidade}` : r.curto;
}

/*
 * Seletor de lista e calendário no mesmo visual do formulário da lojinha
 * (classes `recompensa-*` de coordenacao.css). Cópia de RecompensasPage.jsx,
 * que não exporta esses componentes.
 */
function usePopupMissao(largura, altura) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({});
  const gatilho = useRef(null);
  const painel = useRef(null);
  const fechar = useCallback((focar = false) => {
    setAberto(false);
    if (focar) gatilho.current?.focus();
  }, []);

  function abrir() {
    const caixa = gatilho.current?.getBoundingClientRect();
    if (!caixa) return;
    const larguraFinal = Math.min(largura || caixa.width, window.innerWidth - 24);
    const esquerda = Math.max(12, Math.min(caixa.left, window.innerWidth - larguraFinal - 12));
    const acima = caixa.bottom + altura + 8 > window.innerHeight && caixa.top >= altura + 8;
    setPosicao({ left: esquerda, top: acima ? caixa.top - altura - 8 : caixa.bottom + 8, width: larguraFinal });
    setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (event) => {
      if (!gatilho.current?.contains(event.target) && !painel.current?.contains(event.target)) fechar();
    };
    const rolou = (event) => { if (!painel.current?.contains(event.target)) fechar(); };
    const redimensionou = () => fechar();
    document.addEventListener('pointerdown', fora);
    document.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', redimensionou);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', redimensionou);
    };
  }, [aberto, fechar]);

  return { aberto, posicao, gatilho, painel, abrir, fechar };
}

function ListaMissao({ id, rotulo, valor, opcoes, onChange, desabilitado = false }) {
  const popup = usePopupMissao(0, 240);
  const selecionada = opcoes.find((opcao) => opcao.valor === valor) ?? opcoes[0];

  useEffect(() => {
    if (popup.aberto) popup.painel.current?.querySelector('[aria-selected="true"]')?.focus();
  }, [popup.aberto]);

  function teclado(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      popup.fechar(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const itens = Array.from(popup.painel.current?.querySelectorAll('[role="option"]') ?? []);
      const indice = itens.indexOf(document.activeElement);
      itens[(indice + (event.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus();
    }
  }

  return (
    <div className="editor-field recompensa-seletor">
      <span id={`${id}-rotulo`}>{rotulo}</span>
      <button type="button" ref={popup.gatilho} className="recompensa-gatilho" disabled={desabilitado} style={desabilitado ? { opacity: 0.6, cursor: 'not-allowed' } : undefined} aria-labelledby={`${id}-rotulo ${id}-valor`} aria-haspopup="listbox" aria-expanded={popup.aberto} aria-controls={popup.aberto ? `${id}-lista` : undefined} onClick={() => popup.aberto ? popup.fechar() : popup.abrir()} onKeyDown={(event) => { if (!popup.aberto && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); popup.abrir(); } else if (popup.aberto && event.key === 'Escape') { event.stopPropagation(); popup.fechar(); } }}>
        <span id={`${id}-valor`}>{selecionada?.rotulo}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {popup.aberto && (
        <div id={`${id}-lista`} ref={popup.painel} className="recompensa-popup recompensa-opcoes" role="listbox" aria-labelledby={`${id}-rotulo`} style={popup.posicao} onKeyDown={teclado}>
          {opcoes.map((opcao) => (
            <button key={opcao.valor} type="button" role="option" aria-selected={opcao.valor === valor} onClick={() => { onChange(opcao.valor); popup.fechar(true); }}>
              <span>{opcao.rotulo}</span>
              {opcao.valor === valor && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function dataHoraPartes(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor || '');
  return partes ? { dia: `${partes[1]}-${partes[2]}-${partes[3]}`, hora: partes[4], minuto: partes[5] } : null;
}

function CalendarioMissao({ id, rotulo, valor, onChange }) {
  const popup = usePopupMissao(326, 408);
  const [mes, setMes] = useState(() => new Date());
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('12');
  const [minuto, setMinuto] = useState('00');
  const partes = dataHoraPartes(valor);
  const texto = partes ? `${partes.dia.slice(8, 10)}/${partes.dia.slice(5, 7)}/${partes.dia.slice(0, 4)} ${partes.hora}:${partes.minuto}` : 'Selecionar data e hora';
  const ano = mes.getFullYear();
  const numeroMes = mes.getMonth();
  const inicio = (new Date(ano, numeroMes, 1).getDay() + 6) % 7;
  const total = new Date(ano, numeroMes + 1, 0).getDate();
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const horaValida = /^\d{1,2}$/.test(hora) && Number(hora) <= 23;
  const minutoValido = /^\d{1,2}$/.test(minuto) && Number(minuto) <= 59;

  function abrir() {
    const atual = dataHoraPartes(valor);
    const referencia = atual ? new Date(`${atual.dia}T12:00`) : new Date();
    setMes(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
    setDia(atual?.dia ?? '');
    setHora(atual?.hora ?? '12');
    setMinuto(atual?.minuto ?? '00');
    popup.abrir();
  }

  function aplicar() {
    if (!dia || !horaValida || !minutoValido) return;
    onChange(`${dia}T${String(Number(hora)).padStart(2, '0')}:${String(Number(minuto)).padStart(2, '0')}`);
    popup.fechar(true);
  }

  return (
    <div className="editor-field recompensa-data">
      <span id={`${id}-rotulo`}>{rotulo}</span>
      <button type="button" ref={popup.gatilho} className={`recompensa-gatilho${partes ? '' : ' vazio'}`} aria-labelledby={`${id}-rotulo ${id}-valor`} aria-haspopup="dialog" aria-expanded={popup.aberto} onClick={() => popup.aberto ? popup.fechar() : abrir()} onKeyDown={(event) => { if (popup.aberto && event.key === 'Escape') { event.stopPropagation(); popup.fechar(); } }}>
        <span id={`${id}-valor`}>{texto}</span>
        <Icon name="calendar" size={17} />
      </button>
      {popup.aberto && (
        <div ref={popup.painel} className="recompensa-popup recompensa-calendario" role="dialog" aria-label={`Escolher ${rotulo.toLowerCase()}`} style={popup.posicao} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); popup.fechar(true); } }}>
          <div className="recompensa-calendario-topo">
            <button type="button" aria-label="Mês anterior" onClick={() => setMes(new Date(ano, numeroMes - 1, 1))}><Icon name="chevron" size={17} className="recompensa-seta-esquerda" /></button>
            <strong>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(mes).replace(/^./, (letra) => letra.toUpperCase())}</strong>
            <button type="button" aria-label="Próximo mês" onClick={() => setMes(new Date(ano, numeroMes + 1, 1))}><Icon name="chevron" size={17} /></button>
          </div>
          <div className="recompensa-calendario-grade">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((nome) => <span key={nome} className="recompensa-dia-semana">{nome}</span>)}
            {Array.from({ length: inicio }, (_, indice) => <span key={`vazio-${indice}`} aria-hidden="true" />)}
            {Array.from({ length: total }, (_, indice) => {
              const data = `${ano}-${String(numeroMes + 1).padStart(2, '0')}-${String(indice + 1).padStart(2, '0')}`;
              return <button key={data} type="button" className={`${data === dia ? ' selecionado' : ''}${data === hojeIso ? ' hoje' : ''}`} aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(ano, numeroMes, indice + 1))} aria-pressed={data === dia} onClick={() => setDia(data)}>{indice + 1}</button>;
            })}
          </div>
          <div className="recompensa-calendario-hora">
            <span>Horário</span>
            <div>
              <input aria-label="Hora" type="number" inputMode="numeric" min="0" max="23" value={hora} onChange={(event) => setHora(event.target.value)} />
              <strong>:</strong>
              <input aria-label="Minuto" type="number" inputMode="numeric" min="0" max="59" value={minuto} onChange={(event) => setMinuto(event.target.value)} />
            </div>
          </div>
          <div className="recompensa-calendario-acoes">
            <button type="button" onClick={() => { onChange(''); popup.fechar(true); }}>Limpar</button>
            <button type="button" className="aplicar" disabled={!dia || !horaValida || !minutoValido} onClick={aplicar}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Situação mostrada no selo da lista. */
export function situacaoMissao(m) {
  if (!m.ativa) return { chave: 'inativa', rotulo: 'Inativa', ordem: 2 };
  if (!m.vigenteAgora) return { chave: 'fora', rotulo: 'Fora do período', ordem: 1 };
  return { chave: 'ativa', rotulo: 'Ativa', ordem: 0 };
}

const COMPARADORES = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'),
  tipo: (a, b) => a.tipo.localeCompare(b.tipo),
  status: (a, b) => situacaoMissao(a).ordem - situacaoMissao(b).ordem,
  xp: (a, b) => a.xp - b.xp,
  conclusoes: (a, b) => (a.conclusoes ?? 0) - (b.conclusoes ?? 0),
  periodo: (a, b) => (a.inicio ?? '').localeCompare(b.inicio ?? ''),
  atualizadoEm: (a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm),
};

export const ORDEM_PADRAO = { campo: 'atualizadoEm', direcao: 'desc' };

/** Ordena sem mexer na lista original; empate cai na data de criação. */
export function ordenarMissoes(missoes, { campo, direcao } = ORDEM_PADRAO) {
  const comparar = COMPARADORES[campo] ?? COMPARADORES.atualizadoEm;
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...missoes].sort((a, b) => sinal * comparar(a, b) || b.criadoEm.localeCompare(a.criadoEm));
}

/** "Hoje", "Ontem" ou a data curta, como na coluna "Atualizada". */
export function textoAtualizada(iso, agora = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(d)) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

const COLUNAS = [
  { campo: 'titulo', rotulo: 'Missão' },
  { campo: 'status', rotulo: 'Status' },
  { campo: 'xp', rotulo: 'Recompensa' },
  { campo: 'conclusoes', rotulo: 'Conclusões', centro: true },
  { campo: 'periodo', rotulo: 'Período' },
  { campo: 'atualizadoEm', rotulo: 'Atualizada' },
];

function CaixaSelecao({ marcada, parcial = false, rotulo, onChange }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = parcial; }, [parcial]);
  return (
    <input ref={ref} type="checkbox" className="missoes-check" checked={marcada} aria-label={rotulo} onChange={(e) => onChange(e.target.checked)} />
  );
}

function MenuMissao({ missao, ocupado, onEditar, onAtivar, onDesativar }) {
  const popup = usePopupMissao(190, 100);
  useEffect(() => {
    if (popup.aberto) popup.painel.current?.querySelector('[role="menuitem"]')?.focus();
  }, [popup.aberto]);
  const escolher = (acao) => { popup.fechar(true); acao?.(missao); };
  return (
    <>
      <button type="button" ref={popup.gatilho} className="missoes-menu-gatilho" disabled={ocupado} aria-label={`Ações da missão ${missao.titulo}`} aria-haspopup="menu" aria-expanded={popup.aberto} onClick={() => popup.aberto ? popup.fechar() : popup.abrir()}>
        <span aria-hidden="true" />
      </button>
      {popup.aberto && (
        <div ref={popup.painel} className="recompensa-popup recompensa-opcoes missoes-menu" role="menu" style={popup.posicao} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); popup.fechar(true); } }}>
          <button type="button" role="menuitem" onClick={() => escolher(onEditar)}><span>Editar</span><Icon name="edit" size={15} /></button>
          {missao.ativa
            ? <button type="button" role="menuitem" className="perigo" onClick={() => escolher(onDesativar)}><span>Desativar</span><Icon name="trash" size={15} /></button>
            : <button type="button" role="menuitem" onClick={() => escolher(onAtivar)}><span>Ativar</span><Icon name="refresh" size={15} /></button>}
        </div>
      )}
    </>
  );
}

export function ListaMissoes({
  missoes,
  ocupadoId = null,
  selecionadas = new Set(),
  ordem = ORDEM_PADRAO,
  emLote = false,
  onSelecionar,
  onSelecionarTodas,
  onOrdenar,
  onEditar,
  onAtivar,
  onDesativar,
  onAtivarSelecionadas,
  onDesativarSelecionadas,
}) {
  const selecao = missoes.filter((m) => selecionadas.has(m.id));
  const marcadas = selecao.length;
  const todas = marcadas > 0 && marcadas === missoes.length;
  return (
    <div className="missoes-lista-wrap">
      <table className="missoes-lista">
        <caption className="sr-only">Missões do ciclo</caption>
        <colgroup>
          <col className="c-check" />
          <col className="c-titulo" />
          <col className="c-status" />
          <col className="c-xp" />
          <col className="c-conclusoes" />
          <col className="c-periodo" />
          <col className="c-atualizada" />
          <col className="c-menu" />
        </colgroup>
        <thead>
          <tr className={marcadas > 0 ? 'em-selecao' : undefined}>
            <th scope="col" className="col-check">
              <CaixaSelecao marcada={todas} parcial={marcadas > 0 && !todas} rotulo="Selecionar todas as missões" onChange={(v) => onSelecionarTodas?.(v)} />
            </th>
            {marcadas > 0 ? (
              <th scope="col" colSpan={COLUNAS.length + 1} className="missoes-lote">
                <span className="missoes-lote-conta">{marcadas} {marcadas === 1 ? 'selecionada' : 'selecionadas'}</span>
                <button type="button" disabled={emLote || !selecao.some((m) => !m.ativa)} onClick={() => onAtivarSelecionadas?.(selecao.filter((m) => !m.ativa))}>
                  <Icon name="refresh" size={14} /> Ativar
                </button>
                <button type="button" className="perigo" disabled={emLote || !selecao.some((m) => m.ativa)} onClick={() => onDesativarSelecionadas?.(selecao.filter((m) => m.ativa))}>
                  <Icon name="trash" size={14} /> Desativar
                </button>
                <button type="button" disabled={emLote} onClick={() => onSelecionarTodas?.(false)}>
                  <Icon name="close" size={14} /> Limpar
                </button>
                {emLote && <span className="missoes-lote-status" role="status">Aplicando…</span>}
              </th>
            ) : COLUNAS.map((c) => {
              const ativa = ordem.campo === c.campo;
              return (
                <th key={c.campo} scope="col" className={c.centro ? 'centro' : undefined} aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className={`missoes-ordenar${ativa ? ' ativa' : ''}`} onClick={() => onOrdenar?.(c.campo)}>
                    {c.rotulo}
                    {ativa && <Icon name={ordem.direcao === 'asc' ? 'arrowUp' : 'arrowDown'} size={15} />}
                  </button>
                </th>
              );
            })}
            {marcadas === 0 && <th scope="col" className="col-menu"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {missoes.map((m) => {
            const situacao = situacaoMissao(m);
            const marcada = selecionadas.has(m.id);
            return (
              <tr key={m.id} className={marcada ? 'selecionada' : undefined}>
                <td className="col-check">
                  <CaixaSelecao marcada={marcada} rotulo={`Selecionar missão ${m.titulo}`} onChange={(v) => onSelecionar?.(m.id, v)} />
                </td>
                <td data-label="Missão" className="col-titulo">
                  <strong title={m.titulo}>{m.titulo}</strong>
                  <small title={m.descricao}><span className={`missoes-tipo ${m.tipo === 'SEMANAL' ? 'semanal' : ''}`}>{ROTULO_TIPO[m.tipo] ?? m.tipo}</span><span className={`missoes-tipo requisito ${m.requisito ? '' : 'sem'}`}>{rotuloRequisito(m)}</span>{m.descricao}</small>
                </td>
                <td data-label="Status"><span className={`missoes-selo ${situacao.chave}`}>{situacao.rotulo}</span></td>
                <td data-label="Recompensa" className="col-recompensa"><strong>{m.xp} XP</strong><small>+{m.xp} moedas</small></td>
                <td data-label="Conclusões" className="centro">{numero(m.conclusoes)}</td>
                <td data-label="Período" className="col-secundaria">{periodoMissao(m)}</td>
                <td data-label="Atualizada" className="col-secundaria">{textoAtualizada(m.atualizadoEm)}</td>
                <td className="col-menu">
                  <MenuMissao missao={m} ocupado={ocupadoId === m.id} onEditar={onEditar} onAtivar={onAtivar} onDesativar={onDesativar} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmação de desativar várias missões de uma vez. */
export function ConfirmarDesativacaoLote({ missoes, ocupado, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  const conclusoes = missoes.reduce((t, m) => t + (m.conclusoes ?? 0), 0);
  return (
    <Modal
      titulo={`Desativar ${missoes.length} missões?`}
      descricao="Elas somem da lista dos alunos e não podem mais ser concluídas. Conclusões, XP e moedas já concedidos continuam no histórico, e você pode reativá-las depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : `Desativar ${missoes.length}`}
          </button>
        </>
      )}
    >
      <ul className="missoes-lote-lista">{missoes.map((m) => <li key={m.id}>{m.titulo}</li>)}</ul>
      {conclusoes > 0 && <p className="detail-muted">Juntas, elas têm {conclusoes} conclusão(ões); serão preservadas.</p>}
    </Modal>
  );
}

export function ConfirmarDesativacaoMissao({ missao, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Desativar a missão "${missao.titulo}"?`}
      descricao="A missão some da lista dos alunos e não pode mais ser concluída. Conclusões, XP e moedas já concedidos continuam no histórico, e você pode reativá-la depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : 'Desativar missão'}
          </button>
        </>
      )}
    >
      {missao.conclusoes > 0 && <p className="detail-muted">Esta missão já tem {missao.conclusoes} conclusão(ões); elas serão preservadas.</p>}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Filtro compacto da barra de ferramentas (mesmo popup do formulário). */
function FiltroMissao({ rotulo, valor, opcoes, onChange }) {
  const popup = usePopupMissao(220, 180);
  const selecionada = opcoes.find((o) => o.valor === valor) ?? opcoes[0];
  useEffect(() => {
    if (popup.aberto) popup.painel.current?.querySelector('[aria-selected="true"]')?.focus();
  }, [popup.aberto]);
  return (
    <>
      <button type="button" ref={popup.gatilho} className={`missoes-filtro${valor ? ' ativo' : ''}`} aria-haspopup="listbox" aria-expanded={popup.aberto} onClick={() => popup.aberto ? popup.fechar() : popup.abrir()}>
        <span className="missoes-filtro-rotulo">{rotulo}</span>
        <span>{selecionada.rotulo}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {popup.aberto && (
        <div ref={popup.painel} className="recompensa-popup recompensa-opcoes" role="listbox" aria-label={rotulo} style={popup.posicao} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); popup.fechar(true); } }}>
          {opcoes.map((o) => (
            <button key={o.valor || 'todos'} type="button" role="option" aria-selected={o.valor === valor} onClick={() => { onChange(o.valor); popup.fechar(true); }}>
              <span>{o.rotulo}</span>
              {o.valor === valor && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const OPCOES_TIPO = [
  { valor: 'UNICA', rotulo: 'Única no ciclo' },
  { valor: 'SEMANAL', rotulo: 'Semanal (renova toda segunda)' },
];

export function FormularioMissao({ original, onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => formDaMissao(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;

  const alterados = criando ? null : camposAlteradosMissao(original, form);
  const erroValidacao = validarMissao(form, { fimNovo: criando || (alterados && 'fim' in alterados) });
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;
  const { tituloMax, descricaoMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;
  const tipoBloqueado = !criando && original.conclusoes > 0;
  const requisitoBloqueado = tipoBloqueado && Boolean(original.requisito);
  const [alvos, setAlvos] = useState({ pucstops: [], eventos: [], erro: '' });

  useEffect(() => {
    let vivo = true;
    Promise.all([api.pucstops(), api.eventos()])
      .then(([pucstops, eventos]) => {
        if (!vivo) return;
        const agora = Date.now();
        setAlvos({
          pucstops: (pucstops ?? []).filter((p) => p.ativo),
          eventos: (eventos ?? []).filter((e) => e.ativo && e.local && new Date(e.fim).getTime() > agora),
          erro: '',
        });
      })
      .catch(() => vivo && setAlvos((a) => ({ ...a, erro: 'Não foi possível carregar PucStops e eventos.' })));
    return () => { vivo = false; };
  }, []);

  function campo(chave, valor) {
    setForm((atual) => {
      const proximo = { ...atual, [chave]: valor };
      if (chave === 'requisito') {
        proximo.alvoId = '';
        if (valor === 'EVENTO' || valor === 'PUCSTOPS') proximo.tipo = 'UNICA';
      }
      return proximo;
    });
    setErro('');
  }

  const requisito = REQUISITOS[form.requisito];
  const opcoesPucStop = [{ valor: '', rotulo: 'Qualquer PucStop' }, ...alvos.pucstops.map((p) => ({ valor: p.id, rotulo: p.nome }))];
  const opcoesEvento = [
    { valor: '', rotulo: alvos.eventos.length ? 'Escolha o evento' : 'Nenhum evento futuro com local no mapa' },
    ...alvos.eventos.map((e) => ({ valor: e.id, rotulo: `${e.titulo} · ${diaMes(e.inicio)}` })),
  ];
  if (form.alvoId && form.requisito === 'EVENTO' && !opcoesEvento.some((o) => o.valor === form.alvoId)) {
    opcoesEvento.push({ valor: form.alvoId, rotulo: original?.alvoNome ?? 'Evento atual' });
  }
  if (form.alvoId && form.requisito === 'PUCSTOPS' && !opcoesPucStop.some((o) => o.valor === form.alvoId)) {
    opcoesPucStop.push({ valor: form.alvoId, rotulo: original?.alvoNome ?? 'PucStop atual' });
  }

  async function salvar(event) {
    event.preventDefault();
    if (!podeSalvar || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      const salvo = criando
        ? await api.criarMissao(corpoCriacaoMissao(form))
        : await api.atualizarMissao(original.id, { ...alterados, atualizadoEm: original.atualizadoEm });
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a missão.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };

  return (
    <Modal
      titulo={criando ? 'Nova missão' : `Editar missão "${original.titulo}"`}
      descricao={criando ? 'Defina o que o aluno precisa fazer, quanto XP ganha e por quanto tempo a missão fica disponível. Moedas = XP.' : 'Alterar a recompensa vale só para novas conclusões.'}
      onFechar={fechar}
      tamanho="lg"
      className="recompensa-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? (form.ativar ? 'Criar e publicar' : 'Criar rascunho') : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form recompensa-form missao-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-titulo`}>
          <span>Título</span>
          <input id={`${base}-titulo`} value={form.titulo} maxLength={tituloMax} required data-autofocus placeholder="Ex.: Participe da Semana do Calouro" onChange={(e) => campo('titulo', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição</span>
          <textarea id={`${base}-descricao`} className="detail-textarea" rows={2} value={form.descricao} maxLength={descricaoMax} required placeholder="O que o aluno precisa fazer" onChange={(e) => campo('descricao', e.target.value)} />
        </label>

        <fieldset className="recompensa-bloco">
          <legend>Como o aluno comprova</legend>
          <div className="editor-grid pucstop-grid">
            <ListaMissao id={`${base}-requisito`} rotulo="Requisito" valor={form.requisito} opcoes={form.requisito ? OPCOES_REQUISITO : [{ valor: '', rotulo: 'Escolha o requisito' }, ...OPCOES_REQUISITO]} desabilitado={requisitoBloqueado} onChange={(valor) => campo('requisito', valor)} />
            {form.requisito === 'PUCSTOPS' && (
              <ListaMissao id={`${base}-pucstop`} rotulo="PucStop" valor={form.alvoId} opcoes={opcoesPucStop} desabilitado={requisitoBloqueado} onChange={(valor) => campo('alvoId', valor)} />
            )}
            {form.requisito === 'EVENTO' && (
              <ListaMissao id={`${base}-evento`} rotulo="Evento" valor={form.alvoId} opcoes={opcoesEvento} desabilitado={requisitoBloqueado} onChange={(valor) => campo('alvoId', valor)} />
            )}
            {usaQuantidade(form) && (
              <label className="editor-field" htmlFor={`${base}-quantidade`}>
                <span>Quantidade</span>
                <input id={`${base}-quantidade`} type="number" inputMode="numeric" min={1} max={QUANTIDADE_MAX} step={1} value={form.quantidade} disabled={requisitoBloqueado} required onChange={(e) => campo('quantidade', e.target.value)} />
              </label>
            )}
            {(form.requisito === 'CODIGO' || form.requisito === 'EVENTO') && (
              <label className="editor-field" htmlFor={`${base}-codigo`}>
                <span>Código</span>
                <input id={`${base}-codigo`} value={form.codigo} maxLength={20} autoComplete="off" spellCheck={false} placeholder="Ex.: CALOURO26" onChange={(e) => campo('codigo', e.target.value.toUpperCase())} />
              </label>
            )}
          </div>
          <p className="field-hint">
            {requisito ? requisito.dica : 'Missão antiga sem requisito: escolha um para poder ativar.'}
            {requisitoBloqueado && <strong> Já há conclusões: o requisito não pode mudar (o código pode).</strong>}
            {alvos.erro && <strong> {alvos.erro}</strong>}
          </p>
        </fieldset>

        <fieldset className="recompensa-bloco">
          <legend>Recompensa</legend>
          <div className="editor-grid pucstop-grid">
            <ListaMissao id={`${base}-tipo`} rotulo="Tipo" valor={form.tipo} opcoes={OPCOES_TIPO} desabilitado={tipoBloqueado || form.requisito === 'EVENTO' || form.requisito === 'PUCSTOPS'} onChange={(valor) => campo('tipo', valor)} />
            <label className="editor-field" htmlFor={`${base}-xp`}>
              <span>Recompensa (XP)</span>
              <input id={`${base}-xp`} type="number" inputMode="numeric" min={1} max={form.tipo === 'SEMANAL' ? xpSemanalMax : xpMax} step={1} value={form.xp} required onChange={(e) => campo('xp', e.target.value)} />
            </label>
          </div>
          <p className="field-hint">
            Máximo de {form.tipo === 'SEMANAL' ? `${xpSemanalMax} XP por missão semanal` : `${xpMax} XP por missão`}. Moedas = XP.
            {tipoBloqueado && <strong> Já há conclusões: o tipo não pode mudar.</strong>}
          </p>
        </fieldset>

        <fieldset className="recompensa-bloco">
          <legend>Período</legend>
          <div className="editor-grid pucstop-grid">
            <CalendarioMissao id={`${base}-inicio`} rotulo="Disponível a partir de" valor={form.inicio} onChange={(valor) => campo('inicio', valor)} />
            <CalendarioMissao id={`${base}-fim`} rotulo="Disponível até" valor={form.fim} onChange={(valor) => campo('fim', valor)} />
          </div>
          <p className="field-hint">Datas vazias: sem prazo. A missão só aparece para os alunos ativa e dentro do período.</p>
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Publicar e notificar os alunos" descricao="Desligado, a missão fica como rascunho até ser ativada." checked={form.ativar} onChange={(v) => campo('ativar', v)} />
          </div>
        )}
        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
        {!erro && (erroValidacao || semAlteracoes) && (
          <p className="detail-muted small" role="status">{erroValidacao || 'Nenhuma alteração para salvar.'}</p>
        )}
      </form>
    </Modal>
  );
}

export default function MissoesPage() {
  const mostrarToast = useToast();
  const [missoes, setMissoes] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [editando, setEditando] = useState(null);
  const [desativando, setDesativando] = useState(null);
  const [erroDesativacao, setErroDesativacao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [ordem, setOrdem] = useState(ORDEM_PADRAO);
  const [loteDesativar, setLoteDesativar] = useState(null);
  const [emLote, setEmLote] = useState(false);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setMissoes(await api.missoesCoordenacao());
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as missões.');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function substituir(item) {
    setMissoes((lista) => {
      const resto = (lista || []).filter((m) => m.id !== item.id);
      return [item, ...resto].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    });
  }

  const resumo = useMemo(() => resumoMissoes(missoes || []), [missoes]);
  const lista = useMemo(
    () => ordenarMissoes(filtrarMissoes(missoes || [], { busca, tipo, status }), ordem),
    [missoes, busca, tipo, status, ordem],
  );

  function selecionar(id, marcar) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (marcar) nova.add(id); else nova.delete(id);
      return nova;
    });
  }

  function selecionarTodas(marcar) {
    setSelecionadas(marcar ? new Set(lista.map((m) => m.id)) : new Set());
  }

  function ordenar(campo) {
    setOrdem((atual) => (atual.campo === campo
      ? { campo, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: campo === 'titulo' || campo === 'tipo' || campo === 'status' ? 'asc' : 'desc' }));
  }

  /** Ativa ou desativa várias, uma por vez; o que falhar fica selecionado. */
  async function aplicarEmLote(alvo, ativar) {
    if (trava.current || alvo.length === 0) return;
    trava.current = true;
    setEmLote(true);
    setErroAcao('');
    const falhas = [];
    const idsComFalha = new Set();
    for (const missao of alvo) {
      try {
        substituir(await (ativar ? api.ativarMissao(missao.id) : api.desativarMissao(missao.id)));
      } catch (error) {
        idsComFalha.add(missao.id);
        falhas.push(`"${missao.titulo}": ${error.message || 'erro desconhecido'}`);
      }
    }
    const ok = alvo.length - falhas.length;
    setSelecionadas(idsComFalha);
    if (ok > 0) mostrarToast(`${ok} ${ok === 1 ? 'missão' : 'missões'} ${ativar ? 'ativada(s)' : 'desativada(s)'}.`, 'sucesso');
    if (falhas.length) setErroAcao(`Não foi possível ${ativar ? 'ativar' : 'desativar'} ${falhas.join('; ')}.`);
    setLoteDesativar(null);
    trava.current = false;
    setEmLote(false);
  }

  async function ativar(missao) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(missao.id);
    setErroAcao('');
    try {
      const atualizada = await api.ativarMissao(missao.id);
      substituir(atualizada);
      mostrarToast(`Missão "${atualizada.titulo}" ativada.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível ativar "${missao.titulo}": ${error.message || 'erro desconhecido.'}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function desativar() {
    if (trava.current || !desativando) return;
    trava.current = true;
    setOcupadoId(desativando.id);
    setErroDesativacao('');
    try {
      const atualizada = await api.desativarMissao(desativando.id);
      substituir(atualizada);
      setDesativando(null);
      mostrarToast(`Missão "${atualizada.titulo}" desativada.`, 'sucesso');
    } catch (error) {
      setErroDesativacao(error.message || 'Não foi possível desativar a missão.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page missoes-page">
      <header className="dash-header">
        <div>
          <h1>Missões</h1>
          {missoes && missoes.length > 0 && (
            <ul className="missoes-resumo" aria-label="Resumo do ciclo">
              <li><strong>{numero(resumo.ativas)}</strong> {resumo.ativas === 1 ? 'ativa' : 'ativas'} de {numero(missoes.length)}</li>
              <li><strong>{numero(resumo.conclusoes)}</strong> {resumo.conclusoes === 1 ? 'conclusão' : 'conclusões'}</li>
              <li><strong>{numero(resumo.xp)}</strong> XP distribuídos</li>
              {missoes[0]?.ciclo && <li className="missoes-resumo-ciclo">Ciclo {missoes[0].ciclo}</li>}
            </ul>
          )}
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')}>
          <Icon name="plus" size={17} /> Nova missão
        </button>
      </header>

      {missoes && missoes.length > 0 && (
        <div className="missoes-ferramentas">
          <div className="forms-tabs missoes-abas" role="tablist" aria-label="Filtrar por status">
            {[
              { valor: '', rotulo: 'Todas', total: missoes.length },
              { valor: 'ativa', rotulo: 'Ativas', total: resumo.ativas },
              { valor: 'inativa', rotulo: 'Inativas', total: missoes.length - resumo.ativas },
            ].map((aba) => (
              <button key={aba.valor || 'todas'} type="button" role="tab" aria-selected={status === aba.valor} className={`forms-tab${status === aba.valor ? ' active' : ''}`} onClick={() => setStatus(aba.valor)}>
                {aba.rotulo}<span className="forms-tab-status">{numero(aba.total)}</span>
              </button>
            ))}
          </div>
          <label className="missoes-busca">
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar missão</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou descrição" />
          </label>
          <div className="missoes-filtros">
            <FiltroMissao rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'UNICA', rotulo: 'Única' }, { valor: 'SEMANAL', rotulo: 'Semanal' }]} />
          </div>
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!missoes && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando missões…</p></div>}
      {missoes?.length === 0 && <p className="empty-copy">Nenhuma missão neste ciclo. Crie a primeira com "Nova missão".</p>}
      {missoes && missoes.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhuma missão com estes filtros.</p>}

      {lista.length > 0 && (
        <ListaMissoes
          missoes={lista}
          ocupadoId={ocupadoId}
          selecionadas={selecionadas}
          ordem={ordem}
          emLote={emLote}
          onAtivarSelecionadas={(alvo) => aplicarEmLote(alvo, true)}
          onDesativarSelecionadas={(alvo) => setLoteDesativar(alvo)}
          onSelecionar={selecionar}
          onSelecionarTodas={selecionarTodas}
          onOrdenar={ordenar}
          onEditar={(m) => setEditando(m)}
          onAtivar={ativar}
          onDesativar={(m) => { setErroDesativacao(''); setDesativando(m); }}
        />
      )}

      {editando && (
        <FormularioMissao
          original={editando === 'novo' ? null : editando}
          onCancelar={() => setEditando(null)}
          onSalvo={(salva, criada) => {
            substituir(salva);
            setEditando(null);
            mostrarToast(criada ? `Missão "${salva.titulo}" criada.` : `Missão "${salva.titulo}" atualizada.`, 'sucesso');
          }}
        />
      )}

      {loteDesativar && (
        <ConfirmarDesativacaoLote
          missoes={loteDesativar}
          ocupado={emLote}
          onConfirmar={() => aplicarEmLote(loteDesativar, false)}
          onFechar={() => setLoteDesativar(null)}
        />
      )}

      {desativando && (
        <ConfirmarDesativacaoMissao
          missao={desativando}
          ocupado={ocupadoId === desativando.id}
          erro={erroDesativacao}
          onConfirmar={desativar}
          onFechar={() => setDesativando(null)}
        />
      )}
    </section>
  );
}
