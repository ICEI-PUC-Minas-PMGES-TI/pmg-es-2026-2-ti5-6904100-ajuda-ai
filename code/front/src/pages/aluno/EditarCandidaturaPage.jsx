import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import CandidaturaPadrinhoForm from '../cadastro/CandidaturaPadrinhoForm';
import { EstadoCarregando } from './partes';

export default function EditarCandidaturaPage() {
  const { email, perfil, situacao, carregando, recarregar, atualizarSessao } = useOutletContext();
  const navigate = useNavigate();
  const mostrarToast = useToast();

  if (carregando && !situacao) return <EstadoCarregando texto="Carregando sua candidatura…" />;
  const registro = situacao?.registro;
  const editavel = registro?.papel === 'candidato' && ['pendente', 'em_analise'].includes(registro.status);
  if (!editavel) return <Navigate to="/aluno/candidatura" replace />;

  return (
    <div className="aluno-page">
      <section className="form-card details-card aluno-form-card">
        <CandidaturaPadrinhoForm
          email={email}
          modo="editar"
          perfil={{
            nome: perfil.nome,
            curso: perfil.curso || undefined,
            periodo: perfil.periodo ?? undefined,
            turno: perfil.turno || undefined,
            interesses: perfil.interesses,
          }}
          inicial={registro.respostas}
          onVoltar={() => navigate('/aluno/candidatura')}
          onEnviado={async (_registro, respostas) => {
            atualizarSessao({ respostas, escolha: 'padrinho' });
            mostrarToast('Candidatura atualizada com sucesso.', 'sucesso');
            await recarregar();
            navigate('/aluno/candidatura');
          }}
        />
      </section>
    </div>
  );
}
