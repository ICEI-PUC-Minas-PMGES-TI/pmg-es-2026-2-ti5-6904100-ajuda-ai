import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { textoResposta } from '../../components/PerguntasAdicionais';
import { dataCurta } from './comum';

const PUBLICOS = [
  { tipo: 'apadrinhado', rotulo: 'Apadrinhados' },
  { tipo: 'padrinho', rotulo: 'Padrinhos' },
];
const VISOES = [
  { visao: 'aluno', rotulo: 'Por aluno' },
  { visao: 'pergunta', rotulo: 'Por pergunta' },
];

export default function FormularioRespostasPage() {
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') === 'padrinho' ? 'padrinho' : 'apadrinhado';
  const programa = params.get('programa') || undefined;
  const [visao, setVisao] = useState('aluno');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setDados(null);
    try {
      setDados(await (visao === 'aluno' ? api.respostasFormulario(tipo, programa) : api.respostasPorPergunta(tipo, programa)));
    } catch (error) {
      setErro(error.message || 'Não foi possível carregar as respostas.');
    } finally {
      setCarregando(false);
    }
  }, [tipo, programa, visao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function trocarPublico(novo) {
    const novos = new URLSearchParams(params);
    novos.set('tipo', novo);
    setParams(novos);
  }

  const publico = PUBLICOS.find((p) => p.tipo === tipo);
  const lista = visao === 'aluno' ? dados?.envios : dados?.perguntas;

  return (
    <section className="forms-page">
      <header className="dash-header">
        <div>
          <span className="eyebrow"><Icon name="clipboard" size={15} /> RESPOSTAS</span>
          <h1>Respostas: {publico.rotulo}</h1>
          <p>
            {dados ? `Programa ${dados.programa} · versão atual ${dados.versaoAtual || '—'} · ${dados.total} envio(s)` : 'Consulte o que os alunos responderam, com a versão do formulário de cada envio.'}
          </p>
        </div>
        <Link className="ghost-button" to={`/coordenacao/formularios?tipo=${tipo}${programa ? `&programa=${encodeURIComponent(programa)}` : ''}`}>
          <Icon name="arrowLeft" size={16} /> Voltar ao formulário
        </Link>
      </header>

      <div className="forms-tabs" role="tablist" aria-label="Público do formulário">
        {PUBLICOS.map((p) => (
          <button key={p.tipo} type="button" role="tab" aria-selected={p.tipo === tipo} className={`forms-tab${p.tipo === tipo ? ' active' : ''}`} onClick={() => p.tipo !== tipo && trocarPublico(p.tipo)}>
            {p.rotulo}
          </button>
        ))}
      </div>
      <div className="forms-tabs" role="tablist" aria-label="Forma de consulta">
        {VISOES.map((v) => (
          <button key={v.visao} type="button" role="tab" aria-selected={v.visao === visao} className={`forms-tab${v.visao === visao ? ' active' : ''}`} onClick={() => setVisao(v.visao)}>
            {v.rotulo}
          </button>
        ))}
      </div>

      {carregando && <div className="coord-state" role="status"><div className="coord-spinner" aria-hidden="true" /><p>Carregando respostas…</p></div>}
      {erro && <div className="dash-inline-error" role="alert">{erro}<button type="button" onClick={carregar}>Tentar novamente</button></div>}
      {lista?.length === 0 && <p className="empty-copy">{visao === 'aluno' ? 'Nenhum envio neste programa ainda.' : 'Nenhuma pergunta respondida neste programa ainda.'}</p>}

      {visao === 'aluno' && lista?.length > 0 && (
        <ul className="answers-list">
          {lista.map((envio) => <EnvioCard key={envio.participacaoId} envio={envio} />)}
        </ul>
      )}
      {visao === 'pergunta' && lista?.length > 0 && (
        <ul className="answers-list">
          {lista.map((pergunta) => <PerguntaCard key={pergunta.perguntaId} pergunta={pergunta} />)}
        </ul>
      )}
    </section>
  );
}

function rotuloVersao(versao) {
  return versao === null ? 'Sem formulário' : `Versão ${versao}`;
}

function EnvioCard({ envio }) {
  return (
    <li className="question-card">
      <div className="question-head">
        <strong>{envio.nome}</strong>
        <span className="matching-tag custom">{rotuloVersao(envio.versao)}</span>
      </div>
      <span className="answer-meta">{envio.email} · enviado em {dataCurta(envio.enviadoEm)}</span>
      {envio.respostas.length === 0 ? (
        <p className="empty-copy">Este envio não tem perguntas adicionais.</p>
      ) : (
        <dl className="answer-pairs">
          {envio.respostas.map((r) => (
            <div key={r.perguntaId}>
              <dt>{r.enunciado}</dt>
              <dd className={r.resposta === null ? 'unanswered' : undefined}>{r.resposta === null ? 'Sem resposta' : textoResposta(r.resposta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function PerguntaCard({ pergunta }) {
  const opcoes = Object.entries(pergunta.contagem).sort((a, b) => b[1] - a[1]);
  return (
    <li className="question-card">
      <div className="question-head">
        <strong>{pergunta.enunciado}</strong>
        <span className="matching-tag custom">{pergunta.total} resposta(s)</span>
      </div>
      <span className="answer-meta">Presente nas versões {[...pergunta.versoes].sort((a, b) => a - b).join(', ')}</span>
      {opcoes.length > 0 ? (
        <ul className="answer-bars">
          {opcoes.map(([opcao, total]) => (
            <li key={opcao}>
              <span>{opcao}</span>
              <span className="answer-bar" aria-hidden="true"><i style={{ width: `${(total / pergunta.total) * 100}%` }} /></span>
              <strong>{total}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="answer-pairs">
          {pergunta.respostas.map((r) => (
            <div key={`${r.usuarioId}-${r.versao}`}>
              <dt>{r.nome} <small>(versão {r.versao})</small></dt>
              <dd>{textoResposta(r.resposta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
