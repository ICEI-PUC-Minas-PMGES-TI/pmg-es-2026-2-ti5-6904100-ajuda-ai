import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import './missoes.css';

export const LIMITES_MISSAO = { tituloMax: 120, descricaoMax: 1000, instrucoesMax: 1000, xpMax: 100, xpSemanalMax: 60 };

export const ROTULO_TIPO = { UNICA: 'Única', SEMANAL: 'Semanal' };

export const REQUISITOS = {
  PUCSTOPS: { rotulo: 'Coletar PucStops', curto: 'PucStops', contado: true, dica: 'Conta totem coletado no local (geofence) neste semestre, mesmo antes da publicação. Marque os pontos do roteiro (o aluno coleta todos) ou deixe sem pontos e defina quantos totens quaisquer. Cada totem vale uma vez: a missão é única. Totem desativado depois da publicação deixa de contar para quem ainda não o coletou.' },
  EVENTO: { rotulo: 'Check-in em evento', curto: 'Evento', dica: 'O aluno faz check-in no local do evento (GPS), de 30 min antes até o fim, e digita o código que você mostra lá. Libere o código na hora, no menu da missão (Liberar código): fora desse tempo ele não vale. Sem o código, o GPS não basta.' },
  FEED_COMENTARIOS: { rotulo: 'Comentar no feed', curto: 'Comentários', contado: true, dica: 'Conta um comentário por post (pelo menos 10 caracteres), no feed do semestre: vários no mesmo post valem um, e comentar no próprio post não conta.' },
  FEED_CURTIDAS: { rotulo: 'Curtir posts de colegas', curto: 'Curtidas', contado: true, dica: 'Uma curtida por post; curtir o próprio post não conta. Na semanal, só contam posts publicados na semana.' },
  FEED_PUBLICACOES: { rotulo: 'Publicar no feed', curto: 'Publicações', contado: true, dica: 'Publicação com pelo menos 10 caracteres ou com foto. Só padrinhos com dupla publicam: os demais nem veem esta missão.' },
  CHAT_MENSAGENS: { rotulo: 'Mensagens no chat da dupla', curto: 'Chat', contado: true, dica: 'Só quem já tem dupla vê esta missão. Mensagem com menos de 10 caracteres não conta.' },
  ENCONTRO: { rotulo: 'Participar de encontros confirmados', curto: 'Encontros', contado: true, dica: 'Conta encontros realizados em que o aluno confirmou presença.' },
  CODIGO: { rotulo: 'Código da atividade presencial', curto: 'Código', dica: 'Mostre o código na atividade (telão, monitor, estande) e libere por alguns minutos no menu da missão (Liberar código): fora desse tempo ele não vale, então repassar depois não adianta. 5 erros por hora bloqueiam o aluno. Na semanal, troque o código toda semana: o mesmo código não vale duas vezes para o mesmo aluno.' },
};

export const PUBLICOS = {
  TODOS: 'Todos os participantes',
  PADRINHOS: 'Só padrinhos',
  APADRINHADOS: 'Só apadrinhados',
};

const OPCOES_PUBLICO = Object.entries(PUBLICOS).map(([valor, rotulo]) => ({ valor, rotulo }));

/** rascunho → publicada → arquivada. A API manda `estado`; o resto é fallback. */
export function estadoMissao(m) {
  if (m.estado) return m.estado;
  if (m.ativa) return 'publicada';
  return m.publicadaEm ? 'arquivada' : 'rascunho';
}

export function contarEstados(missoes) {
  const contagem = { rascunho: 0, publicada: 0, arquivada: 0 };
  for (const m of missoes) contagem[estadoMissao(m)] += 1;
  return contagem;
}

export const REQUISITOS_NO_APP = Object.keys(REQUISITOS).filter((r) => r !== 'CHAT_MENSAGENS');

const OPCOES_REQUISITO = REQUISITOS_NO_APP.map((valor) => ({ valor, rotulo: REQUISITOS[valor].rotulo }));

export function opcoesRequisito(atual) {
  if (!atual) return [{ valor: '', rotulo: 'Escolha o requisito' }, ...OPCOES_REQUISITO];
  if (REQUISITOS[atual] && !REQUISITOS_NO_APP.includes(atual)) {
    return [...OPCOES_REQUISITO, { valor: atual, rotulo: REQUISITOS[atual].rotulo }];
  }
  return OPCOES_REQUISITO;
}

export const QUANTIDADE_MAX = 20;
const CODIGO_VALIDO = /^[A-Z0-9-]{4,20}$/;
const CHECKIN_ANTECEDENCIA_MS = 30 * 60 * 1000;

