import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { PublicEnsTruPage } from './PublicEnsTruPage';

const isPublicEnsTruPage = window.location.pathname.replace(/\/+$/, '') === '/enstru';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicEnsTruPage ? (
      <PublicEnsTruPage />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
