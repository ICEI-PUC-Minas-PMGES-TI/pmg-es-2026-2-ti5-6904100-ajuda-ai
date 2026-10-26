import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import SeletorLocal, {
  entradaDoLocal,
  formDoLocal,
  localParaEntrada,
  mensagemErroLocal,
  mesmaEntrada,
  rotuloLocal,
  useDadosMapa,
  validarLocal,
} from './SeletorLocal';

/** Limites iguais aos do servidor (que continua sendo a autoridade). */
export const LIMITES_RESTAURANTE = { nomeMin: 3, nomeMax: 255, descricaoMax: 2000, horariosMax: 21 };

/** Dias como na API: 0 = domingo … 6 = sábado. Exibidos a partir de segunda. */
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA_MS = 24 * 60 * 60 * 1000;

const FILTROS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
];

let sequenciaHorario = 0;
const novaChave = () => { sequenciaHorario += 1; return `h${sequenciaHorario}`; };

/** Linha do editor de horários (dia como texto, como no select). */
export function novaFaixa({ dia = 1, abre = '07:00', fecha = '21:00' } = {}) {
  return { chave: novaChave(), dia: String(dia), abre, fecha };
}

/** Estado do formulário a partir do RestauranteAdmin (ou vazio). */
export function formDoRestaurante(restaurante) {
  return {
    nome: restaurante?.nome ?? '',
    descricao: restaurante?.descricao ?? '',
    local: formDoLocal(restaurante?.local ?? null),
    horarios: (restaurante?.horarios || []).map((h) => novaFaixa(h)),
    ativo: restaurante?.ativo ?? true,
  };
}

/** Formulário de criação pré-preenchido a partir de uma sugestão do mapa (prédio CAFETERIA). */
export function formDaSugestao(sugestao) {
  return {
    ...formDoRestaurante(null),
    nome: sugestao.nome || '',
    local: { ...formDoLocal(null), modo: 'predio', predioId: sugestao.predioId, nome: sugestao.nome || '' },
  };
}

/** Faixas no formato da API, ordenadas por dia e horário de abrir. */
export function horariosParaCorpo(horarios) {
  return (horarios || [])
    .map((h) => ({ dia: Number(h.dia), abre: h.abre, fecha: h.fecha }))
    .sort((a, b) => a.dia - b.dia || a.abre.localeCompare(b.abre));
}

/** Primeira inconsistência dos horários, ou '' (mesmas regras do servidor). */
export function validarHorarios(horarios) {
  const lista = horarios || [];
  if (lista.length > LIMITES_RESTAURANTE.horariosMax) return `Cadastre no máximo ${LIMITES_RESTAURANTE.horariosMax} faixas de horário.`;
  for (let i = 0; i < lista.length; i += 1) {
    const { dia, abre, fecha } = lista[i];
    const numero = Number(dia);
    if (dia === '' || dia == null || !Number.isInteger(numero) || numero < 0 || numero > 6) return `Horário ${i + 1}: escolha o dia da semana.`;
    if (!HORA.test(String(abre ?? '')) || !HORA.test(String(fecha ?? ''))) return `Horário ${i + 1}: informe abertura e fechamento no formato HH:mm.`;
    if (fecha <= abre) return `Horário ${i + 1}: o fechamento deve ser depois da abertura (uma faixa não atravessa a meia-noite; use duas).`;
  }
  const ordenadas = horariosParaCorpo(lista);
  for (let i = 1; i < ordenadas.length; i += 1) {
    const [a, b] = [ordenadas[i - 1], ordenadas[i]];
    if (a.dia === b.dia && b.abre < a.fecha) return `Faixas sobrepostas em ${DIAS_LONGOS[a.dia]}: ${a.abre}–${a.fecha} e ${b.abre}–${b.fecha}.`;
  }
  return '';
}

/** Primeira inconsistência do formulário, ou '' se pode ser enviado. */
export function validarRestaurante(form) {
  const { nomeMin, nomeMax, descricaoMax } = LIMITES_RESTAURANTE;
  const nome = String(form.nome ?? '').trim();
  if (!nome) return 'Informe o nome do restaurante.';
  if (nome.length < nomeMin) return `O nome deve ter pelo menos ${nomeMin} caracteres.`;
  if (nome.length > nomeMax) return `O nome deve ter no máximo ${nomeMax} caracteres.`;
  if (String(form.descricao ?? '').trim().length > descricaoMax) return `A descrição deve ter no máximo ${descricaoMax} caracteres.`;
  return validarLocal(form.local, { obrigatorio: true }) || validarHorarios(form.horarios);
}

