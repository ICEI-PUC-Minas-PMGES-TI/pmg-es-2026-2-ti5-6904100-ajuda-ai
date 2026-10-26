import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { lerPreferencias, limparPreferencias, limparSessaoAluno, salvarPreferencias } from '../../auth/sessaoAluno';
import {clearAlunoSession} from '../../api/client';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import Toggle from '../../components/Toggle';
import { useToast } from '../../components/Toast';
import { PageHeader } from './partes';

const SECOES = [
  { id: 'notificacoes', icon: 'bell', titulo: 'Notificações e preferências' },
  { id: 'privacidade', icon: 'lock', titulo: 'Privacidade e visibilidade' },
  { id: 'apadrinhamento', icon: 'users', titulo: 'Apadrinhamento' },
  { id: 'aparencia', icon: 'eye', titulo: 'Aparência e acessibilidade' },
  { id: 'dados', icon: 'database', titulo: 'Dados e armazenamento' },
  { id: 'suporte', icon: 'compass', titulo: 'Suporte' },
];

const ROTULOS_SITUACAO = {
  nenhuma: 'Sem participação neste ciclo',
  candidatura_pendente: 'Candidatura a padrinho enviada',
  candidatura_em_analise: 'Candidatura a padrinho em análise',
  candidatura_rejeitada: 'Candidatura a padrinho não aprovada',
  candidatura_aprovada_aguardando_matching: 'Candidatura aprovada aguardando definição do grupo',
  apadrinhado_pendente: 'Cadastro aguardando aprovação',
  apadrinhado_rejeitado: 'Cadastro não aprovado',
  padrinho_ativo: 'Padrinho ativo',
  apadrinhado_aguardando: 'Apadrinhado aguardando padrinho',
  apadrinhado_ativo: 'Apadrinhado com padrinho definido',
  concluido: 'Participação concluída',
};

const FAQ = [
  { p: 'Como funciona o match com o padrinho?', r: 'A coordenação compara as respostas do cadastro (curso, interesses, disponibilidade e áreas de apoio) e confirma o vínculo durante a formação dos grupos.' },
  { p: 'Quem pode ser padrinho?', r: 'Alunos a partir do 2º período que cumpram os requisitos definidos pela coordenação para o semestre (exibidos no formulário de candidatura). A candidatura passa pela análise da coordenação.' },
  { p: 'Posso editar minha candidatura?', r: 'Revise e edite antes de confirmar o envio. Após o envio, as respostas ficam registradas e não podem ser editadas.' },
  { p: 'Onde fica o mapa do campus?', r: 'O mapa e as PUC Stops ficam no app Mapa da PUC, que está em desenvolvimento.' },
];

function Secao({ id, icon, titulo, children }) {
  return (
    <section id={id} className="settings-section" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}><Icon name={icon} size={20} /> {titulo}</h2>
      <div className="settings-body">{children}</div>
    </section>
  );
}

