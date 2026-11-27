import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Avatar } from './comum';

const FUNCIONALIDADES = { mapa: 'Mapa', chats: 'Chats' };
const PAPEIS = { candidato: 'Candidato', padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };

export default function AlunosPage() {
  const [busca, setBusca] = useState('');
  const [alunos, setAlunos] = useState(null);
  const [erro, setErro] = useState('');
  const [erroDetalhe, setErroDetalhe] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let atual = true;
    const timer = setTimeout(async () => {
      setErro('');
      try {
        const lista = await api.alunos(busca.trim());
        if (atual) setAlunos(lista);
      } catch (e) {
        if (atual) setErro(e.message);
      }
    }, busca ? 250 : 0);
    return () => { atual = false; clearTimeout(timer); };
  }, [busca, tentativa]);

  async function abrir(id) {
    setOcupado(true);
    setErro('');
    setErroDetalhe('');
    try { setDetalhe(await api.aluno(id)); }
    catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  async function alterar(funcionalidade, revogar) {
    setOcupado(true);
    setErroDetalhe('');
    try {
      const atualizado = revogar
        ? await api.revogarDelegacao(detalhe.id, funcionalidade)
        : await api.concederDelegacao(detalhe.id, funcionalidade);
      setDetalhe(atualizado);
      setAlunos((lista) => lista.map((aluno) => aluno.id === atualizado.id ? atualizado : aluno));
      setTentativa((valor) => valor + 1);
      toast(revogar ? 'Delegação revogada.' : 'Delegação concedida.', 'sucesso');
    } catch (e) {
      setErroDetalhe(e.motivo === 'ja-delegado' ? 'Esta delegação já está ativa.' : e.message);
    } finally { setOcupado(false); }
  }

  return (
    <section className="users-page">
      <header className="dash-header"><h1>Alunos</h1></header>
      <div className="users-tools">
        <label className="search-field">
          <span className="sr-only">Buscar aluno</span>
          <input type="search" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>
      {erro && <div className="dash-inline-error" role="alert">{erro} <button type="button" onClick={() => setTentativa(tentativa + 1)}>Tentar novamente</button></div>}
      {!alunos && !erro && <p role="status">Carregando alunos…</p>}
      {alunos?.length === 0 && <p className="empty-copy">Nenhum aluno encontrado.</p>}
      {alunos?.length > 0 && (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead><tr><th>Aluno</th><th>Papel</th><th>Participação vigente</th><th>Delegações</th><th>Ações</th></tr></thead>
            <tbody>{alunos.map((aluno) => (
              <tr key={aluno.id}>
                <td data-label="Aluno"><span className="user-cell"><Avatar pessoa={aluno} /><span><strong>{aluno.nome}</strong><small>{aluno.email}</small></span></span></td>
                <td data-label="Papel">{PAPEIS[aluno.participacaoAtual?.papel] ?? '—'}</td>
                <td data-label="Participação">{aluno.participacaoAtual?.status.replaceAll('_', ' ') ?? 'Sem participação vigente'}</td>
                <td data-label="Delegações">
                  {aluno.delegacoes.length === 0 ? '—' : aluno.delegacoes.map((f) => <span className="status-pill green" key={f}>{FUNCIONALIDADES[f]}</span>)}
                </td>
                <td className="user-actions"><button className="mini-btn" type="button" disabled={ocupado} onClick={() => abrir(aluno.id)}>Gerenciar</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {detalhe && (
        <Modal titulo={detalhe.nome} descricao={detalhe.email} onFechar={ocupado ? undefined : () => setDetalhe(null)}>
          {Object.entries(FUNCIONALIDADES).map(([funcionalidade, rotulo]) => {
            const concedida = detalhe.delegacoes.includes(funcionalidade);
            return <p key={funcionalidade}>
              <button className={`mini-btn ${concedida ? 'danger' : 'primary'}`} type="button" disabled={ocupado}
                onClick={() => alterar(funcionalidade, concedida)}>{concedida ? 'Revogar' : 'Conceder'} {rotulo}</button>
            </p>;
          })}
          {erroDetalhe && <p className="dash-inline-error" role="alert">{erroDetalhe}</p>}
          <h3>Histórico de delegações</h3>
          {detalhe.historicoDelegacoes.length === 0 && <p>Nenhuma delegação registrada.</p>}
          <ul>{detalhe.historicoDelegacoes.map((d) => (
            <li key={d.id}>
              <strong>{FUNCIONALIDADES[d.funcionalidade]}</strong>
              <p>Concedida por {d.concedidoPor} em {new Date(d.concedidoEm).toLocaleString('pt-BR')}</p>
              {d.revogadoEm && <p>Revogada por {d.revogadoPor} em {new Date(d.revogadoEm).toLocaleString('pt-BR')}</p>}
            </li>
          ))}</ul>
        </Modal>
      )}
    </section>
  );
}