/** Corpo do POST de criação (local obrigatório). */
export function corpoCriacaoRestaurante(form) {
  const corpo = { nome: String(form.nome).trim() };
  const descricao = String(form.descricao ?? '').trim();
  if (descricao) corpo.descricao = descricao;
  corpo.local = localParaEntrada(form.local);
  corpo.horarios = horariosParaCorpo(form.horarios);
  corpo.ativo = Boolean(form.ativo);
  return corpo;
}

/** Só os campos alterados para o PATCH (horários vão inteiros quando mudam). */
export function camposAlteradosRestaurante(original, form) {
  const alterados = {};
  const nome = String(form.nome ?? '').trim();
  if (nome !== original.nome) alterados.nome = nome;
  const descricao = String(form.descricao ?? '').trim();
  if (descricao !== (original.descricao ?? '')) alterados.descricao = descricao;
  const local = localParaEntrada(form.local);
  if (local && !mesmaEntrada(local, entradaDoLocal(original.local))) alterados.local = local;
  const horarios = horariosParaCorpo(form.horarios);
  if (JSON.stringify(horarios) !== JSON.stringify(horariosParaCorpo(original.horarios))) alterados.horarios = horarios;
  return alterados;
}

/**
 * "Preencher Seg a Sex": uma faixa por dia útil com o horário da primeira
 * faixa válida (ou 07:00–21:00); sábados e domingos já cadastrados ficam.
 */
export function preencherDiasUteis(horarios) {
  const lista = horarios || [];
  const modelo = lista.find((h) => Number(h.dia) >= 1 && Number(h.dia) <= 5 && HORA.test(h.abre) && HORA.test(h.fecha) && h.fecha > h.abre)
    || lista.find((h) => HORA.test(h.abre) && HORA.test(h.fecha) && h.fecha > h.abre);
  const abre = modelo?.abre || '07:00';
  const fecha = modelo?.fecha || '21:00';
  return [
    ...[1, 2, 3, 4, 5].map((dia) => novaFaixa({ dia, abre, fecha })),
    ...lista.filter((h) => !(Number(h.dia) >= 1 && Number(h.dia) <= 5)),
  ];
}

function rotuloSequencia(dias) {
  if (dias.length === 1) return DIAS_CURTOS[dias[0]];
  if (dias.length === 2) return `${DIAS_CURTOS[dias[0]]}, ${DIAS_CURTOS[dias[1]]}`;
  return `${DIAS_CURTOS[dias[0]]}–${DIAS_CURTOS[dias[dias.length - 1]]}`;
}

/** Resumo dos horários: "Seg–Sex 07:00–21:00 · Sáb 08:00–12:00". */
export function resumoHorarios(horarios) {
  const porDia = new Map();
  for (const h of horariosParaCorpo(horarios)) porDia.set(h.dia, [...(porDia.get(h.dia) || []), `${h.abre}–${h.fecha}`]);
  if (porDia.size === 0) return 'Sem horários cadastrados';
  // Sequências de dias consecutivos (a partir de segunda) com as mesmas faixas.
  const sequencias = [];
  let atual = null;
  for (const dia of ORDEM_DIAS) {
    const chave = (porDia.get(dia) || []).join(', ');
    if (!chave) { atual = null; continue; }
    if (atual && atual.chave === chave) atual.dias.push(dia);
    else { atual = { chave, dias: [dia] }; sequencias.push(atual); }
  }
  const porChave = new Map();
  for (const s of sequencias) porChave.set(s.chave, [...(porChave.get(s.chave) || []), s.dias]);
  return [...porChave].map(([chave, grupos]) => `${grupos.map(rotuloSequencia).join(', ')} ${chave}`).join(' · ');
}

function ordenarPorNome(lista) {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ===== Cardápios ===== */

export const LIMITES_CARDAPIO = { tamanhoMaxBytes: 10 * 1024 * 1024, vigenciaMaxDias: 31 };
/** Tipos aceitos e as extensões correspondentes (o servidor confere pelos bytes). */
export const TIPOS_CARDAPIO = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
export const ACEITA_CARDAPIO = Object.keys(TIPOS_CARDAPIO).join(',');
const ROTULO_TIPO = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'application/pdf': 'PDF' };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Problema do arquivo escolhido (tipo por MIME + extensão, tamanho), ou ''. */
export function validarArquivoCardapio(arquivo) {
  if (!arquivo) return 'Escolha o arquivo do cardápio (imagem ou PDF).';
  const nome = String(arquivo.name || '');
  const extensao = nome.includes('.') ? nome.split('.').pop().toLowerCase() : '';
  const tipoDaExtensao = Object.keys(TIPOS_CARDAPIO).find((tipo) => TIPOS_CARDAPIO[tipo].includes(extensao));
  const mime = arquivo.type === 'image/jpg' ? 'image/jpeg' : arquivo.type;
  if (!tipoDaExtensao || (mime && mime !== tipoDaExtensao)) return 'Formato não aceito: envie uma imagem PNG, JPEG ou WebP, ou um PDF.';
  if (!arquivo.size) return 'O arquivo está vazio.';
  if (arquivo.size > LIMITES_CARDAPIO.tamanhoMaxBytes) return 'O cardápio deve ter no máximo 10 MB.';
  return '';
}

