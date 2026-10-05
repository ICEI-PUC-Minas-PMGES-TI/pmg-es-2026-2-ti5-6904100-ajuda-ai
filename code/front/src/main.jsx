import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { aplicarAparencia } from './auth/sessaoAluno';
import './styles.css';
import './dashboard.css';
import './aluno.css';
import './coordenacao.css';

aplicarAparencia();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
