import { useEffect, useId, useState } from 'react';
import { api } from '../api/client';

export const TIPOS_PERGUNTA = [
  { valor: 'texto_curto', rotulo: 'Texto curto' },
  { valor: 'texto_longo', rotulo: 'Texto longo' },
  { valor: 'checklist', rotulo: 'Checklist' },
  { valor: 'dropdown', rotulo: 'Dropdown' },
];

export const ERRO_FORMULARIO_NAO_SUPORTADO = 'Formulário contém tipo de pergunta não suportado. Procure a coordenação.';
export function tipoPerguntaSuportado(tipo) {
  return TIPOS_PERGUNTA.some((t) => t.valor === tipo);
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
  if (Array.isArray(valor)) return valor.length === 0;
  return !String(valor ?? '').trim();
}

/** Retorna erros de tipos não suportados e de respostas obrigatórias ausentes. */
export function validarExtras(perguntas, extras = {}) {
  const erros = {};
  perguntas.forEach((pergunta) => {
    if (!tipoPerguntaSuportado(pergunta.tipo) || (pergunta.obrigatoria && vazio(extras[pergunta.id]))) {
      erros[pergunta.id] = true;
    }
  });
  return erros;
}

/** Só as respostas preenchidas e de perguntas existentes. */
export function limparExtras(perguntas, extras = {}) {
  const resultado = {};
  perguntas.forEach((pergunta) => {
    if (!tipoPerguntaSuportado(pergunta.tipo)) throw new Error(ERRO_FORMULARIO_NAO_SUPORTADO);
    const valor = extras[pergunta.id];
    if (!vazio(valor)) resultado[pergunta.id] = Array.isArray(valor) ? valor : String(valor).trim();
  });
  return resultado;
}

export function textoResposta(valor) {
  if (Array.isArray(valor)) return valor.join(', ');
  return valor ? String(valor) : '';
}

export default function PerguntasAdicionais({ perguntas, valores = {}, onChange, erros = {}, titulo = 'Perguntas adicionais', descricao }) {
  if (!perguntas || perguntas.length === 0) return null;
  if (!formularioSuportado(perguntas))
    return (
      <p className="form-error" role="alert">
        {ERRO_FORMULARIO_NAO_SUPORTADO}
      </p>
    );
  return (
    <fieldset className="extras-section">
      <legend>{titulo}</legend>
      {descricao && <p className="extras-desc">{descricao}</p>}
      {perguntas.map((pergunta) => (
        <PerguntaCampo key={pergunta.id} pergunta={pergunta} valor={valores[pergunta.id]} erro={erros[pergunta.id]} onChange={(valor) => onChange?.(pergunta.id, valor)} />
      ))}
    </fieldset>
  );
}

function PerguntaCampo({ pergunta, valor, erro, onChange }) {
  const id = useId();
  const erroId = `${id}-erro`;
  const obrigatoria = pergunta.obrigatoria;
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
    'aria-describedby': erro ? erroId : undefined,
    'aria-required': obrigatoria || undefined,
  };

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
  } else if (pergunta.tipo === 'checklist') {
    const lista = Array.isArray(valor) ? valor : [];
    return (
      <fieldset className={`extra-field${erro ? ' has-error' : ''}`} aria-describedby={erro ? erroId : undefined}>
        <legend className="extra-label">{rotulo}</legend>
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
  } else {
    controle = <input id={id} className="extra-input" maxLength={300} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns} />;
  }

  return (
    <div className={`extra-field${erro ? ' has-error' : ''}`}>
      <label className="extra-label" htmlFor={id}>
        {rotulo}
      </label>
      {controle}
      {erro && (
        <span id={erroId} className="error-message">
          Responda esta pergunta para continuar.
        </span>
      )}
    </div>
  );
}