function diaUtc(valor) {
  if (!DATA.test(String(valor ?? ''))) return null;
  const [a, m, d] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d ? data.getTime() : null;
}

/** Problema da validade (AAAA-MM-DD, fim ≥ início, no máximo 31 dias), ou ''. */
export function validarVigencia(validoDe, validoAte) {
  const de = diaUtc(validoDe);
  if (de === null) return 'Informe a data de início da validade.';
  const ate = diaUtc(validoAte);
  if (ate === null) return 'Informe a data de fim da validade.';
  if (ate < de) return 'O fim da validade deve ser igual ou posterior ao início.';
  if ((ate - de) / DIA_MS >= LIMITES_CARDAPIO.vigenciaMaxDias) return `A validade pode cobrir no máximo ${LIMITES_CARDAPIO.vigenciaMaxDias} dias.`;
  return '';
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Data local AAAA-MM-DD. */
export function dataLocalIso(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Semana de `hoje` (segunda a domingo), padrão da validade de um cardápio novo. */
export function semanaAtual(hoje = new Date()) {
  const voltar = (hoje.getDay() + 6) % 7;
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - voltar);
  const domingo = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 6);
  return { validoDe: dataLocalIso(segunda), validoAte: dataLocalIso(domingo) };
}

/** "19/10/2026" a partir de "2026-10-19" (sem passar por fuso). */
export function formatarDia(valor) {
  if (!DATA.test(String(valor ?? ''))) return '—';
  const [a, m, d] = valor.split('-');
  return `${d}/${m}/${a}`;
}

