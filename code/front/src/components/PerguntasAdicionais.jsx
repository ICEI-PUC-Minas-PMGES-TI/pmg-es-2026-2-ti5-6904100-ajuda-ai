import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../api/client';
import { perguntasVisiveis } from '../formularios/visibilidade';

export const TIPOS_PERGUNTA = [
  { valor: 'texto_curto', rotulo: 'Texto curto' },
  { valor: 'texto_longo', rotulo: 'Texto longo' },
  { valor: 'checklist', rotulo: 'Múltipla escolha' },
  { valor: 'dropdown', rotulo: 'Escolha única' },
  { valor: 'sim_nao', rotulo: 'Sim / Não' },
  { valor: 'escolha_unica', rotulo: 'Escolha única (matching)' },
  { valor: 'multipla_escolha', rotulo: 'Múltipla escolha (matching)' },
];

export const TIPOS_COMUNS = TIPOS_PERGUNTA.filter((t) =>
  ['texto_curto', 'texto_longo', 'checklist', 'dropdown'].includes(t.valor),
);

export const TIPOS_MATCHING = TIPOS_PERGUNTA.filter((t) =>
  ['sim_nao', 'escolha_unica', 'multipla_escolha'].includes(t.valor),
);

export const ERRO_FORMULARIO_NAO_SUPORTADO = 'Formulário contém tipo de pergunta não suportado. Procure a coordenação.';
export function tipoPerguntaSuportado(tipo) {
  return TIPOS_PERGUNTA.some((t) => t.valor === tipo);
}
export function tipoPerguntaMatching(tipo) {
  return TIPOS_MATCHING.some((t) => t.valor === tipo);
}
export function formularioSuportado(perguntas = []) {
  return perguntas.every((p) => p && tipoPerguntaSuportado(p.tipo));
}

/** Perguntas publicadas; carregamento ou falha impedem confirmar o envio. */
export function useFormularioPublico(tipo, programa) {
  const [perguntas, setPerguntas] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    setPerguntas([]);
    api
      .formularioPublico(tipo, programa)
      .then((formulario) => {
        if (!ativo) return;
        const lista = formulario?.publicado === false ? [] : formulario?.perguntas;
        const perguntas = Array.isArray(lista) ? lista : [];
        if (!formularioSuportado(perguntas)) {
          setErro(ERRO_FORMULARIO_NAO_SUPORTADO);
          return;
        }
        setPerguntas(perguntas);
      })
      .catch((error) => {
        if (ativo) {
          setPerguntas([]);
          setErro(error.message || 'Não foi possível carregar o formulário. Tente novamente.');
        }
      }).finally(() => {if (ativo) setCarregando(false);});
    return () => {
      ativo = false;
    };
  }, [tipo, programa]);
  return { perguntas, erro, carregando };
}

/**
 * Requisitos para padrinho do ciclo atual, definidos pela coordenação
 * (vêm de GET /formularios/padrinho; o mobile lê o mesmo endpoint).
 * `requisitos` é null enquanto carrega.
 */
export function useRequisitosPadrinho(programa) {
  const [estado, setEstado] = useState({ requisitos: null, erro: '' });
  useEffect(() => {
    let ativo = true;
    setEstado({requisitos: null, erro: ''});
    api
      .formularioPublico('padrinho', programa)
      .then((formulario) => {
        if (ativo)
          setEstado({
            requisitos: Array.isArray(formulario?.requisitos) ? formulario.requisitos : [],
            erro: '',
          });
      })
      .catch((error) => {
        if (ativo)
          setEstado({
            requisitos: null,
            erro: error.message || 'Não foi possível carregar os requisitos do ciclo.',
          });
      });
    return () => {
      ativo = false;
    };
  }, [programa]);
  return estado;
}

function vazio(valor) {
  if (typeof valor === 'boolean') return false;
  if (Array.isArray(valor)) return valor.length === 0;
  return !String(valor ?? '').trim();
}

function valorVazioParaTipo(tipo) {
  if (tipo === 'checklist' || tipo === 'multipla_escolha') return [];
  if (tipo === 'sim_nao') return undefined;
  return '';
}

