import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { EstadoCarregando, EstadoErro, EstadoVazio, PageHeader } from './partes';
import { formatarDataHora } from './util';

function etapa(programa, id) {
  return programa?.etapas?.find((e) => e.id === id) || null;
}

function passosCandidatura(dados) {
  const { registro, programa } = dados;
  const aprovado = registro.papel === 'padrinho';
  const rejeitado = registro.status === 'nao_aprovado';
  const andamento = etapa(programa, 'andamento');
  const atividadesComecaram = andamento && andamento.estado !== 'futura';
  return [
    { titulo: 'Candidatura enviada', texto: formatarDataHora(registro.criadoEm), estado: 'concluida' },
    aprovado || rejeitado
      ? { titulo: 'Em análise', texto: 'Análise concluída pela coordenação.', estado: 'concluida' }
      : registro.status === 'em_analise'
        ? { titulo: 'Em análise', texto: 'Nossa equipe está analisando suas informações.', estado: 'atual' }
        : { titulo: 'Em análise', texto: 'Sua candidatura foi recebida e aguarda o início da análise.', estado: 'atual' },
    aprovado
      ? { titulo: 'Resultado', texto: `Candidatura aprovada! Você é padrinho(a) no ${programa.titulo}.`, estado: 'concluida' }
      : rejeitado
        ? { titulo: 'Resultado', texto: 'Sua candidatura não foi aprovada neste ciclo.', estado: 'recusada' }
        : { titulo: 'Resultado', texto: 'Você será notificado aqui e no aplicativo.', estado: 'futura' },
    rejeitado
      ? { titulo: 'Início das atividades', texto: 'Você poderá se candidatar novamente no próximo ciclo.', estado: 'futura' }
      : aprovado
        ? {
            titulo: 'Início das atividades',
            texto: atividadesComecaram ? 'Atividades do programa em andamento.' : `Previsto para ${andamento?.periodoTexto || 'o calendário do programa'}. Você receberá orientações para começar.`,
            estado: atividadesComecaram ? 'concluida' : 'atual',
          }
        : { titulo: 'Início das atividades', texto: 'Após a aprovação, você receberá orientações para começar.', estado: 'futura' },
  ];
}

function passosApadrinhado(dados) {
  const { registro, programa, padrinho, grupo } = dados;
  const formacao = etapa(programa, 'formacao');
  const andamento = etapa(programa, 'andamento');
  const atividadesComecaram = andamento && andamento.estado !== 'futura';
  return [
    { titulo: 'Cadastro enviado', texto: formatarDataHora(registro.criadoEm), estado: 'concluida' },
    grupo
      ? { titulo: 'Formação dos grupos', texto: `Você faz parte do ${grupo}.`, estado: 'concluida' }
      : { titulo: 'Formação dos grupos', texto: `A coordenação está formando os grupos (${formacao?.periodoTexto || 'conforme o calendário'}).`, estado: 'atual' },
    grupo
      ? { titulo: 'Padrinho definido', texto: padrinho ? `Seu padrinho é ${padrinho.nome}.` : 'Seu padrinho foi definido.', estado: 'concluida' }
      : { titulo: 'Padrinho definido', texto: 'Você será notificado aqui assim que o match for confirmado.', estado: 'futura' },
    {
      titulo: 'Início das atividades',
      texto: atividadesComecaram ? 'Atividades do programa em andamento.' : `Previsto para ${andamento?.periodoTexto || 'o calendário do programa'}.`,
      estado: grupo ? (atividadesComecaram ? 'concluida' : 'atual') : 'futura',
    },
  ];
}

export default function StatusCandidaturaPage() {
  const { situacao: dados, carregando, erro, recarregar } = useOutletContext();
  const navigate = useNavigate();

  if (carregando && !dados) return <EstadoCarregando texto="Carregando sua candidatura…" />;
  if (erro && !dados) return <EstadoErro mensagem={erro} onTentar={recarregar} />;

  const registro = dados?.registro;
  const ehApadrinhado = registro?.papel === 'apadrinhado';
  const titulo = ehApadrinhado ? 'Status do cadastro' : 'Status da candidatura';

  if (!registro) {
    return (
      <div className="aluno-page">
        <PageHeader titulo="Status da candidatura" subtitulo="Acompanhe as etapas da sua participação no programa." />
        <EstadoVazio icon="clipboard" titulo="Você ainda não enviou uma candidatura" texto={`Para participar do ${dados?.programa?.titulo || 'programa'}, escolha como quer participar.`}>
          <button type="button" className="primary-button inline" onClick={() => navigate('/?passo=escolha')}>Quero participar <Icon name="arrow" size={17} /></button>
        </EstadoVazio>
      </div>
    );
  }

  const passos = ehApadrinhado ? passosApadrinhado(dados) : passosCandidatura(dados);
  const editavel = registro.papel === 'candidato' && ['pendente', 'em_analise'].includes(registro.status);
  const analise = etapa(dados.programa, 'analise');
  const formacao = etapa(dados.programa, 'formacao');

  return (
    <div className="aluno-page">
      <PageHeader
        titulo={titulo}
        subtitulo={ehApadrinhado ? 'Acompanhe as etapas até a definição do seu padrinho.' : 'Acompanhe as etapas da análise da sua candidatura para ser padrinho(a).'}
      />
      <div className="status-layout">
        <section className="timeline-card" aria-label="Etapas">
          <ol className="timeline">
            {passos.map((passo) => (
              <li key={passo.titulo} className={`timeline-item ${passo.estado}`}>
                <span className="timeline-marker" aria-hidden="true">
                  {passo.estado === 'concluida' && <Icon name="check" size={16} />}
                  {passo.estado === 'recusada' && <Icon name="close" size={15} />}
                </span>
                <div>
                  <strong>{passo.titulo}<span className="sr-only"> — {{ concluida: 'concluída', atual: 'etapa atual', futura: 'próxima etapa', recusada: 'não aprovada' }[passo.estado]}</span></strong>
                  <p>{passo.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="deadline-box">
            <Icon name="info" size={22} />
            <div>
              <strong>{ehApadrinhado ? 'Formação dos grupos' : 'Prazo de análise'}</strong>
              <p>
                {ehApadrinhado
                  ? `Os grupos são formados de ${formacao?.periodoTexto || 'acordo com o calendário do programa'}. Você receberá um aviso assim que houver atualização.`
                  : `A análise das candidaturas acontece de ${analise?.periodoTexto || 'acordo com o calendário do programa'}. Você receberá um aviso assim que houver atualização.`}
              </p>
            </div>
          </div>
          {editavel && (
            <button type="button" className="outline-button" onClick={() => navigate('/aluno/candidatura/editar')}>
              <Icon name="edit" size={18} /> Editar candidatura
            </button>
          )}
        </section>

        <aside className="status-aside">
          <div className="thanks-card">
            <img src="/images/perfilcheck.png" alt="" />
            <h2>{ehApadrinhado ? 'Que bom ter você aqui!' : 'Obrigado por se candidatar!'}</h2>
            <p>{ehApadrinhado ? 'Em breve você terá alguém para te acompanhar na PUC Minas.' : 'Sua iniciativa faz a diferença na jornada de novos alunos da PUC Minas.'}</p>
          </div>
          <div className="help-card">
            <span className="help-icon" aria-hidden="true"><Icon name="help" size={22} /></span>
            <div>
              <strong>Dúvidas?</strong>
              <p>Acesse a central de ajuda ou entre em contato com a coordenação do programa.</p>
              <Link to="/aluno/configuracoes#suporte" className="text-link">Acessar ajuda <Icon name="arrow" size={15} /></Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
