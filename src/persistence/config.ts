/**
 * Configuración de backend. Con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY definidas, la app opera
 * multiusuario sobre Supabase; sin ellas, en modo local (localStorage) para un solo equipo.
 * La anon key es pública por diseño: la seguridad la imponen RLS y las funciones de la base.
 */
export interface ConfigSupabase {
  url: string;
  anonKey: string;
}

export function configSupabase(env: Record<string, string | undefined> = import.meta.env): ConfigSupabase | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}