export function formatarTamanho(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024).toLocaleString('pt-BR')} KB`;
  return `${(n / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** 'vigente' | 'futuro' | 'expirado' em relação a `hoje` (AAAA-MM-DD). */
export function vigenciaCardapio(cardapio, hoje) {
  if (hoje < cardapio.validoDe) return 'futuro';
  if (hoje > cardapio.validoAte) return 'expirado';
  return 'vigente';
}

const ROTULO_VIGENCIA = {
  vigente: { rotulo: 'Vigente', tom: 'green' },
  futuro: { rotulo: 'Futuro', tom: 'purple' },
  expirado: { rotulo: 'Expirado', tom: 'muted' },
};

/* ===== Componentes ===== */

/** Tabela de restaurantes (apresentação pura: sem efeitos, renderizável no servidor). */
export function ListaRestaurantes({ restaurantes, ocupadoId = null, onEditar, onCardapios, onExcluir, onReativar }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table pucstops-table campus-table">
        <caption className="sr-only">Restaurantes e cantinas do campus</caption>
        <thead>
          <tr>
            <th scope="col">Restaurante</th>
            <th scope="col">Local</th>
            <th scope="col">Horários</th>
            <th scope="col">Agora</th>
            <th scope="col">Cardápios</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {restaurantes.map((r) => {
            const ocupado = ocupadoId === r.id;
            return (
              <tr key={r.id} className={r.ativo ? undefined : 'inativo'}>
                <td data-label="Restaurante">
                  <span className="user-cell">
                    <span className="pucstop-icon" aria-hidden="true"><Icon name="restaurant" size={16} /></span>
                    <strong>{r.nome}</strong>
                  </span>
                </td>
                <td data-label="Local">{rotuloLocal(r.local)}</td>
                <td data-label="Horários" className="campus-horarios">{resumoHorarios(r.horarios)}</td>
                <td data-label="Agora">
                  <span className="campus-badges">
                    {/* Sem horário cadastrado a situação é desconhecida, não "fechado". */}
                    {r.horarios?.length
                      ? <span className={`flag ${r.abertoAgora ? 'green' : 'muted'}`}>{r.abertoAgora ? 'Aberto agora' : 'Fechado agora'}</span>
                      : <span className="flag muted">Sem horário</span>}
                    <span className={`flag ${r.cardapioHoje ? 'purple' : 'muted'}`}>{r.cardapioHoje ? 'Cardápio hoje' : 'Sem cardápio hoje'}</span>
                  </span>
                </td>
                <td data-label="Cardápios">{r.cardapios ?? 0}</td>
                <td data-label="Status"><span className={`flag ${r.ativo ? 'green' : 'muted'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td className="user-actions">
                  <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(r)} aria-label={`Editar restaurante ${r.nome}`}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onCardapios?.(r)} aria-label={`Cardápios do restaurante ${r.nome}`}>
                    <Icon name="file" size={14} /> Cardápios
                  </button>
                  {r.ativo ? (
                    <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onExcluir?.(r)} aria-label={`Excluir (desativar) restaurante ${r.nome}`}>
                      <Icon name="trash" size={14} /> Excluir
                    </button>
                  ) : (
                    <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onReativar?.(r)} aria-label={`Reativar restaurante ${r.nome}`}>
                      <Icon name="refresh" size={14} /> {ocupado ? 'Reativando…' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lanchonetes/restaurantes do mapa (prédios CAFETERIA) para cadastrar com um clique. */
export function ListaSugestoes({ sugestoes, onCadastrar }) {
  return (
    <ul className="campus-sugestoes">
      {sugestoes.map((s) => {
        const nome = s.nome || `Prédio ${s.predioId}`;
        return (
          <li key={s.predioId} className={s.cadastrado ? 'cadastrado' : undefined}>
            <span className="pucstop-icon" aria-hidden="true"><Icon name="restaurant" size={16} /></span>
            <span className="campus-sugestao-copy">
              <strong>{nome}</strong>
              <small>{s.predioId}</small>
            </span>
            {s.cadastrado ? (
              <span className="flag muted">Já cadastrado</span>
            ) : (
              <button type="button" className="mini-btn primary" onClick={() => onCadastrar?.(s)} aria-label={`Cadastrar restaurante a partir do mapa: ${nome}`}>
                <Icon name="plus" size={14} /> Cadastrar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Confirmação do "Excluir": desativação lógica, reversível. */
export function ConfirmarDesativacaoRestaurante({ restaurante, ocupado, erro, onConfirmar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  return (
    <Modal
      titulo={`Excluir o restaurante "${restaurante.nome}"?`}
      descricao="O restaurante é desativado: some do mapa dos alunos, mas continua salvo aqui (com os cardápios) e você pode reativá-lo depois."
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmar(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Desativando…' : 'Desativar restaurante'}
          </button>
        </>
      )}
    >
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

/** Editor das faixas de funcionamento (dia, abre, fecha). */
export function EditorHorarios({ horarios, onChange }) {
  const base = useId();
  const { horariosMax } = LIMITES_RESTAURANTE;
  const alterar = (chave, campos) => onChange(horarios.map((h) => (h.chave === chave ? { ...h, ...campos } : h)));
  return (
    <fieldset className="pucstop-position campus-horarios-editor">
      <legend>Horários de funcionamento</legend>
      {horarios.length === 0 && <p className="field-hint">Nenhum horário cadastrado: o restaurante aparece como fechado.</p>}
      <ul className="campus-horario-list">
        {horarios.map((h, i) => (
          <li key={h.chave} className="campus-horario-row">
            <label className="editor-field" htmlFor={`${base}-${h.chave}-dia`}>
              <span>Dia</span>
              <select id={`${base}-${h.chave}-dia`} value={h.dia} onChange={(e) => alterar(h.chave, { dia: e.target.value })}>
                {ORDEM_DIAS.map((d) => <option key={d} value={String(d)}>{DIAS_LONGOS[d]}</option>)}
              </select>
            </label>
            <label className="editor-field" htmlFor={`${base}-${h.chave}-abre`}>
              <span>Abre</span>
              <input id={`${base}-${h.chave}-abre`} type="time" value={h.abre} onChange={(e) => alterar(h.chave, { abre: e.target.value })} />
            </label>
            <label className="editor-field" htmlFor={`${base}-${h.chave}-fecha`}>
              <span>Fecha</span>
              <input id={`${base}-${h.chave}-fecha`} type="time" value={h.fecha} onChange={(e) => alterar(h.chave, { fecha: e.target.value })} />
            </label>
            <button type="button" className="icon-square danger" aria-label={`Remover horário ${i + 1}`} onClick={() => onChange(horarios.filter((x) => x.chave !== h.chave))}>
              <Icon name="trash" size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="editor-actions">
        <button type="button" className="mini-btn" disabled={horarios.length >= horariosMax} onClick={() => onChange([...horarios, novaFaixa(horarios.length ? { ...horarios[horarios.length - 1], dia: (Number(horarios[horarios.length - 1].dia) + 1) % 7 } : {})])}>
          <Icon name="plus" size={14} /> Adicionar horário
        </button>
        <button type="button" className="mini-btn" onClick={() => onChange(preencherDiasUteis(horarios))}>
          <Icon name="calendar" size={14} /> Preencher Seg a Sex
        </button>
      </div>
      <p className="field-hint">Até {horariosMax} faixas. Uma faixa não atravessa a meia-noite; para isso, use duas. Faixas do mesmo dia não podem se sobrepor.</p>
    </fieldset>
  );
}

/** Formulário de criação/edição em modal, com o seletor de local e os horários. */
export function FormularioRestaurante({ original, inicial = null, mapa = {}, onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => (criando && inicial ? inicial : formDoRestaurante(original)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;

  const erroValidacao = validarRestaurante(form);
  const alterados = criando ? null : camposAlteradosRestaurante(original, form);
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const podeSalvar = !salvando && !erroValidacao && !semAlteracoes;

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    if (!podeSalvar || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      const salvo = criando
        ? await api.criarRestaurante(corpoCriacaoRestaurante(form))
        : await api.atualizarRestaurante(original.id, alterados);
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(mensagemErroLocal(error, 'Não foi possível salvar o restaurante.'));
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };
  const { nomeMax, descricaoMax } = LIMITES_RESTAURANTE;

  return (
    <Modal
      titulo={criando ? 'Adicionar restaurante' : `Editar restaurante "${original.nome}"`}
      descricao={criando ? 'Defina nome, local no mapa do campus e horários de funcionamento.' : undefined}
      onFechar={fechar}
      tamanho="lg"
      className="pucstop-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? 'Criar restaurante' : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form campus-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-nome`}>
          <span>Nome</span>
          <input id={`${base}-nome`} value={form.nome} maxLength={nomeMax} required data-autofocus placeholder="Ex.: Cantina do prédio 16" onChange={(e) => campo('nome', e.target.value)} />
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição (opcional)</span>
          <textarea id={`${base}-descricao`} className="detail-textarea" rows={2} maxLength={descricaoMax} value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} />
        </label>

        <fieldset className="pucstop-position">
          <legend>Local</legend>
          <SeletorLocal
            valor={form.local}
            onChange={(local) => campo('local', local)}
            campus={mapa.campus}
            erroCampus={mapa.erroCampus}
            predios={mapa.predios}
            areas={mapa.areas}
            erroMapa={mapa.erroMapa}
          />
        </fieldset>

        <EditorHorarios horarios={form.horarios} onChange={(horarios) => campo('horarios', horarios)} />

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Ativo" descricao="Inativo, o restaurante fica fora do mapa dos alunos até ser reativado." checked={form.ativo} onChange={(v) => campo('ativo', v)} />
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

/** Lista de cardápios (apresentação pura), com confirmação de remoção na própria linha. */
export function ListaCardapios({ cardapios, hoje, ocupadoId = null, confirmandoId = null, onSubstituir, onRemover, onConfirmarRemocao, onCancelarRemocao }) {
  return (
    <ul className="campus-cardapios">
      {cardapios.map((c) => {
        const vigencia = ROTULO_VIGENCIA[vigenciaCardapio(c, hoje)];
        const imagem = String(c.tipoConteudo || '').startsWith('image/');
        const periodo = `${formatarDia(c.validoDe)} a ${formatarDia(c.validoAte)}`;
        const ocupado = ocupadoId === c.id;
        return (
          <li key={c.id}>
            <div className="campus-cardapio">
              <a className="campus-cardapio-thumb" href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir cardápio de ${periodo}`}>
                {imagem ? <img src={c.url} alt="" loading="lazy" /> : <Icon name="file" size={26} />}
              </a>
              <div className="campus-cardapio-copy">
                <strong>{periodo}</strong>
                <span>{ROTULO_TIPO[c.tipoConteudo] || c.tipoConteudo} · {formatarTamanho(c.tamanhoBytes)}</span>
                <span className={`flag ${vigencia.tom}`}>{vigencia.rotulo}</span>
              </div>
              <div className="campus-cardapio-actions">
                <a className="mini-btn" href={c.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> Abrir</a>
                <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onSubstituir?.(c)} aria-label={`Substituir cardápio de ${periodo}`}>
                  <Icon name="upload" size={14} /> Substituir
                </button>
                <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onRemover?.(c)} aria-label={`Remover cardápio de ${periodo}`}>
                  <Icon name="trash" size={14} /> Remover
                </button>
              </div>
            </div>
            {confirmandoId === c.id && (
              <div className="campus-confirmacao" role="group" aria-label={`Confirmar remoção do cardápio de ${periodo}`}>
                <p><Icon name="alert" size={15} /> Remover este cardápio? O arquivo é apagado definitivamente e não pode ser recuperado.</p>
                <div className="editor-actions">
                  <button type="button" className="ghost-button small" disabled={ocupado} onClick={() => onCancelarRemocao?.()}>Cancelar</button>
                  <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => { if (!ocupado) onConfirmarRemocao?.(c); }}>
                    <Icon name="trash" size={14} /> {ocupado ? 'Removendo…' : 'Remover definitivamente'}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Envio de um cardápio (novo ou substituto): arquivo + validade. */
export function FormularioCardapio({ restauranteId, substituindo = null, hoje = new Date(), onEnviado, onCancelar }) {
  const [arquivo, setArquivo] = useState(null);
  const [vigencia, setVigencia] = useState(() => (substituindo
    ? { validoDe: substituindo.validoDe, validoAte: substituindo.validoAte }
    : semanaAtual(hoje)));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();

  const erroValidacao = validarArquivoCardapio(arquivo) || validarVigencia(vigencia.validoDe, vigencia.validoAte);
  const podeEnviar = !enviando && !erroValidacao;

  async function enviar(event) {
    event.preventDefault();
    if (!podeEnviar || trava.current) return;
    trava.current = true;
    setEnviando(true);
    setErro('');
    try {
      const enviado = await api.enviarCardapio(restauranteId, { arquivo, ...vigencia, substitui: substituindo?.id });
      onEnviado?.(enviado, substituindo);
    } catch (error) {
      setErro(error.status === 413 ? 'O servidor recusou: o arquivo passa de 10 MB.' : error.message || 'Não foi possível enviar o cardápio.');
    } finally {
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <form className="campus-form campus-cardapio-form" onSubmit={enviar} noValidate aria-label={substituindo ? 'Substituir cardápio' : 'Enviar cardápio'}>
      <h3>{substituindo ? `Substituir o cardápio de ${formatarDia(substituindo.validoDe)} a ${formatarDia(substituindo.validoAte)}` : 'Enviar cardápio'}</h3>
      <label className="editor-field" htmlFor={`${base}-arquivo`}>
        <span>Arquivo (PNG, JPEG, WebP ou PDF, até 10 MB)</span>
        <input id={`${base}-arquivo`} type="file" accept={ACEITA_CARDAPIO} required onChange={(e) => { setArquivo(e.target.files?.[0] || null); setErro(''); }} />
      </label>
      <div className="editor-grid pucstop-grid">
        <label className="editor-field" htmlFor={`${base}-de`}>
          <span>Válido de</span>
          <input id={`${base}-de`} type="date" value={vigencia.validoDe} required onChange={(e) => { setVigencia((v) => ({ ...v, validoDe: e.target.value })); setErro(''); }} />
        </label>
        <label className="editor-field" htmlFor={`${base}-ate`}>
          <span>Válido até</span>
          <input id={`${base}-ate`} type="date" value={vigencia.validoAte} min={vigencia.validoDe || undefined} required onChange={(e) => { setVigencia((v) => ({ ...v, validoAte: e.target.value })); setErro(''); }} />
        </label>
      </div>
      <p className="field-hint">
        Validade de até {LIMITES_CARDAPIO.vigenciaMaxDias} dias (semana, quinzena ou mês). O arquivo fica público para os alunos.
        {substituindo && ' O cardápio antigo é removido depois que o novo for gravado.'}
      </p>
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
      {!erro && erroValidacao && <p className="detail-muted small" role="status">{erroValidacao}</p>}
      <div className="editor-actions">
        <button type="button" className="ghost-button small" disabled={enviando} onClick={() => onCancelar?.()}>Cancelar</button>
        <button type="submit" className="primary-button inline" disabled={!podeEnviar}>
          <Icon name="upload" size={16} /> {enviando ? 'Enviando…' : substituindo ? 'Substituir cardápio' : 'Enviar cardápio'}
        </button>
      </div>
    </form>
  );
}

/** Modal com os cardápios de um restaurante: listar, enviar, substituir e remover. */
export function PainelCardapios({ restaurante, hoje = new Date(), onFechar, onAlterado }) {
  const [cardapios, setCardapios] = useState(null);
  const [erro, setErro] = useState('');
  const [envio, setEnvio] = useState(null); // null | 'novo' | Cardapio (substituindo)
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const [erroAcao, setErroAcao] = useState('');
  const [aviso, setAviso] = useState('');
  const trava = useRef(false);
  const hojeIso = dataLocalIso(hoje);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setCardapios(await api.cardapios(restaurante.id));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os cardápios.');
    }
  }, [restaurante.id]);

  useEffect(() => { carregar(); }, [carregar]);

  function enviado(cardapio, substituido) {
    setCardapios((lista) => [...(lista || []).filter((c) => c.id !== cardapio.id && c.id !== substituido?.id), cardapio]
      .sort((a, b) => b.validoDe.localeCompare(a.validoDe) || b.validoAte.localeCompare(a.validoAte)));
    setEnvio(null);
    setAviso(substituido ? 'Cardápio substituído.' : 'Cardápio enviado.');
    onAlterado?.();
  }

  async function remover(cardapio) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(cardapio.id);
    setErroAcao('');
    try {
      await api.removerCardapio(cardapio.id);
      setCardapios((lista) => (lista || []).filter((c) => c.id !== cardapio.id));
      setConfirmandoId(null);
      setAviso('Cardápio removido.');
      onAlterado?.();
    } catch (error) {
      setErroAcao(error.message || 'Não foi possível remover o cardápio.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <Modal
      titulo={`Cardápios de "${restaurante.nome}"`}
      descricao="Imagens ou PDFs com período de validade. Os alunos veem o cardápio vigente no dia."
      onFechar={onFechar}
      tamanho="lg"
      className="pucstop-modal"
      acoes={<button type="button" className="ghost-button" onClick={onFechar}>Fechar</button>}
    >
      <div className="campus-cardapios-painel">
        {aviso && <p className="detail-ok" role="status"><Icon name="checkCircle" size={15} /> {aviso}</p>}
        {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
        {erroAcao && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erroAcao}</p>}
        {!cardapios && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando cardápios…</p></div>}
        {cardapios?.length === 0 && !envio && <p className="empty-copy">Nenhum cardápio enviado para este restaurante.</p>}
        {cardapios?.length > 0 && (
          <ListaCardapios
            cardapios={cardapios}
            hoje={hojeIso}
            ocupadoId={ocupadoId}
            confirmandoId={confirmandoId}
            onSubstituir={(c) => { setAviso(''); setConfirmandoId(null); setEnvio(c); }}
            onRemover={(c) => { setAviso(''); setErroAcao(''); setConfirmandoId(c.id); }}
            onConfirmarRemocao={remover}
            onCancelarRemocao={() => setConfirmandoId(null)}
          />
        )}
        {envio ? (
          <FormularioCardapio
            key={envio === 'novo' ? 'novo' : envio.id}
            restauranteId={restaurante.id}
            substituindo={envio === 'novo' ? null : envio}
            hoje={hoje}
            onEnviado={enviado}
            onCancelar={() => setEnvio(null)}
          />
        ) : (
          cardapios && (
            <button type="button" className="mini-btn primary campus-novo-cardapio" onClick={() => { setAviso(''); setConfirmandoId(null); setEnvio('novo'); }}>
              <Icon name="upload" size={14} /> Enviar cardápio
            </button>
          )
        )}
      </div>
    </Modal>
  );
}

export default function RestaurantesPage() {
  const mostrarToast = useToast();
  const mapa = useDadosMapa();
  const [restaurantes, setRestaurantes] = useState(null);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [sugestoes, setSugestoes] = useState(null);
  const [erroSugestoes, setErroSugestoes] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [editando, setEditando] = useState(null); // null | { original, inicial }
  const [excluindo, setExcluindo] = useState(null);
  const [erroExclusao, setErroExclusao] = useState('');
  const [cardapiosDe, setCardapiosDe] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);
  const cardapiosAlterados = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setRestaurantes(ordenarPorNome(await api.restaurantes()));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os restaurantes.');
    }
  }, []);

  const carregarSugestoes = useCallback(async () => {
    setErroSugestoes('');
    try {
      setSugestoes(await api.sugestoesRestaurantes());
    } catch (error) {
      setSugestoes([]);
      setErroSugestoes(error.status === 503
        ? 'o mapa do campus ainda não tem uma versão ativa.'
        : error.message || 'não foi possível carregar as sugestões do mapa.');
    }
  }, []);

  useEffect(() => {
    carregar();
    carregarSugestoes();
  }, [carregar, carregarSugestoes]);

  function substituir(item) {
    setRestaurantes((lista) => ordenarPorNome([...(lista || []).filter((r) => r.id !== item.id), item]));
  }

  const contagem = useMemo(() => ({
    todos: restaurantes?.length ?? 0,
    ativos: (restaurantes || []).filter((r) => r.ativo).length,
    inativos: (restaurantes || []).filter((r) => !r.ativo).length,
  }), [restaurantes]);

  const lista = useMemo(() => (restaurantes || []).filter((r) => filtro === 'todos' || (filtro === 'ativos' ? r.ativo : !r.ativo)), [restaurantes, filtro]);
  const pendentes = (sugestoes || []).filter((s) => !s.cadastrado).length;

  async function desativar() {
    if (trava.current || !excluindo) return;
    trava.current = true;
    setOcupadoId(excluindo.id);
    setErroExclusao('');
    try {
      const atualizado = await api.desativarRestaurante(excluindo.id);
      substituir(atualizado);
      setExcluindo(null);
      mostrarToast(`Restaurante "${atualizado.nome}" desativado. Ele não aparece mais no mapa dos alunos.`, 'sucesso');
    } catch (error) {
      setErroExclusao(error.message || 'Não foi possível desativar o restaurante.');
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function reativar(restaurante) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(restaurante.id);
    setErroAcao('');
    try {
      const atualizado = await api.ativarRestaurante(restaurante.id);
      substituir(atualizado);
      mostrarToast(`Restaurante "${atualizado.nome}" reativado.`, 'sucesso');
    } catch (error) {
      setErroAcao(`Não foi possível reativar "${restaurante.nome}": ${mensagemErroLocal(error, 'erro desconhecido.')}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function fecharCardapios() {
    const restaurante = cardapiosDe;
    setCardapiosDe(null);
    if (!cardapiosAlterados.current || !restaurante) return;
    cardapiosAlterados.current = false;
    try {
      substituir(await api.restaurante(restaurante.id));
    } catch {
      carregar();
    }
  }

  return (
    <section className="users-page pucstops-page">
      <header className="dash-header">
        <div>
          <h1>Restaurantes</h1>
          <p>Restaurantes, cantinas e lanchonetes do mapa do campus, com horários e cardápios. Valem para todos os programas.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando({ original: null, inicial: null })}>
          <Icon name="plus" size={17} /> Adicionar restaurante
        </button>
      </header>

      {sugestoes && sugestoes.length > 0 && (
        <details className="campus-sugestoes-box" open={pendentes > 0}>
          <summary>
            <Icon name="map" size={16} /> Sugestões do mapa
            <span className="detail-note">{pendentes ? `${pendentes} sem cadastro` : 'todas cadastradas'}</span>
          </summary>
          <p className="detail-muted small">Lanchonetes e restaurantes que já existem no mapa do campus. Cadastre a partir do mapa para já vir com o nome e o prédio.</p>
          <ListaSugestoes sugestoes={sugestoes} onCadastrar={(s) => setEditando({ original: null, inicial: formDaSugestao(s) })} />
        </details>
      )}
      {erroSugestoes && <p className="detail-warn" role="alert"><Icon name="alert" size={16} /> Sugestões do mapa indisponíveis: {erroSugestoes}</p>}

      {restaurantes && restaurantes.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Filtrar por status">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} className={`filter-chip${filtro === f.valor ? ' active' : ''}`} onClick={() => setFiltro(f.valor)}>
              {f.rotulo} ({contagem[f.valor]})
            </button>
          ))}
        </div>
      )}

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {erroAcao && <div className="dash-inline-error" role="alert">{erroAcao}<button type="button" onClick={() => setErroAcao('')}>Fechar</button></div>}
      {!restaurantes && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando restaurantes…</p></div>}
      {restaurantes?.length === 0 && <p className="empty-copy">Nenhum restaurante cadastrado. Adicione o primeiro ou cadastre a partir das sugestões do mapa.</p>}
      {restaurantes && restaurantes.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhum restaurante com este filtro.</p>}

      {lista.length > 0 && (
        <ListaRestaurantes
          restaurantes={lista}
          ocupadoId={ocupadoId}
          onEditar={(r) => setEditando({ original: r, inicial: null })}
          onCardapios={(r) => { cardapiosAlterados.current = false; setCardapiosDe(r); }}
          onExcluir={(r) => { setErroExclusao(''); setExcluindo(r); }}
          onReativar={reativar}
        />
      )}

      {restaurantes?.length > 0 && (
        <p className="detail-muted small">
          Excluir um restaurante o desativa: ele some do mapa dos alunos e pode ser reativado depois. Remover um cardápio apaga o arquivo definitivamente.
        </p>
      )}

      {editando && (
        <FormularioRestaurante
          original={editando.original}
          inicial={editando.inicial}
          mapa={mapa}
          onCancelar={() => setEditando(null)}
          onSalvo={(salvo, criado) => {
            substituir(salvo);
            setEditando(null);
            if (salvo.local?.tipo === 'predio') {
              setSugestoes((atuais) => atuais?.map((s) => (s.predioId === salvo.local.id ? { ...s, cadastrado: true } : s)) ?? atuais);
            }
            mostrarToast(criado ? `Restaurante "${salvo.nome}" criado.` : `Restaurante "${salvo.nome}" atualizado.`, 'sucesso');
          }}
        />
      )}

      {excluindo && (
        <ConfirmarDesativacaoRestaurante
          restaurante={excluindo}
          ocupado={ocupadoId === excluindo.id}
          erro={erroExclusao}
          onConfirmar={desativar}
          onFechar={() => setExcluindo(null)}
        />
      )}

      {cardapiosDe && (
        <PainelCardapios
          restaurante={cardapiosDe}
          onFechar={fecharCardapios}
          onAlterado={() => { cardapiosAlterados.current = true; }}
        />
      )}
    </section>
  );
}
