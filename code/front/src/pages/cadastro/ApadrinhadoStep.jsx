import PreferenciaGenero from '../../components/PreferenciaGenero';
import Icon from '../../components/Icon';
import MultiSelect from '../../components/MultiSelect';
import PerguntasAdicionais from '../../components/PerguntasAdicionais';
import { AREAS_APOIO, DISPONIBILIDADES, Field, GENEROS, StepHeading, TextArea } from './partes';

export default function ApadrinhadoStep({ profile, errors, onUpdate, onToggle, onBack, onContinue, perguntas, onExtra }) {
  return (
    <form onSubmit={onContinue} noValidate>
      <StepHeading step={2} title="Conte sobre você" subtitle="Suas respostas ajudam a encontrar um padrinho compatível." onBack={onBack} />
      <div className="match-notice"><Icon name="info" size={19} /><div><strong>Como encontramos seu padrinho</strong><p>Comparamos suas respostas e interesses com os dos padrinhos. A coordenação confirma o match para você.</p></div></div>
      <div className="field-grid detail-grid">
        <Field label="Gênero" icon="person" error={errors.gender}>
          <select value={profile.gender} onChange={(event) => onUpdate('gender', event.target.value)} aria-invalid={errors.gender || undefined}>
            <option value="">Selecione</option>
            {GENEROS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <PreferenciaGenero valor={profile.preferenciaGenero} onChange={v => onUpdate('preferenciaGenero', v)} erro={errors.preferenciaGenero} />
        <Field label="É bolsista ProUni?" icon="school" error={errors.prouni}>
          <select value={profile.prouni} onChange={(event) => onUpdate('prouni', event.target.value)} aria-invalid={errors.prouni || undefined}><option value="">Selecione</option><option>Sim</option><option>Não</option></select>
        </Field>
        <Field label="É de outra cidade?" icon="pin" error={errors.otherCity}>
          <select value={profile.otherCity} onChange={(event) => onUpdate('otherCity', event.target.value)} aria-invalid={errors.otherCity || undefined}><option value="">Selecione</option><option>Sim</option><option>Não</option></select>
        </Field>
        <Field label="Disponibilidade de horários" grupo labelId="disp-apadrinhado" error={errors.availability && 'Selecione pelo menos um horário.'}>
          <MultiSelect
            id="disp-apadrinhado-campo"
            ariaLabelledby="disp-apadrinhado"
            icon="clock"
            opcoes={DISPONIBILIDADES}
            valores={profile.availability}
            onChange={(valor) => onUpdate('availability', valor)}
            placeholder="Selecione sua disponibilidade"
            erro={errors.availability}
          />
        </Field>
        <div className="field-wrap span-two">
          <span className="field-label" id="areas-apoio-label">Áreas em que gostaria de receber apoio</span>
          <div className={`area-options ${errors.supportAreas ? 'field-error' : ''}`} role="group" aria-labelledby="areas-apoio-label">
            {AREAS_APOIO.map((area) => {
              const ativa = profile.supportAreas.includes(area);
              return (
                <button type="button" key={area} aria-pressed={ativa} className={`area-chip ${ativa ? 'selected' : ''}`} onClick={() => onToggle('supportAreas', area)}>
                  {ativa && <Icon name="check" size={13} />}{area}
                </button>
              );
            })}
          </div>
          {errors.supportAreas && <span className="error-message" role="alert">Selecione pelo menos uma área.</span>}
        </div>
        <TextArea
          className="span-two"
          label="O que você espera do seu padrinho?"
          value={profile.expectation}
          onChange={(valor) => onUpdate('expectation', valor)}
          max={500}
          required
          placeholder="Ex.: ajuda na adaptação à universidade"
          error={errors.expectation}
        />
        <TextArea
          className="span-two"
          label="Outras informações (opcional)"
          value={profile.additionalInfo}
          onChange={(valor) => onUpdate('additionalInfo', valor)}
          max={300}
          placeholder="Algo mais que seu padrinho deveria saber?"
        />
      </div>
      <PerguntasAdicionais perguntas={perguntas} valores={profile.extras} erros={errors.extras || {}} onChange={onExtra} descricao="Perguntas definidas pela coordenação do programa." />
      <fieldset className={`requisitos-declaracao${errors.firstSemester ? ' has-error' : ''}`}>
        <legend>Identificação acadêmica</legend>
        <label className={`declare-check${errors.firstSemester ? ' has-error' : ''}`}>
          <input
            type="checkbox"
            checked={Boolean(profile.firstSemesterDeclaration)}
            onChange={(e) => onUpdate('firstSemesterDeclaration', e.target.checked)}
            aria-required
            aria-invalid={errors.firstSemester || undefined}
          />
          <span>Declaro que estou no <strong>1º período</strong> e que os dados acadêmicos informados (curso, período e e-mail institucional) estão corretos para verificação da coordenação.</span>
        </label>
        {errors.firstSemester && <p className="error-message" role="alert">Confirme a declaração de 1º período para continuar.</p>}
        <p className="field-hint">A coordenação pode conferir essas informações no sistema da faculdade antes de aprovar.</p>
      </fieldset>
      <button className="primary-button" type="submit">Continuar <Icon name="arrow" size={18} /></button>
    </form>
  );
}
