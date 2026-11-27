import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import { dataCurta } from './comum';
import { paraDatetimeLocal, paraIso } from './EventosPage';

/** Limites iguais aos do servidor (que continua sendo a autoridade). */
export const LIMITES_RECOMPENSA = {
  nomeMax: 120,
  descricaoMax: 2000,
  condicoesMax: 2000,
  imagemMax: 500,
  custoMin: 1,
  custoMax: 100000,
  estoqueMax: 100000,
  limiteMin: 1,
  limiteMax: 100,
  motivoMin: 3,
  motivoMax: 300,
};

export const ROTULO_STATUS = { rascunho: 'Rascunho', publicada: 'Publicada', inativa: 'Inativa', arquivada: 'Arquivada' };
const TOM_STATUS = { rascunho: 'amber', publicada: 'green', inativa: 'muted', arquivada: 'muted' };
export const ROTULO_PUBLICO = { todos: 'Todos os alunos', padrinhos: 'Padrinhos', apadrinhados: 'Apadrinhados' };
export const ROTULO_AJUSTE = {
  inicial: 'Cadastro',
  reposicao: 'Reposição',
  correcao: 'Correção',
  limitado: 'Passou a limitado',
  ilimitado: 'Passou a ilimitado',
};

const FILTROS = [
  { valor: 'ativas', rotulo: 'Em uso' },
  { valor: 'publicada', rotulo: 'Publicadas' },
  { valor: 'rascunho', rotulo: 'Rascunhos' },
  { valor: 'inativa', rotulo: 'Inativas' },
  { valor: 'arquivada', rotulo: 'Arquivadas' },
];

const inteiro = (texto) => {
  const t = String(texto ?? '').trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

/** Estado do formulário (números e datas como texto, como nos inputs). */
export function formDaRecompensa(r) {
  return {
    nome: r?.nome ?? '',
    descricao: r?.descricao ?? '',
    imagemUrl: r?.imagemUrl ?? '',
    custoXp: r ? String(r.custoXp) : '',
    condicoesRetirada: r?.condicoesRetirada ?? '',
    estoqueIlimitado: r?.estoque?.ilimitado ?? false,
    estoqueInicial: '',
    limitePorAluno: r?.limitePorAluno ? String(r.limitePorAluno) : '',
    publico: r?.publico ?? 'todos',
    programaCodigo: r?.programaCodigo ?? '',
    disponivelDe: paraDatetimeLocal(r?.disponivelDe),
    disponivelAte: paraDatetimeLocal(r?.disponivelAte),
    publicar: false,
  };
}

/** Primeira inconsistência do formulário, ou '' se pode ser enviado. */
export function errosCamposRecompensa(form, { criando = false, agora = Date.now() } = {}) {
  const L = LIMITES_RECOMPENSA;
  const erros = {};
  const nome = String(form.nome ?? '').trim();
  if (!nome) erros.nome = 'Informe o nome da recompensa.';
  else if (nome.length > L.nomeMax) erros.nome = `O nome deve ter no máximo ${L.nomeMax} caracteres.`;
  const descricao = String(form.descricao ?? '').trim();
  if (!descricao) erros.descricao = 'Informe a descrição da recompensa.';
  else if (descricao.length > L.descricaoMax) erros.descricao = `A descrição deve ter no máximo ${L.descricaoMax} caracteres.`;
  const imagem = String(form.imagemUrl ?? '').trim();
  if (imagem && !/^https:\/\/\S+$/i.test(imagem)) erros.imagemUrl = 'A imagem deve ser um endereço https://.';
  else if (imagem.length > L.imagemMax) erros.imagemUrl = `O endereço da imagem deve ter no máximo ${L.imagemMax} caracteres.`;
  const custo = inteiro(form.custoXp);
  if (!Number.isInteger(custo) || custo < L.custoMin || custo > L.custoMax) erros.custoXp = `O custo deve ser um número inteiro de ${L.custoMin} a ${L.custoMax} moedas.`;
  const condicoes = String(form.condicoesRetirada ?? '').trim();
  if (!condicoes) erros.condicoesRetirada = 'Informe as condições de retirada.';
  else if (condicoes.length > L.condicoesMax) erros.condicoesRetirada = `As condições devem ter no máximo ${L.condicoesMax} caracteres.`;
  if (criando && !form.estoqueIlimitado) {
    const estoque = inteiro(form.estoqueInicial);
    if (!Number.isInteger(estoque) || estoque < 0 || estoque > L.estoqueMax) erros.estoqueInicial = `Informe o estoque inicial (0 a ${L.estoqueMax}) ou marque estoque ilimitado.`;
  }
  if (String(form.limitePorAluno ?? '').trim()) {
    const limite = inteiro(form.limitePorAluno);
    if (!Number.isInteger(limite) || limite < L.limiteMin || limite > L.limiteMax) erros.limitePorAluno = `O limite por aluno deve ser de ${L.limiteMin} a ${L.limiteMax} (ou vazio, sem limite).`;
  }
  const de = paraIsoRecompensa(form.disponivelDe);
  const ate = paraIsoRecompensa(form.disponivelAte);
  if (form.disponivelDe && !de) erros.disponivelDe = 'Data e hora inicial inválidas.';
  if (form.disponivelAte && !ate) erros.disponivelAte = 'Data e hora final inválidas.';
  if (de && ate && new Date(de) >= new Date(ate)) {
    erros.disponivelAte = 'A data e hora final deve ser posterior à inicial.';
  }
  if (criando && form.publicar && ate && new Date(ate).getTime() <= agora) {
    erros.disponivelAte = 'A vigência já terminou: ajuste a data final para publicar.';
  }
  return erros;
}

export function validarRecompensa(form, opcoes) {
  return Object.values(errosCamposRecompensa(form, opcoes))[0] || '';
}

/** Rejeita datas normalizadas pelo JavaScript, como 31 de fevereiro. */
function validarDataHoraLocal(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor || '');
  if (!partes) return null;
  const [, ano, mes, dia, hora, minuto] = partes.map(Number);
  const data = new Date(ano, mes - 1, dia, hora, minuto);
  if (
    Number.isNaN(data.getTime())
    || data.getFullYear() !== ano
    || data.getMonth() !== mes - 1
    || data.getDate() !== dia
    || data.getHours() !== hora
    || data.getMinutes() !== minuto
  ) return null;
  return valor;
}

