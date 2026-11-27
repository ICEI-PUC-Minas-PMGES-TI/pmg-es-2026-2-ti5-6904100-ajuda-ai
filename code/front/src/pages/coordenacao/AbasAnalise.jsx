import Icon from '../../components/Icon';

export default function AbasAnalise({ aba, onMudar, conferencia = true, cadastro = false }) {
  const abas = [
    ...(conferencia ? [['conferencia', 'Conferência', 'checkCircle']] : []),
    ['perfil', 'Perfil e respostas', 'person'],
    ['registros', cadastro ? 'Histórico' : 'Notas e histórico', 'history'],
  ];
  return <nav className="analysis-tabs" aria-label="Seções da análise">
    {abas.map(([valor, titulo, icone]) => <button key={valor} type="button" aria-pressed={aba === valor} onClick={() => onMudar(valor)}><Icon name={icone} size={17} />{titulo}</button>)}
  </nav>;
}