export default function ConfiguracoesAlunoPage() {
  const { email, situacao } = useOutletContext();
  const [prefs, setPrefs] = useState(() => lerPreferencias());
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mostrarToast = useToast();

  useEffect(() => {
    if (!location.hash) return;
    const alvo = document.getElementById(location.hash.slice(1));
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  function alterar(chave, valor) {
    const novas = { ...prefs, [chave]: valor };
    setPrefs(novas);
    salvarPreferencias(novas);
  }

  function limparTudo() {
    clearAlunoSession();
    limparSessaoAluno();
    limparPreferencias();
    try {
      localStorage.removeItem('ajudaai.aluno.avisosVistos');
    } catch {
      /* ignore */
    }
    setConfirmarLimpeza(false);
    mostrarToast('Dados locais removidos deste navegador.');
    navigate('/login', { replace: true });
  }

  return (
    <div className="aluno-page">
      <PageHeader titulo="Configurações" subtitulo="Preferências salvas neste navegador." />
      <div className="settings-layout">
        <nav className="settings-index" aria-label="Seções das configurações">
          <ul>
            {SECOES.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); navigate(`#${s.id}`, { replace: true }); }}><Icon name={s.icon} size={19} /> {s.titulo}</a></li>
            ))}
          </ul>
        </nav>

        <div className="settings-sections">
          <Secao {...SECOES[0]}>
            <Toggle label="Notificações no app" descricao="Mostra o contador de novidades no sino." checked={prefs.notificacoesApp} onChange={(v) => alterar('notificacoesApp', v)} />
            <Toggle label="Resumo semanal por e-mail" descricao="Receba um resumo dos comunicados do programa." checked={prefs.resumoEmail} onChange={(v) => alterar('resumoEmail', v)} />
            <Toggle label="Lembretes de encontros" descricao="Avisos antes dos encontros do seu grupo." checked={prefs.lembretesEncontros} onChange={(v) => alterar('lembretesEncontros', v)} />
          </Secao>

          <Secao {...SECOES[1]}>
            <Toggle label="Perfil visível para meu grupo" descricao="Seu padrinho ou apadrinhados veem seu nome e interesses." checked={prefs.perfilVisivelGrupo} onChange={(v) => alterar('perfilVisivelGrupo', v)} />
            <Toggle label="Mostrar curso e período" checked={prefs.mostrarCurso} onChange={(v) => alterar('mostrarCurso', v)} />
            <p className="settings-note"><Icon name="info" size={16} /> As respostas do cadastro são vistas apenas pela coordenação do programa.</p>
          </Secao>

          <Secao {...SECOES[2]}>
            <dl className="settings-facts">
              <div><dt>Situação atual</dt><dd>{ROTULOS_SITUACAO[situacao?.situacao] || 'Carregando…'}</dd></div>
              <div><dt>Programa</dt><dd>{situacao?.programa?.titulo || '—'}{situacao?.programa?.statusRotulo ? ` · ${situacao.programa.statusRotulo}` : ''}</dd></div>
              <div><dt>Grupo</dt><dd>{situacao?.grupo || 'Sem grupo'}</dd></div>
              {situacao?.padrinho && <div><dt>Padrinho</dt><dd>{situacao.padrinho.nome}</dd></div>}
            </dl>
            <div className="settings-actions">
              <Link className="ghost-button" to="/aluno/candidatura">Ver status</Link>
              {situacao?.situacao === 'nenhuma' && <Link className="ghost-button" to="/?passo=escolha">Quero participar</Link>}
            </div>
          </Secao>

          <Secao {...SECOES[3]}>
            <Toggle label="Fonte maior" descricao="Aumenta o tamanho dos textos." checked={prefs.fonteMaior} onChange={(v) => alterar('fonteMaior', v)} />
            <Toggle label="Alto contraste" descricao="Reforça cores de textos e bordas." checked={prefs.altoContraste} onChange={(v) => alterar('altoContraste', v)} />
            <Toggle label="Reduzir animações" checked={prefs.reduzirAnimacoes} onChange={(v) => alterar('reduzirAnimacoes', v)} />
          </Secao>

          <Secao {...SECOES[4]}>
            <dl className="settings-facts">
              <div><dt>E-mail institucional</dt><dd>{email}</dd></div>
              <div><dt>Onde ficam seus dados</dt><dd>Cadastro no servidor do programa; preferências apenas neste navegador.</dd></div>
            </dl>
            <div className="settings-actions">
              <button type="button" className="ghost-button" onClick={() => navigate('/?refazer=1')}><Icon name="refresh" size={17} /> Refazer cadastro</button>
              <button type="button" className="ghost-button danger" onClick={() => setConfirmarLimpeza(true)}><Icon name="trash" size={17} /> Limpar dados locais</button>
            </div>
          </Secao>

          <Secao {...SECOES[5]}>
            <div className="faq">
              {FAQ.map((item) => (
                <details key={item.p}>
                  <summary>{item.p}</summary>
                  <p>{item.r}</p>
                </details>
              ))}
            </div>
            <div className="contact-card">
              <Icon name="mail" size={20} />
              <div>
                <strong>Coordenação do programa</strong>
                <span>Renata — <a href="mailto:renata@pucminas.edu.br">renata@pucminas.edu.br</a></span>
              </div>
            </div>
          </Secao>
        </div>
      </div>

      {confirmarLimpeza && (
        <Modal
          titulo="Limpar dados locais?"
          descricao="Sua sessão e preferências serão removidas deste navegador. O cadastro enviado ao programa continua salvo."
          onFechar={() => setConfirmarLimpeza(false)}
          acoes={(
            <>
              <button type="button" className="ghost-button" onClick={() => setConfirmarLimpeza(false)} data-autofocus>Cancelar</button>
              <button type="button" className="danger-button" onClick={limparTudo}>Limpar dados</button>
            </>
          )}
        />
      )}
    </div>
  );
}
