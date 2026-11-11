import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {resolverAluno} from '../../auth/resolverAluno';
import Icon from '../../components/Icon';
import { EstadoCarregando, EstadoErro, EstadoVazio, PageHeader } from './partes';
import { formatarDataHora } from './util';

const TIMELINE_KEY = 'ajudaai.aluno.timelineEtapa';

function chaveTimeline(email, programa, situacao) {
  return `${email || ''}::${programa || ''}::${situacao || ''}`;
}

function progressoTimeline(passos) {
  const atual = passos.findIndex((p) => p.estado === 'atual' || p.estado === 'recusada');
  if (atual >= 0) return atual;
  return passos.filter((p) => p.estado === 'concluida').length;
}

function etapa(programa, id) {
  return programa?.etapas?.find((e) => e.id === id) || null;
}

function passosCandidatura(dados) {
  const { registro, programa } = dados;
  const aprovado = ['candidatura_aprovada_aguardando_matching', 'padrinho_ativo', 'concluido'].includes(dados.situacao);
  const rejeitado = registro.status === 'nao_aprovado';
  const andamento = etapa(programa, 'andamento');
  const atividadesComecaram = dados.situacao === 'padrinho_ativo';
  return [
    { titulo: 'Candidatura enviada', texto: formatarDataHora(registro.criadoEm), estado: 'concluida' },
    aprovado || rejeitado
      ? { titulo: 'Em análise', texto: 'Análise concluída pela coordenação.', estado: 'concluida' }
      : registro.status === 'em_analise'
        ? { titulo: 'Em análise', texto: 'Nossa equipe está analisando suas informações.', estado: 'atual' }
        : { titulo: 'Candidatura recebida', texto: 'Sua candidatura foi recebida e aguarda o início da análise.', estado: 'atual' },
    aprovado
      ? { titulo: 'Resultado', texto: dados.situacao === 'padrinho_ativo' ? 'Candidatura aprovada e vínculo confirmado.' : 'Candidatura aprovada. Aguardando definição do seu grupo.', estado: 'concluida' }
      : rejeitado
        ? { titulo: 'Resultado', texto: `Candidatura não aprovada neste ciclo. Justificativa: ${resolverAluno(null, dados).justificativa || 'Não informada no registro legado.'}`, estado: 'recusada' }
        : { titulo: 'Resultado', texto: 'Você será notificado aqui e no aplicativo.', estado: 'futura' },
    rejeitado
      ? { titulo: 'Início das atividades', texto: 'Você poderá se candidatar novamente no próximo ciclo.', estado: 'futura' }
      : aprovado
        ? {
            titulo: 'Início das atividades',
            texto: atividadesComecaram ? 'Vínculo confirmado. Atividades do programa liberadas.' : 'Aguardando definição do seu grupo.',
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
  const pendente = registro.status === 'pendente';
  const rejeitado = registro.status === 'nao_aprovado';
  const aprovacao = rejeitado
    ? { titulo: 'Aprovação do cadastro', texto: `Seu cadastro não foi aprovado pela coordenação.${dados.cadastro?.motivoRejeicao ? ` Motivo: ${dados.cadastro.motivoRejeicao}` : ''}`, estado: 'recusada' }
    : pendente
      ? { titulo: 'Aprovação do cadastro', texto: 'A coordenação está analisando seu cadastro.', estado: 'atual' }
      : { titulo: 'Aprovação do cadastro', texto: 'Cadastro aprovado — aguardando matching.', estado: 'concluida' };
  if (pendente || rejeitado) {
    return [
      { titulo: 'Cadastro enviado', texto: formatarDataHora(registro.criadoEm), estado: 'concluida' },
      aprovacao,
      { titulo: 'Formação dos grupos', texto: rejeitado ? 'Sem participação neste ciclo.' : 'Começa depois da aprovação do cadastro.', estado: 'futura' },
      { titulo: 'Padrinho definido', texto: 'Você será notificado aqui assim que o match for confirmado.', estado: 'futura' },
    ];
  }
  return [
    { titulo: 'Cadastro enviado', texto: formatarDataHora(registro.criadoEm), estado: 'concluida' },
    aprovacao,
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
  const { email, situacao: dados, carregando, erro, recarregar } = useOutletContext();
  const navigate = useNavigate();
  const [avanco, setAvanco] = useState(false);

  const registro = dados?.registro;
  const ehApadrinhado = registro?.papel === 'apadrinhado';
  const passos = registro ? (ehApadrinhado ? passosApadrinhado(dados) : passosCandidatura(dados)) : [];
  const progresso = progressoTimeline(passos);

  // Anima a etapa atual sempre que a pessoa entra na página (ou o status muda).
  useEffect(() => {
    if (!registro) return undefined;

    try {
      sessionStorage.setItem(TIMELINE_KEY, JSON.stringify({
        chave: chaveTimeline(email, dados?.programa?.codigo, dados?.situacao),
        email,
        programa: dados?.programa?.codigo,
        progresso,
      }));
    } catch {
      /* ignore */
    }

    setAvanco(false);
    const start = window.requestAnimationFrame(() => setAvanco(true));
    const timer = window.setTimeout(() => setAvanco(false), 1800);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(timer);
    };
  }, [email, registro, dados?.programa?.codigo, dados?.situacao, progresso]);

  if (carregando && !dados) return <EstadoCarregando texto="Carregando sua candidatura…" />;
  if (erro && !dados) return <EstadoErro mensagem={erro} onTentar={recarregar} />;

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

  const analise = etapa(dados.programa, 'analise');
  const formacao = etapa(dados.programa, 'formacao');
  const rejeitado = registro.status === 'nao_aprovado';
  const atual = passos.find((p) => p.estado === 'atual') || passos.find((p) => p.estado === 'recusada');
  const indiceDestaque = passos.findIndex((p) => p.estado === 'atual' || p.estado === 'recusada' || (p.estado === 'concluida' && !passos.some((x) => x.estado === 'atual')));

  return (
    <div className={`aluno-page status-page${avanco ? ' timeline-avanco' : ''}`}>
      <header className="status-intro">
        <img src="/images/perfilcheck.png" alt="" className="status-intro-art" />
        <div className="status-intro-copy">
          <h1>{ehApadrinhado ? 'Que bom ter você aqui!' : 'Obrigado por se candidatar!'}</h1>
          <p>
            {ehApadrinhado
              ? 'Em breve você terá alguém para te acompanhar na PUC Minas. Acompanhe abaixo as etapas do seu cadastro.'
              : 'Sua iniciativa faz a diferença na jornada de novos alunos da PUC Minas. Acompanhe abaixo a análise da sua candidatura.'}
          </p>
        </div>
      </header>

      <section className="timeline-card" aria-label="Etapas">
        <div className="timeline-card-head">
          <div>
            <h2>{titulo}</h2>
            <p>{ehApadrinhado ? 'Do cadastro até a definição do seu padrinho.' : 'Do envio até o início das atividades.'}</p>
          </div>
          <Link to="/aluno/configuracoes#suporte" className="help-inline">Ajuda</Link>
        </div>
        <ol className="timeline">
          {passos.map((passo, indice) => (
            <li
              key={passo.titulo}
              className={`timeline-item ${passo.estado}${avanco && indice === progresso ? ' acabou-de-avancar' : ''}${avanco && indice === indiceDestaque ? ' destaque-avanco' : ''}`}
            >
              <span className="timeline-marker" aria-hidden="true">
                {passo.estado === 'concluida' && <Icon name="check" size={16} />}
                {passo.estado === 'recusada' && <Icon name="close" size={15} />}
              </span>
              <div className="timeline-copy">
                <strong>{passo.titulo}<span className="sr-only"> — {{ concluida: 'concluída', atual: 'etapa atual', futura: 'próxima etapa', recusada: 'não aprovada' }[passo.estado]}</span></strong>
                <p>{passo.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="status-foot">
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
        <div className={`status-next${avanco ? ' status-next-pulse' : ''}`}>
          <span className="status-next-icon" aria-hidden="true">
            <Icon name={rejeitado ? 'info' : 'clock'} size={22} />
          </span>
          <div>
            <strong>{rejeitado ? 'E agora?' : avanco ? 'Etapa atualizada' : 'O que acontece agora'}</strong>
            <p>
              {rejeitado
                ? 'Você poderá participar de novo no próximo ciclo. Se quiser entender o motivo, fale com a coordenação.'
                : atual
                  ? `${atual.titulo}: ${atual.texto}`
                  : 'Assim que houver novidade, você verá aqui e também nas notificações.'}
            </p>
          </div>
          <Link to="/aluno/configuracoes#suporte" className="text-link status-next-link">Ajuda</Link>
        </div>
      </div>
    </div>
  );
}
