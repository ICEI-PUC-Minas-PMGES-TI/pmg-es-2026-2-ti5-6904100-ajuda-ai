import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import CadastroPage from './pages/CadastroPage';
import LoginPage from './pages/LoginPage';
import CandidaturasPage from './pages/coordenacao/CandidaturasPage';
import CoordLayout from './pages/coordenacao/CoordLayout';
import DashboardPage from './pages/coordenacao/DashboardPage';
import PlaceholderPage from './pages/coordenacao/PlaceholderPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CadastroPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/coordenacao" element={<CoordLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="candidaturas" element={<CandidaturasPage />} />
            <Route path="usuarios" element={<PlaceholderPage secao="usuarios" />} />
            <Route path="programas" element={<PlaceholderPage secao="programas" />} />
            <Route path="formularios" element={<PlaceholderPage secao="formularios" />} />
            <Route path="configuracoes" element={<PlaceholderPage secao="configuracoes" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
