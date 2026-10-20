import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import { iniciaisDe, rotuloPeriodo } from '../../auth/sessaoAluno';
import Icon from '../../components/Icon';
import { AVISO_MAPA, useToast } from '../../components/Toast';
import { EstadoCarregando, EstadoErro, PageHeader } from './partes';

export default function PerfilAlunoPage() {
  const { email, perfil, situacao, carregando, erro, recarregar, resolucao } = useOutletContext();
  const mostrarToast = useToast();
  const [historico, setHistorico] = useState(null);
  const [foto, setFoto] = useState(null);
  const [erroFoto, setErroFoto] = useState('');
  useEffect(() => {
    let ativo = true;
    api.fotoAluno().then(f => {if (ativo) {setFoto(f?.url || null); setErroFoto('');}})
      .catch(e => {if (ativo) setErroFoto(e.message);});
    return () => {ativo = false;};
  }, [email]);

  useEffect(() => {
    let ativo = true;
    api.historico(email).then((lista) => { if (ativo) setHistorico(lista); }).catch(() => { if (ativo) setHistorico(null); });
    return () => { ativo = false; };
  }, [email]);

  const tipo = situacao?.situacao;
  const temPadrinho = tipo === 'apadrinhado_ativo';
  const ehPadrinho = tipo === 'padrinho_ativo';
  const ehCandidato = ['candidatura_pendente', 'candidatura_em_analise', 'candidatura_rejeitada', 'candidatura_aprovada_aguardando_matching', 'padrinho_ativo'].includes(tipo);

  const acessos = [
    temPadrinho && { to: '/aluno/padrinho', icon: 'person', label: 'Meu padrinho' },
    ehPadrinho && { to: '/aluno/padrinho', icon: 'groups', label: 'Meus apadrinhados' },
    ehCandidato && { to: '/aluno/candidatura', icon: 'clipboard', label: 'Status da candidatura' },
    { to: '/aluno/historico', icon: 'history', label: 'Histórico de participação' },
    { acao: () => mostrarToast(AVISO_MAPA), icon: 'map', label: 'Explorar mapa' },
    { to: '/aluno/configuracoes', icon: 'settings', label: 'Configurações da conta' },
    { to: '/aluno/configuracoes#suporte', icon: 'help', label: 'Ajuda e suporte' },
  ].filter(Boolean);

  return (
    <div className="aluno-page">
      <PageHeader titulo="Meu perfil" subtitulo="Seu progresso, participação e principais informações.">
        <Link to="/aluno/configuracoes" className="icon-link" aria-label="Configurações"><Icon name="settings" size={22} /></Link>
      </PageHeader>

      <Link to="/aluno/perfil/editar" className="text-link">Editar perfil e foto</Link>
      <section className="profile-identity" aria-label="Seus dados">
        <span className="profile-avatar" aria-hidden="true">{foto ? <img src={foto} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} onError={() => {setFoto(null); setErroFoto('Foto indisponível. Abra a edição de perfil para tentar novamente.');}}/> : iniciaisDe(perfil.nome)}</span>
        <div className="profile-identity-copy">
          <h2>{perfil.nome}</h2>
          <p>{perfil.curso || 'Curso não informado'}</p>
          <p>{rotuloPeriodo(perfil.periodo)}{perfil.turno ? ` · ${perfil.turno}` : ''}</p>
          {perfil.interesses.length > 0 && (
            <ul className="interest-chips" aria-label="Interesses">
              {perfil.interesses.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      </section>

      {erroFoto && <p role="status">Foto: {erroFoto}</p>}
      {carregando && !situacao ? (
        <EstadoCarregando texto="Carregando sua situação no programa…" />
      ) : erro && !situacao ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : (
        <SituacaoCard dados={situacao} perfil={perfil} resolucao={resolucao} />
      )}

      <section className="aluno-section" aria-labelledby="jornada-titulo">
        <div className="section-head">
          <h2 id="jornada-titulo">Minha jornada</h2>
          <Link to="/aluno/historico" className="text-link">Ver histórico <Icon name="chevron" size={15} /></Link>
        </div>
        <div className="journey-grid">
          <JourneyTile icon="calendar" tom="blue" valor={historico ? historico.length : '—'} rotulo="Ciclos no programa" />
          <JourneyTile icon="groups" tom="purple" valor={ehPadrinho ? situacao.apadrinhados.length : temPadrinho ? 1 : 0} rotulo={ehPadrinho ? 'Apadrinhados' : 'Padrinho'} />
          <JourneyTile icon="chat" tom="green" valor={0} rotulo="Encontros realizados" />
          <JourneyTile icon="trophy" tom="orange" valor="—" rotulo="Missões concluídas" />
        </div>
      </section>

      <section className="aluno-section" aria-labelledby="acessos-titulo">
        <h2 id="acessos-titulo">Acessos rápidos</h2>
        <ul className="quick-links">
          {acessos.map((item) => (
            <li key={item.label}>
              {item.to ? (
                <Link to={item.to}><Icon name={item.icon} size={19} /><span>{item.label}</span><Icon name="chevron" size={16} /></Link>
              ) : (
                <button type="button" onClick={item.acao}><Icon name={item.icon} size={19} /><span>{item.label}</span><Icon name="chevron" size={16} /></button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="meanwhile-card" onClick={() => mostrarToast(AVISO_MAPA)}>
        <span className="meanwhile-icon" aria-hidden="true"><Icon name="map" size={24} /></span>
        <span>
          <small>ENQUANTO ISSO</small>
          <strong>Conheça as PUC Stops</strong>
        </span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
  );
}

function JourneyTile({ icon, tom, valor, rotulo }) {
  return (
    <div className={`journey-tile ${tom}`}>
      <span className="journey-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span><strong>{valor}</strong><small>{rotulo}</small></span>
    </div>
  );
}

function Meta({ icon, titulo, sub }) {
  return (
    <div className="status-meta-item">
      <span className="status-meta-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      <span><strong>{titulo}</strong>{sub && <small>{sub}</small>}</span>
    </div>
  );
}

function SituacaoCard({ dados, perfil, resolucao }) {
  const navigate = useNavigate();
  if (!dados) return null;
  const { situacao, programa, padrinho, apadrinhados, grupo } = dados;
  const programaMeta = <Meta icon="calendar" titulo={programa?.titulo || 'Programa'} sub="Período atual" />;

  if (situacao === 'apadrinhado_ativo') {
    return (
      <section className="status-card green" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="groups" size={30} /></span>
          <div><h2>Apadrinhado ativo</h2><p>Você já está vinculado(a) ao programa e pode conversar com seu padrinho.</p></div>
          <Link to="/aluno/padrinho" className="icon-link" aria-label="Ver meu padrinho"><Icon name="chevron" size={20} /></Link>
        </div>
        <div className="status-strip"><Icon name="person" size={18} /> Padrinho: <strong>{padrinho?.nome || 'a confirmar'}</strong></div>
        <div className="status-meta">
          <Meta icon="person" titulo="1" sub="Padrinho" />
          <Meta icon="trophy" titulo={grupo || '—'} sub="Seu grupo" />
          {programaMeta}
        </div>
      </section>
    );
  }

  if (resolucao?.candidatura) return <section className="status-card purple" aria-label="Situação no programa">
    <h2>{resolucao.titulo}</h2><p>{resolucao.descricao}</p>
    <p>Ciclo: {programa?.codigo}</p>{resolucao.justificativa && <p>Justificativa: {resolucao.justificativa}</p>}
    <Link to="/aluno/candidatura">Acompanhar status</Link>
  </section>;
  if (situacao === 'apadrinhado_pendente' || situacao === 'apadrinhado_rejeitado') {
    const rejeitado = situacao === 'apadrinhado_rejeitado';
    return (
      <section className={`status-card ${rejeitado ? 'pink' : 'purple'}`} aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name={rejeitado ? 'info' : 'clipboard'} size={30} /></span>
          <div>
            <h2>{rejeitado ? 'Cadastro não aprovado' : 'Cadastro em análise'}</h2>
            <p>{rejeitado
              ? `A coordenação não aprovou seu cadastro.${dados.cadastro?.motivoRejeicao ? ` Motivo: ${dados.cadastro.motivoRejeicao}` : ''}`
              : 'Recebemos seu cadastro de apadrinhado. Ele aguarda a aprovação da coordenação.'}</p>
          </div>
          <Link to="/aluno/candidatura" className="icon-link" aria-label="Ver status do cadastro"><Icon name="chevron" size={20} /></Link>
        </div>
        <div className="status-meta">
          {programaMeta}
          <Meta icon="clock" titulo={rejeitado ? 'Não aprovado' : 'Aguardando aprovação'} sub="Status" />
          <Meta icon="school" titulo={rotuloPeriodo(perfil.periodo)} sub="Seu semestre" />
        </div>
      </section>
    );
  }

  if (situacao === 'apadrinhado_aguardando') {
    return (
      <section className="status-card blue" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="userSearch" size={30} /></span>
          <div><h2>Aguardando padrinho</h2><p>Seu cadastro no programa foi concluído. Estamos buscando o melhor match para você.</p></div>
        </div>
        <div className="status-meta">
          {programaMeta}
          <Meta icon="search" titulo="Matching em andamento" />
          <Meta icon="school" titulo={rotuloPeriodo(perfil.periodo)} sub="Seu semestre" />
        </div>
      </section>
    );
  }

  if (situacao === 'padrinho_ativo') {
    return (
      <section className="status-card green" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="groups" size={30} /></span>
          <div><h2>Padrinho ativo</h2><p>{apadrinhados.length ? 'Sua candidatura foi aprovada e seu grupo já está formado.' : 'Sua candidatura foi aprovada! A coordenação está formando os grupos.'}</p></div>
          <Link to="/aluno/padrinho" className="icon-link" aria-label="Ver meus apadrinhados"><Icon name="chevron" size={20} /></Link>
        </div>
        {apadrinhados.length > 0 && (
          <ul className="status-people" aria-label="Seus apadrinhados">
            {apadrinhados.map((p) => (
              <li key={p.email}><span className="mini-avatar" aria-hidden="true">{p.iniciais}</span><span><strong>{p.nome}</strong><small>{p.curso}{p.periodo ? ` · ${p.periodo}º período` : ''}</small></span></li>
            ))}
          </ul>
        )}
        <div className="status-meta">
          <Meta icon="groups" titulo={String(apadrinhados.length)} sub="Apadrinhados" />
          <Meta icon="trophy" titulo={grupo || 'A definir'} sub="Seu grupo" />
          {programaMeta}
        </div>
      </section>
    );
  }

  if (situacao === 'candidatura_pendente' || situacao === 'candidatura_em_analise') {
    return (
      <section className="status-card purple" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="clipboard" size={30} /></span>
          <div><h2>Candidatura em análise</h2><p>{situacao === 'candidatura_pendente' ? 'Recebemos sua candidatura a padrinho. Ela entrará em análise pela coordenação.' : 'A coordenação está analisando sua candidatura a padrinho.'}</p></div>
          <Link to="/aluno/candidatura" className="icon-link" aria-label="Ver status da candidatura"><Icon name="chevron" size={20} /></Link>
        </div>
        <div className="status-meta">
          {programaMeta}
          <Meta icon="clock" titulo={situacao === 'candidatura_pendente' ? 'Enviada' : 'Em análise'} sub="Status" />
          <Meta icon="school" titulo={rotuloPeriodo(perfil.periodo)} sub="Seu semestre" />
        </div>
      </section>
    );
  }

  if (situacao === 'candidatura_rejeitada') {
    return (
      <section className="status-card pink" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="info" size={30} /></span>
          <div><h2>Candidatura não aprovada</h2><p>Neste ciclo sua candidatura não foi aprovada. Você continua com acesso aos comunicados e pode se candidatar no próximo ciclo.</p></div>
          <Link to="/aluno/candidatura" className="icon-link" aria-label="Ver detalhes da candidatura"><Icon name="chevron" size={20} /></Link>
        </div>
      </section>
    );
  }

  if (situacao === 'concluido') {
    return (
      <section className="status-card purple" aria-label="Situação no programa">
        <div className="status-card-head">
          <span className="status-card-icon" aria-hidden="true"><Icon name="checkCircle" size={30} /></span>
          <div><h2>Participação concluída</h2><p>Você concluiu sua jornada no {programa?.titulo}. Obrigado por fazer parte!</p></div>
        </div>
      </section>
    );
  }

  const periodo = Number(perfil.periodo) || 1;
  return (
    <section className="status-card neutral" aria-label="Situação no programa">
      <div className="status-card-head">
        <span className="status-card-icon" aria-hidden="true"><Icon name="compass" size={30} /></span>
        <div>
          <h2>Sem participação neste ciclo</h2>
          <p>
            {programa?.inscricoesAbertas
              ? `As inscrições do ${programa.titulo} estão abertas. Que tal participar?`
              : `Você ainda não participa do ${programa?.titulo || 'programa'}. Você pode enviar seu cadastro e a coordenação avalia conforme o calendário.`}
          </p>
        </div>
      </div>
      <div className="status-actions">
        {periodo > 1 ? (
          <button type="button" className="primary-button inline" disabled={!resolucao?.podePadrinho && !resolucao?.podeApadrinhado} onClick={() => navigate('/?passo=escolha')}>Quero ser padrinho <Icon name="arrow" size={17} /></button>
        ) : (
          <button type="button" className="primary-button inline" disabled={!resolucao?.podePadrinho && !resolucao?.podeApadrinhado} onClick={() => navigate('/?passo=escolha')}>Quero ser apadrinhado <Icon name="arrow" size={17} /></button>
        )}
        <button type="button" className="ghost-button" onClick={() => navigate('/?refazer=1')}>Atualizar meu perfil</button>
      </div>
    </section>
  );
}
