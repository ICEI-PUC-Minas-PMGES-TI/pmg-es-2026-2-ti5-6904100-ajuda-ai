import { useRef } from 'react';
import Icon from '../../components/Icon';
import { Progress } from './partes';

export const OPCOES_PARTICIPACAO = [
  {
    id: 'padrinho',
    icon: 'groups',
    titulo: 'Quero ser padrinho',
    texto: 'Quero apoiar novos alunos e compartilhar minha experiência.',
    selo: 'PADRINHO',
    destaque: 'Faça a diferença na jornada de novos alunos.',
    descricao: 'Como padrinho, você pode apoiar novos alunos, compartilhar sua experiência e ajudar na adaptação à vida universitária.',
    beneficios: ['Conecte-se com novos alunos', 'Compartilhe sua experiência', 'Contribua para uma PUC mais acolhedora'],
  },
  {
    id: 'apadrinhado',
    icon: 'person',
    titulo: 'Quero ser apadrinhado',
    texto: 'Quero receber orientação de um aluno mais experiente.',
    selo: 'APADRINHADO',
    destaque: 'Comece sua jornada com alguém ao seu lado.',
    descricao: 'Como apadrinhado, você recebe orientação de um aluno veterano do seu curso para se adaptar à rotina, às disciplinas e à vida no campus.',
    beneficios: ['Tenha um padrinho do seu curso', 'Tire dúvidas sobre disciplinas e rotina', 'Participe de encontros do seu grupo'],
  },
  {
    id: 'explorar',
    icon: 'compass',
    titulo: 'Quero apenas explorar o campus',
    texto: 'Quero conhecer o sistema e os recursos disponíveis.',
    selo: 'EXPLORAR',
    destaque: 'Conheça o Ajuda-aí no seu ritmo.',
    descricao: 'Você pode acompanhar comunicados e conhecer os recursos do programa sem se inscrever agora. Dá para participar depois, pela sua área do aluno.',
    beneficios: ['Receba comunicados do programa', 'Conheça os recursos disponíveis', 'Participe quando quiser'],
  },
];

/** Regras do programa: 1º período não pode ser padrinho; período > 1 não pode ser apadrinhado. */
export function bloqueioDaOpcao(opcao, periodo) {
  if (opcao === 'padrinho' && periodo <= 1) return 'Disponível a partir do 2º período.';
  if (opcao === 'apadrinhado' && periodo > 1) return 'Exclusivo para alunos do 1º período.';
  return '';
}

export default function EscolhaStep({ periodo, escolha, onEscolher, onContinuar, onVoltar }) {
  const gruposRef = useRef(null);
  const selecionada = OPCOES_PARTICIPACAO.find((o) => o.id === escolha) || OPCOES_PARTICIPACAO[2];
  const habilitadas = OPCOES_PARTICIPACAO.filter((o) => !bloqueioDaOpcao(o.id, periodo));

  function onKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const idx = habilitadas.findIndex((o) => o.id === escolha);
    const passo = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const proxima = habilitadas[(idx + passo + habilitadas.length) % habilitadas.length];
    onEscolher(proxima.id);
    gruposRef.current?.querySelector(`[data-opcao="${proxima.id}"]`)?.focus();
  }

  return (
    <main className="choice-page">
      <section className="choice-card">
        <div className="choice-top">
          <button type="button" className="back-link" onClick={onVoltar}><span aria-hidden="true">‹</span> Voltar</button>
          <Progress step={2} total={3} label="2 de 3 · Como você quer participar?" />
        </div>
        <header className="choice-heading">
          <h1>Como você quer participar?</h1>
          <p>Escolha a opção que mais combina com você neste momento.</p>
        </header>

        <div className="choice-grid">
          <div className="choice-options" role="radiogroup" aria-label="Forma de participação" ref={gruposRef} onKeyDown={onKeyDown}>
            {OPCOES_PARTICIPACAO.map((opcao) => {
              const motivo = bloqueioDaOpcao(opcao.id, periodo);
              const ativa = opcao.id === escolha;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  role="radio"
                  data-opcao={opcao.id}
                  aria-checked={ativa}
                  aria-disabled={motivo ? true : undefined}
                  tabIndex={ativa ? 0 : -1}
                  className={`choice-option${ativa ? ' selected' : ''}${motivo ? ' blocked' : ''}`}
                  onClick={() => { if (!motivo) onEscolher(opcao.id); }}
                >
                  <span className="choice-icon"><Icon name={motivo ? 'lock' : opcao.icon} size={26} /></span>
                  <span className="choice-copy">
                    <strong>{opcao.titulo}</strong>
                    <span>{opcao.texto}</span>
                    {motivo && <em className="choice-reason"><Icon name="info" size={13} /> {motivo}</em>}
                  </span>
                  <Icon name="chevron" size={20} className="choice-chevron" />
                </button>
              );
            })}
          </div>

          <div className="choice-detail" aria-live="polite">
            <div className="choice-detail-copy">
              <span className="choice-badge">{selecionada.selo}</span>
              <h2>{selecionada.destaque}</h2>
              <p>{selecionada.descricao}</p>
              <ul>
                {selecionada.beneficios.map((item) => (
                  <li key={item}><span className="check-dot"><Icon name="check" size={13} /></span>{item}</li>
                ))}
              </ul>
              <button type="button" className="primary-button" onClick={onContinuar}>Continuar <Icon name="arrow" size={18} /></button>
            </div>
            <img className="choice-photo" src="/images/pucjardim.png" alt="Prédio da PUC Minas cercado de jardins" />
          </div>
        </div>

        <div className="choice-banner">
          <Icon name="info" size={26} />
          <div>
            <strong>Transforme a experiência universitária.</strong>
            <span>O Ajuda-aí conecta alunos para construir, juntos, uma PUC Minas mais acolhedora.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