export function normalizarCodigo(codigo) {
  return String(codigo ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

/** Opções de tempo para liberar o código (o servidor aceita até 120 min). */
export const MINUTOS_CODIGO = [5, 10, 15, 30, 60];

/** Até quando o código vale agora; null se fechado ou vencido. */
export function codigoLiberadoAte(missao, agora = Date.now()) {
  const ate = missao?.codigoLiberadoAte ? new Date(missao.codigoLiberadoAte).getTime() : NaN;
  return Number.isFinite(ate) && ate > agora ? new Date(ate) : null;
}

/** "9:41" (ou "1:05:12") até o código fechar. */
export function textoRestante(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = doisDigitos(total % 60);
  return horas > 0 ? `${horas}:${doisDigitos(minutos)}:${segundos}` : `${minutos}:${segundos}`;
}

export function horaCurta(data) {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
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
    instrucoes: missao?.instrucoes ?? '',
    tipo: missao?.tipo ?? 'UNICA',
    xp: missao ? String(missao.xp) : '50',
    publico: missao?.publico ?? 'TODOS',
    requisito: missao ? missao.requisito ?? '' : 'PUCSTOPS',
    quantidade: String(missao?.quantidade ?? 1),
    alvoId: missao?.alvoId ?? '',
    pontos: (missao?.pontos ?? []).map((p) => p.id),
    codigo: missao?.codigo ?? '',
    inicio: paraInputData(missao?.inicio),
    fim: paraInputData(missao?.fim),
    ativar: false,
  };
}

/**
 * `prazoAtual`: o `fim` da missão já publicada (`null` se não tinha). Aí o
 * prazo só prorroga ou some; encurtar tira tempo de quem está fazendo.
 */
export function validarMissao(form, { agora = new Date(), fimNovo = true, prazoAtual, evento } = {}) {
  const { tituloMax, descricaoMax, instrucoesMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;
  const titulo = form.titulo.trim();
  const descricao = form.descricao.trim();
  if (!titulo) return 'Informe o título da missão.';
  if (titulo.length > tituloMax) return `O título deve ter no máximo ${tituloMax} caracteres.`;
  if (!descricao) return 'Descreva como o aluno conclui a missão.';
  if (descricao.length > descricaoMax) return `A descrição deve ter no máximo ${descricaoMax} caracteres.`;
  if ((form.instrucoes ?? '').trim().length > instrucoesMax) return `As instruções devem ter no máximo ${instrucoesMax} caracteres.`;
  const xp = Number(form.xp);
  if (!Number.isInteger(xp) || xp < 1 || xp > xpMax) return `A recompensa deve ser de 1 a ${xpMax} XP.`;
  if (form.tipo === 'SEMANAL' && xp > xpSemanalMax) return `Missão semanal limitada a ${xpSemanalMax} XP.`;
  const requisito = REQUISITOS[form.requisito];
  if (!requisito) return 'Escolha como o aluno comprova a missão.';
  if (form.publico === 'APADRINHADOS' && form.requisito === 'FEED_PUBLICACOES') {
    return 'Só padrinhos com dupla publicam no feed: escolha outro público ou outro requisito.';
  }
  if (form.requisito === 'PUCSTOPS' && (form.pontos ?? []).length > QUANTIDADE_MAX) {
    return `Escolha no máximo ${QUANTIDADE_MAX} PucStops.`;
  }
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
  if (form.requisito === 'EVENTO' && evento) {
    const abre = new Date(evento.inicio).getTime() - CHECKIN_ANTECEDENCIA_MS;
    const fecha = new Date(evento.fim).getTime();
    if ((inicio && new Date(inicio).getTime() >= fecha) || (fim && new Date(fim).getTime() <= abre)) {
      return 'O período da missão precisa cruzar o check-in do evento (de 30 min antes do início até o fim). Ajuste o início ou o fim.';
    }
  }
  if (fimNovo && fim && new Date(fim) <= agora) return 'O fim precisa estar no futuro.';
  if (fimNovo && fim && prazoAtual !== undefined && (prazoAtual === null || new Date(fim) < new Date(prazoAtual))) {
    return 'Já publicada: o prazo só pode ser prorrogado. Para encerrar antes, arquive a missão.';
  }
  return '';
}

/** Com pontos marcados, a meta é coletar todos; sem pontos, a coordenação diz quantos. */
export function usaQuantidade(form) {
  return Boolean(REQUISITOS[form.requisito]?.contado) && !(form.requisito === 'PUCSTOPS' && (form.pontos ?? []).length > 0);
}

export function camposRequisito(form) {
  const pontos = form.requisito === 'PUCSTOPS' ? [...new Set(form.pontos ?? [])] : [];
  const campos = { requisito: form.requisito, quantidade: usaQuantidade(form) ? Number(form.quantidade) : pontos.length || 1 };
  campos.alvoId = form.requisito === 'EVENTO' && form.alvoId ? form.alvoId : null;
  campos.alvoIds = pontos.length ? pontos : null;
  campos.codigo = form.requisito === 'CODIGO' || form.requisito === 'EVENTO' ? normalizarCodigo(form.codigo) : null;
  return campos;
}

const mesmaLista = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function corpoCriacaoMissao(form) {
  const { alvoId, alvoIds, codigo, ...requisito } = camposRequisito(form);
  const corpo = {
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim(),
    tipo: form.tipo,
    xp: Number(form.xp),
    publico: form.publico || 'TODOS',
    ativar: Boolean(form.ativar),
    ...requisito,
  };
  if (alvoId) corpo.alvoId = alvoId;
  if (alvoIds) corpo.alvoIds = alvoIds;
  if (codigo) corpo.codigo = codigo;
  const instrucoes = (form.instrucoes ?? '').trim();
  if (instrucoes) corpo.instrucoes = instrucoes;
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
  const instrucoes = (form.instrucoes ?? '').trim() || null;
  if (instrucoes !== (original.instrucoes ?? null)) alterados.instrucoes = instrucoes;
  if (form.tipo !== original.tipo) alterados.tipo = form.tipo;
  if (Number(form.xp) !== original.xp) alterados.xp = Number(form.xp);
  if ((form.publico ?? 'TODOS') !== (original.publico ?? 'TODOS')) alterados.publico = form.publico;
  if (form.requisito) {
    const novo = camposRequisito(form);
    const mudouRegra = novo.requisito !== original.requisito
      || novo.quantidade !== original.quantidade
      || novo.alvoId !== (original.alvoId ?? null)
      || !mesmaLista(novo.alvoIds ?? [], (original.pontos ?? []).map((p) => p.id));
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

/** `status`: 'ativa', 'inativa' ou um estado ('rascunho', 'arquivada'). */
export function filtrarMissoes(missoes, { busca = '', tipo = '', status = '' }) {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const noStatus = (m) => {
    if (!status) return true;
    if (status === 'ativa') return m.ativa;
    if (status === 'inativa') return !m.ativa;
    return estadoMissao(m) === status;
  };
  return missoes.filter((m) => (
    (!termo || m.titulo.toLocaleLowerCase('pt-BR').includes(termo) || m.descricao.toLocaleLowerCase('pt-BR').includes(termo))
    && (!tipo || m.tipo === tipo)
    && noStatus(m)
  ));
}

const numero = (v) => Number(v ?? 0).toLocaleString('pt-BR');

export function rotuloRequisito(m) {
  const r = REQUISITOS[m.requisito];
  if (!r) return 'Sem requisito';
  if (m.alvoNome) return `${r.curto}: ${m.alvoNome}`;
  const pontos = m.pontos ?? [];
  if (pontos.length === 1) return `${r.curto}: ${pontos[0].nome ?? 'ponto removido'}`;
  if (pontos.length > 1) return `${r.curto}: roteiro de ${pontos.length}`;
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

function CalendarioMissao({ id, rotulo, valor, onChange, desabilitado = false }) {
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
      <button type="button" ref={popup.gatilho} className={`recompensa-gatilho${partes ? '' : ' vazio'}`} disabled={desabilitado} style={desabilitado ? { opacity: 0.6, cursor: 'not-allowed' } : undefined} aria-labelledby={`${id}-rotulo ${id}-valor`} aria-haspopup="dialog" aria-expanded={popup.aberto} onClick={() => popup.aberto ? popup.fechar() : abrir()} onKeyDown={(event) => { if (popup.aberto && event.key === 'Escape') { event.stopPropagation(); popup.fechar(); } }}>
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
  const estado = estadoMissao(m);
  if (estado === 'rascunho') return { chave: 'rascunho', rotulo: 'Rascunho', ordem: 2 };
  if (estado === 'arquivada') return { chave: 'inativa', rotulo: 'Arquivada', ordem: 3 };
  if (!m.vigenteAgora) return { chave: 'fora', rotulo: 'Fora do período', ordem: 1 };
  return { chave: 'ativa', rotulo: 'Publicada', ordem: 0 };
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

function MenuMissao({ missao, ocupado, onEditar, onAtivar, onDesativar, onExcluir, onCodigo }) {
  const popup = usePopupMissao(210, 140);
  const estado = estadoMissao(missao);
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
          {estado === 'rascunho' && <button type="button" role="menuitem" onClick={() => escolher(onAtivar)}><span>Publicar</span><Icon name="send" size={15} /></button>}
          {estado === 'arquivada' && <button type="button" role="menuitem" onClick={() => escolher(onAtivar)}><span>Publicar de novo</span><Icon name="refresh" size={15} /></button>}
          {estado === 'publicada' && (missao.requisito === 'CODIGO' || missao.requisito === 'EVENTO') && <button type="button" role="menuitem" onClick={() => escolher(onCodigo)}><span>{codigoLiberadoAte(missao) ? 'Código liberado' : 'Liberar código'}</span><Icon name="clock" size={15} /></button>}
          {estado === 'publicada' && <button type="button" role="menuitem" className="perigo" onClick={() => escolher(onDesativar)}><span>Arquivar</span><Icon name="history" size={15} /></button>}
          {estado === 'rascunho' && !missao.conclusoes && <button type="button" role="menuitem" className="perigo" onClick={() => escolher(onExcluir)}><span>Excluir rascunho</span><Icon name="trash" size={15} /></button>}
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
  onExcluir,
  onCodigo,
  onAtivarSelecionadas,
  onDesativarSelecionadas,
  agora = Date.now(),
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
                  <Icon name="send" size={14} /> Publicar
                </button>
                <button type="button" className="perigo" disabled={emLote || !selecao.some((m) => m.ativa)} onClick={() => onDesativarSelecionadas?.(selecao.filter((m) => m.ativa))}>
                  <Icon name="history" size={14} /> Arquivar
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
            const codigoAte = codigoLiberadoAte(m, agora);
            return (
              <tr key={m.id} className={marcada ? 'selecionada' : undefined}>
                <td className="col-check">
                  <CaixaSelecao marcada={marcada} rotulo={`Selecionar missão ${m.titulo}`} onChange={(v) => onSelecionar?.(m.id, v)} />
                </td>
                <td data-label="Missão" className="col-titulo">
                  <strong title={m.titulo}>{m.titulo}</strong>
                  <small title={m.descricao}><span className={`missoes-tipo ${m.tipo === 'SEMANAL' ? 'semanal' : ''}`}>{ROTULO_TIPO[m.tipo] ?? m.tipo}</span><span className={`missoes-tipo requisito ${m.requisito ? '' : 'sem'}`}>{rotuloRequisito(m)}</span>{m.publico && m.publico !== 'TODOS' && <span className="missoes-tipo publico">{PUBLICOS[m.publico]}</span>}{codigoAte && <span className="missoes-tipo codigo">Código até {horaCurta(codigoAte)}</span>}{m.descricao}</small>
                </td>
                <td data-label="Status"><span className={`missoes-selo ${situacao.chave}`}>{situacao.rotulo}</span></td>
                <td data-label="Recompensa" className="col-recompensa"><strong>{m.xp} XP</strong><small>+{m.xp} moedas</small></td>
                <td data-label="Conclusões" className="centro">{numero(m.conclusoes)}</td>
                <td data-label="Período" className="col-secundaria">{periodoMissao(m)}</td>
                <td data-label="Atualizada" className="col-secundaria">{textoAtualizada(m.atualizadoEm)}</td>
                <td className="col-menu">
                  <MenuMissao missao={m} ocupado={ocupadoId === m.id} onEditar={onEditar} onAtivar={onAtivar} onDesativar={onDesativar} onExcluir={onExcluir} onCodigo={onCodigo} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmação de arquivar várias missões de uma vez. */
export function ConfirmarDesativacaoLote({ missoes, ocupado, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  const conclusoes = missoes.reduce((t, m) => t + (m.conclusoes ?? 0), 0);
  return (
    <Modal
      titulo={`Arquivar ${missoes.length} missões?`}
      descricao="Elas somem da lista dos alunos e não podem mais ser concluídas. Conclusões, XP e moedas já concedidos continuam no histórico. Dá para publicá-las de novo, sem mudar regra nem recompensa."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="history" size={16} /> {ocupado ? 'Arquivando…' : `Arquivar ${missoes.length}`}
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
      titulo={`Arquivar a missão "${missao.titulo}"?`}
      descricao="A missão some da lista dos alunos e não pode mais ser concluída. Conclusões, XP e moedas já concedidos continuam no histórico. Dá para publicá-la de novo, sem mudar regra nem recompensa."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="history" size={16} /> {ocupado ? 'Arquivando…' : 'Arquivar missão'}
          </button>
        </>
      )}
    >
      {missao.conclusoes > 0 && <p className="detail-muted">Esta missão já tem {missao.conclusoes} conclusão(ões); elas serão preservadas.</p>}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Rascunho nunca publicado: excluir apaga de vez. */
export function ConfirmarExclusaoMissao({ missao, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Excluir o rascunho "${missao.titulo}"?`}
      descricao="O rascunho nunca foi publicado, então nenhum aluno o viu. Excluir apaga a missão de vez."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Excluindo…' : 'Excluir rascunho'}
          </button>
        </>
      )}
    >
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/**
 * Libera o código por alguns minutos, na hora da atividade. Fora desse tempo
 * o código não vale: quem recebe depois não consegue usar.
 */
export function PainelCodigoMissao({ missao, ocupado, erro, onLiberar, onEncerrar, onFechar, agoraInicial }) {
  const base = useId();
  const [minutos, setMinutos] = useState('10');
  const [agora, setAgora] = useState(() => agoraInicial ?? Date.now());
  const ate = codigoLiberadoAte(missao, agora);
  const liberadoAte = ate?.getTime() ?? null;
  useEffect(() => { setAgora(Date.now()); }, [missao.codigoLiberadoAte]);
  useEffect(() => {
    if (liberadoAte === null) return undefined;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [liberadoAte]);
  const fechar = () => { if (!ocupado) onFechar(); };
  const opcoes = MINUTOS_CODIGO.map((n) => ({ valor: String(n), rotulo: `${n} minutos` }));
  return (
    <Modal
      titulo={`Código da missão "${missao.titulo}"`}
      descricao="Mostre o código na atividade e libere por alguns minutos. Fora desse tempo o código não vale: quem recebe depois não consegue usar."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar}>Fechar</button>
          {ate && (
            <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onEncerrar(); }}>
              <Icon name="lock" size={16} /> Encerrar agora
            </button>
          )}
          <button type="button" className="primary-button inline" disabled={ocupado} onClick={() => { if (!ocupado) onLiberar(Number(minutos)); }} data-autofocus>
            <Icon name="clock" size={16} /> {ocupado ? 'Salvando…' : `${ate ? 'Liberar de novo' : 'Liberar'} por ${minutos} min`}
          </button>
        </>
      )}
    >
      <p className="missao-codigo-grande">{missao.codigo}</p>
      <p className={`missao-codigo-status${ate ? ' liberado' : ''}`} role="status">
        {ate ? <>Liberado até <strong>{horaCurta(ate)}</strong></> : 'Fechado: os alunos não conseguem usar o código agora.'}
        {ate && <span className="missao-codigo-contagem" aria-hidden="true"> · fecha em {textoRestante(ate.getTime() - agora)}</span>}
      </p>
      <div className="editor-grid pucstop-grid">
        <ListaMissao id={`${base}-minutos`} rotulo="Liberar por" valor={minutos} opcoes={opcoes} desabilitado={ocupado} onChange={setMinutos} />
      </div>
      <p className="field-hint">Liberar de novo recomeça a contagem. Trocar o código (em Editar) vale na hora, sem fechar.</p>
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Pontos do roteiro, na ordem em que a coordenação marca. */
function SeletorPucStops({ id, opcoes, selecionados, onChange, desabilitado = false }) {
  const alternar = (pontoId, marcar) => onChange(marcar ? [...selecionados, pontoId] : selecionados.filter((x) => x !== pontoId));
  return (
    <div className="editor-field missao-pontos">
      <span id={`${id}-rotulo`}>PucStops do roteiro</span>
      <div className="missao-pontos-lista" role="group" aria-labelledby={`${id}-rotulo`}>
        {opcoes.length === 0 && <small className="detail-muted">Nenhum PucStop ativo no campus.</small>}
        {opcoes.map((p) => {
          const posicao = selecionados.indexOf(p.id);
          return (
            <label key={p.id} className={`missao-ponto${posicao >= 0 ? ' marcado' : ''}`}>
              <input type="checkbox" checked={posicao >= 0} disabled={desabilitado} onChange={(e) => alternar(p.id, e.target.checked)} />
              <span>{p.nome}</span>
              {posicao >= 0 && <small>{posicao + 1}º</small>}
            </label>
          );
        })}
      </div>
    </div>
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
  const estado = criando ? 'rascunho' : estadoMissao(original);
  // Depois da primeira publicação, regra e recompensa ficam como os alunos viram.
  const congelada = estado !== 'rascunho';
  // Exceção: missão antiga sem requisito pode ganhar o primeiro; o resto segue congelado.
  const requisitoBloqueado = congelada && Boolean(original?.requisito);
  const [alvos, setAlvos] = useState({ pucstops: [], eventos: [], erro: '' });
  const erroValidacao = validarMissao(form, {
    fimNovo: criando || (alterados && 'fim' in alterados),
    prazoAtual: congelada ? (original.fim ?? null) : undefined,
    evento: form.requisito === 'EVENTO' ? alvos.eventos.find((e) => e.id === form.alvoId) : undefined,
  });
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;
  const { tituloMax, descricaoMax, instrucoesMax, xpMax, xpSemanalMax } = LIMITES_MISSAO;

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
        proximo.pontos = [];
        if (!congelada && (valor === 'EVENTO' || valor === 'PUCSTOPS')) proximo.tipo = 'UNICA';
      }
      return proximo;
    });
    setErro('');
  }

  const requisito = REQUISITOS[form.requisito];
  // Pontos já escolhidos que saíram do mapa continuam visíveis (e removíveis).
  const opcoesPucStop = alvos.pucstops.map((p) => ({ id: p.id, nome: p.nome }));
  for (const ponto of original?.pontos ?? []) {
    if (opcoesPucStop.some((o) => o.id === ponto.id)) continue;
    const situacao = ponto.ativo === false && ponto.nome ? 'desativado' : 'fora do mapa';
    opcoesPucStop.push({ id: ponto.id, nome: `${ponto.nome ?? 'PucStop removido'} (${situacao})` });
  }
  const pontosDesativados = (original?.pontos ?? []).filter((p) => p.ativo === false && form.pontos.includes(p.id)).length;
  const opcoesEvento = [
    { valor: '', rotulo: alvos.eventos.length ? 'Escolha o evento' : 'Nenhum evento futuro com local no mapa' },
    ...alvos.eventos.map((e) => ({ valor: e.id, rotulo: `${e.titulo} · ${diaMes(e.inicio)}` })),
  ];
  if (form.alvoId && form.requisito === 'EVENTO' && !opcoesEvento.some((o) => o.valor === form.alvoId)) {
    opcoesEvento.push({ valor: form.alvoId, rotulo: original?.alvoNome ?? 'Evento atual' });
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
      // 409 'missao-publicada': alguém publicou enquanto o formulário estava aberto.
      setErro(error.motivo === 'missao-publicada'
        ? `${error.message} Feche e abra de novo para ver a missão como está.`
        : error.message || 'Não foi possível salvar a missão.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };

  return (
    <Modal
      titulo={criando ? 'Nova missão' : `Editar missão "${original.titulo}"`}
      descricao={criando
        ? 'Defina o que o aluno precisa fazer, para quem, quanto XP ganha e por quanto tempo a missão fica disponível. Moedas = XP.'
        : congelada
          ? `${estado === 'arquivada' ? 'Arquivada' : 'Publicada'}: objetivo, meta, pontos, público, tipo, início e XP ficam como os alunos viram. Dá para mudar título, descrição, instruções, código e prazo. Para mudar o resto, arquive e crie outra.`
          : 'Rascunho: nenhum aluno vê a missão ainda. Tudo pode mudar até a publicação.'}
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
        <label className="editor-field" htmlFor={`${base}-instrucoes`}>
          <span>Instruções (opcional)</span>
          <textarea id={`${base}-instrucoes`} className="detail-textarea" rows={2} value={form.instrucoes} maxLength={instrucoesMax} placeholder="Passo a passo, onde ir, o que levar" onChange={(e) => campo('instrucoes', e.target.value)} />
        </label>

        <fieldset className="recompensa-bloco">
          <legend>Como o aluno comprova</legend>
          <div className="editor-grid pucstop-grid">
            <ListaMissao id={`${base}-requisito`} rotulo="Requisito" valor={form.requisito} opcoes={opcoesRequisito(form.requisito)} desabilitado={requisitoBloqueado} onChange={(valor) => campo('requisito', valor)} />
            {form.requisito === 'PUCSTOPS' && (
              <SeletorPucStops id={`${base}-pontos`} opcoes={opcoesPucStop} selecionados={form.pontos} desabilitado={requisitoBloqueado} onChange={(lista) => campo('pontos', lista)} />
            )}
            {form.requisito === 'EVENTO' && (
              <ListaMissao id={`${base}-evento`} rotulo="Evento" valor={form.alvoId} opcoes={opcoesEvento} desabilitado={requisitoBloqueado} onChange={(valor) => campo('alvoId', valor)} />
            )}
            {usaQuantidade(form) && (
              <label className="editor-field" htmlFor={`${base}-quantidade`}>
                <span>{form.requisito === 'PUCSTOPS' ? 'Quantos PucStops quaisquer' : form.requisito === 'FEED_COMENTARIOS' ? 'Em quantos posts diferentes' : 'Quantidade'}</span>
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
            {requisito ? requisito.dica : 'Missão antiga sem requisito: escolha um para poder publicar.'}
            {form.requisito === 'PUCSTOPS' && form.pontos.length > 0 && <strong>{form.pontos.length === 1 ? ' Meta: coletar o ponto marcado.' : ` Meta: coletar os ${form.pontos.length} pontos marcados.`}</strong>}
            {requisitoBloqueado && <strong> Já publicada: o requisito não pode mudar (o código pode).</strong>}
            {form.requisito === 'PUCSTOPS' && pontosDesativados > 0 && (
              <strong>{congelada
                ? ` ${pontosDesativados === 1 ? 'O ponto desativado não conta' : `Os ${pontosDesativados} pontos desativados não contam`} para quem ainda não ${pontosDesativados === 1 ? 'o coletou' : 'os coletou'}.`
                : ` Tire ${pontosDesativados === 1 ? 'o ponto desativado' : 'os pontos desativados'} antes de publicar.`}</strong>
            )}
            {alvos.erro && <strong> {alvos.erro}</strong>}
          </p>
        </fieldset>

        <fieldset className="recompensa-bloco">
          <legend>Para quem</legend>
          <div className="editor-grid pucstop-grid">
            <ListaMissao id={`${base}-publico`} rotulo="Público" valor={form.publico} opcoes={OPCOES_PUBLICO} desabilitado={congelada} onChange={(valor) => campo('publico', valor)} />
          </div>
          <p className="field-hint">
            Missão só para padrinhos ou só para apadrinhados aparece apenas para quem tem esse papel no programa.
            {congelada && <strong> Já publicada: o público não pode mudar.</strong>}
          </p>
        </fieldset>

        <fieldset className="recompensa-bloco">
          <legend>Recompensa</legend>
          <div className="editor-grid pucstop-grid">
            <ListaMissao id={`${base}-tipo`} rotulo="Tipo" valor={form.tipo} opcoes={OPCOES_TIPO} desabilitado={congelada || form.requisito === 'EVENTO' || form.requisito === 'PUCSTOPS'} onChange={(valor) => campo('tipo', valor)} />
            <label className="editor-field" htmlFor={`${base}-xp`}>
              <span>Recompensa (XP)</span>
              <input id={`${base}-xp`} type="number" inputMode="numeric" min={1} max={form.tipo === 'SEMANAL' ? xpSemanalMax : xpMax} step={1} value={form.xp} disabled={congelada} required onChange={(e) => campo('xp', e.target.value)} />
            </label>
          </div>
          <p className="field-hint">
            Máximo de {form.tipo === 'SEMANAL' ? `${xpSemanalMax} XP por missão semanal` : `${xpMax} XP por missão`}. Moedas = XP.
            {congelada && <strong> Já publicada: tipo e XP ficam como os alunos viram.</strong>}
          </p>
        </fieldset>

        <fieldset className="recompensa-bloco">
          <legend>Período</legend>
          <div className="editor-grid pucstop-grid">
            <CalendarioMissao id={`${base}-inicio`} rotulo="Disponível a partir de" valor={form.inicio} desabilitado={congelada} onChange={(valor) => campo('inicio', valor)} />
            <CalendarioMissao id={`${base}-fim`} rotulo="Disponível até" valor={form.fim} desabilitado={congelada && !original?.fim} onChange={(valor) => campo('fim', valor)} />
          </div>
          <p className="field-hint">
            Datas vazias: sem prazo. A missão só aparece para os alunos publicada e dentro do período. O progresso conta a partir da publicação (PucStops: coletas do semestre todo).
            {congelada && (
              <strong>
                {original?.fim
                  ? ' Já publicada: o início não muda e o prazo só pode ser prorrogado. Para encerrar antes, arquive.'
                  : ' Já publicada sem prazo: o início não muda e não dá para criar um prazo. Para encerrar, arquive.'}
              </strong>
            )}
          </p>
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Publicar e notificar os alunos" descricao="Desligado, a missão fica como rascunho até ser publicada. Depois de publicada, regra e recompensa não mudam." checked={form.ativar} onChange={(v) => campo('ativar', v)} />
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
  const [excluindo, setExcluindo] = useState(null);
  const [erroExclusao, setErroExclusao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [ordem, setOrdem] = useState(ORDEM_PADRAO);
  const [loteDesativar, setLoteDesativar] = useState(null);
  const [emLote, setEmLote] = useState(false);
  const [codigoDe, setCodigoDe] = useState(null);
  const [erroCodigo, setErroCodigo] = useState('');
  const [agora, setAgora] = useState(() => Date.now());
  const trava = useRef(false);
  const algumCodigoLiberado = (missoes ?? []).some((x) => x.codigoLiberadoAte);
  const missaoCodigo = codigoDe ? (missoes ?? []).find((x) => x.id === codigoDe) : null;

  // O selo "Código até" some sozinho quando o tempo acaba.
  useEffect(() => {
    if (!algumCodigoLiberado) return undefined;
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(relogio);
  }, [algumCodigoLiberado]);

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
  const estados = useMemo(() => contarEstados(missoes || []), [missoes]);
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

  /** Publica ou arquiva várias, uma por vez; o que falhar fica selecionado. */
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
    if (ok > 0) mostrarToast(`${ok} ${ok === 1 ? 'missão' : 'missões'} ${ativar ? 'publicada(s)' : 'arquivada(s)'}.`, 'sucesso');
    if (falhas.length) setErroAcao(`Não foi possível ${ativar ? 'publicar' : 'arquivar'} ${falhas.join('; ')}.`);
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
      mostrarToast(`Missão "${atualizada.titulo}" publicada.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível publicar "${missao.titulo}": ${error.message || 'erro desconhecido.'}`);
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
      mostrarToast(`Missão "${atualizada.titulo}" arquivada.`, 'sucesso');
    } catch (error) {
      setErroDesativacao(error.message || 'Não foi possível arquivar a missão.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function alterarCodigo(acao) {
    if (trava.current || !missaoCodigo) return;
    trava.current = true;
    setOcupadoId(missaoCodigo.id);
    setErroCodigo('');
    try {
      const atualizada = await acao(missaoCodigo.id);
      substituir(atualizada);
      setAgora(Date.now());
      mostrarToast(atualizada.codigoLiberadoAte
        ? `Código liberado até ${horaCurta(new Date(atualizada.codigoLiberadoAte))}.`
        : 'Código encerrado: não vale mais.', 'sucesso');
    } catch (error) {
      setErroCodigo(error.message || 'Não foi possível alterar o código.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function excluir() {
    if (trava.current || !excluindo) return;
    trava.current = true;
    setOcupadoId(excluindo.id);
    setErroExclusao('');
    try {
      await api.excluirMissao(excluindo.id);
      setMissoes((lista) => (lista || []).filter((m) => m.id !== excluindo.id));
      setSelecionadas((atual) => {
        const nova = new Set(atual);
        nova.delete(excluindo.id);
        return nova;
      });
      mostrarToast(`Rascunho "${excluindo.titulo}" excluído.`, 'sucesso');
      setExcluindo(null);
    } catch (error) {
      setErroExclusao(error.message || 'Não foi possível excluir o rascunho.');
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
              <li><strong>{numero(resumo.ativas)}</strong> {resumo.ativas === 1 ? 'publicada' : 'publicadas'} de {numero(missoes.length)}</li>
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
              { valor: 'ativa', rotulo: 'Publicadas', total: estados.publicada },
              { valor: 'rascunho', rotulo: 'Rascunhos', total: estados.rascunho },
              { valor: 'arquivada', rotulo: 'Arquivadas', total: estados.arquivada },
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
          onExcluir={(m) => { setErroExclusao(''); setExcluindo(m); }}
          onCodigo={(m) => { setErroCodigo(''); setCodigoDe(m.id); }}
          agora={agora}
        />
      )}

      {missaoCodigo && (
        <PainelCodigoMissao
          missao={missaoCodigo}
          ocupado={ocupadoId === missaoCodigo.id}
          erro={erroCodigo}
          onLiberar={(minutos) => alterarCodigo((id) => api.liberarCodigoMissao(id, minutos))}
          onEncerrar={() => alterarCodigo((id) => api.encerrarCodigoMissao(id))}
          onFechar={() => setCodigoDe(null)}
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

      {excluindo && (
        <ConfirmarExclusaoMissao
          missao={excluindo}
          ocupado={ocupadoId === excluindo.id}
          erro={erroExclusao}
          onConfirmar={excluir}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </section>
  );
}
