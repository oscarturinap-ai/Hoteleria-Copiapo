import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { StoreProvider } from './ui/store';
import { LocalStorageRepository } from './persistence/localStorageRepo';
import { configSupabase } from './persistence/config';
import './ui/estilos.css';

// Punto único de selección de backend: Supabase (multiusuario) si está configurado; si no, local.
// El cliente Supabase se carga bajo demanda: el modo local no lo descarga.
async function iniciar() {
  const raiz = createRoot(document.getElementById('root')!);
  const cfg = configSupabase();
  if (!cfg) {
    raiz.render(
      <StrictMode>
        <StoreProvider repo={new LocalStorageRepository()}>
          <App />
        </StoreProvider>
      </StrictMode>,
    );
    return;
  }
  const [{ createClient }, { SupabaseRepository }, { AuthGate }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('./persistence/supabaseRepo'),
    import('./ui/auth'),
  ]);
  const cliente = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const repo = new SupabaseRepository(cliente);
  raiz.render(
    <StrictMode>
      <AuthGate cliente={cliente}>
        {(sesion) => (
          <StoreProvider key={sesion.userId} repo={repo} sesion={sesion}>
            <App />
          </StoreProvider>
        )}
      </AuthGate>
    </StrictMode>,
  );
}

void iniciar();
