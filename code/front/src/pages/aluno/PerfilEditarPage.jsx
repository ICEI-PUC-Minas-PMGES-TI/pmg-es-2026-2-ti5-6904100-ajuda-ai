import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import MenuSelect from '../../components/MenuSelect';
import { iniciaisDe } from '../../auth/sessaoAluno';
import { CURSOS, Field, INTERESSES, TURNOS } from '../cadastro/partes';
import { PageHeader } from './partes';

export default function PerfilEditarPage() {
  const { perfil, recarregar } = useOutletContext();
  const navigate = useNavigate();
  const [dados, setDados] = useState(perfil || {});
  const [foto, setFoto] = useState(null);
  const [previewLocal, setPreviewLocal] = useState(null);
  const [url, setUrl] = useState(null);
  const [erro, setErro] = useState('');
  const [erroFoto, setErroFoto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const inputFoto = useRef(null);

  useEffect(() => {
    let ativo = true;
    api.perfilAluno().then((p) => { if (ativo) setDados(p || {}); }).catch((e) => { if (ativo) setErro(e.message); });
    api.fotoAluno().then((f) => {
      if (!ativo) return;
      setUrl(f?.url || null);
      setErroFoto('');
    }).catch((e) => {
      if (!ativo) return;
      if (/Azure Blob Storage|AZURE_STORAGE/i.test(e.message || '')) {
        setUrl(null);
        setErroFoto('');
        return;
      }
      setErroFoto('Não foi possível carregar a foto agora.');
    });
    return () => { ativo = false; };
  }, []);

  useEffect(() => () => {
    if (previewLocal) URL.revokeObjectURL(previewLocal);
  }, [previewLocal]);

  const cursos = useMemo(() => {
    const atual = dados.curso;
    return atual && !CURSOS.includes(atual) ? [atual, ...CURSOS] : CURSOS;
  }, [dados.curso]);

  const fotoExibida = previewLocal || url;
  const interesses = Array.isArray(dados.interesses) ? dados.interesses : [];
  const disponiveis = INTERESSES.filter((item) => !interesses.includes(item));

  function alterar(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  function onFoto(e) {
    const file = e.target.files?.[0] || null;
    setFoto(file);
    if (previewLocal) URL.revokeObjectURL(previewLocal);
    setPreviewLocal(file ? URL.createObjectURL(file) : null);
  }

  function toggleInteresse(item) {
    setDados((prev) => {
      const lista = Array.isArray(prev.interesses) ? prev.interesses : [];
      return {
        ...prev,
        interesses: lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item],
      };
    });
  }

  async function salvar(e) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true;
    setSalvando(true);
    setErro('');
    try {
      await api.atualizarPerfil({
        nome: dados.nome,
        curso: dados.curso,
        periodo: Number(dados.periodo),
        turno: dados.turno,
        interesses: Array.isArray(dados.interesses) ? dados.interesses : [],
      });
      if (foto) {
        try {
          const f = await api.salvarFoto(foto);
          setUrl(f.url);
          setFoto(null);
          setErroFoto('');
        } catch (err) {
          if (/Azure Blob Storage|AZURE_STORAGE/i.test(err.message || '')) {
            setErroFoto('Dados salvos. O armazenamento de fotos não está disponível neste ambiente.');
          } else {
            setErroFoto(`Dados salvos. A foto não foi enviada: ${err.message}`);
          }
          return;
        }
      }
      await recarregar();
      navigate('/aluno/perfil');
    } catch (err) {
      setErro(err.message);
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <div className="aluno-page">
      <PageHeader
        titulo="Editar perfil"
        subtitulo="Como você aparece para a coordenação e para o seu grupo."
      />

      <form onSubmit={salvar} className="perfil-edit-card">
        <div className="perfil-edit-identity">
          <button
            type="button"
            className="perfil-edit-avatar-btn"
            onClick={() => inputFoto.current?.click()}
            aria-label={fotoExibida ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
          >
            <span className="perfil-edit-avatar">
              {fotoExibida
                ? (
                  <img
                    src={fotoExibida}
                    alt=""
                    onError={() => {
                      setUrl(null);
                      setPreviewLocal(null);
                      setErroFoto('Foto indisponível. Tente enviar novamente.');
                    }}
                  />
                )
                : iniciaisDe(dados.nome || 'Aluno')}
              <span className="camera-badge" aria-hidden="true"><Icon name="camera" size={14} /></span>
            </span>
          </button>
          <input
            ref={inputFoto}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onFoto}
          />
          <div className="perfil-edit-identity-copy">
            <h2>{dados.nome || 'Seu perfil'}</h2>
            <p>{dados.email || 'E-mail institucional'}</p>
            <div className="perfil-edit-photo-actions">
              <button type="button" className="ghost-button perfil-edit-photo-btn" onClick={() => inputFoto.current?.click()}>
                <Icon name="camera" size={16} />
                {fotoExibida ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              <p className="perfil-edit-photo-meta">* PNG, JPG ou WEBP</p>
            </div>
            {erroFoto && <p className="profile-foto-aviso" role="alert">{erroFoto}</p>}
          </div>
        </div>

        <div className="perfil-edit-body">
          <section className="perfil-edit-section" aria-labelledby="dados-pessoais-titulo">
            <h3 id="dados-pessoais-titulo">Dados pessoais</h3>
            <div className="field-grid perfil-edit-grid">
              <Field label="Nome completo" icon="person" className="perfil-edit-span-2">
                <input
                  required
                  value={dados.nome ?? ''}
                  onChange={(e) => alterar('nome', e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="E-mail institucional" icon="mail" className="perfil-edit-span-2">
                <input disabled value={dados.email || ''} />
              </Field>
            </div>
            <p className="perfil-edit-hint">O e-mail vem do login institucional e não pode ser alterado aqui.</p>
          </section>

          <section className="perfil-edit-section" aria-labelledby="dados-academicos-titulo">
            <h3 id="dados-academicos-titulo">Dados acadêmicos</h3>
            <div className="field-grid perfil-edit-grid">
              <MenuSelect
                className="perfil-edit-span-2"
                label="Curso"
                icon="school"
                required
                value={dados.curso || ''}
                options={cursos}
                placeholder="Selecione o curso"
                onChange={(curso) => alterar('curso', curso)}
              />
              <Field label="Período" icon="calendar">
                <input
                  required
                  type="number"
                  min={1}
                  max={20}
                  value={dados.periodo ?? ''}
                  onChange={(e) => alterar('periodo', e.target.value)}
                />
              </Field>
              <MenuSelect
                label="Turno"
                icon="moon"
                required
                value={dados.turno || ''}
                options={TURNOS}
                placeholder="Selecione"
                onChange={(turno) => alterar('turno', turno)}
              />
            </div>
          </section>

          <section className="perfil-edit-section" aria-labelledby="interesses-edit-label">
            <h3 id="interesses-edit-label">Interesses</h3>
            {interesses.length > 0 && (
              <ul className="perfil-edit-interest-list" aria-label="Interesses selecionados">
                {interesses.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => toggleInteresse(item)}
                      aria-label={`Remover ${item}`}
                    >
                      {item}<span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {disponiveis.length > 0 ? (
              <MenuSelect
                icon="tag"
                aria-label="Adicionar interesse"
                value=""
                options={disponiveis}
                placeholder="Adicionar interesse"
                onChange={(item) => toggleInteresse(item)}
              />
            ) : interesses.length === 0 ? (
              <p className="perfil-edit-interest-empty">Nenhum interesse disponível no momento.</p>
            ) : null}
            <p className="perfil-edit-hint">Escolha assuntos para combinar melhor com o seu grupo. Clique em um chip para remover.</p>
          </section>

          {erro && <p className="error-message" role="alert">{erro}</p>}

          <div className="perfil-edit-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={salvando}
              onClick={() => navigate('/aluno/perfil')}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
