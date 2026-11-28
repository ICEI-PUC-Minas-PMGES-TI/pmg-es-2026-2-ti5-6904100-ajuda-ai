import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

const ELEGIBILIDADE = { todos: 'Todos', padrinho: 'Padrinhos', apadrinhado: 'Apadrinhados' };

function FormularioRegra({ regra, onSalvar, onFechar }) {
  const versao = regra?.versao;
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function salvar(evento) {
    evento.preventDefault();
    if (ocupado) return;
    const dados = new FormData(evento.currentTarget);
    const limite = dados.get('limiteRepeticoes');
    const corpo = {
      valorXp: Number(dados.get('valorXp')),
      elegibilidade: dados.get('elegibilidade'),
      limiteRepeticoes: limite === '' ? null : Number(limite),
      combinavelCom: dados.get('combinavelCom').split(',').map((acao) => acao.trim()).filter(Boolean),
    };
    setOcupado(true);
    setErro('');
    try {
      const salva = regra
        ? await api.editarRegraXp(regra.id, corpo)
        : await api.criarRegraXp({
          acao: dados.get('acao').trim(),
          programa: dados.get('programa').trim() || null,
          ...corpo,
        });
      onSalvar(salva);
    } catch (e) {
      setErro(e.motivo === 'acao-duplicada' ? 'Já existe uma regra ativa para esta ação neste ciclo.' : e.message);
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={regra ? `Editar ${regra.acao} · ${regra.programa ?? 'Todos os ciclos'}` : 'Nova regra de XP'}
      descricao={regra ? `Salvar cria a versão ${regra.versaoAtual + 1}.` : 'A regra começa inativa.'}
      onFechar={ocupado ? undefined : onFechar}>
      <form className="pucstop-form" onSubmit={salvar}>
        {!regra && <label>Ação<input name="acao" required maxLength={40} placeholder="ENCONTRO_REALIZADO" /></label>}
        {!regra && (
          <label>Ciclo
            <input name="programa" pattern="\d{4}/[12]" placeholder="Todos os ciclos (ex. 2026/2)" />
          </label>
        )}
        <label>Valor em XP<input name="valorXp" type="number" min={1} required defaultValue={versao?.valorXp} /></label>
        <label>Elegibilidade
          <select name="elegibilidade" defaultValue={versao?.elegibilidade ?? 'todos'}>
            {Object.entries(ELEGIBILIDADE).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </label>
        <label>Limite de repetições por ciclo
          <input name="limiteRepeticoes" type="number" min={1} defaultValue={versao?.limiteRepeticoes ?? ''} placeholder="Sem limite" />
        </label>
        <label>Ações combináveis, separadas por vírgula
          <input name="combinavelCom" defaultValue={versao?.combinavelCom.join(', ')} />
        </label>
        {erro && <p className="dash-inline-error" role="alert">{erro}</p>}
        <button className="mini-btn primary" type="submit" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar regra'}</button>
      </form>
    </Modal>
  );
}

export default function RegrasXpPage() {
  const [regras, setRegras] = useState(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const toast = useToast();

  const carregar = useCallback(async () => {
    setErro('');
    try { setRegras(await api.regrasXp()); }
    catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrir(regra, paraEditar) {
    setOcupado(true);
    setErro('');
    try {
      const detalhe = await api.regraXp(regra.id);
      if (paraEditar) setForm({ regra: detalhe });
      else setHistorico(detalhe);
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  async function alterarStatus(regra) {
    setOcupado(true);
    setErro('');
    try {
      const atual = await api.definirStatusRegraXp(regra.id, !regra.ativo);
      setRegras((lista) => lista.map((item) => item.id === atual.id ? atual : item));
      toast(atual.ativo ? 'Regra ativada.' : 'Regra desativada.', 'sucesso');
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  return (
    <section className="users-page">
      <header className="dash-header">
        <h1>Regras de XP</h1>
        <button type="button" className="mini-btn primary" onClick={() => setForm({})} disabled={ocupado}>Nova regra</button>
      </header>
      {erro && <div className="dash-inline-error" role="alert">{erro} <button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {!regras && !erro && <p role="status">Carregando regras…</p>}
      {regras?.length === 0 && <p className="empty-copy">Nenhuma regra cadastrada.</p>}
      {regras?.length > 0 && (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead><tr><th>Ação</th><th>Ciclo</th><th>Versão</th><th>XP</th><th>Elegibilidade</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{regras.map((regra) => (
              <tr key={regra.id}>
                <td data-label="Ação">{regra.acao}</td>
                <td data-label="Ciclo">{regra.programa ?? 'Todos'}</td>
                <td data-label="Versão">{regra.versaoAtual}</td>
                <td data-label="XP">{regra.versao.valorXp}</td>
                <td data-label="Elegibilidade">{ELEGIBILIDADE[regra.versao.elegibilidade]}</td>
                <td data-label="Status"><span className={`status-pill ${regra.ativo ? 'green' : 'muted'}`}>{regra.ativo ? 'Ativa' : 'Inativa'}</span></td>
                <td className="user-actions">
                  <button className="mini-btn" type="button" disabled={ocupado} onClick={() => abrir(regra, true)}>Editar</button>
                  <button className="mini-btn" type="button" disabled={ocupado} onClick={() => abrir(regra, false)}>Histórico</button>
                  <button className="mini-btn" type="button" disabled={ocupado} onClick={() => alterarStatus(regra)}>{regra.ativo ? 'Desativar' : 'Ativar'}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {form && <FormularioRegra regra={form.regra} onFechar={() => setForm(null)} onSalvar={() => {
        setForm(null);
        toast('Regra salva.', 'sucesso');
        carregar();
      }} />}
      {historico && (
        <Modal titulo={`Histórico de ${historico.acao}`} onFechar={() => setHistorico(null)}>
          <ul>
            {historico.versoes.map((v) => (
              <li key={v.id}>
                <strong>Versão {v.versao} · {v.valorXp} XP</strong>
                <p>{ELEGIBILIDADE[v.elegibilidade]} · {v.limiteRepeticoes ?? 'Sem limite de repetições'}</p>
                {v.combinavelCom.length > 0 && <p>Combinável com {v.combinavelCom.join(', ')}</p>}
                <p>{new Date(v.criadoEm).toLocaleString('pt-BR')} {v.criadoPor && `· ${v.criadoPor}`}</p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}