export function combinarDataHoraRecompensa(dia, hora, minuto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '') || !/^\d{1,2}$/.test(hora || '') || !/^\d{1,2}$/.test(minuto || '')) return null;
  return validarDataHoraLocal(`${dia}T${String(Number(hora)).padStart(2, '0')}:${String(Number(minuto)).padStart(2, '0')}`);
}

function dataHoraCanonica(valor) {
  const local = validarDataHoraLocal(valor);
  if (local) return local;
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})\s+(?:às\s+)?(\d{2}):(\d{2})$/i.exec(valor || '');
  if (!partes) return null;
  const [, dia, mes, ano, hora, minuto] = partes;
  return combinarDataHoraRecompensa(
    `${ano}-${mes}-${dia}`,
    hora,
    minuto,
  );
}

export function textoDataHoraRecompensa(valor) {
  if (!valor) return '';
  const canonica = dataHoraCanonica(valor);
  if (!canonica) return valor;
  const [data, hora] = canonica.split('T');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} às ${hora}`;
}

export function paraIsoRecompensa(valor) {
  const canonica = dataHoraCanonica(valor);
  return canonica ? paraIso(canonica) : null;
}

function mascaraDataHora(digitos) {
  const valor = digitos.slice(0, 12);
  if (valor.length <= 2) return valor;
  if (valor.length <= 4) return `${valor.slice(0, 2)}/${valor.slice(2)}`;
  if (valor.length <= 8) return `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4)}`;
  if (valor.length <= 10) return `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4, 8)} às ${valor.slice(8)}`;
  return `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4, 8)} às ${valor.slice(8, 10)}:${valor.slice(10)}`;
}

function posicaoAposDigitos(valor, quantidade) {
  if (!quantidade) return 0;
  let encontrados = 0;
  for (let indice = 0; indice < valor.length; indice += 1) {
    if (/\d/.test(valor[indice]) && ++encontrados === quantidade) return indice + 1;
  }
  return valor.length;
}

export function formatarEntradaDataHoraRecompensa(valor, posicao = valor.length) {
  const cursorOriginal = Math.max(0, Math.min(posicao, valor.length));
  const quantidadeAntes = (valor.slice(0, cursorOriginal).match(/\d/g) || []).length;
  const digitos = valor.replace(/\D/g, '').slice(0, 12);
  const texto = mascaraDataHora(digitos);
  return {
    texto,
    posicao: posicaoAposDigitos(texto, Math.min(quantidadeAntes, digitos.length)),
  };
}

/** Corpo do POST de criação. */
export function corpoCriacao(form) {
  const corpo = {
    nome: String(form.nome).trim(),
    descricao: String(form.descricao).trim(),
    custoXp: inteiro(form.custoXp),
    condicoesRetirada: String(form.condicoesRetirada).trim(),
    estoqueIlimitado: Boolean(form.estoqueIlimitado),
    publico: form.publico || 'todos',
    publicar: Boolean(form.publicar),
  };
  const imagem = String(form.imagemUrl ?? '').trim();
  if (imagem) corpo.imagemUrl = imagem;
  if (!form.estoqueIlimitado) corpo.estoqueInicial = inteiro(form.estoqueInicial);
  if (String(form.limitePorAluno ?? '').trim()) corpo.limitePorAluno = inteiro(form.limitePorAluno);
  if (form.programaCodigo) corpo.programaCodigo = form.programaCodigo;
  const de = paraIsoRecompensa(form.disponivelDe);
  const ate = paraIsoRecompensa(form.disponivelAte);
  if (de) corpo.disponivelDe = de;
  if (ate) corpo.disponivelAte = ate;
  return corpo;
}

/** Só os campos alterados para o PATCH (`null` remove o valor opcional). */
export function camposAlterados(original, form) {
  const alterados = {};
  const texto = (v) => String(v ?? '').trim();
  if (texto(form.nome) !== original.nome) alterados.nome = texto(form.nome);
  if (texto(form.descricao) !== (original.descricao ?? '')) alterados.descricao = texto(form.descricao);
  const imagem = texto(form.imagemUrl) || null;
  if (imagem !== (original.imagemUrl ?? null)) alterados.imagemUrl = imagem;
  const custo = inteiro(form.custoXp);
  if (custo !== original.custoXp) alterados.custoXp = custo;
  if (texto(form.condicoesRetirada) !== original.condicoesRetirada) alterados.condicoesRetirada = texto(form.condicoesRetirada);
  const limite = texto(form.limitePorAluno) ? inteiro(form.limitePorAluno) : null;
  if (limite !== (original.limitePorAluno ?? null)) alterados.limitePorAluno = limite;
  if ((form.publico || 'todos') !== original.publico) alterados.publico = form.publico || 'todos';
  const programa = form.programaCodigo || null;
  if (programa !== (original.programaCodigo ?? null)) alterados.programaCodigo = programa;
  if (form.disponivelDe !== paraDatetimeLocal(original.disponivelDe)) alterados.disponivelDe = paraIsoRecompensa(form.disponivelDe);
  if (form.disponivelAte !== paraDatetimeLocal(original.disponivelAte)) alterados.disponivelAte = paraIsoRecompensa(form.disponivelAte);
  return alterados;
}

/** Campos que criam nova versão (condições vistas pelo aluno no resgate). */
export const CAMPOS_VERSIONADOS = ['nome', 'descricao', 'imagemUrl', 'custoXp', 'condicoesRetirada'];

export function textoEstoque(estoque) {
  if (!estoque) return '—';
  if (estoque.ilimitado) return 'Ilimitado';
  return `${estoque.disponivel} de ${estoque.total}`;
}

export function textoVigencia(r) {
  if (!r.disponivelDe && !r.disponivelAte) return 'Sem prazo';
  if (r.disponivelDe && r.disponivelAte) return `${dataCurta(r.disponivelDe)} a ${dataCurta(r.disponivelAte)}`;
  return r.disponivelDe ? `A partir de ${dataCurta(r.disponivelDe)}` : `Até ${dataCurta(r.disponivelAte)}`;
}

/** Tipos de ajuste possíveis no estado atual do estoque. */
export function tiposAjuste(estoque) {
  return estoque?.ilimitado
    ? [{ valor: 'limitado', rotulo: 'Passar a estoque limitado' }]
    : [
        { valor: 'reposicao', rotulo: 'Reposição (somar unidades)' },
        { valor: 'correcao', rotulo: 'Correção (definir novo total)' },
        { valor: 'ilimitado', rotulo: 'Passar a estoque ilimitado' },
      ];
}

/** Primeira inconsistência do ajuste de estoque, ou ''. */
export function validarAjuste(ajuste, estoque) {
  const L = LIMITES_RECOMPENSA;
  const motivo = String(ajuste.motivo ?? '').trim();
  if (ajuste.tipo !== 'ilimitado') {
    const q = inteiro(ajuste.quantidade);
    if (!Number.isInteger(q) || q > L.estoqueMax) return `Informe uma quantidade de 0 a ${L.estoqueMax}.`;
    if (ajuste.tipo === 'reposicao') {
      if (q < 1) return 'A reposição precisa de pelo menos 1 unidade.';
      if (estoque.total + q > L.estoqueMax) return `O total não pode passar de ${L.estoqueMax} unidades.`;
    }
    if (ajuste.tipo === 'correcao' && q === estoque.total) return 'O estoque já tem esse total.';
    if ((ajuste.tipo === 'correcao' || ajuste.tipo === 'limitado') && q < estoque.comprometido) {
      return `O total não pode ficar abaixo das ${estoque.comprometido} unidade(s) comprometidas com resgates.`;
    }
  }
  if (motivo.length < L.motivoMin) return 'Informe o motivo do ajuste.';
  if (motivo.length > L.motivoMax) return `O motivo deve ter no máximo ${L.motivoMax} caracteres.`;
  return '';
}

function ordenar(lista) {
  const ordem = { publicada: 0, rascunho: 1, inativa: 2, arquivada: 3 };
  return [...lista].sort((a, b) => (ordem[a.status] - ordem[b.status]) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Tabela de recompensas (apresentação pura). */
export function ListaRecompensas({ recompensas, ocupadoId = null, onEditar, onEstoque, onPublicar, onDesativar, onRemover }) {
  return (
    <div className="users-table-wrap">
      <table className="users-table recompensas-table">
        <caption className="sr-only">Recompensas da lojinha</caption>
        <thead>
          <tr>
            <th scope="col">Recompensa</th>
            <th scope="col">Status</th>
            <th scope="col">Custo</th>
            <th scope="col">Estoque</th>
            <th scope="col">Público</th>
            <th scope="col">Vigência</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {recompensas.map((r) => {
            const ocupado = ocupadoId === r.id;
            const arquivada = r.status === 'arquivada';
            return (
              <tr key={r.id} className={r.status === 'publicada' ? undefined : 'inativo'}>
                <td data-label="Recompensa">
                  <span className="user-cell">
                    {r.imagemUrl
                      ? <img className="recompensa-thumb" src={r.imagemUrl} alt="" loading="lazy" />
                      : <span className="pucstop-icon" aria-hidden="true"><Icon name="star" size={16} /></span>}
                    <span>
                      <strong>{r.nome}</strong>
                      <small className="recompensa-sub">v{r.versao}{r.limitePorAluno ? ` · até ${r.limitePorAluno} por aluno` : ''}{r.programaCodigo ? ` · ${r.programaCodigo}` : ''}</small>
                    </span>
                  </span>
                </td>
                <td data-label="Status">
                  <span className={`flag ${TOM_STATUS[r.status] || 'muted'}`}>{ROTULO_STATUS[r.status] || r.status}</span>
                  {r.status === 'publicada' && !r.disponivelAgora && <small className="recompensa-sub">fora da vigência</small>}
                </td>
                <td data-label="Custo">{Number(r.custoXp).toLocaleString('pt-BR')} moedas</td>
                <td data-label="Estoque">
                  {textoEstoque(r.estoque)}
                  {r.estoque?.comprometido > 0 && <small className="recompensa-sub">{r.estoque.comprometido} comprometida(s)</small>}
                </td>
                <td data-label="Público">{ROTULO_PUBLICO[r.publico] || r.publico}</td>
                <td data-label="Vigência">{textoVigencia(r)}</td>
                <td className="user-actions">
                  <div>
                    {!arquivada && (
                      <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEditar?.(r)} aria-label={`Editar recompensa ${r.nome}`}>
                        <Icon name="edit" size={14} /> Editar
                      </button>
                    )}
                    <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onEstoque?.(r)} aria-label={`${arquivada ? 'Histórico de' : 'Ajustar'} estoque de ${r.nome}`}>
                      <Icon name={arquivada ? 'history' : 'database'} size={14} /> {arquivada ? 'Histórico' : 'Estoque'}
                    </button>
                    {(r.status === 'rascunho' || r.status === 'inativa') && (
                      <button type="button" className="mini-btn success" disabled={ocupado} onClick={() => onPublicar?.(r)} aria-label={`Publicar recompensa ${r.nome}`}>
                        <Icon name="send" size={14} /> {ocupado ? 'Publicando…' : 'Publicar'}
                      </button>
                    )}
                    {r.status === 'publicada' && (
                      <button type="button" className="mini-btn" disabled={ocupado} onClick={() => onDesativar?.(r)} aria-label={`Desativar recompensa ${r.nome}`}>
                        <Icon name="eye" size={14} /> {ocupado ? 'Desativando…' : 'Desativar'}
                      </button>
                    )}
                    {!arquivada && (
                      <button type="button" className="mini-btn danger" disabled={ocupado} onClick={() => onRemover?.(r)} aria-label={`${r.podeExcluir ? 'Excluir' : 'Arquivar'} recompensa ${r.nome}`}>
                        <Icon name="trash" size={14} /> {r.podeExcluir ? 'Excluir' : 'Arquivar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Excluir (sem transações) ou arquivar (já usada em resgates). */
export function ConfirmarRemocao({ recompensa, ocupado, erro, onExcluir, onArquivar, onFechar }) {
  const fechar = () => { if (!ocupado) onFechar(); };
  const excluir = recompensa.podeExcluir;
  return (
    <Modal
      titulo={excluir ? `Excluir "${recompensa.nome}"?` : `Arquivar "${recompensa.nome}"?`}
      descricao={excluir
        ? 'A recompensa ainda não tem resgates: ela e o histórico de versões e estoque serão apagados de vez. Se preferir manter o registro, arquive.'
        : 'Esta recompensa já tem resgates, então não pode ser excluída. Arquivada, ela sai da lojinha e fica somente para consulta; resgates e histórico são preservados.'}
      onFechar={fechar}
      acoes={(
        <>
          <button type="button" className="ghost-button" disabled={ocupado} onClick={fechar} data-autofocus>Cancelar</button>
          {excluir && (
            <button type="button" className="ghost-button" disabled={ocupado} onClick={() => { if (!ocupado) onArquivar(); }}>
              <Icon name="history" size={16} /> Arquivar
            </button>
          )}
          <button type="button" className="danger-button" disabled={ocupado} onClick={() => { if (!ocupado) (excluir ? onExcluir : onArquivar)(); }}>
            <Icon name="trash" size={16} /> {ocupado ? 'Aguarde…' : excluir ? 'Excluir de vez' : 'Arquivar recompensa'}
          </button>
        </>
      )}
    >
      {!excluir && <p className="detail-muted">{recompensa.transacoes} transação(ões) registrada(s){recompensa.estoque?.comprometido ? `; ${recompensa.estoque.comprometido} unidade(s) comprometida(s)` : ''}.</p>}
      {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
    </Modal>
  );
}

function usePopupRecompensa(largura, altura) {
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

function ListaRecompensa({ id, rotulo, valor, opcoes, onChange }) {
  const popup = usePopupRecompensa(0, 240);
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
      <button type="button" ref={popup.gatilho} className="recompensa-gatilho" aria-labelledby={`${id}-rotulo ${id}-valor`} aria-haspopup="listbox" aria-expanded={popup.aberto} aria-controls={popup.aberto ? `${id}-lista` : undefined} onClick={() => popup.aberto ? popup.fechar() : popup.abrir()} onKeyDown={(event) => { if (!popup.aberto && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); popup.abrir(); } else if (popup.aberto && event.key === 'Escape') { event.stopPropagation(); popup.fechar(); } }}>
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
  const canonica = dataHoraCanonica(valor);
  if (!canonica) return null;
  const [dia, horario] = canonica.split('T');
  const [hora, minuto] = horario.split(':');
  return { dia, hora, minuto };
}

function CalendarioRecompensa({ id, rotulo, valor, onChange, erro }) {
  const popup = usePopupRecompensa(326, 408);
  const campoRef = useRef(null);
  const [mes, setMes] = useState(() => new Date());
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('12');
  const [minuto, setMinuto] = useState('00');
  const [textoDigitado, setTextoDigitado] = useState(() => textoDataHoraRecompensa(valor));
  const ano = mes.getFullYear();
  const numeroMes = mes.getMonth();
  const inicio = (new Date(ano, numeroMes, 1).getDay() + 6) % 7;
  const total = new Date(ano, numeroMes + 1, 0).getDate();
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const dataHoraAplicada = combinarDataHoraRecompensa(dia, hora, minuto);

  useEffect(() => {
    setTextoDigitado(textoDataHoraRecompensa(valor));
  }, [valor]);

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
    if (!dataHoraAplicada) return;
    onChange(dataHoraAplicada);
    popup.fechar(true);
  }

  return (
    <div className="editor-field recompensa-data">
      <span id={`${id}-rotulo`}>{rotulo}</span>
      <div className="recompensa-data-controles">
        <input
          id={`${id}-valor`}
          ref={campoRef}
          className="recompensa-gatilho recompensa-data-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/AAAA às HH:mm"
          value={textoDigitado}
          aria-labelledby={`${id}-rotulo`}
          aria-invalid={Boolean(erro) || undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          onChange={(event) => {
            const digitado = event.currentTarget.value;
            const mascarado = formatarEntradaDataHoraRecompensa(
              digitado,
              event.currentTarget.selectionStart ?? digitado.length,
            );
            setTextoDigitado(mascarado.texto);
            onChange(mascarado.texto ? dataHoraCanonica(mascarado.texto) ?? mascarado.texto : '');
            window.requestAnimationFrame(() => {
              const campo = campoRef.current;
              if (campo && document.activeElement === campo) {
                campo.setSelectionRange(mascarado.posicao, mascarado.posicao);
              }
            });
          }}
        />
        <button
          type="button"
          ref={popup.gatilho}
          className="recompensa-gatilho recompensa-calendario-abrir"
          aria-label={`Abrir calendário de ${rotulo.toLowerCase()}`}
          aria-haspopup="dialog"
          aria-expanded={popup.aberto}
          onClick={() => popup.aberto ? popup.fechar() : abrir()}
          onKeyDown={(event) => { if (popup.aberto && event.key === 'Escape') { event.stopPropagation(); popup.fechar(); } }}
        >
          <Icon name="calendar" size={17} />
        </button>
      </div>
      {erro && <span id={`${id}-erro`} className="recompensa-erro-campo" role="alert">{erro}</span>}
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
            <button type="button" className="aplicar" disabled={!dataHoraAplicada} onClick={aplicar}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Formulário de criação/edição em modal. */
export function FormularioRecompensa({ original, programas = [], onCancelar, onSalvo }) {
  const criando = !original;
  const [form, setForm] = useState(() => formDaRecompensa(original));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;
  const L = LIMITES_RECOMPENSA;

  const errosCampos = errosCamposRecompensa(form, { criando });
  const alterados = criando ? null : camposAlterados(original, form);
  const semAlteracoes = !criando && Object.keys(alterados).length === 0;
  const novaVersao = !criando && CAMPOS_VERSIONADOS.some((c) => c in alterados);
  const podeSalvar = !salvando && !semAlteracoes;

  function campo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    setTentouSalvar(true);
    if (!podeSalvar || Object.keys(errosCampos).length || trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      const salvo = criando
        ? await api.criarRecompensa(corpoCriacao(form))
        : await api.atualizarRecompensa(original.id, { ...alterados, atualizadoEm: original.atualizadoEm });
      onSalvo(salvo, criando);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar a recompensa.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onCancelar(); };

  return (
    <Modal
      titulo={criando ? 'Nova recompensa' : `Editar "${original.nome}"`}
      descricao={criando ? 'Defina o que o aluno recebe, quanto custa em moedas e como retirar. Referência: brindes 100–200, itens úteis 300–450, premium 600–800, experiências 250–500 moedas.' : `Versão atual: v${original.versao}.`}
      onFechar={fechar}
      tamanho="lg"
      className="recompensa-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
            <Icon name="save" size={16} /> {salvando ? 'Salvando…' : criando ? (form.publicar ? 'Criar e publicar' : 'Criar rascunho') : 'Salvar alterações'}
          </button>
        </>
      )}
    >
      <form id={formId} className="pucstop-form recompensa-form" onSubmit={salvar} noValidate>
        <label className="editor-field" htmlFor={`${base}-nome`}>
          <span>Nome <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
          <input id={`${base}-nome`} value={form.nome} maxLength={L.nomeMax} required aria-required="true" aria-invalid={Boolean(tentouSalvar && errosCampos.nome) || undefined} aria-describedby={tentouSalvar && errosCampos.nome ? `${base}-nome-erro` : undefined} data-autofocus placeholder="Ex.: Caneca Ajuda-aí" onChange={(e) => campo('nome', e.target.value)} />
          {tentouSalvar && errosCampos.nome && <span id={`${base}-nome-erro`} className="recompensa-erro-campo">{errosCampos.nome}</span>}
        </label>
        <label className="editor-field" htmlFor={`${base}-descricao`}>
          <span>Descrição <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
          <textarea id={`${base}-descricao`} className="detail-textarea" rows={2} maxLength={L.descricaoMax} required aria-required="true" aria-invalid={Boolean(tentouSalvar && errosCampos.descricao) || undefined} aria-describedby={tentouSalvar && errosCampos.descricao ? `${base}-descricao-erro` : undefined} value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} />
          {tentouSalvar && errosCampos.descricao && <span id={`${base}-descricao-erro`} className="recompensa-erro-campo">{errosCampos.descricao}</span>}
        </label>
        <div className="editor-grid pucstop-grid">
          <label className="editor-field" htmlFor={`${base}-custo`}>
            <span>Custo em moedas <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
            <input id={`${base}-custo`} type="number" inputMode="numeric" min={L.custoMin} max={L.custoMax} step="1" value={form.custoXp} required aria-required="true" aria-invalid={Boolean(tentouSalvar && errosCampos.custoXp) || undefined} aria-describedby={tentouSalvar && errosCampos.custoXp ? `${base}-custo-erro` : undefined} onChange={(e) => campo('custoXp', e.target.value)} />
            {tentouSalvar && errosCampos.custoXp && <span id={`${base}-custo-erro`} className="recompensa-erro-campo">{errosCampos.custoXp}</span>}
          </label>
          <label className="editor-field" htmlFor={`${base}-imagem`}>
            <span>Imagem (URL https, opcional)</span>
            <input id={`${base}-imagem`} type="url" inputMode="url" maxLength={L.imagemMax} placeholder="https://…" value={form.imagemUrl} aria-invalid={Boolean(tentouSalvar && errosCampos.imagemUrl) || undefined} aria-describedby={tentouSalvar && errosCampos.imagemUrl ? `${base}-imagem-erro` : undefined} onChange={(e) => campo('imagemUrl', e.target.value)} />
            {tentouSalvar && errosCampos.imagemUrl && <span id={`${base}-imagem-erro`} className="recompensa-erro-campo">{errosCampos.imagemUrl}</span>}
          </label>
        </div>
        <label className="editor-field" htmlFor={`${base}-condicoes`}>
          <span>Condições de retirada <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
          <textarea id={`${base}-condicoes`} className="detail-textarea" rows={2} maxLength={L.condicoesMax} required aria-required="true" aria-invalid={Boolean(tentouSalvar && errosCampos.condicoesRetirada) || undefined} aria-describedby={tentouSalvar && errosCampos.condicoesRetirada ? `${base}-condicoes-erro` : undefined} placeholder="Ex.: retirar na coordenação, seg a sex, 9h–17h, com documento." value={form.condicoesRetirada} onChange={(e) => campo('condicoesRetirada', e.target.value)} />
          {tentouSalvar && errosCampos.condicoesRetirada && <span id={`${base}-condicoes-erro`} className="recompensa-erro-campo">{errosCampos.condicoesRetirada}</span>}
        </label>
        {!criando && (
          <p className="field-hint">
            Mudar nome, descrição, imagem, custo ou condições cria uma nova versão. Resgates já feitos mantêm as condições da versão em que foram feitos.
            {novaVersao && <strong> Esta alteração criará a v{original.versao + 1}.</strong>}
          </p>
        )}

        {criando && (
          <fieldset className="recompensa-bloco">
            <legend>Estoque</legend>
            <div className="editor-toggles">
              <Toggle label="Estoque ilimitado" descricao="Para itens sem quantidade (ex.: benefício digital)." checked={form.estoqueIlimitado} onChange={(v) => campo('estoqueIlimitado', v)} />
            </div>
            {!form.estoqueIlimitado && (
              <label className="editor-field" htmlFor={`${base}-estoque`}>
                <span>Estoque inicial <strong className="recompensa-obrigatorio" aria-hidden="true">*</strong></span>
                <input id={`${base}-estoque`} type="number" inputMode="numeric" min="0" max={L.estoqueMax} step="1" value={form.estoqueInicial} required aria-required="true" aria-invalid={Boolean(tentouSalvar && errosCampos.estoqueInicial) || undefined} aria-describedby={tentouSalvar && errosCampos.estoqueInicial ? `${base}-estoque-erro` : undefined} onChange={(e) => campo('estoqueInicial', e.target.value)} />
                {tentouSalvar && errosCampos.estoqueInicial && <span id={`${base}-estoque-erro`} className="recompensa-erro-campo">{errosCampos.estoqueInicial}</span>}
              </label>
            )}
          </fieldset>
        )}

        <fieldset className="recompensa-bloco">
          <legend>Disponibilidade</legend>
          <div className="editor-grid pucstop-grid">
            <ListaRecompensa id={`${base}-publico`} rotulo="Público" valor={form.publico} opcoes={Object.entries(ROTULO_PUBLICO).map(([valor, rotulo]) => ({ valor, rotulo }))} onChange={(valor) => campo('publico', valor)} />
            <ListaRecompensa id={`${base}-programa`} rotulo="Programa" valor={form.programaCodigo} opcoes={[{ valor: '', rotulo: 'Todos os programas' }, ...(form.programaCodigo && !programas.some((p) => p.codigo === form.programaCodigo) ? [{ valor: form.programaCodigo, rotulo: form.programaCodigo }] : []), ...programas.map((p) => ({ valor: p.codigo, rotulo: p.titulo ? `${p.codigo} — ${p.titulo}` : p.codigo }))]} onChange={(valor) => campo('programaCodigo', valor)} />
            <CalendarioRecompensa id={`${base}-de`} rotulo="Data e hora de início" valor={form.disponivelDe} erro={tentouSalvar ? errosCampos.disponivelDe : ''} onChange={(valor) => campo('disponivelDe', valor)} />
            <CalendarioRecompensa id={`${base}-ate`} rotulo="Data e hora de fim" valor={form.disponivelAte} erro={tentouSalvar ? errosCampos.disponivelAte : ''} onChange={(valor) => campo('disponivelAte', valor)} />
            <label className="editor-field" htmlFor={`${base}-limite`}>
              <span>Limite por aluno (opcional)</span>
              <input id={`${base}-limite`} type="number" inputMode="numeric" min={L.limiteMin} max={L.limiteMax} step="1" placeholder="Sem limite" value={form.limitePorAluno} aria-invalid={Boolean(tentouSalvar && errosCampos.limitePorAluno) || undefined} aria-describedby={tentouSalvar && errosCampos.limitePorAluno ? `${base}-limite-erro` : undefined} onChange={(e) => campo('limitePorAluno', e.target.value)} />
              {tentouSalvar && errosCampos.limitePorAluno && <span id={`${base}-limite-erro`} className="recompensa-erro-campo">{errosCampos.limitePorAluno}</span>}
            </label>
          </div>
          <p className="field-hint">Datas vazias: sem prazo. A recompensa só aparece na lojinha publicada e dentro da vigência.</p>
        </fieldset>

        {criando && (
          <div className="editor-toggles">
            <Toggle label="Publicar agora" descricao="Desligado, fica como rascunho até você publicar." checked={form.publicar} onChange={(v) => campo('publicar', v)} />
          </div>
        )}

        {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
        {!erro && semAlteracoes && (
          <p className="detail-muted small" role="status">Nenhuma alteração para salvar.</p>
        )}
      </form>
    </Modal>
  );
}

/** Ajuste de estoque com motivo e o histórico de ajustes (responsável e data). */
export function AjusteEstoque({ recompensa, onFechar, onSalvo }) {
  const somenteLeitura = recompensa.status === 'arquivada';
  const opcoes = tiposAjuste(recompensa.estoque);
  const [ajuste, setAjuste] = useState({ tipo: opcoes[0].valor, quantidade: '', motivo: '' });
  const [detalhe, setDetalhe] = useState(null);
  const [erroHistorico, setErroHistorico] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);
  const base = useId();
  const formId = `${base}-form`;
  const L = LIMITES_RECOMPENSA;

  useEffect(() => {
    let ativo = true;
    api.recompensa(recompensa.id)
      .then((d) => { if (ativo) setDetalhe(d); })
      .catch((e) => { if (ativo) setErroHistorico(e.message || 'Não foi possível carregar o histórico.'); });
    return () => { ativo = false; };
  }, [recompensa.id]);

  const erroValidacao = somenteLeitura ? '' : validarAjuste(ajuste, recompensa.estoque);
  const podeSalvar = !somenteLeitura && !salvando && !erroValidacao;

  function campo(chave, valor) {
    setAjuste((atual) => ({ ...atual, [chave]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    if (!podeSalvar || trava.current) return;
    trava.current = true;
    setSalvando(true);
    try {
      const corpo = { tipo: ajuste.tipo, motivo: ajuste.motivo.trim(), atualizadoEm: recompensa.atualizadoEm };
      if (ajuste.tipo !== 'ilimitado') corpo.quantidade = inteiro(ajuste.quantidade);
      onSalvo(await api.ajustarEstoqueRecompensa(recompensa.id, corpo));
    } catch (error) {
      setErro(error.message || 'Não foi possível ajustar o estoque.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  const fechar = () => { if (!salvando) onFechar(); };
  const e = recompensa.estoque;
  const rotuloQuantidade = ajuste.tipo === 'reposicao' ? 'Unidades a somar' : 'Novo total';

  return (
    <Modal
      titulo={`Estoque de "${recompensa.nome}"`}
      descricao={e.ilimitado ? 'Estoque ilimitado.' : `${e.disponivel} disponível(is) de ${e.total}; ${e.comprometido} comprometida(s) com resgates.`}
      onFechar={fechar}
      tamanho="lg"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={fechar} disabled={salvando}>{somenteLeitura ? 'Fechar' : 'Cancelar'}</button>
          {!somenteLeitura && (
            <button type="submit" form={formId} className="primary-button inline" disabled={!podeSalvar}>
              <Icon name="save" size={16} /> {salvando ? 'Registrando…' : 'Registrar ajuste'}
            </button>
          )}
        </>
      )}
    >
      {!somenteLeitura && (
        <form id={formId} className="pucstop-form" onSubmit={salvar} noValidate>
          <div className="editor-grid pucstop-grid">
            <label className="editor-field" htmlFor={`${base}-tipo`}>
              <span>Tipo de ajuste</span>
              <select id={`${base}-tipo`} className="detail-select" value={ajuste.tipo} data-autofocus onChange={(ev) => campo('tipo', ev.target.value)}>
                {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </label>
            {ajuste.tipo !== 'ilimitado' && (
              <label className="editor-field" htmlFor={`${base}-qtd`}>
                <span>{rotuloQuantidade}</span>
                <input id={`${base}-qtd`} type="number" inputMode="numeric" min={ajuste.tipo === 'reposicao' ? 1 : e.comprometido} max={L.estoqueMax} step="1" value={ajuste.quantidade} onChange={(ev) => campo('quantidade', ev.target.value)} />
              </label>
            )}
          </div>
          <label className="editor-field" htmlFor={`${base}-motivo`}>
            <span>Motivo</span>
            <input id={`${base}-motivo`} maxLength={L.motivoMax} placeholder="Ex.: chegou novo lote; contagem física" value={ajuste.motivo} onChange={(ev) => campo('motivo', ev.target.value)} />
          </label>
          <p className="field-hint">O ajuste fica registrado com você como responsável. Unidades comprometidas com resgates não podem ser retiradas.</p>
          {erro && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {erro}</p>}
          {!erro && erroValidacao && <p className="detail-muted small" role="status">{erroValidacao}</p>}
        </form>
      )}

      <h3 className="recompensa-historico-titulo">Histórico de estoque</h3>
      {erroHistorico && <p className="form-error" role="alert">{erroHistorico}</p>}
      {!detalhe && !erroHistorico && <p className="detail-muted small" role="status">Carregando…</p>}
      {detalhe && (
        <ul className="recompensa-historico">
          {detalhe.ajustesEstoque.map((a) => (
            <li key={a.id}>
              <strong>{ROTULO_AJUSTE[a.tipo] || a.tipo}</strong>
              {' '}{a.estoqueAntes ?? '∞'} → {a.estoqueDepois ?? '∞'}
              <span className="detail-muted"> · {a.motivo} · {a.responsavelEmail || 'coordenação'} · {dataCurta(a.criadoEm)}</span>
            </li>
          ))}
        </ul>
      )}
      {detalhe?.versoes?.length > 1 && (
        <>
          <h3 className="recompensa-historico-titulo">Versões</h3>
          <ul className="recompensa-historico">
            {detalhe.versoes.map((v) => (
              <li key={v.versao}>
                <strong>v{v.versao}</strong> {v.nome} · {Number(v.custoXp).toLocaleString('pt-BR')} moedas
                <span className="detail-muted"> · {dataCurta(v.criadoEm)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export default function RecompensasPage() {
  const mostrarToast = useToast();
  const [recompensas, setRecompensas] = useState(null);
  const [programas, setProgramas] = useState([]);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [filtro, setFiltro] = useState('ativas');
  const [editando, setEditando] = useState(null); // null | 'novo' | recompensa
  const [estoque, setEstoque] = useState(null);
  const [removendo, setRemovendo] = useState(null);
  const [erroRemocao, setErroRemocao] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setRecompensas(ordenar(await api.recompensas()));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as recompensas.');
    }
  }, []);

  useEffect(() => {
    carregar();
    api.programas().then((lista) => setProgramas(Array.isArray(lista) ? lista : [])).catch(() => setProgramas([]));
  }, [carregar]);

  function substituir(item) {
    setRecompensas((lista) => ordenar([...(lista || []).filter((r) => r.id !== item.id), item]));
  }

  const contagem = useMemo(() => {
    const lista = recompensas || [];
    const por = (s) => lista.filter((r) => r.status === s).length;
    return { ativas: lista.filter((r) => r.status !== 'arquivada').length, publicada: por('publicada'), rascunho: por('rascunho'), inativa: por('inativa'), arquivada: por('arquivada') };
  }, [recompensas]);

  const lista = useMemo(
    () => (recompensas || []).filter((r) => (filtro === 'ativas' ? r.status !== 'arquivada' : r.status === filtro)),
    [recompensas, filtro],
  );

  async function executar(recompensa, chamada, sucesso, falha) {
    if (trava.current) return;
    trava.current = true;
    setOcupadoId(recompensa.id);
    setErroAcao('');
    try {
      const atualizada = await chamada(recompensa.id);
      substituir(atualizada);
      mostrarToast(sucesso(atualizada), 'sucesso');
    } catch (error) {
      setErroAcao(`${falha} "${recompensa.nome}": ${error.message || 'erro desconhecido.'}`);
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  async function remover(acao) {
    if (trava.current || !removendo) return;
    trava.current = true;
    setOcupadoId(removendo.id);
    setErroRemocao('');
    try {
      if (acao === 'excluir') {
        await api.excluirRecompensa(removendo.id);
        setRecompensas((lista) => (lista || []).filter((r) => r.id !== removendo.id));
        mostrarToast(`Recompensa "${removendo.nome}" excluída.`, 'sucesso');
      } else {
        substituir(await api.arquivarRecompensa(removendo.id));
        mostrarToast(`Recompensa "${removendo.nome}" arquivada. O histórico foi preservado.`, 'sucesso');
      }
      setRemovendo(null);
    } catch (error) {
      setErroRemocao(error.message || 'Não foi possível concluir a operação.');
      if (error.motivo === 'recompensa-com-transacoes') carregar();
    } finally {
      trava.current = false;
      setOcupadoId(null);
    }
  }

  return (
    <section className="users-page pucstops-page recompensas-page">
      <header className="dash-header">
        <div>
          <h1>Lojinha</h1>
          <p>Recompensas que os alunos trocam por moedas (o XP e o nível deles não diminuem). Valem para todos os programas, salvo quando restritas a um deles.</p>
        </div>
        <button type="button" className="primary-button inline" onClick={() => setEditando('novo')}>
          <Icon name="plus" size={17} /> Nova recompensa
        </button>
      </header>

      {recompensas && recompensas.length > 0 && (
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
      {!recompensas && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando recompensas…</p></div>}
      {recompensas?.length === 0 && <p className="empty-copy">Nenhuma recompensa cadastrada. Crie a primeira com custo em moedas e condições de retirada.</p>}
      {recompensas && recompensas.length > 0 && lista.length === 0 && <p className="empty-copy">Nenhuma recompensa com este filtro.</p>}

      {lista.length > 0 && (
        <ListaRecompensas
          recompensas={lista}
          ocupadoId={ocupadoId}
          onEditar={(r) => setEditando(r)}
          onEstoque={(r) => setEstoque(r)}
          onPublicar={(r) => executar(r, api.publicarRecompensa, (a) => `Recompensa "${a.nome}" publicada${a.disponivelAgora ? '' : ' (aparece quando a vigência começar)'}.`, 'Não foi possível publicar')}
          onDesativar={(r) => executar(r, api.desativarRecompensa, (a) => `Recompensa "${a.nome}" desativada.`, 'Não foi possível desativar')}
          onRemover={(r) => { setErroRemocao(''); setRemovendo(r); }}
        />
      )}

      {recompensas?.length > 0 && (
        <p className="detail-muted small">
          Recompensas sem resgates podem ser excluídas; as já usadas são arquivadas, preservando resgates e histórico.
        </p>
      )}

      {editando && (
        <FormularioRecompensa
          original={editando === 'novo' ? null : editando}
          programas={programas}
          onCancelar={() => setEditando(null)}
          onSalvo={(salvo, criada) => {
            substituir(salvo);
            setEditando(null);
            mostrarToast(criada ? `Recompensa "${salvo.nome}" criada.` : `Recompensa "${salvo.nome}" atualizada.`, 'sucesso');
          }}
        />
      )}

      {estoque && (
        <AjusteEstoque
          recompensa={estoque}
          onFechar={() => setEstoque(null)}
          onSalvo={(salvo) => {
            substituir(salvo);
            setEstoque(null);
            mostrarToast(`Estoque de "${salvo.nome}" atualizado.`, 'sucesso');
          }}
        />
      )}

      {removendo && (
        <ConfirmarRemocao
          recompensa={removendo}
          ocupado={ocupadoId === removendo.id}
          erro={erroRemocao}
          onExcluir={() => remover('excluir')}
          onArquivar={() => remover('arquivar')}
          onFechar={() => setRemovendo(null)}
        />
      )}
    </section>
  );
}
