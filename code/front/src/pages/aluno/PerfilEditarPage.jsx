import {useEffect, useState, useRef} from 'react';
import {useNavigate, useOutletContext} from 'react-router-dom';
import {api} from '../../api/client';
export default function PerfilEditarPage() {
  const {perfil, recarregar} = useOutletContext(); const navigate = useNavigate();
  const [dados, setDados] = useState(perfil); const [foto, setFoto] = useState(null);
  const [url, setUrl] = useState(null); const [erro, setErro] = useState(''); const [erroFoto, setErroFoto] = useState('');
  const [salvando, setSalvando] = useState(false); const trava = useRef(false);
  useEffect(() => {let ativo = true;
    api.perfilAluno().then(p => {if(ativo) setDados(p);}).catch(e => {if(ativo) setErro(e.message);});
    api.fotoAluno().then(f => {if(ativo) setUrl(f?.url);}).catch(e => {if(ativo) setErroFoto(e.message);});
    return () => {ativo = false;};
  }, []);
  async function salvar(e) {
    e.preventDefault(); if(trava.current) return; trava.current = true; setSalvando(true); setErro('');
    try {await api.atualizarPerfil({nome: dados.nome, curso: dados.curso, periodo: Number(dados.periodo), turno: dados.turno, interesses: dados.interesses});
      if(foto) {try {const f = await api.salvarFoto(foto); setUrl(f.url); setFoto(null); setErroFoto('');} catch(e) {setErroFoto(`Perfil salvo. Foto não salva: ${e.message}`); return;}}
      await recarregar(); navigate('/aluno/perfil');
    } catch(e) {setErro(e.message);} finally {trava.current = false; setSalvando(false);}
  }
  return <form onSubmit={salvar} className="form-card"><h1>Editar perfil</h1>
    {url ? <img src={url} width="80" height="80" alt="Foto de perfil" onError={() => {setUrl(null); setErroFoto('Foto indisponível.');}}/> : <p>Sem foto de perfil</p>}
    <label>Selecionar ou substituir foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFoto(e.target.files?.[0] || null)}/></label>
    {erroFoto && <p role="alert">{erroFoto}</p>}
    {['nome','curso','periodo','turno'].map(chave => <label key={chave}>{ {nome:'Nome', curso:'Curso', periodo:'Período', turno:'Turno'}[chave]}<input required value={dados[chave] ?? ''} type={chave === 'periodo' ? 'number' : 'text'} min={chave === 'periodo' ? 1 : undefined} onChange={e => setDados(p => ({...p,[chave]:e.target.value}))}/></label>)}
    <label>E-mail institucional<input disabled value={dados.email || ''}/></label>
    <label>Interesses (separados por vírgula)<input value={(dados.interesses || []).join(',')} onChange={e => setDados(p => ({...p,interesses:e.target.value.split(',')}))}/></label>
    {erro && <p role="alert">{erro}</p>}<button disabled={salvando}>Salvar perfil</button>
    <button type="button" disabled={salvando} onClick={() => navigate('/aluno/perfil')}>Voltar</button>
  </form>;
}
