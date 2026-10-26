import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import LoginPage from './pages/LoginPage';
import AlunoLayout from './pages/aluno/AlunoLayout';
import ConfiguracoesAlunoPage from './pages/aluno/ConfiguracoesAlunoPage';
import EditarCandidaturaPage from './pages/aluno/EditarCandidaturaPage';
import HistoricoPage from './pages/aluno/HistoricoPage';
import PadrinhoPage from './pages/aluno/PadrinhoPage';
import PerfilEditarPage from './pages/aluno/PerfilEditarPage';
import PerfilAlunoPage from './pages/aluno/PerfilAlunoPage';
import StatusCandidaturaPage from './pages/aluno/StatusCandidaturaPage';
import CadastroPage from './pages/cadastro/CadastroPage';
import CandidaturasPage from './pages/coordenacao/CandidaturasPage';
import RedirectCadastros from './pages/coordenacao/RedirectCadastros';
import ComunicadosPage from './pages/coordenacao/ComunicadosPage';
import ConfiguracoesPage from './pages/coordenacao/ConfiguracoesPage';
import CoordLayout from './pages/coordenacao/CoordLayout';
import DashboardPage from './pages/coordenacao/DashboardPage';
import EventosPage from './pages/coordenacao/EventosPage';
import FormularioRespostasPage from './pages/coordenacao/FormularioRespostasPage';
import FormulariosPage from './pages/coordenacao/FormulariosPage';
import MatchingPage from './pages/coordenacao/MatchingPage';
import ProgramasPage from './pages/coordenacao/ProgramasPage';
import PucStopsPage from './pages/coordenacao/PucStopsPage';
import RestaurantesPage from './pages/coordenacao/RestaurantesPage';
import UsuariosPage from './pages/coordenacao/UsuariosPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<CadastroPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<LoginPage />} />
            <Route path="/aluno" element={<AlunoLayout />}>
              <Route index element={<Navigate to="perfil" replace />} />
              <Route path="perfil" element={<PerfilAlunoPage />} />
              <Route path="perfil/editar" element={<PerfilEditarPage />} />
              <Route path="candidatura" element={<StatusCandidaturaPage />} />
              <Route path="candidatura/editar" element={<EditarCandidaturaPage />} />
              <Route path="padrinho" element={<PadrinhoPage />} />
              <Route path="historico" element={<HistoricoPage />} />
              <Route path="configuracoes" element={<ConfiguracoesAlunoPage />} />
            </Route>
            <Route path="/coordenacao" element={<CoordLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="cadastros" element={<RedirectCadastros />} />
              <Route path="candidaturas" element={<CandidaturasPage />} />
              <Route path="matching" element={<MatchingPage />} />
              <Route path="usuarios" element={<UsuariosPage />} />
              <Route path="programas" element={<ProgramasPage />} />
              <Route path="formularios" element={<FormulariosPage />} />
              <Route path="formularios/respostas" element={<FormularioRespostasPage />} />
              <Route path="pucstops" element={<PucStopsPage />} />
              <Route path="eventos" element={<EventosPage />} />
              <Route path="restaurantes" element={<RestaurantesPage />} />
              <Route path="comunicados" element={<ComunicadosPage />} />
              <Route path="configuracoes" element={<ConfiguracoesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
