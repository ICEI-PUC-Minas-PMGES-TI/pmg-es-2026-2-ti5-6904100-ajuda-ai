import { useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import MultiSelect from '../../components/MultiSelect';
import PerguntasAdicionais, { limparExtras, useFormularioPublico, useRequisitosPadrinho, validarExtras } from '../../components/PerguntasAdicionais';
import { AREAS_APOIO, DISPONIBILIDADES, Field, GENEROS, paraBool, simNao, StepHeading, TextArea } from './partes';

function dadosDoPerfil(perfil = {}) {
  const dados = {};
  ['nome', 'curso', 'periodo', 'turno', 'interesses'].forEach((chave) => {
    const valor = perfil[chave];
    if (valor !== undefined && valor !== null && valor !== '') dados[chave] = valor;
  });
  return dados;
}

function estadoInicial(inicial) {
  const r = inicial || {};
  return {
    motivacao: r.motivacao || '',
    experiencias: r.experiencias || '',
    areas: Array.isArray(r.areas) ? r.areas : [],
    disponibilidade: Array.isArray(r.disponibilidade) ? r.disponibilidade : [],
    genero: r.genero || '',
    prouni: simNao(r.bolsistaProuni),
    outraCidade: simNao(r.deOutraCidade),
    // id do requisito → declarou que cumpre
    requisitos: Object.fromEntries((Array.isArray(r.requisitos) ? r.requisitos : []).map((q) => [q.id, q.cumpre === true])),
    extras: r.extras && typeof r.extras === 'object' ? r.extras : {},
  };
}

/**
 * Candidatura de padrinho (passo 2 de 3). Também usada em "Editar candidatura":
 * o backend atualiza as respostas enquanto a candidatura está pendente/em análise.
 */
export default function CandidaturaPadrinhoForm({ email, perfil, inicial, modo = 'novo', onVoltar, onEnviado }) {
  const perguntas = useFormularioPublico('padrinho');
  const { requisitos, erro: erroRequisitos } = useRequisitosPadrinho();
  const [form, setForm] = useState(() => estadoInicial(inicial));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const editar = modo === 'editar';

  function atualizar(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErros((atual) => ({ ...atual, [chave]: false }));
    setErroEnvio('');
  }

  function marcarRequisito(id, cumpre) {
    setForm((atual) => ({ ...atual, requisitos: { ...atual.requisitos, [id]: cumpre } }));
    setErros((atual) => ({ ...atual, requisitos: false }));
    setErroEnvio('');
  }

  function atualizarExtra(id, valor) {
    setForm((atual) => ({ ...atual, extras: { ...atual.extras, [id]: valor } }));
    setErros((atual) => ({ ...atual, extras: { ...(atual.extras || {}), [id]: false } }));
  }

  async function enviar(event) {
    event.preventDefault();
    const errosExtras = validarExtras(perguntas, form.extras);
    // Ajuda visual: o backend é quem recusa requisitos obrigatórios não cumpridos.
    const faltando = (requisitos || []).filter((q) => q.obrigatorio && !form.requisitos[q.id]);
    const novos = {
      motivacao: !form.motivacao.trim(),
      areas: form.areas.length === 0,
      disponibilidade: form.disponibilidade.length === 0,
      genero: !form.genero,
      prouni: !form.prouni,
      outraCidade: !form.outraCidade,
      requisitos: requisitos === null || faltando.length > 0,
      extras: errosExtras,
    };
    setErros(novos);
    const temErro = Object.entries(novos).some(([chave, valor]) => (chave === 'extras' ? Object.keys(valor).length > 0 : valor));
    if (temErro) {
      setErroEnvio(faltando.length
        ? `Para se candidatar a padrinho neste ciclo é preciso cumprir: ${faltando.map((q) => q.descricao).join('; ')}.`
        : 'Revise os campos destacados antes de enviar.');
      return;
    }

    const respostas = {
      ...(inicial || {}),
      ...dadosDoPerfil(perfil),
      motivacao: form.motivacao.trim(),
      experiencias: form.experiencias.trim(),
      areas: form.areas,
      disponibilidade: form.disponibilidade,
      genero: form.genero,
      bolsistaProuni: paraBool(form.prouni),
      deOutraCidade: paraBool(form.outraCidade),
      requisitos: (requisitos || []).map((q) => ({ id: q.id, cumpre: Boolean(form.requisitos[q.id]) })),
      extras: limparExtras(perguntas, form.extras),
    };
    delete respostas.declaraPreRequisitos;
    Object.keys(respostas).forEach((chave) => respostas[chave] === undefined && delete respostas[chave]);

    setEnviando(true);
    setErroEnvio('');
    try {
      // Primeiro envio = cadastro (fica PENDENTE); na edição, só as respostas.
      const registro = editar
        ? await api.enviarCandidaturaPadrinho(email, respostas)
        : (await api.cadastrar({ ...dadosDoPerfil(perfil), email, tipoParticipacao: 'padrinho', respostas })).participacao;
      onEnviado?.(registro, respostas);
    } catch (error) {
      setErroEnvio(error.message || 'Não foi possível enviar sua candidatura. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="padrinho-form">
      <StepHeading
        step={editar ? null : 2}
        title={editar ? 'Editar candidatura' : 'Candidatura de padrinho'}
        subtitle={editar ? 'Atualize suas respostas. A coordenação verá a versão mais recente.' : 'Conte um pouco sobre você e por que deseja ser padrinho no Ajuda-aí.'}
        onBack={onVoltar}
      />

      <div className="match-notice prereq-box">
        <Icon name="info" size={19} />
        <div>
          <strong>Pré-requisitos para ser padrinho neste semestre</strong>
          <p>Estar a partir do 2º período{requisitos?.length ? ' e cumprir os requisitos definidos pela coordenação:' : '.'}</p>
          {requisitos === null && <p>Carregando requisitos do ciclo…</p>}
          {requisitos?.length === 0 && !erroRequisitos && <p>Este ciclo não exige disciplinas específicas.</p>}
          {erroRequisitos && <p className="error-message" role="alert">{erroRequisitos}</p>}
          {requisitos?.length > 0 && (
            <ul>
              {requisitos.map((q) => <li key={q.id}>{q.descricao}{q.obrigatorio ? '' : ' (desejável)'}</li>)}
            </ul>
          )}
          <p className="field-hint">Cumprir os requisitos não aprova a candidatura: a coordenação analisa cada caso.</p>
        </div>
      </div>

      <div className="field-grid detail-grid">
        <TextArea label="Por que você quer ser padrinho?" value={form.motivacao} onChange={(v) => atualizar('motivacao', v)} max={500} required placeholder="Conte sua motivação…" error={erros.motivacao} />
        <TextArea label="Experiências relevantes (opcional)" value={form.experiencias} onChange={(v) => atualizar('experiencias', v)} max={300} placeholder="Ex.: projetos, monitoria, voluntariado…" />
        <Field label="Áreas de interesse para apoiar" grupo labelId="areas-padrinho" error={erros.areas && 'Selecione pelo menos uma área.'}>
          <MultiSelect id="areas-padrinho-campo" ariaLabelledby="areas-padrinho" icon="tag" opcoes={AREAS_APOIO} valores={form.areas} onChange={(v) => atualizar('areas', v)} placeholder="Selecione uma ou mais áreas" erro={erros.areas} />
        </Field>
        <Field label="Disponibilidade de horários" grupo labelId="disp-padrinho" error={erros.disponibilidade && 'Selecione pelo menos um horário.'}>
          <MultiSelect id="disp-padrinho-campo" ariaLabelledby="disp-padrinho" icon="clock" opcoes={DISPONIBILIDADES} valores={form.disponibilidade} onChange={(v) => atualizar('disponibilidade', v)} placeholder="Selecione sua disponibilidade" erro={erros.disponibilidade} />
        </Field>
      </div>
      <div className="field-grid three-cols">
        <Field label="Gênero" icon="person" error={erros.genero}>
          <select value={form.genero} onChange={(e) => atualizar('genero', e.target.value)} aria-invalid={erros.genero || undefined}>
            <option value="">Selecione seu gênero</option>
            {GENEROS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="É bolsista ProUni?" icon="school" error={erros.prouni}>
          <select value={form.prouni} onChange={(e) => atualizar('prouni', e.target.value)} aria-invalid={erros.prouni || undefined}><option value="">Selecione uma opção</option><option>Sim</option><option>Não</option></select>
        </Field>
        <Field label="É de outra cidade?" icon="pin" error={erros.outraCidade}>
          <select value={form.outraCidade} onChange={(e) => atualizar('outraCidade', e.target.value)} aria-invalid={erros.outraCidade || undefined}><option value="">Selecione uma opção</option><option>Sim</option><option>Não</option></select>
        </Field>
      </div>

      <PerguntasAdicionais perguntas={perguntas} valores={form.extras} erros={erros.extras || {}} onChange={atualizarExtra} descricao="Perguntas definidas pela coordenação do programa." />

      {requisitos?.length > 0 && (
        <fieldset className="requisitos-declaracao">
          <legend>Declare sua situação em cada requisito</legend>
          {requisitos.map((q) => (
            <label key={q.id} className={`declare-check${erros.requisitos && q.obrigatorio && !form.requisitos[q.id] ? ' has-error' : ''}`}>
              <input
                type="checkbox"
                checked={Boolean(form.requisitos[q.id])}
                onChange={(e) => marcarRequisito(q.id, e.target.checked)}
                aria-required={q.obrigatorio || undefined}
                aria-invalid={(erros.requisitos && q.obrigatorio && !form.requisitos[q.id]) || undefined}
              />
              <span>Declaro que cumpro: <strong>{q.descricao}</strong>{q.obrigatorio ? '' : ' (desejável)'}</span>
            </label>
          ))}
          <p className="field-hint">A declaração é sua; a coordenação pode conferir antes de aprovar.</p>
        </fieldset>
      )}

      {erroEnvio && <p className="form-error" role="alert"><Icon name="alert" size={16} /> {erroEnvio}</p>}
      <button className="primary-button" type="submit" disabled={enviando} aria-busy={enviando}>
        {enviando ? 'Enviando…' : editar ? 'Salvar alterações' : 'Enviar candidatura'} <Icon name="arrow" size={18} />
      </button>
    </form>
  );
}
