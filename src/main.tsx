import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { StoreProvider } from './ui/store';
import { LocalStorageRepository } from './persistence/localStorageRepo';
import './ui/estilos.css';

// Punto único de inyección de persistencia: al migrar, reemplazar por SupabaseRepository.
const repo = new LocalStorageRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider repo={repo}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