/** Retorna erros de tipos não suportados e de respostas obrigatórias ausentes (só visíveis). */
export function validarExtras(perguntas, extras = {}) {
  const erros = {};
  perguntasVisiveis(perguntas, extras).forEach((pergunta) => {
    if (!tipoPerguntaSuportado(pergunta.tipo) || (pergunta.obrigatoria && vazio(extras[pergunta.id]))) {
      erros[pergunta.id] = true;
    }
  });
  return erros;
}

/** Só as respostas preenchidas das perguntas visíveis. */
export function limparExtras(perguntas, extras = {}) {
  const resultado = {};
  perguntasVisiveis(perguntas, extras).forEach((pergunta) => {
    if (!tipoPerguntaSuportado(pergunta.tipo)) throw new Error(ERRO_FORMULARIO_NAO_SUPORTADO);
    const valor = extras[pergunta.id];
    if (vazio(valor)) return;
    if (pergunta.tipo === 'sim_nao') resultado[pergunta.id] = Boolean(valor);
    else if (Array.isArray(valor)) resultado[pergunta.id] = valor;
    else resultado[pergunta.id] = String(valor).trim();
  });
  return resultado;
}

export function textoResposta(valor) {
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.join(', ');
  return valor ? String(valor) : '';
}

export default function PerguntasAdicionais({ perguntas, valores = {}, onChange, erros = {}, titulo = 'Perguntas adicionais', descricao }) {
  const visiveis = useMemo(() => perguntasVisiveis(perguntas || [], valores), [perguntas, valores]);

  useEffect(() => {
    if (!onChange || !perguntas?.length) return;
    const idsVisiveis = new Set(visiveis.map((p) => p.id));
    perguntas.forEach((p) => {
      if (!idsVisiveis.has(p.id) && !vazio(valores[p.id])) onChange(p.id, valorVazioParaTipo(p.tipo));
    });
  }, [perguntas, visiveis, valores, onChange]);

  if (!perguntas || perguntas.length === 0) return null;
  if (!formularioSuportado(perguntas))
    return (
      <p className="form-error" role="alert">
        {ERRO_FORMULARIO_NAO_SUPORTADO}
      </p>
    );
  if (visiveis.length === 0) return null;
  return (
    <fieldset className="extras-section">
      <legend>{titulo}</legend>
      {descricao && <p className="extras-desc">{descricao}</p>}
      {agruparPorSecao(visiveis).map(({ secao, itens }, i) => (
        <div key={`${i}-${secao}`} className="extras-group">
          {secao && <h4 className="extras-secao">{secao}</h4>}
          {itens.map((pergunta) => (
            <PerguntaCampo key={pergunta.id} pergunta={pergunta} valor={valores[pergunta.id]} erro={erros[pergunta.id]} onChange={(valor) => onChange?.(pergunta.id, valor)} />
          ))}
        </div>
      ))}
    </fieldset>
  );
}

/** Agrupa perguntas consecutivas da mesma seção, preservando a ordem do formulário. */
function agruparPorSecao(perguntas) {
  const grupos = [];
  perguntas.forEach((pergunta) => {
    const secao = (pergunta.secao || '').trim();
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.secao === secao) ultimo.itens.push(pergunta);
    else grupos.push({ secao, itens: [pergunta] });
  });
  return grupos;
}

