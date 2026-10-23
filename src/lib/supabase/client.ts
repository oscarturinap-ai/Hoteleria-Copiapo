import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Cliente para componentes de navegador. */
export function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createBrowserClient(env.url, env.anonKey);
}
