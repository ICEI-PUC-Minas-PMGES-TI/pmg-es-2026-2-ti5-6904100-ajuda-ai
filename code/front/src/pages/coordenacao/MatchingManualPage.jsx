import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { Avatar, DefinirPadrinho } from './comum';

export default function MatchingManualPage() {
  const [params] = useSearchParams();
  const programaCodigo = params.get('programa') || '';
  const mostrarToast = useToast();
  const [programa, setPrograma] = useState(null);
  const [matching, setMatching] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setPrograma(null);
    setMatching(null);
    try {
      const programas = await api.programas();
      const ciclo = programas.find((item) => item.codigo === programaCodigo);
      if (!ciclo) {
        throw new Error(programaCodigo
          ? `Programa ${programaCodigo} não encontrado.`
          : 'Selecione um programa para consultar o matching.');
      }
      setPrograma(ciclo);
      if (ciclo.matchingLiberado) {
        setMatching(await api.matchingPool(programaCodigo));
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar o matching.');
    } finally {
      setCarregando(false);
    }
  }, [programaCodigo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const padrinhos = matching?.padrinhos || [];
  const apadrinhados = matching?.apadrinhados || [];

  function vinculado() {
    mostrarToast('Vínculo salvo. O conjunto do programa foi atualizado.', 'sucesso');
    carregar();
  }

  return (
    <section className="matching-page">
      <header className="dash-header">
        <div>
          <h1>Matching manual</h1>
          <p>
            {programaCodigo
              ? `Programa ${programaCodigo}: associe padrinhos aprovados a apadrinhados.`
              : 'Selecione um programa para consultar os participantes elegíveis.'}
          </p>
        </div>
        <div className="matching-run-actions">
          <Link
            className="ghost-button"
            to={`/coordenacao/matching${programaCodigo ? `?programa=${encodeURIComponent(programaCodigo)}` : ''}`}
          >
            Voltar às sugestões
          </Link>
          <Link className="ghost-button" to={`/coordenacao/programas${programaCodigo ? `?programa=${encodeURIComponent(programaCodigo)}` : ''}`}>
            <Icon name="calendar" size={16} /> Ver programas
          </Link>
        </div>
      </header>

      {carregando && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando matching…</p></div>}
      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}

      {!carregando && !erro && programa && !programa.matchingLiberado && (
        <div className="matching-locked" role="status">
          <Icon name="lock" size={22} />
          <div>
            <h2>Matching ainda não liberado</h2>
            <p>Encerre as inscrições, decida todas as candidaturas e prepare ao menos um padrinho aprovado. A liberação é feita em Programas; este painel não cria sugestões nem vínculos automaticamente.</p>
            <Link className="primary-button inline" to={`/coordenacao/programas?programa=${encodeURIComponent(programaCodigo)}`}>
              Ir para o programa
            </Link>
          </div>
        </div>
      )}

      {!carregando && !erro && matching && (
        <>
          <div className="matching-summary">
            <span><strong>{padrinhos.length}</strong> padrinhos elegíveis</span>
            <span><strong>{apadrinhados.length}</strong> apadrinhados no conjunto</span>
            <span className="matching-summary-status"><Icon name="check" size={15} /> Matching liberado</span>
          </div>
          {padrinhos.length === 0 && (
            <div className="empty-copy">Não há padrinhos aprovados para este programa.</div>
          )}
          <section className="matching-list" aria-labelledby="matching-apadrinhados">
            <div className="matching-section-head">
              <h2 id="matching-apadrinhados">Apadrinhados</h2>
              <p>Os vínculos são definidos manualmente pela coordenação.</p>
            </div>
            {apadrinhados.length === 0 && <p className="empty-copy">Não há apadrinhados aptos para vinculação neste programa.</p>}
            {apadrinhados.map((pessoa) => (
              <article className="matching-person" key={pessoa.id}>
                <div className="matching-person-head">
                  <Avatar pessoa={pessoa} tamanho="md" />
                  <div>
                    <h3>{pessoa.nome}</h3>
                    <p>{[pessoa.curso, pessoa.periodo ? `${pessoa.periodo}º período` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={`flag ${pessoa.vinculado ? 'green' : 'amber'}`}>
                    {pessoa.vinculado ? 'Com vínculo' : 'Sem vínculo'}
                  </span>
                </div>
                {pessoa.vinculado ? (
                  <p className="detail-muted">Este apadrinhado já está associado a um grupo neste programa.</p>
                ) : (
                  <DefinirPadrinho
                    apadrinhado={pessoa}
                    programa={programaCodigo}
                    padrinhos={padrinhos}
                    onVinculado={vinculado}
                  />
                )}
              </article>
            ))}
          </section>
          <section className="matching-list" aria-labelledby="matching-padrinhos">
            <div className="matching-section-head">
              <h2 id="matching-padrinhos">Padrinhos aprovados</h2>
              <p>O vínculo pode reutilizar um grupo existente ou criar um grupo para o padrinho.</p>
            </div>
            <div className="matching-mentors">
              {padrinhos.map((pessoa) => (
                <article className="matching-person mentor" key={pessoa.id}>
                  <Avatar pessoa={pessoa} tamanho="md" />
                  <div>
                    <h3>{pessoa.nome}</h3>
                    <p>{[pessoa.curso, pessoa.periodo ? `${pessoa.periodo}º período` : null].filter(Boolean).join(' · ')}</p>
                    <small>{pessoa.apadrinhados ?? 0} apadrinhado(s) · {pessoa.grupo || 'Sem grupo'}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
