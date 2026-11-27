import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon';
import { EstadoCarregando, EstadoErro, PageHeader } from './partes';
import { ProgressoGamificacao, SituacaoCard } from './PerfilAlunoPage';

/** Primeiro nome para a saudação; sem nome, saúda sem ele. */
export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

/**
 * Atalhos da tela de Início, na ordem do app mobile. Só entram os que o
 * aluno pode abrir agora (mesmas regras do menu lateral).
 */
export function atalhosInicio({ resolucao = {}, papel } = {}) {
  return [
    resolucao.participante && { to: '/aluno/feed', icon: 'megaphone', titulo: 'Feed', texto: 'Comunicados e novidades do ciclo' },
    resolucao.ativo && {
      to: '/aluno/padrinho',
      icon: 'users',
      titulo: papel === 'padrinho' ? 'Meus apadrinhados' : 'Meu padrinho',
      texto: papel === 'padrinho' ? 'Acompanhe seu grupo' : 'Fale com quem te acompanha',
    },
    resolucao.candidatura && { to: '/aluno/candidatura', icon: 'clipboard', titulo: 'Minha candidatura', texto: 'Acompanhe a análise' },
    { to: '/aluno/chat', icon: 'chat', titulo: 'Conversas', texto: 'Mensagens do programa' },
    resolucao.participante && { to: '/aluno/lojinha', icon: 'tag', titulo: 'Lojinha', texto: 'Troque suas moedas' },
    { to: '/aluno/mapa', icon: 'map', titulo: 'Mapa do campus', texto: 'PUC Stops, eventos e restaurantes' },
  ].filter(Boolean);
}

export default function InicioAlunoPage() {
  const { perfil, situacao, carregando, erro, recarregar, resolucao, papel } = useOutletContext();
  const nome = primeiroNome(perfil?.nome);
  const atalhos = atalhosInicio({ resolucao, papel });

  return (
    <div className="aluno-page inicio-page">
      <PageHeader
        titulo={nome ? `Olá, ${nome}!` : 'Olá!'}
        subtitulo="Acompanhe sua participação no programa e acesse o que você mais usa."
      >
        <Link to="/aluno/perfil" className="ghost-button inicio-perfil-link">
          <Icon name="person" size={17} /> Meu perfil
        </Link>
      </PageHeader>

      <div className="inicio-grid">
        <section className="aluno-section" aria-labelledby="inicio-situacao-titulo">
          <h2 id="inicio-situacao-titulo">Minha situação</h2>
          {carregando && !situacao ? (
            <EstadoCarregando texto="Carregando sua situação no programa…" />
          ) : erro && !situacao ? (
            <EstadoErro mensagem={erro} onTentar={recarregar} />
          ) : (
            <SituacaoCard dados={situacao} perfil={perfil} resolucao={resolucao} />
          )}
        </section>
        <ProgressoGamificacao />
      </div>

      <section className="aluno-section" aria-labelledby="inicio-atalhos-titulo">
        <h2 id="inicio-atalhos-titulo">Acesso rápido</h2>
        <ul className="inicio-atalhos">
          {atalhos.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="inicio-atalho">
                <span className="inicio-atalho-icone" aria-hidden="true"><Icon name={item.icon} size={22} /></span>
                <span className="inicio-atalho-texto">
                  <strong>{item.titulo}</strong>
                  <small>{item.texto}</small>
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
