import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Avatar, DefinirPadrinho, ROTULO_SITUACAO_COORD, situacaoTom } from './comum';

const PAPEIS = [
  { valor: '', rotulo: 'Todos os papéis' },
  { valor: 'candidato', rotulo: 'Candidatos' },
  { valor: 'padrinho', rotulo: 'Padrinhos' },
  { valor: 'apadrinhado', rotulo: 'Apadrinhados' },
];

const ROTULO_PAPEL = { candidato: 'Candidato', padrinho: 'Padrinho', apadrinhado: 'Apadrinhado' };

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function UsuariosPage() {
  const [params, setParams] = useSearchParams();
  const programa = params.get('programa') || '';
  const papel = params.get('papel') || '';
  const situacao = params.get('situacao') || '';
  const mostrarToast = useToast();
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [vincular, setVincular] = useState(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setUsuarios(await api.usuarios(programa || undefined));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar os usuários.');
    }
  }, [programa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function filtrar(chave, valor) {
    const novos = new URLSearchParams(params);
    if (valor) novos.set(chave, valor);
    else novos.delete(chave);
    setParams(novos, { replace: true });
  }

  const padrinhos = useMemo(() => (usuarios || []).filter((u) => u.situacao === 'candidatura_aprovada_aguardando_matching' || u.situacao === 'padrinho_ativo'), [usuarios]);
  const situacoesPresentes = useMemo(() => Array.from(new Set((usuarios || []).map((u) => u.situacao))), [usuarios]);
  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (usuarios || []).filter((u) =>
      (!papel || u.papel === papel)
      && (!situacao || u.situacao === situacao)
      && (!termo || [u.nome, u.email, u.curso, u.grupo, u.periodo ? `${u.periodo}º` : ''].some((c) => normalizar(c).includes(termo))));
  }, [usuarios, papel, situacao, busca]);

  const contagem = useMemo(() => {
    const base = { candidato: 0, padrinho: 0, apadrinhado: 0, aguardando: 0 };
    (usuarios || []).forEach((u) => {
      base[u.papel] = (base[u.papel] || 0) + 1;
      if (u.situacao === 'apadrinhado_aguardando') base.aguardando += 1;
    });
    return base;
  }, [usuarios]);

  return (
    <section className="users-page">
      <header className="dash-header">
        <div>
          <h1>Usuários</h1>
          <p>Participantes do programa {usuarios?.[0]?.programa || programa || 'vigente'}: candidatos, padrinhos e apadrinhados.</p>
        </div>
      </header>

      <div className="users-summary">
        <button type="button" className={`summary-tile${papel === 'candidato' ? ' active' : ''}`} onClick={() => filtrar('papel', papel === 'candidato' ? '' : 'candidato')}><strong>{contagem.candidato}</strong><span>Candidatos</span></button>
        <button type="button" className={`summary-tile${papel === 'padrinho' ? ' active' : ''}`} onClick={() => filtrar('papel', papel === 'padrinho' ? '' : 'padrinho')}><strong>{contagem.padrinho}</strong><span>Padrinhos</span></button>
        <button type="button" className={`summary-tile${papel === 'apadrinhado' ? ' active' : ''}`} onClick={() => filtrar('papel', papel === 'apadrinhado' ? '' : 'apadrinhado')}><strong>{contagem.apadrinhado}</strong><span>Apadrinhados</span></button>
        <button type="button" className={`summary-tile warn${situacao === 'apadrinhado_aguardando' ? ' active' : ''}`} onClick={() => filtrar('situacao', situacao === 'apadrinhado_aguardando' ? '' : 'apadrinhado_aguardando')}><strong>{contagem.aguardando}</strong><span>Aguardando padrinho</span></button>
      </div>

      <div className="cand-tools users-tools">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">Buscar usuário</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, curso ou grupo…" />
        </label>
        <label className="filter-select">
          <Icon name="users" size={16} />
          <span className="sr-only">Filtrar por papel</span>
          <select value={papel} onChange={(e) => filtrar('papel', e.target.value)}>
            {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
        </label>
        <label className="filter-select">
          <Icon name="filter" size={16} />
          <span className="sr-only">Filtrar por situação</span>
          <select value={situacao} onChange={(e) => filtrar('situacao', e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(ROTULO_SITUACAO_COORD)
              .filter(([valor]) => situacoesPresentes.includes(valor) || valor === situacao)
              .map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </label>
      </div>

      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {!usuarios && !erro && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando usuários…</p></div>}
      {usuarios && lista.length === 0 && <p className="empty-copy">Nenhum usuário encontrado com estes filtros.</p>}

      {usuarios && lista.length > 0 && (
        <div className="users-table-wrap">
          <table className="users-table">
            <caption className="sr-only">Participantes do programa</caption>
            <thead>
              <tr>
                <th scope="col">Participante</th>
                <th scope="col">Curso</th>
                <th scope="col">Papel</th>
                <th scope="col">Situação</th>
                <th scope="col">Grupo</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td data-label="Participante">
                    <span className="user-cell">
                      <Avatar pessoa={u} />
                      <span><strong>{u.nome}</strong><small>{u.email}</small></span>
                    </span>
                  </td>
                  <td data-label="Curso">{u.curso}{u.periodo ? ` · ${u.periodo}º` : ''}</td>
                  <td data-label="Papel">{ROTULO_PAPEL[u.papel] || u.papel}{u.papel === 'padrinho' ? ` (${u.apadrinhados})` : ''}</td>
                  <td data-label="Situação"><span className={`status-pill ${situacaoTom(u.situacao)}`}>{ROTULO_SITUACAO_COORD[u.situacao] || u.situacao}</span></td>
                  <td data-label="Grupo">{u.grupo || '—'}</td>
                  <td className="user-actions">
                    {u.situacao === 'apadrinhado_aguardando' && (
                      <button type="button" className="mini-btn primary" onClick={() => setVincular(u)}><Icon name="link" size={14} /> Definir padrinho</button>
                    )}
                    {u.papel !== 'apadrinhado' && (
                      <Link className="mini-btn" to={`/coordenacao/candidaturas?${new URLSearchParams({ ...(programa ? { programa } : {}), ...(u.papel === 'padrinho' ? { status: 'aprovadas' } : {}), id: String(u.id) })}`}>
                        Ver candidatura
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vincular && (
        <Modal titulo="Definir padrinho" descricao={`${vincular.nome} · ${vincular.curso}`} onFechar={() => setVincular(null)}>
          <DefinirPadrinho
            apadrinhado={vincular}
            programa={vincular.programa}
            padrinhos={padrinhos}
            onVinculado={(res) => {
              setVincular(null);
              mostrarToast(`${res.apadrinhado?.nome || vincular.nome} vinculado(a) a ${res.padrinho?.nome} (${res.padrinho?.grupo || res.apadrinhado?.grupo}).`, 'sucesso');
              carregar();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