function PerguntaCampo({ pergunta, valor, erro, onChange }) {
  const id = useId();
  const erroId = `${id}-erro`;
  const ajudaId = `${id}-ajuda`;
  const obrigatoria = pergunta.obrigatoria;
  const descritoPor = [pergunta.ajuda && ajudaId, erro && erroId].filter(Boolean).join(' ') || undefined;
  const ajuda = pergunta.ajuda ? <span id={ajudaId} className="extra-help">{pergunta.ajuda}</span> : null;
  const rotulo = (
    <>
      {pergunta.enunciado}
      {obrigatoria ? (
        <span className="extra-req" aria-hidden="true">
          {' '}
          *
        </span>
      ) : (
        <span className="extra-opt"> (opcional)</span>
      )}
    </>
  );
  const comuns = {
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': descritoPor,
    'aria-required': obrigatoria || undefined,
  };
  const alternativas = pergunta.alternativas || [];

  let controle;
  if (pergunta.tipo === 'texto_longo') {
    controle = <textarea id={id} className="extra-input" rows={3} maxLength={1000} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns} />;
  } else if (pergunta.tipo === 'dropdown') {
    controle = (
      <select id={id} className="extra-input" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns}>
        <option value="">Selecione</option>
        {(pergunta.opcoes || []).map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    );
  } else if (pergunta.tipo === 'escolha_unica') {
    controle = (
      <select id={id} className="extra-input" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns}>
        <option value="">Selecione</option>
        {alternativas.map((alt) => (
          <option key={alt.id} value={alt.id}>
            {alt.rotulo}
          </option>
        ))}
      </select>
    );
  } else if (pergunta.tipo === 'sim_nao') {
    return (
      <fieldset className={`extra-field${erro ? ' has-error' : ''}`} aria-describedby={descritoPor}>
        <legend className="extra-label">{rotulo}</legend>
        {ajuda}
        <div className="extra-checks extra-radios">
          <label className={`extra-check${valor === true ? ' selected' : ''}`}>
            <input
              type="radio"
              name={id}
              checked={valor === true}
              onChange={() => onChange(true)}
            />
            <span>Sim</span>
          </label>
          <label className={`extra-check${valor === false ? ' selected' : ''}`}>
            <input
              type="radio"
              name={id}
              checked={valor === false}
              onChange={() => onChange(false)}
            />
            <span>Não</span>
          </label>
        </div>
        {erro && (
          <span id={erroId} className="error-message">
            Responda esta pergunta para continuar.
          </span>
        )}
      </fieldset>
    );
  } else if (pergunta.tipo === 'checklist') {
    const lista = Array.isArray(valor) ? valor : [];
    return (
      <fieldset className={`extra-field${erro ? ' has-error' : ''}`} aria-describedby={descritoPor}>
        <legend className="extra-label">{rotulo}</legend>
        {ajuda}
        <div className="extra-checks">
          {(pergunta.opcoes || []).map((opcao) => (
            <label key={opcao} className={`extra-check${lista.includes(opcao) ? ' selected' : ''}`}>
              <input type="checkbox" checked={lista.includes(opcao)} onChange={() => onChange(lista.includes(opcao) ? lista.filter((v) => v !== opcao) : [...lista, opcao])} />
              <span>{opcao}</span>
            </label>
          ))}
        </div>
        {erro && (
          <span id={erroId} className="error-message">
            Responda esta pergunta para continuar.
          </span>
        )}
      </fieldset>
    );
  } else if (pergunta.tipo === 'multipla_escolha') {
    const lista = Array.isArray(valor) ? valor : [];
    return (
      <fieldset className={`extra-field${erro ? ' has-error' : ''}`} aria-describedby={descritoPor}>
        <legend className="extra-label">{rotulo}</legend>
        {ajuda}
        <div className="extra-checks">
          {alternativas.map((alt) => (
            <label key={alt.id} className={`extra-check${lista.includes(alt.id) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={lista.includes(alt.id)}
                onChange={() => onChange(lista.includes(alt.id) ? lista.filter((v) => v !== alt.id) : [...lista, alt.id])}
              />
              <span>{alt.rotulo}</span>
            </label>
          ))}
        </div>
        {erro && (
          <span id={erroId} className="error-message">
            Responda esta pergunta para continuar.
          </span>
        )}
      </fieldset>
    );
  } else {
    controle = <input id={id} className="extra-input" maxLength={300} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns} />;
  }

  return (
    <div className={`extra-field${erro ? ' has-error' : ''}`}>
      <label className="extra-label" htmlFor={id}>
        {rotulo}
      </label>
      {ajuda}
      {controle}
      {erro && (
        <span id={erroId} className="error-message">
          Responda esta pergunta para continuar.
        </span>
      )}
    </div>
  );
}
