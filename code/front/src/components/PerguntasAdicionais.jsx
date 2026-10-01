import { useEffect, useId, useState } from 'react';
import { api } from '../api/client';
import Icon from './Icon';

export const TIPOS_PERGUNTA = [
  { valor: 'texto_curto', rotulo: 'Texto curto' },
  { valor: 'texto_longo', rotulo: 'Texto longo' },
  { valor: 'checklist', rotulo: 'Checklist' },
  { valor: 'dropdown', rotulo: 'Dropdown' },
  { valor: 'upload', rotulo: 'Envio de arquivo' },
];

/** Perguntas publicadas pela coordenação. Falha ao buscar = sem perguntas. */
export function useFormularioPublico(tipo) {
  const [perguntas, setPerguntas] = useState([]);
  useEffect(() => {
    let ativo = true;
    api
      .formularioPublico(tipo)
      .then((formulario) => {
        if (!ativo) return;
        const lista = formulario?.publicado === false ? [] : formulario?.perguntas;
        setPerguntas(Array.isArray(lista) ? lista : []);
      })
      .catch(() => {
        if (ativo) setPerguntas([]);
      });
    return () => {
      ativo = false;
    };
  }, [tipo]);
  return perguntas;
}

function vazio(valor) {
  if (Array.isArray(valor)) return valor.length === 0;
  return !String(valor ?? '').trim();
}

/** Retorna { [id]: true } para cada pergunta obrigatória sem resposta (upload não conta). */
export function validarExtras(perguntas, extras = {}) {
  const erros = {};
  perguntas.forEach((pergunta) => {
    if (pergunta.obrigatoria && pergunta.tipo !== 'upload' && vazio(extras[pergunta.id])) {
      erros[pergunta.id] = true;
    }
  });
  return erros;
}

/** Só as respostas preenchidas e de perguntas existentes. */
export function limparExtras(perguntas, extras = {}) {
  const resultado = {};
  perguntas.forEach((pergunta) => {
    if (pergunta.tipo === 'upload') return;
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
  return (
    <fieldset className="extras-section">
      <legend>{titulo}</legend>
      {descricao && <p className="extras-desc">{descricao}</p>}
      {perguntas.map((pergunta) => (
        <PerguntaCampo
          key={pergunta.id}
          pergunta={pergunta}
          valor={valores[pergunta.id]}
          erro={erros[pergunta.id]}
          onChange={(valor) => onChange?.(pergunta.id, valor)}
        />
      ))}
    </fieldset>
  );
}

function PerguntaCampo({ pergunta, valor, erro, onChange }) {
  const id = useId();
  const erroId = `${id}-erro`;
  const obrigatoria = pergunta.obrigatoria && pergunta.tipo !== 'upload';
  const rotulo = (
    <>
      {pergunta.enunciado}
      {obrigatoria ? <span className="extra-req" aria-hidden="true"> *</span> : <span className="extra-opt"> (opcional)</span>}
    </>
  );
  const comuns = {
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? erroId : undefined,
    'aria-required': obrigatoria || undefined,
  };

  let controle;
  if (pergunta.tipo === 'texto_longo') {
    controle = (
      <textarea id={id} className="extra-input" rows={3} maxLength={1000} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns} />
    );
  } else if (pergunta.tipo === 'dropdown') {
    controle = (
      <select id={id} className="extra-input" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns}>
        <option value="">Selecione</option>
        {(pergunta.opcoes || []).map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
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
              <input
                type="checkbox"
                checked={lista.includes(opcao)}
                onChange={() => onChange(lista.includes(opcao) ? lista.filter((v) => v !== opcao) : [...lista, opcao])}
              />
              <span>{opcao}</span>
            </label>
          ))}
        </div>
        {erro && <span id={erroId} className="error-message">Responda esta pergunta para continuar.</span>}
      </fieldset>
    );
  } else if (pergunta.tipo === 'upload') {
    controle = (
      <span className="extra-upload" id={id}>
        <Icon name="upload" size={16} />
        Envio de arquivo em breve
        <input type="file" disabled aria-label={`${pergunta.enunciado} (envio de arquivo em breve)`} />
      </span>
    );
  } else {
    controle = (
      <input id={id} className="extra-input" maxLength={300} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...comuns} />
    );
  }

  return (
    <div className={`extra-field${erro ? ' has-error' : ''}`}>
      <label className="extra-label" htmlFor={id}>{rotulo}</label>
      {controle}
      {erro && <span id={erroId} className="error-message">Responda esta pergunta para continuar.</span>}
    </div>
  );
}
