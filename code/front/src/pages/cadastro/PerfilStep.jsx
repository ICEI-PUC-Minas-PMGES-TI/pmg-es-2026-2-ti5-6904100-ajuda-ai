import { useState } from 'react';
import Icon from '../../components/Icon';
import { CURSOS, Field, INTERESSES, PERIODOS, StepHeading, TURNOS } from './partes';

export default function PerfilStep({ profile, photo, errors, onUpdate, onToggle, onPhoto, onContinue, aviso }) {
  const [interestToAdd, setInterestToAdd] = useState('');
  const availableInterests = INTERESSES.filter((item) => !profile.interests.includes(item));
  const cursos = CURSOS.includes(profile.course) ? CURSOS : [profile.course, ...CURSOS];

  function addInterest(event) {
    const value = event.target.value;
    setInterestToAdd('');
    if (value) onToggle('interests', value);
  }

  return (
    <form onSubmit={onContinue} noValidate>
      <StepHeading step={1} title="Complete seu perfil" subtitle="Essas informações serão usadas para personalizar sua experiência no Ajuda-aí e conectar você a oportunidades, pessoas e conteúdos relevantes." />

      {aviso}

      <div className="profile-intro-row">
        <label className="photo-picker">
          <input type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPhoto(URL.createObjectURL(file));
          }} />
          <span className="photo-circle">
            {photo ? <img src={photo} alt="Foto de perfil" /> : <Icon name="person" size={37} />}
            <span className="camera-badge"><Icon name="camera" size={14} /></span>
          </span>
          <span className="photo-link">Adicionar foto</span>
        </label>
        <div className="photo-tip"><Icon name="info" size={18} /><span>Uma boa foto ajuda outras pessoas a te reconhecerem no Ajuda-aí.</span></div>
      </div>

      <div className="field-grid">
        <Field label="Nome completo" icon="person" error={errors.name}>
          <input value={profile.name} onChange={(event) => onUpdate('name', event.target.value)} placeholder="Seu nome completo" autoComplete="name" required />
        </Field>
        <Field label="E-mail institucional" icon="mail">
          <input value={profile.email} disabled />
        </Field>
        <Field label="Curso" icon="school">
          <select value={profile.course} onChange={(event) => onUpdate('course', event.target.value)}>
            {cursos.map((course) => <option key={course}>{course}</option>)}
          </select>
        </Field>
        <Field label="Período atual" icon="chart">
          <select value={profile.period} onChange={(event) => onUpdate('period', event.target.value)}>
            {PERIODOS.map((period) => <option key={period}>{period}</option>)}
          </select>
        </Field>
        <Field label="Turno" icon="moon">
          <select value={profile.shift} onChange={(event) => onUpdate('shift', event.target.value)}>
            {TURNOS.map((shift) => <option key={shift}>{shift}</option>)}
          </select>
        </Field>
        <div className="field-wrap interest-field">
          <span className="field-label" id="interesses-label">Interesses (opcional)</span>
          <div className="field interest-control">
            <Icon name="tag" size={17} />
            <div className="chips">
              {profile.interests.map((item) => (
                <button type="button" key={item} className="chip" onClick={() => onToggle('interests', item)} aria-label={`Remover interesse ${item}`}>
                  {item}<span aria-hidden="true">×</span>
                </button>
              ))}
              {availableInterests.length > 0 && (
                <select aria-label="Adicionar interesse" value={interestToAdd} onChange={addInterest}>
                  <option value="">Adicionar assunto</option>
                  {availableInterests.map((item) => <option key={item}>{item}</option>)}
                </select>
              )}
            </div>
            <span className="select-chevron" aria-hidden="true">⌄</span>
          </div>
          <span className="field-hint">Selecione assuntos que você gosta ou tem interesse.</span>
        </div>
      </div>

      <button className="primary-button" type="submit">Continuar <Icon name="arrow" size={18} /></button>
    </form>
  );
}
